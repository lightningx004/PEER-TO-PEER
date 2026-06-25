/* ─────────────────────────────────────────
   NEXUS LINK — Client Application
   ───────────────────────────────────────── */

// ══ State ══
let socket = null;
let myRoom = '';
let myName = '';
let pendingFiles = [];
let typingTimeout = null;
let isOnline = navigator.onLine;
let messageQueue = JSON.parse(localStorage.getItem('nexus_queue') || '[]');
let isTyping = false;
let allFiles = {};  // id → file data
let knownMessages = new Set(); // to prevent duplicate rendering

// ══ DOM ══
const joinScreen       = document.getElementById('join-screen');
const chatScreen       = document.getElementById('chat-screen');
const deviceNameInput  = document.getElementById('device-name-input');
const roomIdInput      = document.getElementById('room-id-input');
const genRoomBtn       = document.getElementById('gen-room-btn');
const connectBtn       = document.getElementById('connect-btn');
const joinError        = document.getElementById('join-error');
const messagesInner    = document.getElementById('messages-inner');
const messageInput     = document.getElementById('message-input');
const sendBtn          = document.getElementById('send-btn');
const fileInput        = document.getElementById('file-input');
const filePreviewStrip = document.getElementById('file-preview-strip');
const typingIndicator  = document.getElementById('typing-indicator');
const typingText       = document.getElementById('typing-text');
const deviceList       = document.getElementById('device-list');
const onlineCount      = document.getElementById('online-count');
const sidebarRoomId    = document.getElementById('sidebar-room-id');
const headerRoomLabel  = document.getElementById('header-room-label');
const headerDeviceName = document.getElementById('header-device-name');
const copyRoomBtn      = document.getElementById('copy-room-btn');
const disconnectBtn    = document.getElementById('disconnect-btn');
const previewModal     = document.getElementById('preview-modal');
const modalBackdrop    = document.getElementById('modal-backdrop');
const modalFilename    = document.getElementById('modal-filename');
const modalBody        = document.getElementById('modal-body');
const modalDownload    = document.getElementById('modal-download');
const modalClose       = document.getElementById('modal-close');
const toast            = document.getElementById('toast');
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
const sidebar          = document.querySelector('.sidebar');
const sidebarCloseBtn  = document.getElementById('sidebar-close-btn');

// ══════════════════════════════════
// MATRIX DIGITAL RAIN BACKGROUND
// ══════════════════════════════════
const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');

let columns = 0;
let drops = [];
const fontSize = 16;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  columns = Math.floor(canvas.width / fontSize) + 1;
  drops = [];
  for (let x = 0; x < columns; x++) {
    drops[x] = Math.random() * (canvas.height / fontSize);
  }
}

function drawMatrix() {
  // Translucent black to create the trail effect
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.font = fontSize + 'px "Share Tech Mono", monospace';
  
  for (let i = 0; i < drops.length; i++) {
    const char = Math.random() > 0.6 
      ? String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96)) 
      : (Math.random() > 0.5 ? '1' : '0');
      
    const x = i * fontSize;
    const y = drops[i] * fontSize;
    
    // Random highlights for some characters
    if (Math.random() > 0.95) {
      ctx.fillStyle = '#7fff8a'; // Bright green
    } else {
      ctx.fillStyle = '#00ff41'; // Standard green
    }
    
    ctx.fillText(char, x, y);
    
    // Reset drop to top randomly when it offscreen
    if (y > canvas.height && Math.random() > 0.975) {
      drops[i] = 0;
    }
    drops[i]++;
  }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const matrixInterval = setInterval(drawMatrix, 50);

