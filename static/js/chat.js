(() => {
'use strict';

const socket = io({ withCredentials: true });

// Reconnect banner
const connBanner = document.createElement('div');
connBanner.className = 'chat-conn-banner';
connBanner.textContent = 'Reconnecting…';
document.body.appendChild(connBanner);
socket.on('disconnect', () => connBanner.classList.add('show'));
socket.on('connect',    () => connBanner.classList.remove('show'));

const $ = id => document.getElementById(id);

if (typeof window.ME_ID === 'undefined') {
  console.warn('[chat] window.ME_ID is not set — messages from you will render as received');
}

// DOM
const screenRooms     = $('screenRooms');
const screenConvo     = $('screenConvo');
const roomListEl      = $('roomList');
const chatMessagesEl  = $('chatMessages');
const chatInputEl     = $('chatInput');
const chatSendBtn     = $('chatSend');
const chatTitleEl     = $('chatTitle');
const chatSubtitleEl  = $('chatSubtitle');
const chatPeerAvatar  = $('chatPeerAvatar');
const convoBackBtn    = $('convoBackBtn');
const typingEl        = $('typingIndicator');
const typingTextEl    = $('typingText');
const newPillEl       = $('newMessagesPill');
const searchToggleBtn = $('searchToggleBtn');
const searchBar       = $('searchBar');
const searchInput     = $('searchInput');
const searchCloseBtn  = $('searchCloseBtn');
const searchResults   = $('searchResults');
const newGroupBtn     = $('newGroupBtn');
const newGroupModal   = $('newGroupModal');
const newGroupClose   = $('newGroupClose');
const newGroupCreate  = $('newGroupCreate');
const newGroupName    = $('newGroupName');
const groupUserPicker = $('groupUserPicker');
const startNewBtn     = $('startNewBtn');

// State
let rooms         = [];
let currentRoomId = null;
let currentRoom   = null;
let typingTimer   = null;
let typingActive  = false;
let peerTypingTO  = null;
let onlineUsers   = new Set();
let audioCtx      = null;

// Helpers
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, m => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]
  ));
}
function initials(name) {
  return (name || '?').trim().split(/\s+/).map(w => w[0])
    .slice(0, 2).join('').toUpperCase();
}
function avatarHtml(url, name, small) {
  const cls = small ? 'room-avatar' : 'msg-avatar';
  return url
    ? `<img class="${cls}" src="${esc(url)}" alt="">`
    : `<div class="${cls} avatar-blank">${esc(initials(name))}</div>`;
}
function isAtBottom() {
  if (!chatMessagesEl) return true;
  const gap = chatMessagesEl.scrollHeight - chatMessagesEl.scrollTop
              - chatMessagesEl.clientHeight;
  return gap < 60;
}
function scrollToBottom(instant) {
  if (!chatMessagesEl) return;
  chatMessagesEl.scrollTo({
    top: chatMessagesEl.scrollHeight,
    behavior: instant ? 'auto' : 'smooth',
  });
}
function playPing() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.26);
  } catch (_) {}
}
function linkify(text) {
  return esc(text).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}
function dayLabel(d) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today - that) / 86400000;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return that.toLocaleDateString('en-US', { weekday: 'long' });
  return that.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Room list
async function loadRooms() {
  try {
    const r = await fetch('/api/chat/rooms', { credentials: 'same-origin' });
    if (!r.ok) throw new Error();
    rooms = await r.json();
    renderRooms();
  } catch (_) {
    roomListEl.innerHTML = '<div class="empty">Could not load chats.</div>';
  }
}

function renderRooms() {
  if (!rooms.length) {
    roomListEl.innerHTML = '<div class="empty">No chats yet. Tap + to start one.</div>';
    return;
  }
  rooms.sort((a, b) => {
    if (a.unread > 0 && b.unread === 0) return -1;
    if (b.unread > 0 && a.unread === 0) return 1;
    return 0;
  });
  roomListEl.innerHTML = rooms.map(r => {
    const avatar = r.avatar
      ? `<img class="room-avatar" src="${esc(r.avatar)}" alt="">`
      : `<div class="room-avatar avatar-blank">${esc(initials(r.name))}</div>`;
    const onlineDot = (!r.is_group && r.online)
      ? '<span class="online-dot"></span>' : '';
    const lastLine = r.last_message
      ? `${r.last_is_mine ? 'You: ' : ''}${esc(r.last_message)}`
      : '<em style="opacity:.5;">No messages yet</em>';
    const unreadBadge = r.unread > 0
      ? `<span class="room-unread">${r.unread > 99 ? '99+' : r.unread}</span>`
      : '';
    return `
      <div class="room-item${r.unread > 0 ? ' unread' : ''}" data-id="${r.id}">
        <div style="position:relative;">${avatar}${onlineDot}</div>
        <div class="room-body">
          <div class="room-head">
            <div class="room-name">${esc(r.name)}</div>
            <div class="room-time">${esc(r.last_time)}</div>
          </div>
          <div class="room-preview">${lastLine}</div>
        </div>
        ${unreadBadge}
      </div>`;
  }).join('');
}

