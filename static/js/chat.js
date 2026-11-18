/* Lead City University — Chat UI
 * Replacement for static/js/chat.js
 *
 * Uses the existing chat.html IDs:
 * screenRooms, searchToggleBtn, newGroupBtn, searchBar, searchInput,
 * searchCloseBtn, searchResults, roomList, startNewBtn, screenConvo,
 * convoBackBtn, peerInfo, chatPeerAvatar, chatTitle, chatSubtitle,
 * chatMessages, typingIndicator, typingText, newMessagesPill,
 * chatComposer, chatInput, chatSend, newGroupModal, newGroupClose,
 * newGroupName, groupUserPicker, newGroupCreate.
 *
 * IMPORTANT: Set the API paths below to the routes implemented by your
 * Flask app. The default paths are a documented REST contract, not a claim
 * that these endpoints already exist in your backend.
 */
(() => {
  'use strict';

  const ME_ID = String(window.ME_ID ?? '');
  const ROOT = (window.CHAT_API_BASE || '').replace(/\/$/, '');

  // Change these paths to match your Flask routes.
  const API = {
    rooms:              () => `${ROOT}/api/chat/rooms`,
    messages:           (roomId) => `${ROOT}/api/chat/rooms/${encodeURIComponent(roomId)}/messages`,
    send:               (roomId) => `${ROOT}/api/chat/rooms/${encodeURIComponent(roomId)}/messages`,
    read:               (roomId) => `${ROOT}/api/chat/rooms/${encodeURIComponent(roomId)}/read`,
    typing:             (roomId) => `${ROOT}/api/chat/rooms/${encodeURIComponent(roomId)}/typing`,
    presence:           () => `${ROOT}/api/chat/presence`,
    react:              (messageId) => `${ROOT}/api/chat/messages/${encodeURIComponent(messageId)}/reactions`,
    search:             (query) => `${ROOT}/api/chat/search?q=${encodeURIComponent(query)}`,
    users:              () => `${ROOT}/api/chat/users`,
    createGroup:        () => `${ROOT}/api/chat/groups`,
    notifications:      () => `${ROOT}/api/chat/notifications`
  };

  // Polling keeps this compatible with a normal Flask app without requiring
  // Socket.IO. For instant updates, replace polling with your Socket.IO events.
  const POLL_MESSAGES_MS = 2500;
  const POLL_ROOMS_MS = 9000;
  const PRESENCE_MS = 15000;
  const TYPING_IDLE_MS = 1800;

  const $ = (id) => document.getElementById(id);
  const el = {
    rooms: $('screenRooms'),
    searchToggle: $('searchToggleBtn'),
    newGroup: $('newGroupBtn'),
    searchBar: $('searchBar'),
    searchInput: $('searchInput'),
    searchClose: $('searchCloseBtn'),
    searchResults: $('searchResults'),
    roomList: $('roomList'),
    startNew: $('startNewBtn'),
    convo: $('screenConvo'),
    back: $('convoBackBtn'),
    peerInfo: $('peerInfo'),
    peerAvatar: $('chatPeerAvatar'),
    title: $('chatTitle'),
    subtitle: $('chatSubtitle'),
    messages: $('chatMessages'),
    typing: $('typingIndicator'),
    typingText: $('typingText'),
    newPill: $('newMessagesPill'),
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
    lastMessageId: null,
    pollMessagesTimer: null,
    pollRoomsTimer: null,
    presenceTimer: null,
    typingTimer: null,
    searchTimer: null,
    typingSent: false,
    sending: false,
    messageRequestTokens: new Map(),
    unreadAtBottom: 0,
    lastSeenMessageIds: new Set(),
    seenNotificationIds: new Set(),
    destroyed: false
  };

  const css = `
    :root {
      --chat-brand: var(--primary, var(--brand, var(--accent, #176b55)));
      --chat-brand-strong: var(--primary-dark, var(--brand-dark, #10513f));
      --chat-bg: var(--page-bg, var(--bg, #f4f7f6));
      --chat-card: var(--card, #ffffff);
      --chat-text: var(--text, #17211e);
      --chat-muted: var(--muted, #78847f);
      --chat-border: var(--border, #e4ebe7);
      --chat-soft: color-mix(in srgb, var(--chat-brand) 8%, white);
      --chat-outgoing: color-mix(in srgb, var(--chat-brand) 13%, white);
    }
    #screenRooms, #screenConvo { min-height:0; }
    #roomList { display:flex; flex-direction:column; gap:7px; }
    .chat-room-row {
      width:100%; display:flex; align-items:center; gap:12px; text-align:left;
      padding:12px; border:1px solid transparent; border-radius:15px;
      background:transparent; color:var(--chat-text); cursor:pointer;
      transition:background .18s,border-color .18s,transform .18s;
    }
    .chat-room-row:hover { background:var(--chat-soft); transform:translateY(-1px); }
    .chat-room-row.active { background:var(--chat-soft); border-color:color-mix(in srgb,var(--chat-brand) 20%,transparent); }
    .chat-avatar-wrap { position:relative; flex:0 0 46px; width:46px; height:46px; }
    .chat-avatar {
      width:46px;height:46px;border-radius:50%;display:grid;place-items:center;
      overflow:hidden;background:var(--chat-soft);color:var(--chat-brand);
      font-weight:800;font-size:15px;object-fit:cover;
    }
    .chat-avatar img { width:100%;height:100%;object-fit:cover; }
    .chat-online-dot {
      position:absolute;right:0;bottom:0;width:12px;height:12px;border-radius:50%;
      background:#22c55e;border:2px solid var(--chat-card);
      box-shadow:0 0 0 2px rgba(34,197,94,.12);
    }
    .chat-room-main { min-width:0;flex:1; }
    .chat-room-top,.chat-room-bottom { display:flex;align-items:center;justify-content:space-between;gap:8px; }
    .chat-room-name { font-size:14px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
    .chat-room-time { flex:none;font-size:10px;color:var(--chat-muted); }
    .chat-room-preview { min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--chat-muted);margin-top:4px; }
    .chat-unread {
      flex:none;min-width:19px;height:19px;padding:0 5px;border-radius:20px;
      display:grid;place-items:center;background:var(--chat-brand);color:white;
      font-size:10px;font-weight:800;
    }
    #screenConvo { display:flex;flex-direction:column; }
    #chatMessages {
      flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;
      padding:18px clamp(12px,3vw,28px);scroll-behavior:smooth;
      background:
        radial-gradient(circle at 15% 15%,color-mix(in srgb,var(--chat-brand) 4%,transparent),transparent 35%),
        var(--chat-bg);
    }
    .chat-day-divider { display:flex;justify-content:center;margin:13px 0 18px; }
    .chat-day-divider span { background:var(--chat-card);color:var(--chat-muted);font-size:10px;padding:6px 11px;border-radius:20px;box-shadow:0 1px 5px rgba(0,0,0,.05); }
    .chat-message-row { display:flex;margin:8px 0;animation:chatPop .2s ease both; }
    .chat-message-row.mine { justify-content:flex-end; }
    .chat-bubble {
      position:relative;max-width:min(76%,560px);padding:10px 12px 7px;
      border-radius:16px 16px 16px 5px;background:var(--chat-card);
      color:var(--chat-text);box-shadow:0 1px 2px rgba(0,0,0,.055);
      overflow-wrap:anywhere;white-space:pre-wrap;line-height:1.45;font-size:13px;
    }
    .chat-message-row.mine .chat-bubble {
      background:var(--chat-outgoing);border-radius:16px 16px 5px 16px;
    }
    .chat-sender { font-size:10px;font-weight:800;color:var(--chat-brand);margin-bottom:4px; }
    .chat-message-image { display:block;max-width:100%;max-height:280px;border-radius:10px;margin-bottom:6px; }
    .chat-message-meta { display:flex;justify-content:flex-end;align-items:center;gap:5px;margin-top:4px;color:var(--chat-muted);font-size:9px; }
    .chat-ticks { color:var(--chat-muted);font-size:12px;letter-spacing:-3px;padding-right:3px; }
    .chat-ticks.read { color:#2698e6; }
    .chat-reactions { display:flex;flex-wrap:wrap;gap:4px;margin-top:5px; }
    .chat-reaction {
      border:1px solid var(--chat-border);border-radius:14px;padding:3px 7px;
      background:var(--chat-card);font-size:11px;cursor:pointer;
    }
    .chat-reaction.mine { border-color:var(--chat-brand);background:var(--chat-soft); }
    .chat-react-trigger {
      position:absolute;right:-7px;top:-12px;border:1px solid var(--chat-border);
      border-radius:18px;background:var(--chat-card);padding:3px 6px;
      opacity:0;transition:opacity .15s;cursor:pointer;font-size:12px;
    }
    .chat-bubble:hover .chat-react-trigger,.chat-react-trigger:focus { opacity:1; }
    .chat-system-note { text-align:center;color:var(--chat-muted);font-size:11px;margin:14px 0; }
    #chatComposer { display:flex;align-items:flex-end;gap:9px;padding:12px 14px;background:var(--chat-card);border-top:1px solid var(--chat-border); }
    #chatInput {
      flex:1;min-width:0;max-height:130px;resize:none;border:1px solid var(--chat-border);
      outline:none;border-radius:22px;padding:11px 15px;background:var(--chat-bg);
      color:var(--chat-text);font:inherit;font-size:13px;transition:border-color .15s,box-shadow .15s;
    }
    #chatInput:focus { border-color:var(--chat-brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--chat-brand) 12%,transparent); }
    #chatSend { border:0;border-radius:50%;width:42px;height:42px;flex:none;background:var(--chat-brand);color:white;cursor:pointer;font-size:17px;box-shadow:0 5px 12px color-mix(in srgb,var(--chat-brand) 22%,transparent);transition:transform .15s,opacity .15s; }
    #chatSend:hover { transform:translateY(-2px);background:var(--chat-brand-strong); }
    #chatSend:disabled { opacity:.5;cursor:not-allowed;transform:none; }
    #typingIndicator { min-height:20px;padding:0 18px 5px;color:var(--chat-muted);font-size:11px;background:var(--chat-card); }
    #newMessagesPill {
      position:absolute;left:50%;bottom:82px;transform:translateX(-50%);
      border:0;border-radius:22px;background:var(--chat-brand);color:white;
      padding:8px 14px;font-size:11px;font-weight:750;box-shadow:0 5px 18px rgba(0,0,0,.15);
      cursor:pointer;z-index:4;display:none;
    }
    .chat-empty { padding:28px 15px;text-align:center;color:var(--chat-muted);font-size:12px; }
    .chat-search-result { display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--chat-border);text-decoration:none;color:var(--chat-text);cursor:pointer; }
    .chat-search-result:hover { background:var(--chat-soft); }
    .chat-modal-user { display:flex;align-items:center;gap:9px;padding:8px;border-radius:10px; }
    .chat-modal-user:hover { background:var(--chat-soft); }
    .chat-modal-user input { accent-color:var(--chat-brand); }
    .chat-toast {
      position:fixed;left:50%;bottom:22px;transform:translate(-50%,15px);
      opacity:0;pointer-events:none;z-index:99999;background:#17211e;color:#fff;
      border-radius:22px;padding:10px 15px;font-size:12px;box-shadow:0 8px 28px rgba(0,0,0,.2);
      transition:all .2s;max-width:calc(100vw - 30px);text-align:center;
    }
    .chat-toast.show { opacity:1;transform:translate(-50%,0); }
    .chat-reaction-picker {
      display:flex;gap:5px;padding:6px;background:var(--chat-card);
      border:1px solid var(--chat-border);border-radius:22px;box-shadow:0 6px 20px rgba(0,0,0,.12);
    }
    .chat-reaction-picker button { border:0;background:transparent;font-size:19px;cursor:pointer;padding:3px;border-radius:8px; }
    .chat-reaction-picker button:hover { background:var(--chat-soft);transform:scale(1.12); }
    @keyframes chatPop { from { opacity:0;transform:translateY(5px) scale(.99); } to { opacity:1;transform:none; } }
    @media(max-width:640px) {
      .chat-bubble { max-width:88%; }
      #chatMessages { padding:12px 10px; }
      #chatComposer { padding:9px; }
      .chat-room-row { padding:10px 8px; }
    }
    @media(prefers-reduced-motion:reduce) {
      .chat-message-row { animation:none; }
      #chatMessages { scroll-behavior:auto; }
    }
  `;

  function addStyles() {
    if (document.getElementById('lcu-chat-runtime-styles')) return;
    const style = document.createElement('style');
    style.id = 'lcu-chat-runtime-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[ch]);
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 2)).toUpperCase();
  }

  function fmtTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  }

  function fmtRoomTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    return date.toDateString() === today.toDateString()
      ? fmtTime(date)
      : date.toLocaleDateString([], { day:'numeric', month:'short' });
  }

    function roomId(room) { return String(room.id ?? room.room_id ?? room.conversation_id ?? ''); }
  function roomName(room) { return room.name || room.title || room.peer_name || room.other_user?.name || 'Conversation'; }
  function roomAvatar(room) { return room.avatar || room.peer_avatar || room.other_user?.avatar || ''; }
  function roomOnline(room) { return !!(room.is_online ?? room.online ?? room.other_user?.is_online); }
  function msgId(message) { return String(message.id ?? message.message_id ?? ''); }
  function msgSender(message) { return String(message.sender_id ?? message.user_id ?? message.author_id ?? ''); }
  function isMine(message) { return message.mine === true || (ME_ID && msgSender(message) === ME_ID); }
  function msgText(message) { return message.content ?? message.message ?? message.text ?? ''; }
  function msgTime(message) { return message.created_at ?? message.timestamp ?? message.time ?? ''; }

  async function request(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
    if (csrf && !headers['X-CSRFToken']) headers['X-CSRFToken'] = csrf;
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

    const response = await fetch(url, {
      credentials:'same-origin',
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

  function unwrapList(data, keys) {
    if (Array.isArray(data)) return data;
    for (const key of keys) {
      if (Array.isArray(data?.[key])) return data[key];
    }
    return [];
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

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => node.classList.remove('show'), 2600);
  }

  function avatarMarkup(name, url, online = false) {
    const inner = url
      ? `<img src="${escapeHTML(url)}" alt="" loading="lazy">`
      : escapeHTML(initials(name));

    return `<span class="chat-avatar-wrap">
      <span class="chat-avatar">${inner}</span>
      ${online ? '<i class="chat-online-dot" title="Online"></i>' : ''}
    </span>`;
  }

  function previewText(room) {
    const last = room.last_message || room.latest_message || {};
    const text = last.content ?? last.message ?? room.last_message_text ?? '';
    const prefix = last.sender_id && ME_ID && String(last.sender_id) === ME_ID ? 'You: ' : '';

    return (prefix + text).trim() ||
      (room.is_group ? 'Group conversation' : 'Start a conversation');
  }

  function renderRooms() {
    if (!el.roomList) return;

    if (!state.rooms.length) {
      el.roomList.innerHTML =
        '<div class="chat-empty">No conversations yet.<br>Start a new chat with someone from Lead City University.</div>';
      return;
    }

    const sorted = [...state.rooms].sort((a, b) => {
      const at = new Date(a.updated_at || a.last_message?.created_at || 0).getTime();
      const bt = new Date(b.updated_at || b.last_message?.created_at || 0).getTime();
      return bt - at;
    });

    el.roomList.innerHTML = sorted.map(room => {
      const id = roomId(room);
      const unread = Number(room.unread_count || room.unread || 0);
      const active = state.activeRoom && roomId(state.activeRoom) === id;
      const name = roomName(room);

      return `<button type="button"
        class="chat-room-row${active ? ' active' : ''}"
        data-room-id="${escapeHTML(id)}">

        ${avatarMarkup(name, roomAvatar(room), roomOnline(room))}

        <span class="chat-room-main">
          <span class="chat-room-top">
            <span class="chat-room-name">${escapeHTML(name)}</span>
            <time class="chat-room-time">
              ${escapeHTML(fmtRoomTime(room.updated_at || room.last_message?.created_at))}
            </time>
          </span>

          <span class="chat-room-bottom">
            <span class="chat-room-preview">${escapeHTML(previewText(room))}</span>
            ${unread ? `<b class="chat-unread">${unread > 99 ? '99+' : unread}</b>` : ''}
          </span>
        </span>
      </button>`;
    }).join('');
  }

  function openRooms() {
    el.convo?.setAttribute('hidden', '');
    el.rooms?.removeAttribute('hidden');
    el.rooms?.classList.remove('hidden');
    el.convo?.classList.remove('active');
    el.rooms?.classList.add('active');

    renderRooms();
  }

  function openConversationScreen() {
    el.rooms?.setAttribute('hidden', '');
    el.rooms?.classList.remove('active');
    el.convo?.removeAttribute('hidden');
    el.convo?.classList.remove('hidden');
    el.convo?.classList.add('active');
  }

  function updateConversationHeader(room) {
    const name = roomName(room);

    if (el.title) el.title.textContent = name;

    if (el.subtitle) {
      const subtitle = room.is_group
        ? `${room.member_count || room.members?.length || ''} members`
        : (
            roomOnline(room)
              ? 'online'
              : (room.last_seen ? `last seen ${fmtTime(room.last_seen)}` : 'Lead City University')
          );

      el.subtitle.textContent = subtitle;
      el.subtitle.classList.toggle('is-online', roomOnline(room));
    }

    if (el.peerAvatar) {
      if (roomAvatar(room)) {
        el.peerAvatar.innerHTML = `<img src="${escapeHTML(roomAvatar(room))}" alt="">`;
      } else {
        el.peerAvatar.textContent = initials(name);
      }
    }
  }

  function dayLabel(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';

    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);

    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return d.toLocaleDateString([], {
      weekday:'long',
      day:'numeric',
      month:'long'
    });
  }

  function statusTicks(message) {
    const status = String(
      message.status ||
      (message.read_at ? 'read' : message.delivered_at ? 'delivered' : 'sent')
    ).toLowerCase();

    if (status === 'read' || message.read === true || message.is_read === true) {
      return '<span class="chat-ticks read" title="Read">✓✓</span>';
    }

    if (status === 'delivered') {
      return '<span class="chat-ticks" title="Delivered">✓✓</span>';
    }

    return '<span class="chat-ticks" title="Sent">✓</span>';
  }

  function renderMessage(message, previousDay) {
    const mine = isMine(message);
    const date = msgTime(message);
    const day = date ? dayLabel(date) : '';

    const divider = day && day !== previousDay
      ? `<div class="chat-day-divider"><span>${escapeHTML(day)}</span></div>`
      : '';

    const text = msgText(message);
    const imageUrl = message.image_url || message.attachment_url || '';
    const reactions = Array.isArray(message.reactions) ? message.reactions : [];

    const reactionHtml = reactions.length
      ? `<div class="chat-reactions">${reactions.map(r => {
          const emoji = typeof r === 'string' ? r : (r.emoji || r.reaction || '❤️');
          const count = typeof r === 'string' ? 1 : (r.count || r.users?.length || 1);
          const mineReaction = typeof r === 'object' && (r.mine || r.reacted_by_me);

          return `<button type="button"
            class="chat-reaction${mineReaction ? ' mine' : ''}"
            data-message-id="${escapeHTML(msgId(message))}"
            data-emoji="${escapeHTML(emoji)}">
            ${escapeHTML(emoji)} ${count}
          </button>`;
        }).join('')}</div>`
      : '';

    const sender = state.activeRoom?.is_group && !mine
      ? `<div class="chat-sender">${escapeHTML(message.sender_name || message.author || 'Member')}</div>`
      : '';

    return `${divider}
      <div class="chat-message-row${mine ? ' mine' : ''}"
        data-message-id="${escapeHTML(msgId(message))}">
        <div class="chat-bubble">
          ${sender}
          ${imageUrl ? `<img class="chat-message-image" src="${escapeHTML(imageUrl)}" alt="Shared image" loading="lazy">` : ''}
          ${text ? `<span>${escapeHTML(text)}</span>` : ''}

          <button type="button"
            class="chat-react-trigger"
            title="React to message"
            aria-label="React to message">☺</button>

          ${reactionHtml}

          <div class="chat-message-meta">
            <time>${escapeHTML(fmtTime(date))}</time>
            ${mine ? statusTicks(message) : ''}
          </div>
        </div>
      </div>`;
  }

  function nearBottom() {
    if (!el.messages) return true;

    return el.messages.scrollHeight -
      el.messages.scrollTop -
      el.messages.clientHeight < 100;
  }

  function renderMessages(messages, appendOnly = false) {
    if (!el.messages) return;

    const wasNearBottom = nearBottom();
    const oldHeight = el.messages.scrollHeight;
    const oldTop = el.messages.scrollTop;
    let freshCount = 0;

    if (!appendOnly) {
      let lastDay = '';

      el.messages.innerHTML = messages.length
        ? messages.map(m => {
            const html = renderMessage(m, lastDay);
            const d = msgTime(m);
            if (d) lastDay = dayLabel(d);
            return html;
          }).join('')
        : '<div class="chat-empty">Say hello 👋<br>Your conversation starts here.</div>';

    } else {
      const existing = new Set(
        [...el.messages.querySelectorAll('[data-message-id]')]
          .map(n => n.dataset.messageId)
      );

      const fresh = messages.filter(m => !existing.has(msgId(m)));
      freshCount = fresh.length;

      if (freshCount) {
        let lastDay = '';
        const last = messages[messages.length - 1];

        if (last) lastDay = dayLabel(msgTime(last));

        el.messages.insertAdjacentHTML(
          'beforeend',
          fresh.map(m => renderMessage(m, lastDay)).join('')
        );
      }
    }

    if (wasNearBottom) {
      el.messages.scrollTop = el.messages.scrollHeight;
      state.unreadAtBottom = 0;
      hideNewMessages();

    } else if (appendOnly && freshCount > 0) {
      state.unreadAtBottom += freshCount;
      showNewMessages();
      el.messages.scrollTop = oldTop + (el.messages.scrollHeight - oldHeight);
    }
  }

  function showNewMessages() {
    if (!el.newPill) return;

    el.newPill.textContent =
      `${state.unreadAtBottom} new message${state.unreadAtBottom === 1 ? '' : 's'} ↓`;

    el.newPill.style.display = 'block';
  }

  function hideNewMessages() {
    if (el.newPill) el.newPill.style.display = 'none';
  }

  async function loadRooms() {
    const data = await request(API.rooms());
    state.rooms = unwrapList(data, ['rooms','conversations','data']);
    renderRooms();
  }

  async function loadMessages(roomIdValue, { appendOnly = false } = {}) {
    if (!roomIdValue) return;

    const targetRoomId = String(roomIdValue);
    const token = (state.messageRequestTokens.get(targetRoomId) || 0) + 1;

    state.messageRequestTokens.set(targetRoomId, token);

    const data = await request(API.messages(targetRoomId));
    const messages = unwrapList(data, ['messages','data']);

    // Ignore stale responses if a newer request has completed or the user
    // has switched to another conversation.
    if (state.messageRequestTokens.get(targetRoomId) !== token) return;

    if (!state.activeRoom || roomId(state.activeRoom) !== targetRoomId) return;

    const oldIds = new Set(state.messages.map(msgId));
    const newMessages = messages.filter(m => msgId(m) && !oldIds.has(msgId(m)));

    state.messages = messages;
    renderMessages(messages, appendOnly);

    const last = messages[messages.length - 1];
    state.lastMessageId = last ? msgId(last) : null;

    if (newMessages.length && newMessages.some(m => !isMine(m))) {
      markRead(targetRoomId).catch(() => {});
      if (appendOnly) notifyIncoming(newMessages);
    }
  }

  async function markRead(roomIdValue) {
    await request(API.read(roomIdValue), {
      method:'POST',
      body:JSON.stringify({ last_message_id:state.lastMessageId })
    });

    const room = state.rooms.find(r => roomId(r) === String(roomIdValue));

    if (room) {
      room.unread_count = 0;
      room.unread = 0;
      renderRooms();
    }
  }

  async function selectRoom(id) {
    const room = state.rooms.find(r => roomId(r) === String(id));
    if (!room) return;

    state.activeRoom = room;
    state.messages = [];
    state.lastMessageId = null;
    state.unreadAtBottom = 0;

    updateConversationHeader(room);
    openConversationScreen();

    if (el.messages) {
      el.messages.innerHTML = '<div class="chat-empty">Opening conversation…</div>';
    }

    renderRooms();

    try {
      await loadMessages(id);
      await markRead(id).catch(() => {});
      startMessagePolling();

      if (el.input) el.input.focus();

    } catch (error) {
      if (el.messages) {
        el.messages.innerHTML =
          `<div class="chat-empty">Could not load messages.<br>${escapeHTML(error.message)}</div>`;
      }

      toast('Could not open conversation');
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

    const optimistic = {
      id:tempId,
      sender_id:ME_ID,
      mine:true,
      content,
      created_at:new Date().toISOString(),
      status:'sending'
    };

    state.messages.push(optimistic);
    renderMessages(state.messages);

    el.input.value = '';
    resizeInput();

    try {
      const data = await request(API.send(roomIdValue), {
        method:'POST',
        body:JSON.stringify({ content })
      });

      const saved = data?.message || data?.data || data;

      state.messages = state.messages.filter(m => msgId(m) !== tempId);

      if (saved && (saved.id || saved.message_id)) {
        state.messages.push(saved);
      } else {
        state.messages.push({
          ...optimistic,
          ...(saved || {}),
          id:saved?.id || tempId.replace('temp-','')
        });
      }

      renderMessages(state.messages);
      state.typingSent = false;
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

  function resizeInput() {
    if (!el.input) return;

    el.input.style.height = 'auto';
    el.input.style.height = `${Math.min(el.input.scrollHeight, 130)}px`;
  }

  async function sendTyping() {
    if (!state.activeRoom || state.typingSent) return;

    state.typingSent = true;

    try {
      await request(API.typing(roomId(state.activeRoom)), {
        method:'POST',
        body:JSON.stringify({ typing:true })
      });
    } catch (_) {
      // Typing is a convenience feature.
    }
  }

  function scheduleTypingStop() {
    clearTimeout(state.typingTimer);

    state.typingTimer = setTimeout(async () => {
      if (!state.activeRoom) return;

      state.typingSent = false;

      try {
        await request(API.typing(roomId(state.activeRoom)), {
          method:'POST',
          body:JSON.stringify({ typing:false })
        });
      } catch (_) {}
    }, TYPING_IDLE_MS);
  }

  async function pollTyping() {
    if (!state.activeRoom) return;

    try {
      const data = await request(API.typing(roomId(state.activeRoom)));
      const people = data?.users || data?.typing_users || [];

      const names = people
        .map(p => typeof p === 'string' ? p : p.name)
        .filter(Boolean);

      if (el.typing) {
        el.typing.style.display = names.length ? 'block' : 'none';
      }

      if (el.typingText) {
        el.typingText.textContent = names.length
          ? `${names.slice(0,2).join(', ')} ${names.length === 1 ? 'is' : 'are'} typing…`
          : '';
      }

    } catch (_) {}
  }

  function startMessagePolling() {
    clearInterval(state.pollMessagesTimer);

    state.pollMessagesTimer = setInterval(() => {
      if (state.activeRoom) {
        loadMessages(roomId(state.activeRoom), { appendOnly:true }).catch(() => {});
        pollTyping();
      }
    }, POLL_MESSAGES_MS);
  }

  async function pollPresence() {
    try {
      const data = await request(API.presence(), {
        method:'POST',
        body:JSON.stringify({
          online:true,
          room_id:state.activeRoom ? roomId(state.activeRoom) : null
        })
      });

      const onlineIds = new Set(
        (data?.online_users || data?.users || [])
          .map(u => String(u.id ?? u.user_id ?? u))
      );

      state.rooms.forEach(room => {
        const peerId = String(room.peer_id ?? room.other_user?.id ?? '');

        if (peerId) {
          room.is_online = onlineIds.has(peerId);
        }
      });

      renderRooms();

      if (state.activeRoom) {
        const current = state.rooms.find(
          r => roomId(r) === roomId(state.activeRoom)
        );

        if (current) {
          state.activeRoom = current;
          updateConversationHeader(current);
        }
      }

    } catch (_) {}
  }

  async function pollNotifications() {
    try {
      const data = await request(API.notifications());
      const notifications = unwrapList(data, ['notifications','data']);

      for (const n of notifications) {
        const id = String(n.id ?? n.notification_id ?? '');

        if (!id || state.seenNotificationIds.has(id)) continue;

        state.seenNotificationIds.add(id);

        if (
          n.type === 'message' &&
          n.room_id &&
          (!state.activeRoom || roomId(state.activeRoom) !== String(n.room_id))
        ) {
          toast(
            `${n.sender_name || 'New message'}: ${n.preview || n.content || 'Sent you a message'}`
          );
        }
      }

    } catch (_) {}
  }

  function notifyIncoming(messages) {
    const latest = messages[messages.length - 1];

    if (!latest || isMine(latest)) return;

    if (
      'Notification' in window &&
      Notification.permission === 'granted' &&
      document.hidden
    ) {
      new Notification(
        latest.sender_name || roomName(state.activeRoom),
        {
          body:String(msgText(latest) || 'Sent you a message').slice(0,120),
          icon:state.activeRoom ? roomAvatar(state.activeRoom) || undefined : undefined,
          tag:`chat-${roomId(state.activeRoom)}`
        }
      );
    }
  }

  async function enableNotifications() {
    if (!('Notification' in window)) {
      toast('This browser does not support notifications');
      return;
    }

    if (Notification.permission === 'granted') {
      toast('Notifications are already enabled');
      return;
    }

    if (Notification.permission === 'denied') {
      toast('Notifications are blocked in your browser settings');
      return;
    }

    const permission = await Notification.requestPermission();

    toast(
      permission === 'granted'
        ? 'Notifications enabled'
        : 'Notifications not enabled'
    );
  }

  async function reactToMessage(messageId, emoji) {
    try {
      const data = await request(API.react(messageId), {
        method:'POST',
        body:JSON.stringify({ emoji })
      });

      const updated = data?.message || data?.data;

      if (updated) {
        const index = state.messages.findIndex(
          m => msgId(m) === String(messageId)
        );

        if (index >= 0) {
          state.messages[index] = updated;
        }

      } else {
        const msg = state.messages.find(
          m => msgId(m) === String(messageId)
        );

        if (msg) {
          msg.reactions ||= [];

          const existing = msg.reactions.find(
            r => (r.emoji || r) === emoji
          );

          if (existing) {
            existing.count = (existing.count || 1) + 1;
          } else {
            msg.reactions.push({
              emoji,
              count:1,
              mine:true
            });
          }
        }
      }

      renderMessages(state.messages);

    } catch (error) {
      toast(`Reaction failed: ${error.message}`);
    }
  }

  function showReactionPicker(anchor, messageId) {
    document.querySelector('.chat-reaction-picker')?.remove();

    const picker = document.createElement('div');
    picker.className = 'chat-reaction-picker';

    picker.innerHTML = ['❤️','😂','👍','😮','😢','🙏'].map(emoji =>
      `<button type="button"
        data-emoji="${emoji}"
        aria-label="React ${emoji}">${emoji}</button>`
    ).join('');

    const rect = anchor.getBoundingClientRect();

    picker.style.position = 'fixed';
    picker.style.zIndex = '9999';
    picker.style.left =
      `${Math.max(8, Math.min(window.innerWidth - 250, rect.left - 100))}px`;
    picker.style.top = `${Math.max(8, rect.top - 48)}px`;

    document.body.appendChild(picker);

    picker.addEventListener('click', event => {
      const button = event.target.closest('[data-emoji]');
      if (!button) return;

      reactToMessage(messageId, button.dataset.emoji);
      picker.remove();
    });

    setTimeout(() => document.addEventListener('click', function close(e) {
      if (!picker.contains(e.target)) {
        picker.remove();
        document.removeEventListener('click', close);
      }
    }, { once:true }), 0);
  }

  async function openSearch() {
    if (el.searchBar) el.searchBar.hidden = false;

    el.searchToggle?.setAttribute('aria-expanded','true');
    el.searchInput?.focus();
  }

  function closeSearch() {
    if (el.searchBar) el.searchBar.hidden = true;
    if (el.searchInput) el.searchInput.value = '';
    if (el.searchResults) el.searchResults.innerHTML = '';

    el.searchToggle?.setAttribute('aria-expanded','false');
  }

  async function runSearch(query) {
    if (!el.searchResults) return;

    if (!query.trim()) {
      el.searchResults.innerHTML = '';
      return;
    }

    el.searchResults.innerHTML =
      '<div class="chat-empty">Searching…</div>';

    try {
      const data = await request(API.search(query.trim()));

      const results = unwrapList(
        data,
        ['results','users','people','data']
      );

      el.searchResults.innerHTML = results.length
        ? results.map(user => {
            const name = user.name || user.full_name || user.username || 'Student';
            const uid = user.id ?? user.user_id;

            return `<button type="button"
              class="chat-search-result"
              data-user-id="${escapeHTML(uid)}"
              data-user-name="${escapeHTML(name)}">

              ${avatarMarkup(name, user.avatar || user.avatar_url, !!user.is_online)}

              <span>
                <strong>${escapeHTML(name)}</strong>
                <small style="display:block;color:var(--chat-muted)">
                  ${escapeHTML([user.department,user.level].filter(Boolean).join(' · ') || 'Lead City University')}
                </small>
              </span>
            </button>`;
          }).join('')
        : '<div class="chat-empty">No students found.</div>';

    } catch (error) {
      el.searchResults.innerHTML =
        `<div class="chat-empty">Search unavailable: ${escapeHTML(error.message)}</div>`;
    }
  }

  async function openDirectChat(userId, name) {
    const existing = state.rooms.find(
      r => String(r.peer_id ?? r.other_user?.id ?? '') === String(userId)
    );

    if (existing) {
      return selectRoom(roomId(existing));
    }

    try {
      const data = await request(API.createGroup(), {
        method:'POST',
        body:JSON.stringify({
          name:'',
          member_ids:[userId],
          direct:true
        })
      });

      const room = data?.room || data?.conversation || data?.data || data;

      if (!room || !roomId(room)) {
        throw new Error('Server did not return a conversation');
      }

      state.rooms.unshift(room);

      renderRooms();
      closeSearch();

      await selectRoom(roomId(room));

    } catch (error) {
      toast(`Could not start chat with ${name}: ${error.message}`);
    }
  }

  async function openGroupModal() {
    if (!el.groupModal) return;

    el.groupModal.hidden = false;
    el.groupModal.classList.add('open');

    if (!el.userPicker) return;

    el.userPicker.innerHTML =
      '<div class="chat-empty">Loading students…</div>';

    try {
      const data = await request(API.users());

      const users = unwrapList(
        data,
        ['users','students','data']
      ).filter(u => String(u.id ?? u.user_id) !== ME_ID);

      el.userPicker.innerHTML = users.length
        ? users.map(user => {
            const id = user.id ?? user.user_id;
            const name = user.name || user.full_name || 'Student';

            return `<label class="chat-modal-user">
              <input type="checkbox" value="${escapeHTML(id)}">

              ${avatarMarkup(name, user.avatar || user.avatar_url, !!user.is_online)}

              <span>
                <strong>${escapeHTML(name)}</strong>
                <small style="display:block;color:var(--chat-muted)">
                  ${escapeHTML(user.department || 'Student')}
                </small>
              </span>
            </label>`;
          }).join('')
        : '<div class="chat-empty">No other students found.</div>';

    } catch (error) {
      el.userPicker.innerHTML =
        `<div class="chat-empty">Could not load students: ${escapeHTML(error.message)}</div>`;
    }
  }

  function closeGroupModal() {
    if (!el.groupModal) return;

    el.groupModal.classList.remove('open');
    el.groupModal.hidden = true;
  }

  async function createGroup() {
    if (!el.userPicker) return;

    const memberIds = [
      ...el.userPicker.querySelectorAll('input[type="checkbox"]:checked')
    ].map(input => input.value);

    const name = el.groupName?.value.trim() || '';

    if (memberIds.length < 1) {
      toast('Choose at least one student');
      return;
    }

    if (!name) {
      toast('Enter a group name');
      el.groupName?.focus();
      return;
    }

    if (el.groupCreate) {
      el.groupCreate.disabled = true;
    }

    try {
      const data = await request(API.createGroup(), {
        method:'POST',
        body:JSON.stringify({
          name,
          member_ids:memberIds
        })
      });

      const room = data?.room || data?.group || data?.data || data;

      if (!room || !roomId(room)) {
        throw new Error('Server did not return the new group');
      }

      state.rooms.unshift(room);

      closeGroupModal();

      if (el.groupName) {
        el.groupName.value = '';
      }

      renderRooms();

      await selectRoom(roomId(room));

      toast('Group created');

    } catch (error) {
      toast(`Could not create group: ${error.message}`);

    } finally {
      if (el.groupCreate) {
        el.groupCreate.disabled = false;
      }
    }
  }

  function ensureNotificationButton() {
    if (document.getElementById('chatNotifyBtn')) return;

    const host = el.searchToggle?.parentElement || el.newGroup?.parentElement;
    if (!host) return;

    const button = document.createElement('button');

    button.type = 'button';
    button.id = 'chatNotifyBtn';
    button.className = el.searchToggle?.className || el.newGroup?.className || '';
    button.textContent = 'Enable notifications';
    button.title = 'Enable desktop message notifications';
    button.setAttribute('aria-label', 'Enable desktop message notifications');

    button.addEventListener('click', enableNotifications);

    host.appendChild(button);
  }

  function bindEvents() {
    el.roomList?.addEventListener('click', event => {
      const row = event.target.closest('[data-room-id]');
      if (row) selectRoom(row.dataset.roomId);
    });

    el.send?.addEventListener('click', sendMessage);

    el.input?.addEventListener('input', () => {
      resizeInput();
      sendTyping();
      scheduleTypingStop();
    });

    el.input?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    el.back?.addEventListener('click', () => {
      clearInterval(state.pollMessagesTimer);
      openRooms();
    });

    el.newPill?.addEventListener('click', () => {
      if (el.messages) {
        el.messages.scrollTo({
          top:el.messages.scrollHeight,
          behavior:'smooth'
        });
      }

      state.unreadAtBottom = 0;
      hideNewMessages();

      if (state.activeRoom) {
        markRead(roomId(state.activeRoom)).catch(() => {});
      }
    });

    el.messages?.addEventListener('click', event => {
      const reactTrigger = event.target.closest('.chat-react-trigger');

      if (reactTrigger) {
        const row = reactTrigger.closest('[data-message-id]');

        if (row) {
          showReactionPicker(reactTrigger, row.dataset.messageId);
        }

        return;
      }

      const reaction = event.target.closest('.chat-reaction');

      if (reaction) {
        reactToMessage(
          reaction.dataset.messageId,
          reaction.dataset.emoji
        );
      }
    });

    el.searchToggle?.addEventListener('click', openSearch);
    el.searchClose?.addEventListener('click', closeSearch);

    el.searchInput?.addEventListener('input', () => {
      clearTimeout(state.searchTimer);

      state.searchTimer = setTimeout(
        () => runSearch(el.searchInput.value),
        280
      );
    });

    el.searchResults?.addEventListener('click', event => {
      const row = event.target.closest('[data-user-id]');

      if (row) {
        openDirectChat(
          row.dataset.userId,
          row.dataset.userName
        );
      }
    });

    el.newGroup?.addEventListener('click', openGroupModal);
    el.startNew?.addEventListener('click', openSearch);
    el.groupClose?.addEventListener('click', closeGroupModal);
    el.groupCreate?.addEventListener('click', createGroup);

    el.groupModal?.addEventListener('click', event => {
      if (event.target === el.groupModal) {
        closeGroupModal();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.activeRoom) {
        loadMessages(
          roomId(state.activeRoom),
          { appendOnly:true }
        ).catch(() => {});

        markRead(roomId(state.activeRoom)).catch(() => {});
      }
    });

    window.addEventListener('beforeunload', () => {
      state.destroyed = true;

      clearInterval(state.pollMessagesTimer);
      clearInterval(state.pollRoomsTimer);
      clearInterval(state.presenceTimer);
      clearTimeout(state.typingTimer);
    });
  }

  async function init() {
    addStyles();
    ensureNotificationButton();
    bindEvents();

    // Allows an existing button to request browser notifications.
    window.enableChatNotifications = enableNotifications;

    try {
      await loadRooms();

    } catch (error) {
      if (el.roomList) {
        el.roomList.innerHTML =
          `<div class="chat-empty">Could not load conversations.<br>${escapeHTML(error.message)}</div>`;
      }

      console.error('[LCU Chat] Room loading failed:', error);
    }

    state.pollRoomsTimer = setInterval(
      () => loadRooms().catch(() => {}),
      POLL_ROOMS_MS
    );

    state.presenceTimer = setInterval(() => {
      pollPresence();
      pollNotifications();
    }, PRESENCE_MS);

    pollPresence();
    pollNotifications();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }

})();