// ══════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════
function applyCipherEffect(element, finalString = null, speedMs = 30) {
  const symbols = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ01@#$%^&*()_+{}[]|:;<>,./?~-';
  const targetText = finalString || element.innerText;
  clearInterval(element.cipherInterval);

  // Long text: quick 3-frame glitch flash then instant reveal
  if (targetText.length > 40) {
    const scramble = () => targetText.split('').map(ch => ch === ' ' ? ' ' : symbols[Math.floor(Math.random() * symbols.length)]).join('');
    element.innerText = scramble();
    if (element.hasAttribute('data-text')) element.setAttribute('data-text', element.innerText);
    let flashes = 0;
    element.cipherInterval = setInterval(() => {
      flashes++;
      if (flashes < 3) { element.innerText = scramble(); if (element.hasAttribute('data-text')) element.setAttribute('data-text', element.innerText); }
      else { clearInterval(element.cipherInterval); element.innerText = targetText; if (element.hasAttribute('data-text')) element.setAttribute('data-text', targetText); }
    }, 60);
    return;
  }

  // Short text: original char-by-char reveal
  let iterations = 0;
  element.cipherInterval = setInterval(() => {
    const currentStr = targetText.split('').map((char, index) => {
      if (index < iterations) return targetText[index];
      if (targetText[index] === ' ') return ' ';
      return symbols[Math.floor(Math.random() * symbols.length)];
    }).join('');
    element.innerText = currentStr;
    if (element.hasAttribute('data-text')) element.setAttribute('data-text', currentStr);
    if (iterations >= targetText.length) { clearInterval(element.cipherInterval); element.innerText = targetText; if (element.hasAttribute('data-text')) element.setAttribute('data-text', targetText); }
    iterations += 1/3;
  }, speedMs);
}

// Initial Triggers
const logo = document.querySelector('.logo-glitch');
if (logo) applyCipherEffect(logo, 'NEXUS LINK', 40);

const logoSub = document.querySelector('.logo-sub');
if (logoSub) applyCipherEffect(logoSub, '[ CROSS-DEVICE COMMUNICATION PROTOCOL ]', 20);

const termTitle = document.querySelector('.terminal-title');
if (termTitle) applyCipherEffect(termTitle, '// ESTABLISH CONNECTION', 20);

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function getFileIcon(mimetype, name) {
  if (!mimetype) mimetype = '';
  if (mimetype.startsWith('image/')) return '🖼️';
  if (mimetype.startsWith('video/')) return '🎬';
  if (mimetype.startsWith('audio/')) return '🎵';
  if (mimetype.includes('pdf')) return '📄';
  if (mimetype.includes('zip') || mimetype.includes('rar') || mimetype.includes('tar') || mimetype.includes('gzip')) return '📦';
  if (mimetype.includes('text') || (name && name.match(/\.(txt|md|csv|log)$/i))) return '📝';
  if (name && name.match(/\.(exe|msi|dmg|deb|apk)$/i)) return '⚙️';
  return '📁';
}

function showToast(msg, duration = 2200) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), duration);
}

function showError(msg) {
  joinError.textContent = msg;
  joinError.classList.remove('hidden');
}

function scrollToBottom() {
  const container = document.getElementById('messages-container');
  container.scrollTop = container.scrollHeight;
}

// ══════════════════════════════════
// RENDER MESSAGES
// ══════════════════════════════════
function appendSystemMsg(text) {
  const el = document.createElement('div');
  el.className = 'msg-system';
  messagesInner.appendChild(el);
  scrollToBottom();
  applyCipherEffect(el, text, 20);
}

function appendTextMessage(data, isSelf) {
  if (knownMessages.has(data.id)) return;
  knownMessages.add(data.id);

  const wrapper = document.createElement('div');
  wrapper.className = `msg-wrapper ${isSelf ? 'self' : 'other'}`;

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = isSelf
    ? `<span>${formatTime(data.timestamp)}</span>`
    : `<span>${escapeHtml(data.sender)}</span><span>${formatTime(data.timestamp)}</span>`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  wrapper.appendChild(meta);
  wrapper.appendChild(bubble);
  messagesInner.appendChild(wrapper);
  scrollToBottom();

  applyCipherEffect(bubble, data.text, 10);
}