roomListEl.addEventListener('click', e => {
  const item = e.target.closest('.room-item');
  if (item) openRoom(parseInt(item.dataset.id, 10));
});

// Open conversation
async function openRoom(roomId) {
  currentRoomId = roomId;
  currentRoom = rooms.find(r => r.id === roomId);

  if (!currentRoom) {
    await loadRooms();
    currentRoom = rooms.find(r => r.id === roomId) || null;
  }

  screenRooms.classList.add('hidden');
  screenConvo.classList.remove('hidden');

  if (currentRoom) {
    chatTitleEl.textContent = currentRoom.name;
    chatPeerAvatar.innerHTML = currentRoom.avatar
      ? `<img src="${esc(currentRoom.avatar)}" alt="">`
      : `<div class="avatar-blank">${esc(initials(currentRoom.name))}</div>`;
    updatePresenceHeader();
  }

  chatMessagesEl.innerHTML = `
    <div class="skeleton">
      <div class="skeleton-row"><div class="skeleton-bubble"></div></div>
      <div class="skeleton-row right"><div class="skeleton-bubble"></div></div>
      <div class="skeleton-row"><div class="skeleton-bubble" style="max-width:60%"></div></div>
    </div>`;
  newPillEl.classList.add('hidden');

  if (socket.connected) {
    socket.emit('join', { room_id: roomId });
  } else {
    socket.once('connect', () => socket.emit('join', { room_id: roomId }));
  }

  try {
    const r = await fetch(`/api/chat/rooms/${roomId}/messages`,
                          { credentials: 'same-origin' });
    if (!r.ok) throw new Error();
    const msgs = await r.json();
    renderMessages(msgs);
    scrollToBottom(true);
    chatInputEl.focus();
  } catch (_) {
    chatMessagesEl.innerHTML = '<div class="empty">Could not load messages.</div>';
    return;
  }

  socket.emit('read', { room_id: roomId });
  if (currentRoom) {
    currentRoom.unread = 0;
    renderRooms();
  }
}

function renderMessages(msgs) {
  if (!msgs.length) {
    chatMessagesEl.innerHTML = '<div class="empty">Say hi 👋</div>';
    return;
  }
  let html = '';
  let lastDay = '';
  for (const m of msgs) {
    const d = m.created_at ? new Date(m.created_at) : new Date();
    const key = d.toDateString();
    if (key !== lastDay) {
      html += `<div class="msg-day">${esc(dayLabel(d))}</div>`;
      lastDay = key;
    }
    html += msgHtml(m);
  }
  chatMessagesEl.innerHTML = html;
}

function msgHtml(m) {
  const mine = (m.mine !== undefined)
    ? m.mine
    : (m.user_id === window.ME_ID);
  const tick = mine
    ? `<span class="msg-tick${m.read_at ? ' read' : ''}">${m.read_at ? '✓✓' : '✓'}</span>`
    : '';
  const avatar = mine ? '' : avatarHtml(m.avatar, m.author, false);
  const sending = m.pending ? ' sending' : '';
  return `
    <div class="msg ${mine ? 'mine' : 'theirs'}${sending}" data-id="${m.id}">
      ${avatar}
      <div class="msg-bubble">
        ${mine ? '' : `<div class="msg-author">${esc(m.author)}</div>`}
        <div class="msg-content">${linkify(m.content)}</div>
        <div class="msg-meta">${esc(m.time)}${tick}</div>
      </div>
    </div>`;
}

function appendMessage(m) {
  const empty = chatMessagesEl.querySelector('.empty');
  if (empty) empty.remove();
  const atBottom = isAtBottom();
  chatMessagesEl.insertAdjacentHTML('beforeend', msgHtml(m));
  if (m.mine || atBottom) {
    scrollToBottom();
    newPillEl.classList.add('hidden');
  } else {
    newPillEl.classList.remove('hidden');
  }
}

