(() => {
  'use strict';

  const ME_ID = window.ME_ID ? String(window.ME_ID) : "";
  const ROOT = (window.CHAT_API_BASE || '').replace(/\/$/, '');

  // ── ALIGNED API ROUTES (MATCHES YOUR PYTHON BACKEND) ──
  const API = {
    rooms:         () => `${ROOT}/api/chat/rooms`,
    messages:      (roomId) => `${ROOT}/api/chat/rooms/${encodeURIComponent(roomId)}/messages`,
    send:          (roomId) => `${ROOT}/api/chat/rooms/${encodeURIComponent(roomId)}/messages`,
    read:          (roomId) => `${ROOT}/api/chat/rooms/${encodeURIComponent(roomId)}/read`,
    typing:        (roomId) => `${ROOT}/api/chat/rooms/${encodeURIComponent(roomId)}/typing`,
    presence:      () => `${ROOT}/api/chat/presence`,
    react:         (messageId) => `${ROOT}/api/chat/messages/${encodeURIComponent(messageId)}/reactions`,
    search:        (query) => `${ROOT}/api/users/search?q=${encodeURIComponent(query)}`,
    users:         () => `${ROOT}/api/chat/users`,
    createGroup:   () => `${ROOT}/api/chat/group`,
    dm:            (userId) => `${ROOT}/api/chat/dm/${encodeURIComponent(userId)}`,
    notifications: () => `${ROOT}/api/chat/notifications`
  };

  const POLL_MESSAGES_MS = 2500;
  const POLL_ROOMS_MS = 9000;
  const PRESENCE_MS = 15000;
  const TYPING_IDLE_MS = 1800;

  const $ = (id) => document.getElementById(id);
  const el = {
    rooms: $('screenRooms'), searchToggle: $('searchToggleBtn'), newGroup: $('newGroupBtn'),
    searchBar: $('searchBar'), searchInput: $('searchInput'), searchClose: $('searchCloseBtn'),
    searchResults: $('searchResults'), roomList: $('roomList'), startNew: $('startNewBtn'),
    convo: $('screenConvo'), back: $('convoBackBtn'), peerInfo: $('peerInfo'), peerAvatar: $('chatPeerAvatar'),
    title: $('chatTitle'), subtitle: $('chatSubtitle'), messages: $('chatMessages'),
    typing: $('typingIndicator'), typingText: $('typingText'), newPill: $('newMessagesPill'),
    composer: $('chatComposer'), input: $('chatInput'), send: $('chatSend'),
    groupModal: $('newGroupModal'), groupClose: $('newGroupClose'), groupName: $('newGroupName'),
    userPicker: $('groupUserPicker'), groupCreate: $('newGroupCreate')
  };

  const state = {
    rooms: [], activeRoom: null, messages: [], lastMessageId: null,
    pollMessagesTimer: null, pollRoomsTimer: null, presenceTimer: null,
    typingTimer: null, searchTimer: null, typingSent: false, sending: false,
    messageRequestTokens: new Map(), unreadAtBottom: 0
  };

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
  }
  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 2)).toUpperCase();
  }
  function fmtTime(value) {
    if (!value) return '';
    const date = new Date(value);
    return isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  }
  function fmtRoomTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toDateString() === new Date().toDateString() ? fmtTime(date) : date.toLocaleDateString([], { day:'numeric', month:'short' });
  }

  function roomId(r) { return String(r.id ?? r.room_id ?? ''); }
  function roomName(r) { return r.name || r.title || 'Conversation'; }
  function roomAvatar(r) { return r.avatar || ''; }
  function roomOnline(r) { return !!(r.online); }
  function msgId(m) { return String(m.id ?? m.message_id ?? ''); }
  function msgSender(m) { return String(m.user_id ?? m.sender_id ?? ''); }
  function isMine(m) { return m.mine === true || (ME_ID && msgSender(m) === ME_ID); }
  function msgText(m) { return m.content ?? m.message ?? ''; }
  function msgTime(m) { return m.created_at ?? m.time ?? ''; }

  async function request(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, { credentials:'same-origin', ...options, headers });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`);
    return data;
  }

  function unwrapList(data, keys) {
    if (Array.isArray(data)) return data;
    for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
    return [];
  }

  function toast(message) {
    let node = $('lcuChatToast');
    if (!node) {
      node = document.createElement('div'); node.id = 'lcuChatToast'; node.className = 'chat-toast';
      document.body.appendChild(node);
    }
    node.textContent = message; node.classList.add('show');
    clearTimeout(toast._timer); toast._timer = setTimeout(() => node.classList.remove('show'), 2600);
  }

  function avatarMarkup(name, url, online = false) {
    const inner = url ? `<img src="${escapeHTML(url)}" alt="" loading="lazy">` : escapeHTML(initials(name));
    return `<span class="chat-avatar-wrap"><span class="chat-avatar">${inner}</span>${online ? '<i class="chat-online-dot"></i>' : ''}</span>`;
  }

  function renderRooms() {
    if (!el.roomList) return;
    if (!state.rooms.length) {
      el.roomList.innerHTML = '<div class="chat-empty">No conversations yet.<br>Start a new chat.</div>';
      return;
    }

    el.roomList.innerHTML = state.rooms.map(room => {
      const id = roomId(room);
      const unread = Number(room.unread || 0);
      const active = state.activeRoom && roomId(state.activeRoom) === id;
      const name = roomName(room);

      return `<button type="button" class="chat-room-row${active ? ' active' : ''}" data-room-id="${escapeHTML(id)}">
        ${avatarMarkup(name, roomAvatar(room), roomOnline(room))}
        <span class="chat-room-main">
          <span class="chat-room-top">
            <span class="chat-room-name">${escapeHTML(name)}</span>
            <time class="chat-room-time">${escapeHTML(fmtRoomTime(room.last_time))}</time>
          </span>
          <span class="chat-room-bottom">
            <span class="chat-room-preview">${escapeHTML(room.last_message || 'Start a conversation')}</span>
            ${unread ? `<b class="chat-unread">${unread > 99 ? '99+' : unread}</b>` : ''}
          </span>
        </span>
      </button>`;
    }).join('');
  }

  function openRooms() {
    el.convo?.classList.remove('active');
    el.rooms?.classList.add('active');
    renderRooms();
  }

  function openConversationScreen() {
    el.rooms?.classList.remove('active');
    el.convo?.classList.add('active');
  }

  function updateConversationHeader(room) {
    if (el.title) el.title.textContent = roomName(room);
    if (el.subtitle) el.subtitle.textContent = roomOnline(room) ? 'online' : 'KAMUPUS Member';
    if (el.peerAvatar) el.peerAvatar.innerHTML = roomAvatar(room) ? `<img src="${escapeHTML(roomAvatar(room))}" alt="">` : initials(roomName(room));
  }

  function dayLabel(value) {
    const d = new Date(value); if (isNaN(d.getTime())) return '';
    const now = new Date(); const yesterday = new Date(); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday:'long', day:'numeric', month:'long' });
  }

  function renderMessage(message, previousDay) {
    const mine = isMine(message);
    const date = msgTime(message);
    const day = date ? dayLabel(date) : '';
    const divider = day && day !== previousDay ? `<div class="chat-day-divider"><span>${escapeHTML(day)}</span></div>` : '';
    const text = msgText(message);

    return `${divider}<div class="chat-message-row${mine ? ' mine' : ''}" data-message-id="${escapeHTML(msgId(message))}">
        <div class="chat-bubble">
          ${text ? `<span>${escapeHTML(text)}</span>` : ''}
          <div class="chat-message-meta">
            <time>${escapeHTML(fmtTime(date))}</time>
            ${mine ? '<span class="chat-ticks">✓</span>' : ''}
          </div>
        </div>
      </div>`;
  }

  function nearBottom() { return el.messages ? el.messages.scrollHeight - el.messages.scrollTop - el.messages.clientHeight < 100 : true; }

  function renderMessages(messages, appendOnly = false) {
    if (!el.messages) return;
    const wasNearBottom = nearBottom();

    if (!appendOnly) {
      let lastDay = '';
      el.messages.innerHTML = messages.length ? messages.map(m => {
        const html = renderMessage(m, lastDay);
        if (msgTime(m)) lastDay = dayLabel(msgTime(m));
        return html;
      }).join('') : '<div class="chat-empty">Say hello 👋<br>Your conversation starts here.</div>';
    } else {
      const existing = new Set([...el.messages.querySelectorAll('[data-message-id]')].map(n => n.dataset.messageId));
      const fresh = messages.filter(m => !existing.has(msgId(m)));
      if (fresh.length) {
        let lastDay = messages.length ? dayLabel(msgTime(messages[messages.length-1])) : '';
        el.messages.insertAdjacentHTML('beforeend', fresh.map(m => renderMessage(m, lastDay)).join(''));
      }
    }
    if (wasNearBottom) el.messages.scrollTop = el.messages.scrollHeight;
  }

  async function loadRooms() {
    const data = await request(API.rooms());
    state.rooms = unwrapList(data, ['rooms','data']);
    renderRooms();
  }

  async function loadMessages(roomIdValue, { appendOnly = false } = {}) {
    if (!roomIdValue) return;
    const data = await request(API.messages(roomIdValue));
    const messages = unwrapList(data, ['messages','data']);
    state.messages = messages;
    renderMessages(messages, appendOnly);
    const last = messages[messages.length - 1];
    state.lastMessageId = last ? msgId(last) : null;
  }

  async function markRead(roomIdValue) {
    try { await request(API.read(roomIdValue), { method:'POST' }); } catch(_) {}
  }

  async function selectRoom(id) {
    const room = state.rooms.find(r => roomId(r) === String(id));
    if (!room) return;
    state.activeRoom = room;
    state.messages = [];
    updateConversationHeader(room);
    openConversationScreen();
    el.messages.innerHTML = '<div class="chat-empty">Opening conversation…</div>';
    renderRooms();

    try {
      await loadMessages(id);
      await markRead(id);
      startMessagePolling();
      if (el.input) el.input.focus();
    } catch (error) {
      el.messages.innerHTML = `<div class="chat-empty">Could not load messages.<br>${escapeHTML(error.message)}</div>`;
    }
  }

  async function sendMessage() {
    if (state.sending || !state.activeRoom || !el.input) return;
    const content = el.input.value.trim();
    if (!content) return;

    state.sending = true;
    if (el.send) el.send.disabled = true;
    const roomIdValue = roomId(state.activeRoom);
    const tempId = `temp-${Date.now()}`;

    const optimistic = { id:tempId, user_id:ME_ID, mine:true, content, created_at:new Date().toISOString() };
    state.messages.push(optimistic);
    renderMessages(state.messages);

    el.input.value = '';
    el.input.style.height = 'auto';

    try {
      const data = await request(API.send(roomIdValue), { method:'POST', body:JSON.stringify({ content }) });
      const saved = data?.message || data;
      state.messages = state.messages.filter(m => msgId(m) !== tempId);
      if (saved && saved.id) state.messages.push(saved);
      renderMessages(state.messages);
      loadRooms().catch(() => {});
    } catch (error) {
      state.messages = state.messages.filter(m => msgId(m) !== tempId);
      renderMessages(state.messages);
      el.input.value = content;
      toast(`Message not sent: ${error.message}`);
    } finally {
      state.sending = false;
      if (el.send) el.send.disabled = false;
      el.input?.focus();
    }
  }

  function startMessagePolling() {
    clearInterval(state.pollMessagesTimer);
    state.pollMessagesTimer = setInterval(() => {
      if (state.activeRoom) loadMessages(roomId(state.activeRoom), { appendOnly:true }).catch(() => {});
    }, POLL_MESSAGES_MS);
  }

  async function runSearch(query) {
    if (!el.searchResults) return;
    if (!query.trim()) { el.searchResults.innerHTML = ''; return; }
    el.searchResults.innerHTML = '<div class="chat-empty">Searching…</div>';
    try {
      const data = await request(API.search(query.trim()));
      const results = unwrapList(data, ['results','users','data']);
      el.searchResults.innerHTML = results.length ? results.map(user => {
        const name = user.full_name || user.name || 'Student';
        const uid = user.id;
        return `<button type="button" class="chat-search-result" data-user-id="${uid}" data-user-name="${escapeHTML(name)}">
          ${avatarMarkup(name, user.avatar, false)}
          <span><strong>${escapeHTML(name)}</strong><small style="display:block;color:var(--chat-muted)">Start a chat</small></span>
        </button>`;
      }).join('') : '<div class="chat-empty">No students found.</div>';
    } catch (error) {
      el.searchResults.innerHTML = `<div class="chat-empty">Search unavailable.</div>`;
    }
  }

  async function openDirectChat(userId, name) {
    try {
      const data = await request(API.dm(userId), { method:'POST' });
      const room = data?.room || data;
      if (!room || !roomId(room)) throw new Error('Server error');
      if (!state.rooms.find(r => roomId(r) === roomId(room))) state.rooms.unshift(room);
      renderRooms();
      closeSearch();
      await selectRoom(roomId(room));
    } catch (error) {
      toast(`Could not start chat: ${error.message}`);
    }
  }

  async function openGroupModal() {
    if (!el.groupModal) return;
    el.groupModal.hidden = false;
    el.userPicker.innerHTML = '<div class="chat-empty">Loading students…</div>';
    try {
      const data = await request(API.users());
      const users = unwrapList(data, ['users','data']).filter(u => String(u.id) !== ME_ID);
      el.userPicker.innerHTML = users.length ? users.map(user => {
        const name = user.full_name || 'Student';
        return `<label class="chat-modal-user">
          <input type="checkbox" value="${user.id}">
          ${avatarMarkup(name, user.avatar, false)}
          <span><strong>${escapeHTML(name)}</strong></span>
        </label>`;
      }).join('') : '<div class="chat-empty">No other students found.</div>';
    } catch (error) {
      el.userPicker.innerHTML = `<div class="chat-empty">Could not load students.</div>`;
    }
  }

  function closeGroupModal() { if (el.groupModal) el.groupModal.hidden = true; }

  async function createGroup() {
    const memberIds = [...el.userPicker.querySelectorAll('input:checked')].map(i => i.value);
    const name = el.groupName?.value.trim();
    if (memberIds.length < 1 || !name) { toast('Choose students and a name'); return; }
    el.groupCreate.disabled = true;
    try {
      const data = await request(API.createGroup(), { method:'POST', body:JSON.stringify({ name, member_ids:memberIds }) });
      const room = data?.room || data;
      state.rooms.unshift(room);
      closeGroupModal();
      el.groupName.value = '';
      renderRooms();
      await selectRoom(roomId(room));
    } catch (error) {
      toast(`Error: ${error.message}`);
    } finally {
      el.groupCreate.disabled = false;
    }
  }

  function bindEvents() {
    el.roomList?.addEventListener('click', e => { const row = e.target.closest('[data-room-id]'); if (row) selectRoom(row.dataset.roomId); });
    el.send?.addEventListener('click', sendMessage);
    el.input?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    el.input?.addEventListener('input', () => { el.input.style.height = 'auto'; el.input.style.height = `${Math.min(el.input.scrollHeight, 130)}px`; });
    el.back?.addEventListener('click', () => { clearInterval(state.pollMessagesTimer); openRooms(); });
    el.searchToggle?.addEventListener('click', () => { el.searchBar.hidden = false; el.searchInput.focus(); });
    el.searchClose?.addEventListener('click', () => { el.searchBar.hidden = true; el.searchResults.innerHTML = ''; });
    el.searchInput?.addEventListener('input', () => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(() => runSearch(el.searchInput.value), 300); });
    el.searchResults?.addEventListener('click', e => { const row = e.target.closest('[data-user-id]'); if (row) openDirectChat(row.dataset.userId, row.dataset.userName); });
    el.newGroup?.addEventListener('click', openGroupModal);
    el.groupClose?.addEventListener('click', closeGroupModal);
    el.groupCreate?.addEventListener('click', createGroup);
  }

  async function init() {
    if (!ME_ID) {
      if (el.roomList) el.roomList.innerHTML = '<div class="chat-empty">Please sign in to view your chats.</div>';
      return;
    }
    bindEvents();
    try { await loadRooms(); } catch (e) { el.roomList.innerHTML = `<div class="chat-empty">Failed to load.</div>`; }
    state.pollRoomsTimer = setInterval(() => loadRooms().catch(() => {}), POLL_ROOMS_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();