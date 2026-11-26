(() => {
  'use strict';

  // =====================================================
  // KAMUPUS CAMPUS CHAT — FULL VERSION
  // =====================================================

  const ME_ID = window.ME_ID ? String(window.ME_ID) : '';
  const ROOT = (window.CHAT_API_BASE || '').replace(/\/$/, '');

  const API = {
    rooms:        () => `${ROOT}/api/chat/rooms`,
    messages:     id => `${ROOT}/api/chat/rooms/${encodeURIComponent(id)}/messages`,
    send:         id => `${ROOT}/api/chat/rooms/${encodeURIComponent(id)}/messages`,
    read:         id => `${ROOT}/api/chat/rooms/${encodeURIComponent(id)}/read`,
    search:       q  => `${ROOT}/api/users/search?q=${encodeURIComponent(q)}`,
    users:        () => `${ROOT}/api/chat/users`,
    createGroup:  () => `${ROOT}/api/chat/group`,
    dm:           id => `${ROOT}/api/chat/dm/${encodeURIComponent(id)}`,

    // Block / Report
    block:        id => `${ROOT}/api/users/${encodeURIComponent(id)}/block`,
    blockStatus:  id => `${ROOT}/api/users/${encodeURIComponent(id)}/block-status`,
    report:       id => `${ROOT}/api/users/${encodeURIComponent(id)}/report`,
    blockedList:  () => `${ROOT}/api/me/blocked`
  };

  const POLL_MESSAGES_MS = 3000;
  const POLL_ROOMS_MS = 10000;

  const $ = id => document.getElementById(id);

  const el = {
    rooms: $('screenRooms'),
    convo: $('screenConvo'),

    searchToggle: $('searchToggleBtn'),
    searchBar: $('searchBar'),
    searchInput: $('searchInput'),
    searchClose: $('searchCloseBtn'),
    searchResults: $('searchResults'),

    roomList: $('roomList'),
    startNew: $('startNewBtn'),
    newGroup: $('newGroupBtn'),

    back: $('convoBackBtn'),
    title: $('chatTitle'),
    subtitle: $('chatSubtitle'),
    peerAvatar: $('chatPeerAvatar'),

    messages: $('chatMessages'),
    typing: $('typingIndicator'),
    typingText: $('typingText'),

    composer: $('chatComposer'),
    input: $('chatInput'),
    send: $('chatSend'),

    groupModal: $('newGroupModal'),
    groupClose: $('newGroupClose'),
    groupName: $('newGroupName'),
    userPicker: $('groupUserPicker'),
    groupCreate: $('newGroupCreate')
  };

  const state = {
    rooms: [],
    activeRoom: null,
    messages: [],
    sending: false,
    searchTimer: null,
    roomsTimer: null,
    messagesTimer: null,
    requestVersion: 0,
    lastMessageId: null,
    menuOpen: false
  };

  // =====================================================
  // STYLES (only the bits the JS injects)
  // =====================================================

  function installStyles() {
    if ($('kamupusChatFixStyles')) return;

    const style = document.createElement('style');
    style.id = 'kamupusChatFixStyles';

    style.textContent = `
      /* HEADER MENU */
      .chat-header-menu {
        position: absolute; top: 64px; right: 20px; z-index: 60;
        background: #141414; border: 1px solid #2a2a2a;
        border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.55);
        min-width: 210px; overflow: hidden; display: none;
      }
      .chat-header-menu.open { display: block; }
      .chat-header-menu button {
        display: block; width: 100%; text-align: left;
        padding: 12px 16px; background: none; border: none;
        color: #fff; font-size: 13px; cursor: pointer;
      }
      .chat-header-menu button:hover { background: #1f1f1f; }
      .chat-header-menu button.danger { color: #ff6b6b; }
      .chat-header-menu button.guidelines { border-top: 1px solid #2a2a2a; color: #ccc; font-size: 12px; }

      /* REPORT MODAL */
      .chat-report-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,.7);
        display: flex; align-items: center; justify-content: center;
        z-index: 10000; padding: 20px;
      }
      .chat-report-card {
        background: #141414; border: 1px solid #2a2a2a;
        border-radius: 16px; width: 100%; max-width: 420px;
        padding: 22px; color: #fff;
      }
      .chat-report-card h3 { margin: 0 0 6px; font-size: 16px; }
      .chat-report-card p  { margin: 0 0 16px; color: #999; font-size: 12px; line-height: 1.5; }
      .chat-report-card label { display: block; margin-bottom: 6px; font-size: 12px; color: #bbb; }
      .chat-report-card select,
      .chat-report-card textarea {
        width: 100%; background: #0a0a0a; border: 1px solid #2a2a2a;
        border-radius: 10px; color: #fff; padding: 10px 12px;
        font-size: 13px; font-family: inherit; margin-bottom: 12px;
        box-sizing: border-box;
      }
      .chat-report-card textarea { min-height: 80px; resize: vertical; }
      .chat-report-actions { display: flex; gap: 10px; justify-content: flex-end; }
      .chat-report-actions button {
        padding: 10px 16px; border-radius: 10px; border: none;
        cursor: pointer; font-size: 13px; font-weight: 600;
      }
      .chat-report-actions .cancel { background: #2a2a2a; color: #ddd; }
      .chat-report-actions .submit { background: #ff6b6b; color: #fff; }
      .chat-report-actions .submit:disabled { opacity: .6; cursor: not-allowed; }
    `;

    document.head.appendChild(style);
  }

  // =====================================================
  // HELPERS
  // =====================================================

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1
      ? parts[0][0] + parts[parts.length - 1][0]
      : (parts[0] || '?').slice(0, 2)).toUpperCase();
  }

  function roomId(room)  { return String(room.id ?? room.room_id ?? ''); }
  function roomName(room) { return room.name || room.title || 'Conversation'; }
  function roomAvatar(room) { return room.avatar || room.image || ''; }
  function roomOnline(room) { return !!room.online; }

  function msgId(m)      { return String(m.id ?? m.message_id ?? ''); }
  function msgSender(m)  { return String(m.user_id ?? m.sender_id ?? ''); }
  function isMine(m)     { return m.mine === true || (!!ME_ID && msgSender(m) === ME_ID); }
  function msgText(m)    { return m.content ?? m.message ?? ''; }
  function msgTime(m)    { return m.created_at ?? m.time ?? ''; }

  function fmtTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function fmtRoomTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toDateString() === new Date().toDateString()
      ? fmtTime(date)
      : date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }

  function unwrapList(data, keys) {
    if (Array.isArray(data)) return data;
    for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
    return [];
  }

  async function request(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers
    });

    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `Request failed (${response.status})`);
    }
    return data;
  }

  function toast(message) {
    let node = $('lcuChatToast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'lcuChatToast';
      node.className = 'chat-toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 2800);
  }

  function avatarMarkup(name, url, online = false) {
    const avatar = url
      ? `<img src="${escapeHTML(url)}" alt="" loading="lazy">`
      : escapeHTML(initials(name));
    return `
      <span class="chat-avatar-wrap">
        <span class="chat-avatar">${avatar}</span>
        ${online ? '<i class="chat-online-dot"></i>' : ''}
      </span>
    `;
  }

  // =====================================================
  // MOBILE NAVIGATION
  // =====================================================

  function isMobile() { return window.matchMedia('(max-width: 768px)').matches; }

  function openRooms() {
    if (isMobile()) {
      el.rooms?.classList.remove('hidden');
      el.convo?.classList.remove('active');
    }
    closeHeaderMenu();
    renderRooms();
  }

  function openConversationScreen() {
    if (isMobile()) {
      el.rooms?.classList.add('hidden');
      el.convo?.classList.add('active');
    }
  }

  // =====================================================
  // SEARCH
  // =====================================================

  function closeSearch() {
    if (el.searchBar) el.searchBar.hidden = true;
    if (el.searchInput) el.searchInput.value = '';
    if (el.searchResults) el.searchResults.innerHTML = '';
    clearTimeout(state.searchTimer);
  }

  function showSearch() {
    if (!el.searchBar) return;
    el.searchBar.hidden = false;
    el.searchInput?.focus();
  }

  async function runSearch(query) {
    if (!el.searchResults) return;
    query = query.trim();
    if (!query) { el.searchResults.innerHTML = ''; return; }

    el.searchResults.innerHTML = '<div class="chat-empty">Searching students...</div>';

    try {
      const data = await request(API.search(query));
      if (el.searchInput?.value.trim() !== query) return;

      const results = unwrapList(data, ['results', 'users', 'data']);

      if (!results.length) {
        el.searchResults.innerHTML = '<div class="chat-empty">No students found.</div>';
        return;
      }

      el.searchResults.innerHTML = results.map(user => {
        const name = user.full_name || user.name || 'Student';
        const id = user.id ?? user.user_id;
        if (id == null) return '';
        return `
          <button type="button" class="chat-search-result"
                  data-user-id="${escapeHTML(id)}">
            ${avatarMarkup(name, user.avatar || user.profile_image)}
            <span>
              <strong>${escapeHTML(name)}</strong>
              <small>Start a chat</small>
            </span>
          </button>
        `;
      }).join('');
    } catch {
      el.searchResults.innerHTML =
        '<div class="chat-empty">Search unavailable. Try again.</div>';
    }
  }

  // =====================================================
  // RENDER ROOMS
  // =====================================================

  function renderRooms() {
    if (!el.roomList) return;

    if (!state.rooms.length) {
      el.roomList.innerHTML = `
        <div class="chat-empty">
          No conversations yet.<br>
          Start a new chat with a student.
        </div>
      `;
      return;
    }

    el.roomList.innerHTML = state.rooms.map(room => {
      const id = roomId(room);
      const name = roomName(room);
      const unread = Number(room.unread || 0);
      const active = state.activeRoom && roomId(state.activeRoom) === id;

      return `
        <button type="button" class="chat-room-row ${active ? 'active' : ''}"
                data-room-id="${escapeHTML(id)}">
          ${avatarMarkup(name, roomAvatar(room), roomOnline(room))}
          <span class="chat-room-main">
            <span class="chat-room-top">
              <span class="chat-room-name">${escapeHTML(name)}</span>
              <time class="chat-room-time">${escapeHTML(fmtRoomTime(room.last_time || room.updated_at))}</time>
            </span>
            <span class="chat-room-bottom">
              <span class="chat-room-preview">${escapeHTML(room.last_message || 'Start a conversation')}</span>
              ${unread > 0 ? `<b class="chat-unread">${unread > 99 ? '99+' : unread}</b>` : ''}
            </span>
          </span>
        </button>
      `;
    }).join('');
  }

  // =====================================================
  // LOAD ROOMS
  // =====================================================

  async function loadRooms() {
    const data = await request(API.rooms());
    const rooms = unwrapList(data, ['rooms', 'data']);
    state.rooms = rooms;

    if (state.activeRoom) {
      const updated = rooms.find(r => roomId(r) === roomId(state.activeRoom));
      if (updated) {
        state.activeRoom = updated;
      } else {
        // Active room disappeared (blocked/unblocked elsewhere, or removed)
        state.activeRoom = null;
        clearInterval(state.messagesTimer);
        openRooms();
      }
    }
    renderRooms();
  }

  // =====================================================
  // CONVERSATION HEADER
  // =====================================================

  function updateConversationHeader(room) {
    if (el.title) el.title.textContent = roomName(room);
    if (el.subtitle) {
      el.subtitle.textContent = roomOnline(room) ? 'online' : 'KAMUPUS Member';
    }
    if (el.peerAvatar) {
      const avatar = roomAvatar(room);
      el.peerAvatar.innerHTML = avatar
        ? `<img src="${escapeHTML(avatar)}" alt="">`
        : escapeHTML(initials(roomName(room)));
    }

    // Show/hide ⋮ button (hidden for groups)
    const menuBtn = $('chatHeaderMenuBtn');
    if (menuBtn) {
      menuBtn.style.display = room.is_group ? 'none' : 'grid';
    }

    // Reset label
    const blockBtn = $('menuBlockBtn');
    if (blockBtn) blockBtn.textContent = 'Block user';
  }

  // =====================================================
  // MESSAGES
  // =====================================================

  function dayLabel(value) {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const yesterday = new Date(); yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === now.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function renderMessage(message, previousDay = '') {
    const mine = isMine(message);
    const date = msgTime(message);
    const day = date ? dayLabel(date) : '';
    const divider = day && day !== previousDay
      ? `<div class="chat-day-divider"><span>${escapeHTML(day)}</span></div>`
      : '';
    const text = msgText(message);

    return `
      ${divider}
      <div class="chat-message-row ${mine ? 'mine' : ''}"
           data-message-id="${escapeHTML(msgId(message))}">
        <div class="chat-bubble">
          ${text ? `<span>${escapeHTML(text)}</span>` : ''}
          <div class="chat-message-meta">
            <time>${escapeHTML(fmtTime(date))}</time>
            ${mine ? '<span class="chat-ticks">✓</span>' : ''}
          </div>
        </div>
      </div>
    `;
  }

  function nearBottom() {
    if (!el.messages) return true;
    return (el.messages.scrollHeight - el.messages.scrollTop - el.messages.clientHeight) < 120;
  }

  function renderMessages(messages, appendOnly = false) {
    if (!el.messages) return;
    const wasNearBottom = nearBottom();

    if (!appendOnly) {
      let previousDay = '';
      el.messages.innerHTML = messages.length
        ? messages.map(m => {
            const html = renderMessage(m, previousDay);
            if (msgTime(m)) previousDay = dayLabel(msgTime(m));
            return html;
          }).join('')
        : `<div class="chat-empty"><strong>Say hello 👋</strong><br><br>Your conversation starts here.</div>`;
    } else {
      const existing = new Set(
        [...el.messages.querySelectorAll('[data-message-id]')].map(n => n.dataset.messageId)
      );
      const fresh = messages.filter(m => !existing.has(msgId(m)));

      if (fresh.length) {
        const existingRows = [...el.messages.querySelectorAll('[data-message-id]')];
        const lastRow = existingRows[existingRows.length - 1];
        const previousDay = lastRow
          ? dayLabel((messages.find(m => msgId(m) === lastRow.dataset.messageId) || {}).created_at || '')
          : '';
        let lastDay = previousDay;

        el.messages.insertAdjacentHTML('beforeend',
          fresh.map(m => {
            const html = renderMessage(m, lastDay);
            if (msgTime(m)) lastDay = dayLabel(msgTime(m));
            return html;
          }).join('')
        );
      }
    }

    if (wasNearBottom) el.messages.scrollTop = el.messages.scrollHeight;
  }

  async function loadMessages(id, { appendOnly = false } = {}) {
    if (!id) return;
    const version = ++state.requestVersion;
    const data = await request(API.messages(id));

    if (version !== state.requestVersion || !state.activeRoom ||
        roomId(state.activeRoom) !== String(id)) return;

    const messages = unwrapList(data, ['messages', 'data']);
    state.messages = messages;
    renderMessages(messages, appendOnly);

    const last = messages[messages.length - 1];
    state.lastMessageId = last ? msgId(last) : null;
  }

  async function markRead(id) {
    try { await request(API.read(id), { method: 'POST' }); }
    catch (e) { console.warn('markRead failed:', e); }
  }

  // =====================================================
  // SELECT ROOM
  // =====================================================

  async function selectRoom(id) {
    const room = state.rooms.find(item => roomId(item) === String(id));
    if (!room) return;

    clearInterval(state.messagesTimer);
    state.requestVersion++;
    state.activeRoom = room;
    state.messages = [];

    updateConversationHeader(room);
    openConversationScreen();
    renderRooms();

    if (el.messages) {
      el.messages.innerHTML = `<div class="chat-empty">Opening conversation...</div>`;
    }

    try {
      await loadMessages(id);
      await markRead(id);

      const updatedRoom = state.rooms.find(r => roomId(r) === String(id));
      if (updatedRoom) { updatedRoom.unread = 0; state.activeRoom = updatedRoom; }
      renderRooms();

      startMessagePolling();
      el.input?.focus();
    } catch (error) {
      if (el.messages) {
        el.messages.innerHTML = `
          <div class="chat-empty">
            Could not load messages.<br>${escapeHTML(error.message)}
          </div>
        `;
      }
    }
  }

  function startMessagePolling() {
    clearInterval(state.messagesTimer);
    state.messagesTimer = setInterval(() => {
      if (!state.activeRoom) return;
      loadMessages(roomId(state.activeRoom), { appendOnly: true })
        .catch(e => console.warn('Message refresh failed:', e));
    }, POLL_MESSAGES_MS);
  }

  // =====================================================
  // SEND MESSAGE
  // =====================================================

  async function sendMessage() {
    if (state.sending || !state.activeRoom || !el.input) return;
    const content = el.input.value.trim();
    if (!content) return;

    const id = roomId(state.activeRoom);
    state.sending = true;
    if (el.send) el.send.disabled = true;

    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      id: tempId, user_id: ME_ID, mine: true, content,
      created_at: new Date().toISOString()
    };
    state.messages.push(optimistic);
    renderMessages(state.messages);

    el.input.value = '';
    el.input.style.height = 'auto';

    try {
      const data = await request(API.send(id), {
        method: 'POST',
        body: JSON.stringify({ content })
      });
      const saved = data?.message || data;
      state.messages = state.messages.filter(m => msgId(m) !== tempId);
      if (saved && (saved.id || saved.message_id)) state.messages.push(saved);
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

  // =====================================================
  // HEADER MENU — BLOCK / REPORT / GUIDELINES / BLOCKED LIST
  // =====================================================

  function otherUserIdInRoom() {
    if (!state.activeRoom || state.activeRoom.is_group) return null;
    return state.activeRoom.other_user_id
      ? String(state.activeRoom.other_user_id)
      : null;
  }

  function buildHeaderMenu() {
    if ($('chatHeaderMenu')) return;

    const menu = document.createElement('div');
    menu.id = 'chatHeaderMenu';
    menu.className = 'chat-header-menu';
    menu.innerHTML = `
      <button type="button" id="menuBlockBtn">Block user</button>
      <button type="button" id="menuReportBtn" class="danger">Report user</button>
      <button type="button" class="guidelines"
              onclick="window.open('/community-guidelines', '_blank')">
        Community Guidelines
      </button>
      <button type="button" class="guidelines"
              onclick="window.location.href='/blocked-users'">
        Blocked users
      </button>
    `;
    document.body.appendChild(menu);

    $('menuBlockBtn')?.addEventListener('click', toggleBlock);
    $('menuReportBtn')?.addEventListener('click', openReportModal);

    document.addEventListener('click', e => {
      if (state.menuOpen &&
          !e.target.closest('#chatHeaderMenu') &&
          !e.target.closest('#chatHeaderMenuBtn')) {
        closeHeaderMenu();
      }
    });
  }

  function toggleHeaderMenu() {
    const menu = $('chatHeaderMenu');
    if (!menu) return;
    if (state.menuOpen) { closeHeaderMenu(); return; }

    const otherId = otherUserIdInRoom();
    if (otherId) {
      request(API.blockStatus(otherId))
        .then(d => {
          const btn = $('menuBlockBtn');
          if (btn) btn.textContent = d.blocked ? 'Unblock user' : 'Block user';
        })
        .catch(() => {});
    }

    // Position next to the ⋮ button
    const btn = $('chatHeaderMenuBtn');
    if (btn) {
      const r = btn.getBoundingClientRect();
      menu.style.top = `${r.bottom + 8}px`;
      menu.style.right = `${window.innerWidth - r.right}px`;
      menu.style.left = 'auto';
    }

    menu.classList.add('open');
    state.menuOpen = true;
  }

  function closeHeaderMenu() {
    const menu = $('chatHeaderMenu');
    if (menu) menu.classList.remove('open');
    state.menuOpen = false;
  }

  async function toggleBlock() {
    const otherId = otherUserIdInRoom();
    if (!otherId) { closeHeaderMenu(); return; }

    try {
      const status = await request(API.blockStatus(otherId));
      const method = status.blocked ? 'DELETE' : 'POST';
      await request(API.block(otherId), { method });
      closeHeaderMenu();

      if (!status.blocked) {
        toast('User blocked.');
        state.activeRoom = null;
        clearInterval(state.messagesTimer);
        openRooms();
      } else {
        toast('User unblocked.');
      }
      loadRooms().catch(() => {});
    } catch (error) {
      toast(`Could not update block: ${error.message}`);
    }
  }

  function openReportModal() {
    const otherId = otherUserIdInRoom();
    if (!otherId) { closeHeaderMenu(); return; }
    closeHeaderMenu();

    if ($('chatReportOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'chatReportOverlay';
    overlay.className = 'chat-report-overlay';
    overlay.innerHTML = `
      <div class="chat-report-card">
        <h3>Report this user</h3>
        <p>Reports go to the admin team and are reviewed within 24 hours.</p>

        <label for="reportReasonSelect">Reason</label>
        <select id="reportReasonSelect">
          <option value="">Choose a reason...</option>
          <option value="Bullying or harassment">Bullying or harassment</option>
          <option value="Hate speech">Hate speech</option>
          <option value="Threats or intimidation">Threats or intimidation</option>
          <option value="Spam or scam">Spam or scam</option>
          <option value="Inappropriate content">Inappropriate content</option>
          <option value="Other">Other</option>
        </select>

        <label for="reportDetails">Details (optional)</label>
        <textarea id="reportDetails"
                  placeholder="What happened? Include context if helpful."></textarea>

        <div class="chat-report-actions">
          <button type="button" class="cancel" id="reportCancel">Cancel</button>
          <button type="button" class="submit" id="reportSubmit">Submit report</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    $('reportCancel').addEventListener('click', closeReportModal);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeReportModal();
    });

    $('reportSubmit').addEventListener('click', async () => {
      const reason = $('reportReasonSelect').value;
      const details = $('reportDetails').value.trim();

      if (!reason) { toast('Please choose a reason.'); return; }
      const fullReason = details ? `${reason} — ${details}` : reason;

      const btn = $('reportSubmit');
      btn.disabled = true;
      btn.textContent = 'Submitting...';

      try {
        await request(API.report(otherId), {
          method: 'POST',
          body: JSON.stringify({
            reason: fullReason,
            context: 'Reported from chat',
            room_id: state.activeRoom ? Number(roomId(state.activeRoom)) : null
          })
        });
        closeReportModal();
        toast('Report submitted. Thank you.');
      } catch (error) {
        toast(`Could not submit report: ${error.message}`);
        btn.disabled = false;
        btn.textContent = 'Submit report';
      }
    });
  }

  function closeReportModal() {
    $('chatReportOverlay')?.remove();
  }

  // =====================================================
  // DIRECT CHAT
  // =====================================================

  async function openDirectChat(userId) {
    try {
      const data = await request(API.dm(userId), { method: 'POST' });
      const room = data?.room || data;
      if (!room || !roomId(room)) throw new Error('Invalid conversation returned by server.');

      const existingIndex = state.rooms.findIndex(r => roomId(r) === roomId(room));
      if (existingIndex >= 0) state.rooms[existingIndex] = room;
      else state.rooms.unshift(room);

      closeSearch();
      renderRooms();
      await selectRoom(roomId(room));
    } catch (error) {
      toast(`Could not start chat: ${error.message}`);
    }
  }

  // =====================================================
  // GROUP CREATION
  // =====================================================

  async function openGroupModal() {
    if (!el.groupModal) return;
    el.groupModal.hidden = false;
    if (el.userPicker) el.userPicker.innerHTML = '<div class="chat-empty">Loading students...</div>';

    try {
      const data = await request(API.users());
      const users = unwrapList(data, ['users', 'data'])
        .filter(u => String(u.id ?? u.user_id) !== ME_ID);

      if (!users.length) {
        el.userPicker.innerHTML = '<div class="chat-empty">No other students found.</div>';
        return;
      }

      el.userPicker.innerHTML = users.map(user => {
        const name = user.full_name || user.name || 'Student';
        const id = user.id ?? user.user_id;
        return `
          <label class="chat-modal-user">
            <input type="checkbox" value="${escapeHTML(id)}">
            ${avatarMarkup(name, user.avatar)}
            <span><strong>${escapeHTML(name)}</strong></span>
          </label>
        `;
      }).join('');
    } catch {
      el.userPicker.innerHTML = '<div class="chat-empty">Could not load students.</div>';
    }
  }

  function closeGroupModal() { if (el.groupModal) el.groupModal.hidden = true; }

  async function createGroup() {
    if (!el.userPicker || !el.groupName) return;

    const memberIds = [...el.userPicker.querySelectorAll('input:checked')].map(i => i.value);
    const name = el.groupName.value.trim();

    if (!name) { toast('Please enter a group name.'); return; }
    if (!memberIds.length) { toast('Please select at least one student.'); return; }

    el.groupCreate.disabled = true;

    try {
      const data = await request(API.createGroup(), {
        method: 'POST',
        body: JSON.stringify({ name, member_ids: memberIds })
      });
      const room = data?.room || data;
      if (!room || !roomId(room)) throw new Error('Invalid group returned by server.');

      state.rooms.unshift(room);
      el.groupName.value = '';
      closeGroupModal();
      renderRooms();
      await selectRoom(roomId(room));
      toast('Group created successfully.');
    } catch (error) {
      toast(`Group creation failed: ${error.message}`);
    } finally {
      el.groupCreate.disabled = false;
    }
  }

  // =====================================================
  // EVENTS
  // =====================================================

  function bindEvents() {
    el.roomList?.addEventListener('click', event => {
      const row = event.target.closest('[data-room-id]');
      if (row) selectRoom(row.dataset.roomId);
    });

    el.send?.addEventListener('click', sendMessage);
    el.composer?.addEventListener('submit', e => { e.preventDefault(); sendMessage(); });

    el.input?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    el.input?.addEventListener('input', () => {
      el.input.style.height = 'auto';
      el.input.style.height = `${Math.min(el.input.scrollHeight, 120)}px`;
    });

    el.back?.addEventListener('click', () => {
      clearInterval(state.messagesTimer);
      openRooms();
    });

    el.searchToggle?.addEventListener('click', showSearch);
    el.searchClose?.addEventListener('click', closeSearch);

    el.searchInput?.addEventListener('input', () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => runSearch(el.searchInput.value), 350);
    });

    el.searchResults?.addEventListener('click', event => {
      const row = event.target.closest('[data-user-id]');
      if (row) openDirectChat(row.dataset.userId);
    });

    el.startNew?.addEventListener('click', () => {
      showSearch();
      el.searchInput?.focus();
    });

    el.newGroup?.addEventListener('click', openGroupModal);
    el.groupClose?.addEventListener('click', closeGroupModal);
    el.groupCreate?.addEventListener('click', createGroup);

    el.groupModal?.addEventListener('click', event => {
      if (event.target === el.groupModal) closeGroupModal();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeSearch();
        closeGroupModal();
        closeHeaderMenu();
        closeReportModal();
      }
    });

    window.addEventListener('resize', () => {
      if (!isMobile()) {
        el.rooms?.classList.remove('hidden');
        el.convo?.classList.remove('active');
      } else if (!state.activeRoom) {
        openRooms();
      }
      if (state.menuOpen) closeHeaderMenu();
    });

    // Header ⋮ button
    const menuBtn = $('chatHeaderMenuBtn');
    menuBtn?.addEventListener('click', e => {
      e.stopPropagation();
      toggleHeaderMenu();
    });

    // Fired by the Blocked Users page when a user unblocks someone
    window.addEventListener('kamupus:refresh-rooms', () => {
      loadRooms().catch(() => {});
    });
  }

  // =====================================================
  // INIT
  // =====================================================

  async function init() {
    installStyles();
    buildHeaderMenu();

    if (!ME_ID) {
      if (el.roomList) {
        el.roomList.innerHTML =
          `<div class="chat-empty">Please sign in to view your campus chats.</div>`;
      }
      if (el.input) el.input.disabled = true;
      if (el.send) el.send.disabled = true;
      return;
    }

    bindEvents();

    try {
      await loadRooms();
    } catch (error) {
      console.error('KAMUPUS rooms error:', error);
      if (el.roomList) {
        el.roomList.innerHTML = `
          <div class="chat-empty">
            Failed to load conversations.<br>Please refresh and try again.
          </div>
        `;
      }
    }

    state.roomsTimer = setInterval(() => {
      loadRooms().catch(e => console.warn('Room refresh failed:', e));
    }, POLL_ROOMS_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();