function appendFileMessage(data, isSelf) {
  if (knownMessages.has(data.id)) return;
  knownMessages.add(data.id);
  allFiles[data.id] = data;

  const wrapper = document.createElement('div');
  wrapper.className = `msg-wrapper ${isSelf ? 'self' : 'other'}`;

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = isSelf
    ? `<span>${formatTime(data.timestamp)}</span>`
    : `<span>${escapeHtml(data.sender)}</span><span>${formatTime(data.timestamp)}</span>`;

  const card = document.createElement('div');
  card.className = 'file-card';
  card.dataset.fileId = data.id;

  const mime = data.mimetype || '';
  const name = data.originalName || 'file';
  const sizeStr = formatBytes(data.size || 0);

  if (mime.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = data.url;
    img.alt = name;
    img.loading = 'lazy';
    card.appendChild(img);
  } else if (mime.startsWith('video/')) {
    const vid = document.createElement('video');
    vid.src = data.url;
    vid.controls = true;
    vid.muted = true;
    vid.preload = 'metadata';
    card.appendChild(vid);
  } else {
    const iconArea = document.createElement('div');
    iconArea.className = 'file-icon-card';
    iconArea.innerHTML = `
      <div class="file-icon">${getFileIcon(mime, name)}</div>
      <div class="file-icon-info">
        <div class="file-icon-name">${escapeHtml(name)}</div>
        <div class="file-icon-size">${sizeStr}</div>
      </div>`;
    card.appendChild(iconArea);
  }

  const info = document.createElement('div');
  info.className = 'file-card-info';
  info.innerHTML = `
    <span class="file-card-name">${escapeHtml(name)}</span>
    <span class="file-card-size">${sizeStr}</span>
    <a class="file-download-btn" href="${data.url}" download="${escapeHtml(name)}">⬇ Save</a>`;
  card.appendChild(info);

  card.addEventListener('click', (e) => {
    if (e.target.closest('.file-download-btn')) return;
    openPreviewModal(data);
  });

  wrapper.appendChild(meta);
  wrapper.appendChild(card);
  messagesInner.appendChild(wrapper);
  scrollToBottom();
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════
// FILE PREVIEW MODAL
// ══════════════════════════════════
function openPreviewModal(data) {
  const mime = data.mimetype || '';
  const name = data.originalName || 'file';

  modalFilename.textContent = name;
  modalDownload.href = data.url;
  modalDownload.download = name;
  modalBody.innerHTML = '';

  if (mime.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = data.url;
    img.alt = name;
    modalBody.appendChild(img);
  } else if (mime.startsWith('video/')) {
    const vid = document.createElement('video');
    vid.src = data.url;
    vid.controls = true;
    vid.autoplay = true;
    vid.style.maxWidth = '80vw';
    vid.style.maxHeight = '65vh';
    modalBody.appendChild(vid);
  } else if (mime.startsWith('audio/')) {
    const aud = document.createElement('audio');
    aud.src = data.url;
    aud.controls = true;
    aud.autoplay = true;
    modalBody.appendChild(aud);
  } else if (mime.includes('pdf')) {
    const iframe = document.createElement('iframe');
    iframe.src = data.url;
    iframe.title = name;
    modalBody.appendChild(iframe);
  } else {
    modalBody.innerHTML = `
      <div class="file-no-preview">
        <div class="big-icon">${getFileIcon(mime, name)}</div>
        <div>${escapeHtml(name)}</div>
        <div style="margin-top:0.5rem;font-size:0.7rem;color:var(--text-muted)">${formatBytes(data.size || 0)}</div>
        <div style="margin-top:1rem;font-size:0.7rem">Preview not available. Download to open.</div>
      </div>`;
  }

  previewModal.classList.remove('hidden');
}

function closePreviewModal() {
  previewModal.classList.add('hidden');
  // Stop any playing media
  modalBody.querySelectorAll('video,audio').forEach(el => { el.pause(); el.src = ''; });
  modalBody.innerHTML = '';
}

modalClose.addEventListener('click', closePreviewModal);
modalBackdrop.addEventListener('click', closePreviewModal);

// ══════════════════════════════════
// DEVICE LIST UI
// ══════════════════════════════════
function renderDeviceList(devices) {
  deviceList.innerHTML = '';
  devices.forEach(name => {
    const item = document.createElement('div');
    item.className = `device-item${name === myName ? ' self' : ''}`;
    item.innerHTML = `<span class="device-dot"></span><span>${escapeHtml(name)}${name === myName ? ' (you)' : ''}</span>`;
    deviceList.appendChild(item);
  });
  onlineCount.textContent = devices.length;
}

// ══════════════════════════════════
// FILE ATTACH & PREVIEW STRIP
// ══════════════════════════════════
fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files);
  files.forEach(f => pendingFiles.push(f));
  fileInput.value = '';
  renderFileStrip();
});

