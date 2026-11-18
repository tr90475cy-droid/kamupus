
(() => {
  'use strict';

  // =====================================================
  // KAMUPUS CAMPUS CHAT — FIXED VERSION
  // =====================================================

  const ME_ID = window.ME_ID ? String(window.ME_ID) : '';
  const ROOT = (window.CHAT_API_BASE || '').replace(/\/$/, '');

  const API = {
    rooms: () => `${ROOT}/api/chat/rooms`,
    messages: id => `${ROOT}/api/chat/rooms/${encodeURIComponent(id)}/messages`,
    send: id => `${ROOT}/api/chat/rooms/${encodeURIComponent(id)}/messages`,
    read: id => `${ROOT}/api/chat/rooms/${encodeURIComponent(id)}/read`,
    typing: id => `${ROOT}/api/chat/rooms/${encodeURIComponent(id)}/typing`,
    presence: () => `${ROOT}/api/chat/presence`,
    search: q => `${ROOT}/api/users/search?q=${encodeURIComponent(q)}`,
    users: () => `${ROOT}/api/chat/users`,
    createGroup: () => `${ROOT}/api/chat/group`,
    dm: id => `${ROOT}/api/chat/dm/${encodeURIComponent(id)}`
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
    lastMessageId: null
  };

  // =====================================================
  // INJECT MISSING CHAT STYLES
  // =====================================================

  function installStyles() {
    if ($('kamupusChatFixStyles')) return;

    const style = document.createElement('style');
    style.id = 'kamupusChatFixStyles';

    style.textContent = `
      /* CHAT AVATARS */

      .chat-avatar-wrap {
        position: relative;
        width: 46px;
        height: 46px;
        flex-shrink: 0;
        display: inline-flex;
      }

      .chat-avatar {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: #241608;
        color: #e79a54;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 14px;
        overflow: hidden;
      }

      .chat-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
      }

      .chat-online-dot {
        position: absolute;
        width: 11px;
        height: 11px;
        background: #22c55e;
        border: 2px solid #0a0a0a;
        border-radius: 50%;
        bottom: 0;
        right: 0;
      }

      /* ROOM ROWS */

      .chat-room-row {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        min-width: 0;
        padding: 12px;
        margin-bottom: 5px;
        border: 1px solid transparent;
        border-radius: 13px;
        background: transparent;
        color: white;
        text-align: left;
        cursor: pointer;
      }

      .chat-room-row:hover,
      .chat-room-row.active {
        background: #171717;
        border-color: #303030;
      }

      .chat-room-main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .chat-room-top,
      .chat-room-bottom {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .chat-room-name {
        font-size: 14px;
        font-weight: 700;
        color: white;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .chat-room-time {
        font-size: 10px;
        color: #888;
        flex-shrink: 0;
      }

      .chat-room-preview {
        font-size: 12px;
        color: #999;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .chat-unread {
        background: #ff7900;
        color: white;
        border-radius: 20px;
        min-width: 19px;
        padding: 3px 6px;
        text-align: center;
        font-size: 10px;
        flex-shrink: 0;
      }

      /* SEARCH RESULTS — IMPORTANT FIX */

      #searchResults {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 260px;
        overflow-y: auto;
        overflow-x: hidden;
      }

      .chat-search-result {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        min-width: 0;
        padding: 12px;
        background: #171717;
        border: 1px solid #292929;
        border-radius: 12px;
        color: white;
        text-align: left;
        cursor: pointer;
        transition: background .2s, border-color .2s;
      }

      .chat-search-result:hover {
        background: #222;
        border-color: #ff7900;
      }

      .chat-search-result > span:last-child {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .chat-search-result strong {
        font-size: 13px;
        font-weight: 700;
        color: white;
        overflow-wrap: anywhere;
      }

      .chat-search-result small {
        font-size: 11px;
        color: #999 !important;
      }

      /* MESSAGE DAY DIVIDER */

      .chat-day-divider {
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 18px 0;
      }

      .chat-day-divider span {
        padding: 6px 13px;
        border-radius: 20px;
        background: #181818;
        color: #999;
        font-size: 11px;
      }

      .chat-ticks {
        color: #ffb16b;
        margin-left: 4px;
      }

      /* EMPTY STATES */

      .chat-empty {
        padding: 25px 15px;
        text-align: center;
        color: #888;
        font-size: 13px;
        line-height: 1.7;
      }

      /* GROUP MODAL */

      .chat-modal-user {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px;
        border-bottom: 1px solid #252525;
        cursor: pointer;
        color: white;
      }

      .chat-modal-user input {
        accent-color: #ff7900;
        width: 17px;
        height: 17px;
      }

      .chat-modal-user strong {
        font-size: 13px;
      }

      /* TOAST */

      .chat-toast {
        position: fixed;
        z-index: 10001;
        bottom: 25px;
        left: 50%;
        transform: translate(-50%, 20px);
        background: #222;
        border: 1px solid #444;
        color: white;
        padding: 12px 18px;
        border-radius: 12px;
        font-size: 13px;
        opacity: 0;
        pointer-events: none;
        transition: .25s;
        max-width: calc(100% - 30px);
        text-align: center;
      }

      .chat-toast.show {
        opacity: 1;
        transform: translate(-50%, 0);
      }

      /* MOBILE NAVIGATION */

      @media(max-width:768px) {
        #screenRooms {
          width: 100%;
          min-width: 0;
        }

        #screenRooms.hidden {
          display: none !important;
        }

        #screenConvo {
          display: none !important;
        }

        #screenConvo.active {
          display: flex !important;
          position: absolute;
          inset: 0;
          z-index: 10;
          width: 100%;
          height: 100%;
        }

        #searchResults {
          max-height: 230px;
        }

        .chat-room-row {
          padding: 12px;
        }

        .chat-room-name {
          font-size: 14px;
        }
      }

      @media(min-width:769px) {
        #screenRooms {
          display: flex !important;
        }

        #screenConvo {
          display: flex !important;
          position: relative;
        }

        #screenRooms.hidden {
          display: flex !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // =====================================================
  // HELPERS
  // =====================================================

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);

    return (
      parts.length > 1
        ? parts[0][0] + parts[parts.length - 1][0]
        : (parts[0] || '?').slice(0, 2)
    ).toUpperCase();
  }

  function roomId(room) {
    return String(room.id ?? room.room_id ?? '');
  }

  function roomName(room) {
    return room.name || room.title || 'Conversation';
  }

  function roomAvatar(room) {
    return room.avatar || room.image || '';
  }

  function roomOnline(room) {
    return !!room.online;
  }

  function msgId(message) {
    return String(message.id ?? message.message_id ?? '');
  }

  function msgSender(message) {
    return String(message.user_id ?? message.sender_id ?? '');
  }

  function isMine(message) {
    return message.mine === true ||
      (!!ME_ID && msgSender(message) === ME_ID);
  }

  function msgText(message) {
    return message.content ?? message.message ?? '';
  }

  function msgTime(message) {
    return message.created_at ?? message.time ?? '';
  }

  function fmtTime(value) {
    if (!value) return '';

    const date = new Date(value);

    if (isNaN(date.getTime())) return '';

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function fmtRoomTime(value) {
    if (!value) return '';

    const date = new Date(value);

    if (isNaN(date.getTime())) return '';

    return date.toDateString() === new Date().toDateString()
      ? fmtTime(date)
      : date.toLocaleDateString([], {
          day: 'numeric',
          month: 'short'
        });
  }

  function unwrapList(data, keys) {
    if (Array.isArray(data)) return data;

    for (const key of keys) {
      if (Array.isArray(data?.[key])) return data[key];
    }

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
      throw new Error(
        data.error || data.message || `Request failed (${response.status})`
      );
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

    toast.timer = setTimeout(() => {
      node.classList.remove('show');
    }, 2800);
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
  // MOBILE SCREEN CONTROL
  // =====================================================

  function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function openRooms() {
    if (isMobile()) {
      el.rooms?.classList.remove('hidden');
      el.convo?.classList.remove('active');
    }

    renderRooms();
  }

  function openConversationScreen() {
    if (isMobile()) {
      el.rooms?.classList.add('hidden');
      el.convo?.classList.add('active');
    }
  }

  // =====================================================
  // SEARCH CONTROL
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

    if (!query) {
      el.searchResults.innerHTML = '';
      return;
    }

    el.searchResults.innerHTML =
      '<div class="chat-empty">Searching students...</div>';

    try {
      const data = await request(API.search(query));

      // Ignore outdated search responses.
      if (el.searchInput?.value.trim() !== query) return;

      const results = unwrapList(data, [
        'results',
        'users',
        'data'
      ]);

      if (!results.length) {
        el.searchResults.innerHTML =
          '<div class="chat-empty">No students found.</div>';
        return;
      }

      el.searchResults.innerHTML = results.map(user => {
        const name = user.full_name || user.name || 'Student';
        const id = user.id ?? user.user_id;

        if (id == null) return '';

        return `
          <button
            type="button"
            class="chat-search-result"
            data-user-id="${escapeHTML(id)}"
            data-user-name="${escapeHTML(name)}"
          >
            ${avatarMarkup(name, user.avatar || user.profile_image)}
            <span>
              <strong>${escapeHTML(name)}</strong>
              <small>Start a chat</small>
            </span>
          </button>
        `;
      }).join('');

    } catch (error) {
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

      const active =
        state.activeRoom &&
        roomId(state.activeRoom) === id;

      return `
        <button
          type="button"
          class="chat-room-row ${active ? 'active' : ''}"
          data-room-id="${escapeHTML(id)}"
        >
          ${avatarMarkup(name, roomAvatar(room), roomOnline(room))}

          <span class="chat-room-main">
            <span class="chat-room-top">
              <span class="chat-room-name">
                ${escapeHTML(name)}
              </span>

              <time class="chat-room-time">
                ${escapeHTML(fmtRoomTime(room.last_time || room.updated_at))}
              </time>
            </span>

            <span class="chat-room-bottom">
              <span class="chat-room-preview">
                ${escapeHTML(room.last_message || 'Start a conversation')}
              </span>

              ${
                unread > 0
                  ? `<b class="chat-unread">${unread > 99 ? '99+' : unread}</b>`
                  : ''
              }
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

    const rooms = unwrapList(data, [
      'rooms',
      'data'
    ]);

    state.rooms = rooms;

    // Keep the active room synchronized with refreshed data.
    if (state.activeRoom) {
      const updated = rooms.find(
        room => roomId(room) === roomId(state.activeRoom)
      );

      if (updated) {
        state.activeRoom = updated;
      }
    }

    renderRooms();
  }

  // =====================================================
  // CONVERSATION HEADER
  // =====================================================

  function updateConversationHeader(room) {
    if (el.title) {
      el.title.textContent = roomName(room);
    }

    if (el.subtitle) {
      el.subtitle.textContent = roomOnline(room)
        ? 'online'
        : 'KAMUPUS Member';
    }

    if (el.peerAvatar) {
      const avatar = roomAvatar(room);

      el.peerAvatar.innerHTML = avatar
        ? `<img src="${escapeHTML(avatar)}" alt="">`
        : escapeHTML(initials(roomName(room)));
    }
  }

  // =====================================================
  // MESSAGE RENDERING
  // =====================================================

  function dayLabel(value) {
    const date = new Date(value);

    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const yesterday = new Date();

    yesterday.setDate(now.getDate() - 1);

    if (date.toDateString() === now.toDateString()) {
      return 'Today';
    }

    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    return date.toLocaleDateString([], {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  }

  function renderMessage(message, previousDay = '') {
    const mine = isMine(message);
    const date = msgTime(message);
    const day = date ? dayLabel(date) : '';

    const divider =
      day && day !== previousDay
        ? `<div class="chat-day-divider"><span>${escapeHTML(day)}</span></div>`
        : '';

    const text = msgText(message);

    return `
      ${divider}

      <div
        class="chat-message-row ${mine ? 'mine' : ''}"
        data-message-id="${escapeHTML(msgId(message))}"
      >
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

    return (
      el.messages.scrollHeight -
      el.messages.scrollTop -
      el.messages.clientHeight
    ) < 120;
  }

  function renderMessages(messages, appendOnly = false) {
    if (!el.messages) return;

    const wasNearBottom = nearBottom();

    if (!appendOnly) {
      let previousDay = '';

      el.messages.innerHTML = messages.length
        ? messages.map(message => {
            const html = renderMessage(message, previousDay);

            if (msgTime(message)) {
              previousDay = dayLabel(msgTime(message));
            }

            return html;
          }).join('')
        : `
          <div class="chat-empty">
            <strong>Say hello 👋</strong><br><br>
            Your conversation starts here.
          </div>
        `;

    } else {
      const existing = new Set(
        [...el.messages.querySelectorAll('[data-message-id]')]
          .map(node => node.dataset.messageId)
      );

      const fresh = messages.filter(message => {
        return !existing.has(msgId(message));
      });

      if (fresh.length) {
        const existingRows = [
          ...el.messages.querySelectorAll('[data-message-id]')
        ];

        const lastRow = existingRows[existingRows.length - 1];

        const previousDay = lastRow
          ? dayLabel(
              messages.find(m => msgId(m) === lastRow.dataset.messageId)
                ? msgTime(messages.find(m => msgId(m) === lastRow.dataset.messageId))
                : ''
            )
          : '';

        let lastDay = previousDay;

        el.messages.insertAdjacentHTML(
          'beforeend',
          fresh.map(message => {
            const html = renderMessage(message, lastDay);

            if (msgTime(message)) {
              lastDay = dayLabel(msgTime(message));
            }

            return html;
          }).join('')
        );
      }
    }

    if (wasNearBottom) {
      el.messages.scrollTop = el.messages.scrollHeight;
    }
  }

  // =====================================================
  // LOAD MESSAGES
  // =====================================================

  async function loadMessages(id, { appendOnly = false } = {}) {
    if (!id) return;

    const version = ++state.requestVersion;

    const data = await request(API.messages(id));

    // Prevent old room requests overwriting the current conversation.
    if (
      version !== state.requestVersion ||
      !state.activeRoom ||
      roomId(state.activeRoom) !== String(id)
    ) {
      return;
    }

    const messages = unwrapList(data, [
      'messages',
      'data'
    ]);

    state.messages = messages;

    renderMessages(messages, appendOnly);

    const last = messages[messages.length - 1];

    state.lastMessageId = last
      ? msgId(last)
      : null;
  }

  // =====================================================
  // MARK READ
  // =====================================================

  async function markRead(id) {
    try {
      await request(API.read(id), {
        method: 'POST'
      });
    } catch (error) {
      console.warn('Could not mark conversation as read:', error);
    }
  }

  // =====================================================
  // SELECT ROOM
  // =====================================================

  async function selectRoom(id) {
    const room = state.rooms.find(
      item => roomId(item) === String(id)
    );

    if (!room) return;

    clearInterval(state.messagesTimer);

    state.requestVersion++;

    state.activeRoom = room;
    state.messages = [];

    updateConversationHeader(room);
    openConversationScreen();
    renderRooms();

    if (el.messages) {
      el.messages.innerHTML = `
        <div class="chat-empty">
          Opening conversation...
        </div>
      `;
    }

    try {
      await loadMessages(id);
      await markRead(id);

      const updatedRoom = state.rooms.find(
        item => roomId(item) === String(id)
      );

      if (updatedRoom) {
        updatedRoom.unread = 0;
        state.activeRoom = updatedRoom;
      }

      renderRooms();

      startMessagePolling();

      el.input?.focus();

    } catch (error) {
      el.messages.innerHTML = `
        <div class="chat-empty">
          Could not load messages.<br>
          ${escapeHTML(error.message)}
        </div>
      `;
    }
  }

  // =====================================================
  // MESSAGE POLLING
  // =====================================================

  function startMessagePolling() {
    clearInterval(state.messagesTimer);

    state.messagesTimer = setInterval(() => {
      if (!state.activeRoom) return;

      loadMessages(roomId(state.activeRoom), {
        appendOnly: true
      }).catch(error => {
        console.warn('Message refresh failed:', error);
      });

    }, POLL_MESSAGES_MS);
  }

  // =====================================================
  // SEND MESSAGE
  // =====================================================

  async function sendMessage() {
    if (state.sending || !state.activeRoom || !el.input) return;

    const content = el.input.value.trim();

    if (!content) return;

    const room = state.activeRoom;
    const id = roomId(room);

    state.sending = true;

    if (el.send) {
      el.send.disabled = true;
    }

    const tempId = `temp-${Date.now()}`;

    const optimistic = {
      id: tempId,
      user_id: ME_ID,
      mine: true,
      content,
      created_at: new Date().toISOString()
    };

    state.messages.push(optimistic);

    renderMessages(state.messages);

    el.input.value = '';
    el.input.style.height = 'auto';

    try {
      const data = await request(API.send(id), {
        method: 'POST',
        body: JSON.stringify({
          content: content
        })
      });

      const saved = data?.message || data;

      state.messages = state.messages.filter(
        message => msgId(message) !== tempId
      );

      if (saved && (saved.id || saved.message_id)) {
        state.messages.push(saved);
      }

      renderMessages(state.messages);

      loadRooms().catch(() => {});

    } catch (error) {
      state.messages = state.messages.filter(
        message => msgId(message) !== tempId
      );

      renderMessages(state.messages);

      el.input.value = content;

      toast(`Message not sent: ${error.message}`);

    } finally {
      state.sending = false;

      if (el.send) {
        el.send.disabled = false;
      }

      el.input?.focus();
    }
  }

  // =====================================================
  // DIRECT CHAT
  // =====================================================

  async function openDirectChat(userId) {
    try {
      const data = await request(API.dm(userId), {
        method: 'POST'
      });

      const room = data?.room || data;

      if (!room || !roomId(room)) {
        throw new Error('Invalid conversation returned by server.');
      }

      const existingIndex = state.rooms.findIndex(
        item => roomId(item) === roomId(room)
      );

      if (existingIndex >= 0) {
        state.rooms[existingIndex] = room;
      } else {
        state.rooms.unshift(room);
      }

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

    if (el.userPicker) {
      el.userPicker.innerHTML =
        '<div class="chat-empty">Loading students...</div>';
    }

    try {
      const data = await request(API.users());

      const users = unwrapList(data, [
        'users',
        'data'
      ]).filter(user => String(user.id ?? user.user_id) !== ME_ID);

      if (!users.length) {
        el.userPicker.innerHTML =
          '<div class="chat-empty">No other students found.</div>';
        return;
      }

      el.userPicker.innerHTML = users.map(user => {
        const name = user.full_name || user.name || 'Student';
        const id = user.id ?? user.user_id;

        return `
          <label class="chat-modal-user">

            <input
              type="checkbox"
              value="${escapeHTML(id)}"
            >

            ${avatarMarkup(name, user.avatar)}

            <span>
              <strong>${escapeHTML(name)}</strong>
            </span>

          </label>
        `;
      }).join('');

    } catch (error) {
      el.userPicker.innerHTML =
        '<div class="chat-empty">Could not load students.</div>';
    }
  }

  function closeGroupModal() {
    if (el.groupModal) {
      el.groupModal.hidden = true;
    }
  }

  async function createGroup() {
    if (!el.userPicker || !el.groupName) return;

    const memberIds = [
      ...el.userPicker.querySelectorAll('input:checked')
    ].map(input => input.value);

    const name = el.groupName.value.trim();

    if (!name) {
      toast('Please enter a group name.');
      return;
    }

    if (!memberIds.length) {
      toast('Please select at least one student.');
      return;
    }

    el.groupCreate.disabled = true;

    try {
      const data = await request(API.createGroup(), {
        method: 'POST',
        body: JSON.stringify({
          name,
          member_ids: memberIds
        })
      });

      const room = data?.room || data;

      if (!room || !roomId(room)) {
        throw new Error('Invalid group returned by server.');
      }

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
  // EVENT LISTENERS
  // =====================================================

  function bindEvents() {

    // Open a conversation.
    el.roomList?.addEventListener('click', event => {
      const row = event.target.closest('[data-room-id]');

      if (row) {
        selectRoom(row.dataset.roomId);
      }
    });

    // Send message.
    el.send?.addEventListener('click', sendMessage);

    el.composer?.addEventListener('submit', event => {
      event.preventDefault();
      sendMessage();
    });

    // Enter sends, Shift + Enter adds a new line.
    el.input?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    // Automatically resize message box.
    el.input?.addEventListener('input', () => {
      el.input.style.height = 'auto';

      el.input.style.height =
        `${Math.min(el.input.scrollHeight, 120)}px`;
    });

    // Mobile back button.
    el.back?.addEventListener('click', () => {
      clearInterval(state.messagesTimer);
      openRooms();
    });

    // Search.
    el.searchToggle?.addEventListener('click', showSearch);

    el.searchClose?.addEventListener('click', closeSearch);

    el.searchInput?.addEventListener('input', () => {
      clearTimeout(state.searchTimer);

      state.searchTimer = setTimeout(() => {
        runSearch(el.searchInput.value);
      }, 350);
    });

    // Open direct chat from search results.
    el.searchResults?.addEventListener('click', event => {
      const row = event.target.closest('[data-user-id]');

      if (row) {
        openDirectChat(row.dataset.userId);
      }
    });

    // Start new chat button.
    el.startNew?.addEventListener('click', () => {
      showSearch();
      el.searchInput?.focus();
    });

    // Group creation.
    el.newGroup?.addEventListener('click', openGroupModal);

    el.groupClose?.addEventListener('click', closeGroupModal);

    el.groupCreate?.addEventListener('click', createGroup);

    // Close modal when clicking outside.
    el.groupModal?.addEventListener('click', event => {
      if (event.target === el.groupModal) {
        closeGroupModal();
      }
    });

    // Escape closes search and group modal.
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeSearch();
        closeGroupModal();
      }
    });

    // Adjust layout when screen changes size.
    window.addEventListener('resize', () => {
      if (!isMobile()) {
        el.rooms?.classList.remove('hidden');
        el.convo?.classList.remove('active');
      } else if (!state.activeRoom) {
        openRooms();
      }
    });
  }

  // =====================================================
  // INITIALIZATION
  // =====================================================

  async function init() {
    installStyles();

    if (!ME_ID) {
      if (el.roomList) {
        el.roomList.innerHTML = `
          <div class="chat-empty">
            Please sign in to view your campus chats.
          </div>
        `;
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

      el.roomList.innerHTML = `
        <div class="chat-empty">
          Failed to load conversations.<br>
          Please refresh and try again.
        </div>
      `;
    }

    state.roomsTimer = setInterval(() => {
      loadRooms().catch(error => {
        console.warn('Room refresh failed:', error);
      });
    }, POLL_ROOMS_MS);
  }

  // =====================================================
  // START APPLICATION
  // =====================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {
      once: true
    });
  } else {
    init();
  }

})();
