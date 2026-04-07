const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e9 // 1GB max file size via socket
});
// Ensure uploads & chunks directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const chunksDir  = path.join(__dirname, 'chunks');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(chunksDir))  fs.mkdirSync(chunksDir);
// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});
// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));
// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));
app.use(express.json());
// Track rooms and users
const rooms = {};
const roomMessages = {};
// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = `/uploads/${req.file.filename}`;
  const fileData = {
    id: uuidv4(),
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    url: fileUrl,
    timestamp: new Date().toISOString()
  };
  // If room info provided, broadcast to room
  const { roomId, deviceName } = req.body;
  if (roomId) {
    const msgData = {
      ...fileData,
      sender: deviceName || 'Unknown Device',
      type: 'file'
    };
    if (!roomMessages[roomId]) roomMessages[roomId] = [];
    roomMessages[roomId].push(msgData);
    if (roomMessages[roomId].length > 100) roomMessages[roomId].shift();
    io.to(roomId).emit('file-shared', msgData);
  }
  res.json(fileData);
});
// ── Chunked upload: receive one chunk ──────────────────────────────
app.post('/upload-chunk',
  express.raw({ type: 'application/octet-stream', limit: '110mb' }),
  (req, res) => {
    const fileId      = req.headers['x-file-id'];
    const chunkIndex  = req.headers['x-chunk-index'];
    if (!fileId || chunkIndex === undefined) return res.status(400).json({ error: 'Missing headers' });
    const chunkPath = path.join(chunksDir, `${fileId}_${chunkIndex}`);
    fs.writeFile(chunkPath, req.body, (err) => {
      if (err) return res.status(500).json({ error: 'Failed to save chunk' });
      res.json({ ok: true });
    });
  }
);
// ── Chunked upload: stream-assemble all chunks into final file ───────
app.post('/upload-finalize', express.json(), async (req, res) => {
  const { fileId, originalName, mimetype, totalChunks, roomId, deviceName } = req.body;
  if (!fileId || !originalName || !totalChunks) return res.status(400).json({ error: 'Missing fields' });
  const ext       = path.extname(originalName);
  const filename  = `${fileId}${ext}`;
  const finalPath = path.join(uploadsDir, filename);
  try {
    const writeStream = fs.createWriteStream(finalPath, { flags: 'w' });
    const n = parseInt(totalChunks);
    // Stream each chunk directly into the output — no RAM spike
    for (let i = 0; i < n; i++) {
      const chunkPath = path.join(chunksDir, `${fileId}_${i}`);
      await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(chunkPath);
        readStream.on('error', reject);
        readStream.on('end', () => {
          fs.unlink(chunkPath, () => {}); // async cleanup
          resolve();
        });
        readStream.pipe(writeStream, { end: false });
      });
    }
    await new Promise((resolve, reject) => {
      writeStream.end();
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    const stats   = fs.statSync(finalPath);
    const fileUrl = `/uploads/${filename}`;
    const fileData = {
      id: fileId,
      originalName,
      mimetype,
      size: stats.size,
      url: fileUrl,
      timestamp: new Date().toISOString()
    };
    if (roomId) {
      const msgData = { ...fileData, sender: deviceName || 'Unknown Device', type: 'file' };
      if (!roomMessages[roomId]) roomMessages[roomId] = [];
      roomMessages[roomId].push(msgData);
      if (roomMessages[roomId].length > 100) roomMessages[roomId].shift();
      io.to(roomId).emit('file-shared', msgData);
    }
    res.json(fileData);
  } catch (err) {
    console.error('[NEXUS] Finalize error:', err);
    res.status(500).json({ error: 'Failed to assemble file' });
  }
});
// Health check
app.get('/api/status', (req, res) => {
  res.json({ status: 'online', rooms: Object.keys(rooms).length });
});
// Socket.io events
io.on('connection', (socket) => {
  console.log(`[NEXUS] Socket connected: ${socket.id}`);
  socket.on('join-room', ({ roomId, deviceName }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.deviceName = deviceName || 'Unknown Device';
    // Track room users
    if (!rooms[roomId]) rooms[roomId] = {};
    rooms[roomId][socket.id] = { deviceName: socket.deviceName, id: socket.id };
    const userCount = Object.keys(rooms[roomId]).length;
    const deviceList = Object.values(rooms[roomId]).map(u => u.deviceName);
    // Notify room
    socket.to(roomId).emit('user-joined', {
      deviceName: socket.deviceName,
      userCount,
      deviceList
    });
    // Send back confirmation
    socket.emit('room-joined', {
      roomId,
      userCount,
      deviceList
    });
    // Send full message history to the newly joined user
    if (roomMessages[roomId] && roomMessages[roomId].length > 0) {
      socket.emit('message-history', roomMessages[roomId]);
    }
    console.log(`[NEXUS] ${socket.deviceName} joined room: ${roomId} (${userCount} devices)`);
  });
  socket.on('send-message', ({ roomId, message, deviceName }) => {
    const msgData = {
      id: uuidv4(),
      text: message,
      sender: deviceName,
      timestamp: new Date().toISOString(),
      type: 'text'
    };
    
    if (!roomMessages[roomId]) roomMessages[roomId] = [];
    roomMessages[roomId].push(msgData);
    if (roomMessages[roomId].length > 100) roomMessages[roomId].shift();
    // Broadcast to all in room including sender
    io.to(roomId).emit('receive-message', msgData);
  });
  socket.on('typing', ({ roomId, deviceName }) => {
    socket.to(roomId).emit('user-typing', { deviceName });
  });
  socket.on('stop-typing', ({ roomId }) => {
    socket.to(roomId).emit('user-stop-typing');
  });
  socket.on('disconnect', () => {
    const { roomId, deviceName } = socket;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId][socket.id];
      const userCount = Object.keys(rooms[roomId]).length;
      const deviceList = Object.values(rooms[roomId]).map(u => u.deviceName);
      if (userCount === 0) delete rooms[roomId];
      io.to(roomId).emit('user-left', {
        deviceName,
        userCount,
        deviceList
      });
    }
    console.log(`[NEXUS] Socket disconnected: ${socket.id}`);
  });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔══════════════════════════════════╗`);
  console.log(`║   NEXUS LINK - SERVER ONLINE     ║`);
  console.log(`║   http://localhost:${PORT}           ║`);
  console.log(`║   Local Network: Check your IP   ║`);
  console.log(`╚══════════════════════════════════╝\n`);
});
