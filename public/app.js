/* ─────────────────────────────────────────
   NEXUS LINK — Client Application
   ───────────────────────────────────────── */
// ══ State ══
let socket = null;
let myRoom = '';
let myName = '';
let pendingFiles = [];
let typingTimeout = null;
let isTyping = false;
let allFiles = {};  // id → file data
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
// ══════════════════════════════════
// PARTICLES CANVAS BACKGROUND
// ══════════════════════════════════
const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
function createParticle() {
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    size: Math.random() * 1.5 + 0.3,
    opacity: Math.random() * 0.5 + 0.1,
    char: Math.random() > 0.7 ? String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96)) : (Math.random() > 0.5 ? '1' : '0')
  };
}
function initParticles() {
  resizeCanvas();
  particles = Array.from({ length: 120 }, createParticle);
}
function drawParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '10px "Share Tech Mono"';
  particles.forEach(p => {
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = '#00ff41';
    if (Math.random() > 0.97) {
      p.char = Math.random() > 0.5 ? String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96)) : (Math.random() > 0.5 ? '1' : '0');
    }
    ctx.fillText(p.char, p.x, p.y);
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < -10) p.x = canvas.width + 10;
    if (p.x > canvas.width + 10) p.x = -10;
    if (p.y < -10) p.y = canvas.height + 10;
    if (p.y > canvas.height + 10) p.y = -10;
    // Random flicker
    if (Math.random() > 0.98) p.opacity = Math.random() * 0.5 + 0.05;
  });
  ctx.globalAlpha = 1;
  requestAnimationFrame(drawParticles);
}
window.addEventListener('resize', () => {
  resizeCanvas();
});
initParticles();
drawParticles();
// ══════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════
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
  el.textContent = text;
  messagesInner.appendChild(el);
  scrollToBottom();
}
function appendTextMessage(data, isSelf) {
  const wrapper = document.createElement('div');
  wrapper.className = `msg-wrapper ${isSelf ? 'self' : 'other'}`;
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = isSelf
    ? `<span>${formatTime(data.timestamp)}</span>`
    : `<span>${escapeHtml(data.sender)}</span><span>${formatTime(data.timestamp)}</span>`;
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = data.text;
  wrapper.appendChild(meta);
  wrapper.appendChild(bubble);
  messagesInner.appendChild(wrapper);
  scrollToBottom();
}
function appendFileMessage(data, isSelf) {
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
// UPLOAD FILES
// ══════════════════════════════════
async function uploadFile(file) {
  const progressWrapper = document.createElement('div');
  progressWrapper.className = 'upload-progress msg-wrapper self';
  progressWrapper.innerHTML = `
    <span>Uploading ${escapeHtml(file.name)}...</span>
    <div class="progress-bar-wrap"><div class="progress-bar-fill" id="pb-${Date.now()}"></div></div>`;
  messagesInner.appendChild(progressWrapper);
  scrollToBottom();
  const fill = progressWrapper.querySelector('.progress-bar-fill');
  const formData = new FormData();
  formData.append('file', file);
  formData.append('roomId', myRoom);
  formData.append('deviceName', myName);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload');
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        fill.style.width = ((e.loaded / e.total) * 100) + '%';
      }
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
    socket.emit('send-message', { roomId: myRoom, message: text, deviceName: myName });
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
  socket = io({ transports: ['websocket'] });
  socket.on('connect', () => {
    socket.emit('join-room', { roomId, deviceName });
  });
  socket.on('room-joined', ({ roomId, userCount, deviceList: dl }) => {
    switchToChat(roomId, deviceName);
    renderDeviceList(dl);
    appendSystemMsg(`⟩ Connected to room ${roomId} · ${userCount} device(s) online`);
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
  socket.on('user-typing', ({ deviceName: dn }) => {
    typingText.textContent = `${dn} is typing`;
    typingIndicator.classList.remove('hidden');
    clearTimeout(typingIndicator._t);
    typingIndicator._t = setTimeout(() => typingIndicator.classList.add('hidden'), 2000);
  });
  socket.on('user-stop-typing', () => {
    typingIndicator.classList.add('hidden');
  });
  socket.on('disconnect', () => {
    appendSystemMsg('⟩ Connection lost. Reconnecting...');
  });
  socket.on('connect_error', () => {
    showError('Connection error. Is the server running?');
    connectBtn.querySelector('.btn-text').textContent = 'ESTABLISH LINK';
    connectBtn.disabled = false;
  });
}
// ══════════════════════════════════
// SCREEN TRANSITIONS
// ══════════════════════════════════
function switchToChat(roomId, deviceName) {
  joinScreen.classList.remove('active');
  chatScreen.classList.add('active');
  sidebarRoomId.textContent = roomId;
  headerRoomLabel.textContent = `ROOM: ${roomId}`;
  headerDeviceName.textContent = deviceName;
  messageInput.focus();
}
function switchToJoin() {
  chatScreen.classList.remove('active');
  joinScreen.classList.add('active');
  messagesInner.innerHTML = '';
  deviceList.innerHTML = '';
  onlineCount.textContent = '0';
  pendingFiles = [];
  renderFileStrip();
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
