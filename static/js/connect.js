(() => {
  'use strict';

  console.log('[CONNECT] script loaded');

  const tabsEl          = document.getElementById('connectTabs');
  const reqCountBadge   = document.getElementById('reqCountBadge');

  const discoverList    = document.getElementById('discoverList');
  const incomingList    = document.getElementById('incomingList');
  const outgoingList    = document.getElementById('outgoingList');
  const connectionsList = document.getElementById('connectionsList');

  const panels = {
    discover:    document.getElementById('panelDiscover'),
    requests:    document.getElementById('panelRequests'),
    connections: document.getElementById('panelConnections'),
  };

  console.log('[CONNECT] elements:', {
    tabs: !!tabsEl,
    discover: !!panels.discover,
    requests: !!panels.requests,
    connections: !!panels.connections,
  });

  // ═══════════════════════════════════════
  // LOADERS
  // ═══════════════════════════════════════
  async function loadDiscover() {
    if (!discoverList) return;
    discoverList.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch('/api/connect/suggestions');
      const items = await r.json();
      if (!items.length) {
        discoverList.innerHTML = '<div class="empty">No suggestions yet. Check back when more students join.</div>';
        return;
      }
      discoverList.innerHTML = items.map(u => cardHtml(u, 'discover')).join('');
    } catch (e) {
      console.error('[CONNECT] discover error:', e);
      discoverList.innerHTML = '<div class="empty">Could not load suggestions.</div>';
    }
  }

  async function loadRequests() {
    if (!incomingList || !outgoingList) return;
    incomingList.innerHTML = '<div class="empty">Loading…</div>';
    outgoingList.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch('/api/connect/requests');
      const data = await r.json();
      console.log('[CONNECT] requests:', data);

      if (reqCountBadge) {
        if (data.incoming && data.incoming.length) {
          reqCountBadge.textContent = data.incoming.length;
          reqCountBadge.classList.remove('hidden');
        } else {
          reqCountBadge.classList.add('hidden');
        }
      }

      incomingList.innerHTML = (data.incoming && data.incoming.length)
        ? data.incoming.map(u => cardHtml(u, 'incoming')).join('')
        : '<div class="empty">No incoming requests.</div>';

      outgoingList.innerHTML = (data.outgoing && data.outgoing.length)
        ? data.outgoing.map(u => cardHtml(u, 'outgoing')).join('')
        : '<div class="empty">You haven\'t sent any requests.</div>';
    } catch (e) {
      console.error('[CONNECT] requests error:', e);
      incomingList.innerHTML = '<div class="empty">Could not load requests.</div>';
      outgoingList.innerHTML = '';
    }
  }

  async function loadConnections() {
    if (!connectionsList) return;
    connectionsList.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch('/api/connect/mine');
      const items = await r.json();
      console.log('[CONNECT] connections:', items);
      if (!items.length) {
        connectionsList.innerHTML = '<div class="empty">You haven\'t connected with anyone yet.<br>Go to Discover to find people.</div>';
        return;
      }
      connectionsList.innerHTML = items.map(u => cardHtml(u, 'connected')).join('');
    } catch (e) {
      console.error('[CONNECT] connections error:', e);
      connectionsList.innerHTML = '<div class="empty">Could not load connections.</div>';
    }
  }

  // ═══════════════════════════════════════
  // CARD
  // ═══════════════════════════════════════
  function cardHtml(u, mode) {
    const avatarHtml = u.avatar
      ? `<img class="connect-avatar" src="${esc(u.avatar)}" alt="">`
      : `<div class="connect-avatar connect-avatar-blank"></div>`;

    const meta = [u.level ? u.level + 'L' : '', u.department].filter(Boolean).join(' · ');

    let action = '';
    if (mode === 'discover') {
      action = `<button class="btn btn-primary btn-sm" data-action="connect" data-uid="${u.id}">Add Up</button>`;
    } else if (mode === 'incoming') {
      action = `
        <div class="connect-actions">
          <button class="btn btn-success btn-sm" data-action="accept" data-cid="${u.connection_id}">Accept</button>
          <button class="btn btn-ghost btn-sm" data-action="decline" data-cid="${u.connection_id}">Decline</button>
        </div>`;
    } else if (mode === 'outgoing') {
      action = `<span class="tag tag-pending">Requested</span>`;
    } else if (mode === 'connected') {
      action = `<button class="btn btn-ghost btn-sm" data-action="message" data-uid="${u.id}">Message</button>`;
    }

    return `
      <div class="connect-card">
        ${avatarHtml}
        <div class="connect-body">
          <div class="connect-name">${esc(u.name)}</div>
          ${meta ? `<div class="connect-meta">${esc(meta)}</div>` : ''}
          ${u.bio ? `<div class="connect-bio">${esc(u.bio)}</div>` : ''}
        </div>
        <div class="connect-action">${action}</div>
      </div>
    `;
  }

  // ═══════════════════════════════════════
  // ACTION HANDLER
  // ═══════════════════════════════════════
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    console.log('[CONNECT] action:', action);

    if (action === 'connect') {
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        await fetch('/api/connect/send/' + btn.dataset.uid, { method: 'POST' });
        btn.textContent = 'Requested';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-ghost');
      } catch {
        btn.textContent = 'Try again';
        btn.disabled = false;
      }
      return;
    }

    if (action === 'accept') {
      btn.disabled = true;
      await fetch('/api/connect/accept/' + btn.dataset.cid, { method: 'POST' });
      await loadRequests();
      await loadConnections();
      return;
    }

    if (action === 'decline') {
      btn.disabled = true;
      await fetch('/api/connect/decline/' + btn.dataset.cid, { method: 'POST' });
      await loadRequests();
      return;
    }

    if (action === 'message') {
      window.location.href = '/chat?dm=' + btn.dataset.uid;
      return;
    }
  });

  // ═══════════════════════════════════════
  // TABS
  // ═══════════════════════════════════════
  if (tabsEl) {
    tabsEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;

      console.log('[CONNECT] tab clicked:', chip.dataset.tab);

      tabsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const tab = chip.dataset.tab;
      Object.entries(panels).forEach(([key, el]) => {
        if (!el) return;
        el.classList.toggle('hidden', key !== tab);
      });

      if (tab === 'discover') loadDiscover();
      else if (tab === 'requests') loadRequests();
      else if (tab === 'connections') loadConnections();
    });
  } else {
    console.error('[CONNECT] tabsEl not found!');
  }

  // ═══════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // ═══════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════
  loadDiscover();

  // Pre-fetch count
  fetch('/api/connect/requests').then(r => r.json()).then(data => {
    if (reqCountBadge && data.incoming && data.incoming.length) {
      reqCountBadge.textContent = data.incoming.length;
      reqCountBadge.classList.remove('hidden');
    }
  }).catch(() => {});

})();