newPillEl.addEventListener('click', () => {
  scrollToBottom();
  newPillEl.classList.add('hidden');
});

// Send message
function sendMessage() {
  const content = chatInputEl.value.trim();
  if (!content || !currentRoomId) return;
  if (!socket.connected) {
    alert('Reconnecting — try again in a moment.');
    return;
  }
  const now = new Date();
  appendMessage({
    id: 'tmp_' + Date.now(),
    content,
    user_id: window.ME_ID,
    author: 'You',
    avatar: null,
    mine: true,
    time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    read_at: null,
    pending: true,
  });
  socket.emit('message', { room_id: currentRoomId, content });
  chatInputEl.value = '';
  stopTyping();
}

chatSendBtn.addEventListener('click', sendMessage);
chatInputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Typing (outgoing)
chatInputEl.addEventListener('input', () => {
  if (!currentRoomId || !socket.connected) return;
  if (!typingActive) {
    typingActive = true;
    socket.emit('typing', { room_id: currentRoomId });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTyping, 2000);
});

function stopTyping() {
  if (typingActive && currentRoomId && socket.connected) {
    socket.emit('stop_typing', { room_id: currentRoomId });
  }
  typingActive = false;
  clearTimeout(typingTimer);
}

// Typing (incoming)
socket.on('typing', data => {
  if (data.room_id !== currentRoomId) return;
  typingTextEl.textContent = `${data.name} is typing…`;
  typingEl.classList.remove('hidden');
  clearTimeout(peerTypingTO);
  peerTypingTO = setTimeout(() => {
    typingEl.classList.add('hidden');
  }, 3000);
});

socket.on('stop_typing', data => {
  if (data.room_id !== currentRoomId) return;
  typingEl.classList.add('hidden');
  clearTimeout(peerTypingTO);
});

// Incoming message
socket.on('message', m => {
  const isMine = (m.user_id === window.ME_ID);
  m.mine = isMine;
  if (m.room_id !== currentRoomId) return;
  if (isMine) {
    const pending = chatMessagesEl.querySelector('.msg.sending');
    if (pending) pending.remove();
  } else {
    playPing();
  }
  appendMessage(m);
  if (!isMine) {
    socket.emit('read', { room_id: currentRoomId });
  }
  const room = rooms.find(r => r.id === m.room_id);
  if (room) {
    room.last_message = m.content;
    room.last_time = m.time;
    room.last_is_mine = isMine;
    room.unread = 0;
    renderRooms();
  }
});

// Read receipts
socket.on('read', data => {
  if (data.room_id !== currentRoomId) return;
  chatMessagesEl.querySelectorAll('.msg.mine .msg-tick').forEach(el => {
    el.classList.add('read');
    el.textContent = '✓✓';
  });
});

socket.on('room_read', data => {
  const room = rooms.find(r => r.id === data.room_id);
  if (room) { room.unread = 0; renderRooms(); }
});

// Room list live updates
socket.on('room_update', data => {
  const room = rooms.find(r => r.id === data.room_id);
  if (!room) { loadRooms(); return; }
  room.last_message = data.last_message;
  room.last_time = data.last_time;
  room.last_is_mine = false;
  if (data.room_id === currentRoomId) {
    room.unread = 0;
  } else {
    room.unread = data.unread || 0;
  }
  renderRooms();
  if (data.from_user_id !== window.ME_ID && data.room_id !== currentRoomId) {
    playPing();
  }
});

// Presence
socket.on('presence', data => {
  if (data.online) {
    onlineUsers.add(data.user_id);
  } else {
    onlineUsers.delete(data.user_id);
  }
  if (currentRoom && !currentRoom.is_group
      && data.user_id === currentRoom.other_user_id) {
    currentRoom.online = data.online;
    if (!data.online && data.last_seen) {
      currentRoom.last_seen = data.last_seen;
    }
    updatePresenceHeader();
    renderRooms();
  } else {
    rooms.forEach(r => {
      if (!r.is_group && r.other_user_id === data.user_id) {
        r.online = data.online;
      }
    });
    renderRooms();
  }
});

function updatePresenceHeader() {
  if (!currentRoom || currentRoom.is_group) {
    chatSubtitleEl.textContent = currentRoom
      ? `${currentRoom.member_count} members`
      : '';
    return;
  }
  if (currentRoom.online) {
    chatSubtitleEl.innerHTML = '<span style="color:#6BCB9C;">● Online</span>';
  } else if (currentRoom.last_seen) {
    chatSubtitleEl.textContent = `Last seen ${timeAgo(currentRoom.last_seen)}`;
  } else {
    chatSubtitleEl.textContent = 'Offline';
  }
}