function renderFileStrip() {
  filePreviewStrip.innerHTML = '';
  if (pendingFiles.length === 0) {
    filePreviewStrip.classList.add('hidden');
    return;
  }
  filePreviewStrip.classList.remove('hidden');
  pendingFiles.forEach((file, idx) => {
    const thumb = document.createElement('div');
    thumb.className = 'file-preview-thumb';

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      const img = document.createElement('img');
      img.src = url;
      img.onload = () => URL.revokeObjectURL(url);
      thumb.appendChild(img);
    } else {
      const label = document.createElement('div');
      label.className = 'thumb-label';
      label.textContent = file.name;
      thumb.appendChild(label);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'thumb-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      pendingFiles.splice(idx, 1);
      renderFileStrip();
    });
    thumb.appendChild(removeBtn);
    filePreviewStrip.appendChild(thumb);
  });
}

// ══════════════════════════════════
// UPLOAD FILES  (chunked + parallel)
// ══════════════════════════════════
const CHUNK_SIZE  = 100 * 1024 * 1024; // 100 MB per chunk → only 10-60 requests for 1-6 GB
const CONCURRENCY = 8;                 // 8 parallel streams

async function uploadFile(file) {
  const progressWrapper = document.createElement('div');
  progressWrapper.className = 'upload-progress msg-wrapper self';
  progressWrapper.innerHTML = `
    <span>Uploading ${escapeHtml(file.name)}...</span>
    <div class="progress-bar-wrap"><div class="progress-bar-fill"></div></div>
    <span class="upload-speed-label" style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;display:block;"></span>`;
  messagesInner.appendChild(progressWrapper);
  scrollToBottom();

  const fill      = progressWrapper.querySelector('.progress-bar-fill');
  const speedLabel = progressWrapper.querySelector('.upload-speed-label');

  // ── Small file: use original single-request route ─────────────────
  if (file.size <= CHUNK_SIZE) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('roomId', myRoom);
    formData.append('deviceName', myName);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/upload');
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) fill.style.width = ((e.loaded / e.total) * 100) + '%';
      });
      xhr.addEventListener('load', () => {
        progressWrapper.remove();
        if (xhr.status === 200) resolve(JSON.parse(xhr.responseText));
        else reject(new Error('Upload failed'));
      });
      xhr.addEventListener('error', () => { progressWrapper.remove(); reject(new Error('Upload error')); });
      xhr.send(formData);
    });
  }

  // ── Large file: parallel chunked upload ───────────────────────────
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const fileId      = crypto.randomUUID();
  let bytesLoaded   = 0;
  let startTime     = Date.now();

  function updateProgress(chunkBytes) {
    bytesLoaded += chunkBytes;
    fill.style.width = ((bytesLoaded / file.size) * 100) + '%';
    const elapsed = (Date.now() - startTime) / 1000;
    const speed   = bytesLoaded / elapsed;
    speedLabel.textContent = `${(speed / 1048576).toFixed(1)} MB/s`;
  }

  // Build an array of chunk-upload tasks
  const tasks = Array.from({ length: totalChunks }, (_, i) => async () => {
    const start = i * CHUNK_SIZE;
    const end   = Math.min(start + CHUNK_SIZE, file.size);
    const blob  = file.slice(start, end);

    const res = await fetch('/upload-chunk', {
      method: 'POST',
      headers: {
        'Content-Type':   'application/octet-stream',
        'x-file-id':      fileId,
        'x-chunk-index':  String(i),
        'x-total-chunks': String(totalChunks)
      },
      body: blob
    });
    if (!res.ok) throw new Error(`Chunk ${i} failed`);
    updateProgress(end - start);
  });

  // Run chunks with limited concurrency
  async function runWithConcurrency(tasks, limit) {
    const results = [];
    const executing = new Set();
    for (const task of tasks) {
      const p = Promise.resolve().then(() => task());
      results.push(p);
      executing.add(p);
      p.finally(() => executing.delete(p));
      if (executing.size >= limit) await Promise.race(executing);
    }
    return Promise.all(results);
  }

  try {
    await runWithConcurrency(tasks, CONCURRENCY);

    // Assembly phase — show it in the progress label
    speedLabel.textContent = 'Assembling on server…';
    fill.style.width = '99%';

    // Finalize: assemble chunks on server
    const finalRes = await fetch('/upload-finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId,
        originalName: file.name,
        mimetype:     file.type || 'application/octet-stream',
        totalChunks,
        roomId:     myRoom,
        deviceName: myName
      })
    });

    progressWrapper.remove();
    if (!finalRes.ok) throw new Error('Finalize failed');
    return await finalRes.json();
  } catch (err) {
    progressWrapper.remove();
    throw err;
  }
}