/* ═══════════════════════════════════════════════════════
   PROFILE PREVIEW MODAL
   ═══════════════════════════════════════════════════════ */
(function () {
  const modal  = document.getElementById('previewModal');
  const close  = document.getElementById('previewClose');
  const body   = document.getElementById('previewBody');

  if (!modal || !body) return;

  let currentUid = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => (
      {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]
    ));
  }

  async function openPreview(uid) {
    currentUid = uid;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    body.innerHTML = '<div class="empty">Loading…</div>';

    try {
      const res = await fetch(`/api/users/${uid}/preview`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error();
      renderPreview(await res.json());
    } catch (e) {
      body.innerHTML = '<div class="empty">Could not load profile.</div>';
    }
  }

  function renderPreview(p) {
    const avatar = p.avatar
      ? `<img class="preview-avatar" src="${esc(p.avatar)}" alt="">`
      : `<div class="preview-avatar">${esc((p.name || '?')[0].toUpperCase())}</div>`;

    const meta = [p.level ? p.level + 'L' : '', p.department, p.faculty]
                 .filter(Boolean).join(' · ');

    let actions = '';
    switch (p.connection_status) {
      case 'connected':
        actions = `
          <button class="btn btn-ghost" disabled>✓ Connected</button>
          <button class="btn btn-primary" data-action="message">Message</button>`;
        break;
      case 'outgoing':
        actions = `<button class="btn btn-ghost" disabled>Request sent</button>`;
        break;
      case 'incoming':
        actions = `
          <button class="btn btn-ghost" data-action="decline" data-cid="${p.connection_id}">Decline</button>
          <button class="btn btn-primary" data-action="accept" data-cid="${p.connection_id}">Accept</button>`;
        break;
      default:
        actions = `<button class="btn btn-primary" data-action="send" data-uid="${p.id}">Add Up</button>`;
    }

    const postsHtml = p.recent_posts.length
      ? p.recent_posts.map(r => `
          <div class="preview-post">
            <p>${esc(r.content)}</p>
            <span class="preview-post-time">${esc(r.time)} ago</span>
          </div>`).join('')
      : '<div class="empty" style="padding:10px 0;">No public posts yet.</div>';

    body.innerHTML = `
      <div class="preview-head">
        ${avatar}
        <div class="preview-info">
          <div class="preview-name">${esc(p.name)}</div>
          ${meta ? `<div class="preview-meta">${esc(meta)}</div>` : ''}
          ${p.bio ? `<p class="preview-bio">${esc(p.bio)}</p>` : ''}
        </div>
      </div>

      <div class="preview-stats">
        <div><strong>${p.post_count}</strong><span>Posts</span></div>
        <div><strong>${p.follower_count}</strong><span>Followers</span></div>
        <div><strong>${p.following_count}</strong><span>Following</span></div>
      </div>

      <div class="preview-actions">${actions}</div>

      <div class="preview-section-title">Recent posts</div>
      <div class="preview-posts">${postsHtml}</div>
    `;
  }

  function closePreview() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
    currentUid = null;
  }

  /* Modal action buttons */
  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    btn.disabled = true;

    try {
      if (action === 'send') {
        const r = await fetch(`/api/connect/send/${btn.dataset.uid}`,
                              { method: 'POST', credentials: 'same-origin' });
        if (!r.ok) throw new Error();
        btn.textContent = 'Request sent';
        btn.classList.replace('btn-primary', 'btn-ghost');
        if (typeof window.loadRequests === 'function') window.loadRequests();

      } else if (action === 'accept') {
        const r = await fetch(`/api/connect/accept/${btn.dataset.cid}`,
                              { method: 'POST', credentials: 'same-origin' });
        if (!r.ok) throw new Error();
        btn.textContent = '✓ Connected';
        btn.classList.replace('btn-primary', 'btn-ghost');
        btn.disabled = true;
        if (typeof window.loadRequests === 'function') window.loadRequests();
        if (typeof window.loadConnections === 'function') window.loadConnections();

      } else if (action === 'decline') {
        const r = await fetch(`/api/connect/decline/${btn.dataset.cid}`,
                              { method: 'POST', credentials: 'same-origin' });
        if (!r.ok) throw new Error();
        closePreview();
        if (typeof window.loadRequests === 'function') window.loadRequests();

      } else if (action === 'message') {
        try {
          await fetch(`/api/chat/dm/${currentUid}`,
                      { method: 'POST', credentials: 'same-origin' });
        } catch (_) {}
        window.location.href = `/chat?dm=${currentUid}`;
      }
    } catch (err) {
      alert('Action failed — please try again');
      btn.disabled = false;
    }
  });

  /* Click a card in any connect-list → open preview */
  document.querySelectorAll('.connect-list').forEach(list => {
    list.addEventListener('click', (e) => {
      // Ignore clicks on real buttons / links (let them behave normally)
      if (e.target.closest('button, a')) return;
      const card = e.target.closest('[data-uid]');
      if (!card) return;
      openPreview(card.dataset.uid);
    });
  });

  close.addEventListener('click', closePreview);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePreview();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closePreview();
  });

  // Expose for external use
  window.openPreview = openPreview;
})();