function timeAgo(iso) {
  if (!iso) return '';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// Reconnect
socket.on('connect', () => {
  if (currentRoomId) {
    socket.emit('join', { room_id: currentRoomId });
    socket.emit('read', { room_id: currentRoomId });
  }
  loadRooms();
});

// Back button
convoBackBtn.addEventListener('click', () => {
  stopTyping();
  if (currentRoomId) socket.emit('leave', { room_id: currentRoomId });
  typingEl.classList.add('hidden');
  newPillEl.classList.add('hidden');
  currentRoomId = null;
  currentRoom = null;
  screenConvo.classList.add('hidden');
  screenRooms.classList.remove('hidden');
  loadRooms();
});

// Search
searchToggleBtn.addEventListener('click', () => {
  searchBar.classList.toggle('hidden');
  if (!searchBar.classList.contains('hidden')) searchInput.focus();
});
searchCloseBtn.addEventListener('click', () => {
  searchBar.classList.add('hidden');
  searchInput.value = '';
  searchResults.classList.add('hidden');
});

let searchTO = null;
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  clearTimeout(searchTO);
  if (!q) { searchResults.classList.add('hidden'); return; }
  searchTO = setTimeout(() => runSearch(q), 220);
});

async function runSearch(q) {
  try {
    const r = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`,
                          { credentials: 'same-origin' });
    if (!r.ok) throw new Error();
    const users = await r.json();
    if (!users.length) {
      searchResults.innerHTML = '<div class="empty" style="padding:16px;">No users found.</div>';
    } else {
      searchResults.innerHTML = users.map(u => `
        <div class="search-row"
             data-uid="${u.id}"
             data-room-id="${u.existing_room_id || ''}"
             data-name="${esc(u.name)}">
          <div class="room-avatar avatar-blank">${esc(initials(u.name))}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;">${esc(u.name)}</div>
            <div style="font-size:12px;opacity:.6;">${esc(u.email)}</div>
          </div>
        </div>`).join('');
    }
    searchResults.classList.remove('hidden');
  } catch (_) {}
}

searchResults.addEventListener('click', async e => {
  const row = e.target.closest('.search-row');
  if (!row) return;
  searchBar.classList.add('hidden');
  searchInput.value = '';
  searchResults.classList.add('hidden');
  const existingRoomId = row.dataset.roomId;
  if (existingRoomId) {
    await loadRooms();
    openRoom(parseInt(existingRoomId, 10));
    return;
  }
  try {
    const r = await fetch(`/api/chat/dm/${row.dataset.uid}`,
                          { method: 'POST', credentials: 'same-origin' });
    if (!r.ok) throw new Error();
    const room = await r.json();
    await loadRooms();
    openRoom(room.id);
  } catch (_) {
    alert('Could not open chat.');
  }
});

// New group
startNewBtn.addEventListener('click', () => {
  searchBar.classList.remove('hidden');
  searchInput.focus();
});
newGroupBtn.addEventListener('click', async () => {
  newGroupModal.classList.add('open');
  newGroupName.value = '';
  groupUserPicker.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const r = await fetch('/api/users', { credentials: 'same-origin' });
    const users = await r.json();
    groupUserPicker.innerHTML = users.map(u => `
      <label class="user-pick">
        <input type="checkbox" value="${u.id}">
        <span>${esc(u.name)}</span>
      </label>`).join('');
  } catch (_) {
    groupUserPicker.innerHTML = '<div class="empty">Failed.</div>';
  }
});
newGroupClose.addEventListener('click', () => newGroupModal.classList.remove('open'));
newGroupModal.addEventListener('click', e => {
  if (e.target === newGroupModal) newGroupModal.classList.remove('open');
});

newGroupCreate.addEventListener('click', async () => {
  const name = newGroupName.value.trim();
  const ids = [...groupUserPicker.querySelectorAll('input:checked')]
    .map(i => parseInt(i.value, 10));
  if (!name) { alert('Name required'); return; }
  if (ids.length < 2) { alert('Pick at least 2 members'); return; }
  try {
    const r = await fetch('/api/chat/group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ name, member_ids: ids }),
    });
    if (!r.ok) throw new Error();
    const room = await r.json();
    newGroupModal.classList.remove('open');
    await loadRooms();
    openRoom(room.id);
  } catch (_) {
    alert('Could not create group.');
  }
});

// Boot
loadRooms();
})();