// ══════════════════════════════════
// SEND LOGIC
// ══════════════════════════════════
async function sendMessage() {
  const text = messageInput.value.trim();
  const files = [...pendingFiles];
  pendingFiles = [];
  renderFileStrip();
  messageInput.value = '';
  stopTyping();

  if (text) {
    if (socket && socket.connected) {
      socket.emit('send-message', { roomId: myRoom, message: text, deviceName: myName });
    } else {
      // Offline: queue the message and show it locally with a pending indicator
      const queued = { roomId: myRoom, message: text, deviceName: myName, _queued: true };
      messageQueue.push(queued);
      localStorage.setItem('nexus_queue', JSON.stringify(messageQueue));
      // Show locally with pending style
      const fakeData = { id: crypto.randomUUID(), text, sender: myName, timestamp: new Date().toISOString() };
      appendTextMessage(fakeData, true);
      showOfflineBanner();
      showToast('⚠ Offline — message queued, will send when reconnected', 3500);
    }
  }

  for (const file of files) {
    try {
      await uploadFile(file);
      // Server will broadcast file-shared to room; we also display locally
    } catch (err) {
      showToast('⚠ Upload failed: ' + file.name, 3000);
    }
  }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ══════════════════════════════════
// TYPING EVENTS
// ══════════════════════════════════
function startTyping() {
  if (!isTyping) {
    isTyping = true;
    socket.emit('typing', { roomId: myRoom, deviceName: myName });
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(stopTyping, 1500);
}

function stopTyping() {
  if (isTyping) {
    isTyping = false;
    socket.emit('stop-typing', { roomId: myRoom });
  }
  clearTimeout(typingTimeout);
}

messageInput.addEventListener('input', startTyping);

// ══════════════════════════════════
// SOCKET INITIALIZATION
// ══════════════════════════════════
function initSocket(roomId, deviceName) {
  // Save session so page refresh can restore it
  sessionStorage.setItem('nexus_room', roomId);
  sessionStorage.setItem('nexus_name', deviceName);

  socket = io({
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  let isFirstConnect = true;

  socket.on('connect', () => {
    isOnline = true;
    hideOfflineBanner();
    socket.emit('join-room', { roomId, deviceName });
    // Flush any queued messages
    if (messageQueue.length > 0) {
      const toSend = [...messageQueue];
      messageQueue.length = 0;
      localStorage.removeItem('nexus_queue');
      toSend.forEach(q => socket.emit('send-message', { roomId: q.roomId, message: q.message, deviceName: q.deviceName }));
      showToast(`✓ Reconnected — ${toSend.length} queued message(s) sent`, 3000);
    }
  });

  socket.on('room-joined', ({ roomId, userCount, deviceList: dl }) => {
    if (isFirstConnect) {
      isFirstConnect = false;
      switchToChat(roomId, deviceName);
      appendSystemMsg(`⟩ Connected to room ${roomId} · ${userCount} device(s) online`);
    } else {
      appendSystemMsg(`⟩ Reconnected to room ${roomId} · ${userCount} device(s) online`);
    }
    renderDeviceList(dl);
  });

  socket.on('user-joined', ({ deviceName: dn, userCount, deviceList: dl }) => {
    renderDeviceList(dl);
    appendSystemMsg(`⟩ ${dn} joined the link`);
  });

  socket.on('user-left', ({ deviceName: dn, userCount, deviceList: dl }) => {
    renderDeviceList(dl);
    appendSystemMsg(`⟩ ${dn} disconnected`);
  });

  socket.on('receive-message', (data) => {
    const isSelf = data.sender === myName;
    appendTextMessage(data, isSelf);
  });

  socket.on('file-shared', (data) => {
    const isSelf = data.sender === myName;
    appendFileMessage(data, isSelf);
  });

  socket.on('message-history', (history) => {
    history.forEach(data => {
      const isSelf = data.sender === myName;
      if (data.type === 'text') appendTextMessage(data, isSelf);
      else if (data.type === 'file') appendFileMessage(data, isSelf);
    });
  });

  socket.on('user-typing', ({ deviceName: dn }) => {
    typingText.textContent = `${dn} is typing`;
    typingIndicator.classList.remove('hidden');
    clearTimeout(typingIndicator._t);
    typingIndicator._t = setTimeout(() => typingIndicator.classList.add('hidden'), 2000);
  });

  socket.on('user-stop-typing', () => {
    typingIndicator.classList.add('hidden');
  });

  socket.on('disconnect', (reason) => {
    isOnline = false;
    showOfflineBanner();
    appendSystemMsg('⟩ Connection lost. Reconnecting...');
    if (reason === 'io server disconnect') {
      socket.connect();
    }
  });

  socket.on('reconnect', (attemptNumber) => {
    // room-joined event above handles the UI update
  });

  socket.on('connect_error', () => {
    // Only show error on join screen, not during background reconnect
    if (!chatScreen.classList.contains('active')) {
      showError('Connection error. Is the server running?');
      connectBtn.querySelector('.btn-text').textContent = 'ESTABLISH LINK';
      connectBtn.disabled = false;
    }
  });
}

// ══════════════════════════════════
// SCREEN TRANSITIONS
// ══════════════════════════════════
function switchToChat(roomId, deviceName) {
  joinScreen.classList.remove('active');
  chatScreen.classList.add('active');
  applyCipherEffect(sidebarRoomId, roomId, 20);
  applyCipherEffect(headerRoomLabel, `ROOM: ${roomId}`, 20);
  applyCipherEffect(headerDeviceName, deviceName, 20);
  
  if (window.innerWidth <= 640) {
    sidebar.classList.add('closed');
    sidebarToggleBtn.classList.add('sidebar-closed');
  }

  messageInput.focus();
}

function switchToJoin() {
  chatScreen.classList.remove('active');
  joinScreen.classList.add('active');
  messagesInner.innerHTML = '';
  deviceList.innerHTML = '';
  onlineCount.textContent = '0';
  pendingFiles = [];
  knownMessages.clear();
  renderFileStrip();
  // Clear saved session on manual disconnect
  sessionStorage.removeItem('nexus_room');
  sessionStorage.removeItem('nexus_name');
  if (socket) { socket.disconnect(); socket = null; }
}

// ══════════════════════════════════
// JOIN / CONNECT
// ══════════════════════════════════
genRoomBtn.addEventListener('click', () => {
  roomIdInput.value = generateRoomId();
  roomIdInput.focus();
});

connectBtn.addEventListener('click', () => {
  const name = deviceNameInput.value.trim();
  const room = roomIdInput.value.trim().toUpperCase();
  joinError.classList.add('hidden');

  if (!name) return showError('Enter a device name.');
  if (!room) return showError('Enter or generate a Room ID.');
  if (room.length < 3) return showError('Room ID too short (min 3 chars).');

  myName = name;
  myRoom = room;
  connectBtn.querySelector('.btn-text').textContent = 'CONNECTING...';
  connectBtn.disabled = true;

  initSocket(room, name);
});

// Allow Enter key on inputs to connect
[deviceNameInput, roomIdInput].forEach(el => {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connectBtn.click();
  });
});

// ══════════════════════════════════
// SIDEBAR ACTIONS
// ══════════════════════════════════
sidebarToggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('closed');
  sidebarToggleBtn.classList.toggle('sidebar-closed');
});

sidebarCloseBtn.addEventListener('click', () => {
  sidebar.classList.add('closed');
  sidebarToggleBtn.classList.add('sidebar-closed');
});

copyRoomBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(myRoom).then(() => showToast('✓ Room ID copied!')).catch(() => showToast('Could not copy'));
});

disconnectBtn.addEventListener('click', () => {
  switchToJoin();
  connectBtn.querySelector('.btn-text').textContent = 'ESTABLISH LINK';
  connectBtn.disabled = false;
});

// ══════════════════════════════════
// KEYBOARD SHORTCUTS
// ══════════════════════════════════
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !previewModal.classList.contains('hidden')) {
    closePreviewModal();
  }
});

// ══════════════════════════════════
// SESSION RESTORE ON PAGE LOAD
// ══════════════════════════════════
(function restoreSession() {
  const savedRoom = sessionStorage.getItem('nexus_room');
  const savedName = sessionStorage.getItem('nexus_name');
  if (savedRoom && savedName) {
    myName = savedName;
    myRoom = savedRoom;
    // Pre-fill the join form in case user goes back
    deviceNameInput.value = savedName;
    roomIdInput.value = savedRoom;
    // Reconnect automatically
    initSocket(savedRoom, savedName);
  }
})();

// ══════════════════════════════════
// OFFLINE BANNER
// ══════════════════════════════════
(function createOfflineBanner() {
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.innerHTML = '⚡ OFFLINE — messages will queue and send on reconnect';
  banner.style.cssText = [
    'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
    'background:#1a0000', 'color:#ff4444', 'border:1px solid #ff4444',
    'padding:6px 18px', 'font-size:0.72rem', 'letter-spacing:0.08em',
    'border-radius:4px', 'z-index:9999', 'display:none',
    'font-family:"Share Tech Mono",monospace', 'box-shadow:0 0 12px #ff444466'
  ].join(';');
  document.body.appendChild(banner);
})();

function showOfflineBanner() {
  const b = document.getElementById('offline-banner');
  if (b) b.style.display = 'block';
}
function hideOfflineBanner() {
  const b = document.getElementById('offline-banner');
  if (b) b.style.display = 'none';
}

// Browser online/offline events (for when device loses internet entirely)
window.addEventListener('offline', () => { isOnline = false; showOfflineBanner(); });
window.addEventListener('online',  () => { isOnline = true;  if (socket && socket.connected) hideOfflineBanner(); });

// ══════════════════════════════════
// SERVICE WORKER REGISTRATION
// ══════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[NEXUS] Service Worker registered:', reg.scope))
      .catch(err => console.warn('[NEXUS] SW registration failed:', err));
  });
}
