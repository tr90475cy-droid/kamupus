(() => {
  'use strict';

  // ── Element refs ──
  const postsEl         = document.getElementById('myPosts');
  const videosEl        = document.getElementById('myVideos');
  const followersList   = document.getElementById('followersList');
  const followingList   = document.getElementById('followingList');
  const followersCount  = document.getElementById('followersCount');
  const followingCount  = document.getElementById('followingCount');
  const videosCount     = document.getElementById('videosCount');

  const tabsEl          = document.getElementById('profileTabs');
  const panels = {
    posts:     document.getElementById('panelPosts'),
    videos:    document.getElementById('panelVideos'),
    followers: document.getElementById('panelFollowers'),
    following: document.getElementById('panelFollowing'),
  };
  const loadedTabs = { posts: false, videos: false, followers: false, following: false };

  // Edit modal
  const editBtn   = document.getElementById('editProfileBtn');
  const editModal = document.getElementById('editProfileModal');
  const editClose = document.getElementById('editProfileClose');
  const editSave  = document.getElementById('editProfileSave');
  const editName  = document.getElementById('editName');
  const editBio   = document.getElementById('editBio');
  const bioEl     = document.getElementById('profileBio');

  // Avatar
  const avatarFile   = document.getElementById('avatarFile');
  const avatarRemove = document.getElementById('avatarRemove');

  // Video preview modal
  const previewModal  = document.getElementById('videoPreviewModal');
  const previewPlayer = document.getElementById('videoPreviewPlayer');
  const previewMeta   = document.getElementById('videoPreviewMeta');
  const previewClose  = document.getElementById('videoPreviewClose');

  // Likers modal
  const likersModal  = document.getElementById('likersModal');
  const likersList   = document.getElementById('likersList');
  const likersClose  = document.getElementById('likersClose');

  // Notifications
  const notifBell  = document.getElementById('notifBell');
  const notifBadge = document.getElementById('notifBadge');
  const notifModal = document.getElementById('notifModal');
  const notifList  = document.getElementById('notifList');
  const notifClose = document.getElementById('notifClose');

  // ── Helpers ──
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function fmtCount(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  function agoLabel(t) {
    if (!t) return 'now';
    return t === 'now' ? 'now' : t + ' ago';
  }

  // FIX #1: attach error body to the thrown error so callers can show real messages
  async function fetchJson(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      const err = new Error(body.error || 'HTTP ' + r.status);
      err.status = r.status;
      err.body = body;
      throw err;
    }
    return r.json();
  }

  // ── POSTS ──
  async function loadPosts() {
    if (!postsEl) return;
    postsEl.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const posts = await fetchJson('/api/me/posts');
      if (!Array.isArray(posts) || !posts.length) {
        postsEl.innerHTML = '<div class="empty">You haven\'t posted yet.</div>';
        return;
      }
      postsEl.innerHTML = posts.map(postHtml).join('');
      loadedTabs.posts = true;
    } catch {
      postsEl.innerHTML = '<div class="empty">Could not load posts.</div>';
    }
  }

  function postHtml(p) {
    const avatar = p.anonymous
      ? `<div class="avatar avatar-anon">🥷</div>`
      : (p.avatar
          ? `<img class="avatar" src="${esc(p.avatar)}" alt="">`
          : `<div class="avatar avatar-blank"></div>`);

    const verifiedBadge = p.anonymous
      ? '<span class="badge-anon">ANON</span>'
      : (p.verified ? '<span class="verified">✓</span>' : '');

    return `
      <article class="post ${p.anonymous ? 'anon' : ''}">
        <div class="post-head">
          ${avatar}
          <div class="post-meta">
            <div class="post-name-row">
              <span class="post-name">${esc(p.author)}</span>
              ${verifiedBadge}
            </div>
            <div class="post-time">${esc(agoLabel(p.time))}</div>
          </div>
        </div>
        <p class="post-body">${esc(p.content)}</p>
        ${p.image ? `<img class="post-img" src="${esc(p.image)}" alt="">` : ''}
        <div class="post-actions">
          <div class="act">❤️ <span>${fmtCount(p.likes)}</span></div>
          <div class="act">💬 <span>${fmtCount(p.comments)}</span></div>
        </div>
      </article>
    `;
  }

  // ── VIDEOS GRID ──
  async function loadVideos() {
    if (!videosEl) return;
    videosEl.innerHTML = '<div class="empty" style="grid-column:1/-1;">Loading…</div>';
    try {
      const videos = await fetchJson('/api/me/videos');
      if (!Array.isArray(videos)) throw new Error('bad payload');
      if (videosCount) videosCount.textContent = videos.length;
      if (!videos.length) {
        videosEl.innerHTML = '<div class="empty" style="grid-column:1/-1;">You haven\'t uploaded any videos yet. Tap the + in the video feed to post your first one.</div>';
        loadedTabs.videos = true;
        return;
      }
      videosEl.innerHTML = videos.map(videoThumbHtml).join('');
      loadedTabs.videos = true;
    } catch {
      videosEl.innerHTML = '<div class="empty" style="grid-column:1/-1;">Could not load videos.</div>';
    }
  }

  function videoThumbHtml(v) {
    const thumb = v.thumbnail_url
      ? `<img src="${esc(v.thumbnail_url)}" alt="" loading="lazy">`
      : `<div style="width:100%;height:100%;background:#1a1a1a;"></div>`;

    return `
      <div class="video-thumb" data-vid="${v.id}" data-vurl="${esc(v.video_url)}" data-vcaption="${esc(v.caption || '')}">
        ${thumb}
        <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <span class="thumb-views">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          ${fmtCount(v.views)}
        </span>
        <span class="thumb-likes" data-likers="${v.id}" title="See who liked">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"/></svg>
          ${fmtCount(v.likes)}
        </span>
      </div>
    `;
  }

  if (videosEl) {
    videosEl.addEventListener('click', (e) => {
      const likersBtn = e.target.closest('[data-likers]');
      if (likersBtn) {
        e.stopPropagation();
        openLikers(Number(likersBtn.dataset.likers));
        return;
      }
      const thumb = e.target.closest('.video-thumb');
      if (!thumb || !previewModal || !previewPlayer) return;
      previewPlayer.src = thumb.dataset.vurl;
      if (previewMeta) previewMeta.textContent = thumb.dataset.vcaption || '';
      previewModal.classList.add('open');

      requestAnimationFrame(() => {
        const p = previewPlayer.play();
        if (p && p.catch) p.catch(() => {});
      });
    });
  }

  if (previewClose) previewClose.addEventListener('click', closePreview);
  if (previewModal) previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) closePreview();
  });
  function closePreview() {
    if (!previewPlayer || !previewModal) return;
    previewPlayer.pause();
    previewPlayer.removeAttribute('src');
    previewPlayer.load();
    previewModal.classList.remove('open');
  }

  // ── LIKERS ──
  async function openLikers(vid) {
    if (!likersModal || !likersList) return;
    likersList.innerHTML = '<div class="empty" style="padding:32px;text-align:center;color:#9ca3af;">Loading…</div>';
    likersModal.classList.add('open');
    try {
      const users = await fetchJson('/api/videos/' + vid + '/likers');
      if (!Array.isArray(users) || !users.length) {
        likersList.innerHTML = '<div class="empty" style="padding:32px;text-align:center;color:#9ca3af;">No likes yet.</div>';
        return;
      }
      likersList.innerHTML = users.map(u => `
        <a class="liker-row" href="/user/${u.id}">
          ${u.avatar
            ? `<img class="liker-avatar" src="${esc(u.avatar)}" alt="">`
            : `<div class="liker-avatar"></div>`}
          <div class="liker-info">
            <div class="liker-name">${esc(u.name)}</div>
            <div class="liker-time">${esc(agoLabel(u.time))}</div>
          </div>
        </a>
      `).join('');
    } catch {
      likersList.innerHTML = '<div class="empty" style="padding:32px;text-align:center;color:#9ca3af;">Could not load.</div>';
    }
  }

  if (likersClose) likersClose.addEventListener('click', () => likersModal && likersModal.classList.remove('open'));
  if (likersModal) likersModal.addEventListener('click', (e) => {
    if (e.target === likersModal) likersModal.classList.remove('open');
  });

  // ── FOLLOWERS / FOLLOWING ──
  async function loadFollowers() {
    if (!followersList) return;
    followersList.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const users = await fetchJson('/api/me/followers');
      if (!Array.isArray(users)) throw new Error('bad payload');
      if (followersCount) followersCount.textContent = users.length;
      followersList.innerHTML = users.length
        ? users.map(u => userCard(u)).join('')
        : '<div class="empty">No followers yet. Post often to get noticed!</div>';
      loadedTabs.followers = true;
    } catch {
      followersList.innerHTML = '<div class="empty">Could not load followers.</div>';
    }
  }

  async function loadFollowing() {
    if (!followingList) return;
    followingList.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const users = await fetchJson('/api/me/following');
      if (!Array.isArray(users)) throw new Error('bad payload');
      if (followingCount) followingCount.textContent = users.length;
      followingList.innerHTML = users.length
        ? users.map(u => userCard(u)).join('')
        : '<div class="empty">You aren\'t following anyone yet. Tap "Find friends".</div>';
      loadedTabs.following = true;
    } catch {
      followingList.innerHTML = '<div class="empty">Could not load following.</div>';
    }
  }

  function userCard(u) {
    const avatarHtml = u.avatar
      ? `<img class="connect-avatar" src="${esc(u.avatar)}" alt="">`
      : `<div class="connect-avatar connect-avatar-blank"></div>`;
    const meta = [u.level ? u.level + 'L' : '', u.department].filter(Boolean).join(' · ');
    return `
      <div class="connect-card">
        ${avatarHtml}
        <div class="connect-body">
          <div class="connect-name">${esc(u.name)}</div>
          ${meta ? `<div class="connect-meta">${esc(meta)}</div>` : ''}
          ${u.bio ? `<div class="connect-bio">${esc(u.bio)}</div>` : ''}
        </div>
        <div class="connect-action">
          <button class="btn btn-ghost btn-sm" data-action="message" data-uid="${u.id}">Message</button>
        </div>
      </div>
    `;
  }

  // FIX #1 + #3: handle both {id} and {room:{id}} shapes; surface 403 errors
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="message"]');
    if (!btn) return;
    const uid = btn.dataset.uid;
    btn.disabled = true;
    try {
      const data = await fetchJson('/api/chat/dm/' + uid, { method: 'POST' });
      const room = data?.room || data;
      if (room && room.id) {
        window.location.href = '/chat?room=' + room.id;
      } else {
        window.location.href = '/chat?dm=' + uid;
      }
    } catch (err) {
      // Real backend message (e.g. "Cannot start a conversation with this user.")
      alert(err.body?.error || err.message || 'Could not start chat.');
    } finally {
      btn.disabled = false;
    }
  });

  // ── TABS ──
  if (tabsEl) {
    tabsEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      tabsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const tab = chip.dataset.tab;
      Object.entries(panels).forEach(([k, el]) => {
        if (!el) return;
        el.classList.toggle('hidden', k !== tab);
      });

      if (tab === 'posts')         { if (!loadedTabs.posts)     loadPosts(); }
      else if (tab === 'videos')   { if (!loadedTabs.videos)    loadVideos(); }
      else if (tab === 'followers'){ if (!loadedTabs.followers) loadFollowers(); }
      else if (tab === 'following'){ if (!loadedTabs.following) loadFollowing(); }
    });
  }

  // ── EDIT PROFILE ──
  if (editBtn && editModal) {
    editBtn.addEventListener('click', () => {
      editModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  }
  function closeEdit() {
    if (!editModal) return;
    editModal.classList.remove('open');
    document.body.style.overflow = '';
  }
  if (editClose) editClose.addEventListener('click', closeEdit);
  if (editModal) editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEdit(); });

  if (editSave) {
    editSave.addEventListener('click', async () => {
      editSave.disabled = true;
      try {
        const data = await fetchJson('/api/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full_name: editName.value, bio: editBio.value })
        });
        if (data && data.ok) {
          if (bioEl) bioEl.textContent = data.bio || 'No bio yet.';
          closeEdit();
        }
      } catch (err) {
        alert(err.body?.error || 'Could not save profile. Please try again.');
      } finally { editSave.disabled = false; }
    });
  }

  // ── AVATAR ──
  if (avatarFile) {
    avatarFile.addEventListener('change', async () => {
      const file = avatarFile.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return; }
      const fd = new FormData();
      fd.append('picture', file);
      try {
        const r = await fetch('/api/me/picture', { method: 'POST', body: fd });
        if (r.ok) window.location.reload();
        else {
          const err = await r.json().catch(() => ({}));
          alert(err.error || 'Could not upload picture.');
        }
      } catch { alert('Upload failed. Please try again.'); }
    });
  }

  if (avatarRemove) {
    avatarRemove.addEventListener('click', async () => {
      if (!confirm('Remove your profile picture?')) return;
      const r = await fetch('/api/me/picture', { method: 'DELETE' });
      if (r.ok) window.location.reload();
    });
  }

  // ── NOTIFICATIONS ──
  async function refreshNotifBadge() {
    if (!notifBadge) return;
    try {
      const d = await fetchJson('/api/notifications/unread-count');
      if (d && d.count > 0) {
        notifBadge.textContent = d.count > 99 ? '99+' : d.count;
        notifBadge.classList.add('on');
      } else {
        notifBadge.classList.remove('on');
      }
    } catch {}
  }

  async function openNotifs() {
    if (!notifModal || !notifList) return;
    notifList.innerHTML = '<div class="empty" style="padding:32px;text-align:center;color:#9ca3af;">Loading…</div>';
    notifModal.classList.add('open');
    try {
      const items = await fetchJson('/api/notifications');
      if (!Array.isArray(items) || !items.length) {
        notifList.innerHTML = '<div class="empty" style="padding:32px;text-align:center;color:#9ca3af;">No notifications yet.</div>';
      } else {
        notifList.innerHTML = items.map(notifHtml).join('');
      }
      fetch('/api/notifications/read', { method: 'POST' })
        .then(() => refreshNotifBadge())
        .catch(() => {});
    } catch {
      notifList.innerHTML = '<div class="empty" style="padding:32px;text-align:center;color:#9ca3af;">Could not load.</div>';
    }
  }

  function notifHtml(n) {
    const icon = {
      video_like: '❤️',
      video_comment: '💬',
      video_repost: '🔁',
      post_like: '❤️',
      follow: '👤',
    }[n.type] || '🔔';

    const verb = {
      video_like: 'liked your video',
      video_comment: 'commented on your video',
      video_repost: 'reposted your video',
      post_like: 'liked your post',
      follow: 'started following you',
    }[n.type] || 'interacted with you';

    return `
      <div class="notif-item ${n.read ? '' : 'unread'}">
        ${n.actor_avatar
          ? `<img class="notif-avatar" src="${esc(n.actor_avatar)}" alt="">`
          : `<div class="notif-avatar"></div>`}
        <div class="notif-body">
          <div class="notif-text">
            <strong>${esc(n.actor)}</strong> ${verb}
            ${n.preview ? ` <span style="color:#6b7280;">"${esc(n.preview.slice(0, 50))}"</span>` : ''}
          </div>
          <div class="notif-time">${esc(agoLabel(n.time))} · ${icon}</div>
        </div>
      </div>
    `;
  }

  if (notifBell)  notifBell.addEventListener('click', openNotifs);
  if (notifClose) notifClose.addEventListener('click', () => notifModal && notifModal.classList.remove('open'));
  if (notifModal) notifModal.addEventListener('click', (e) => {
    if (e.target === notifModal) notifModal.classList.remove('open');
  });

  // ── INIT ──
  // FIX #2: only the default visible tab loads eagerly.
  // Videos/followers/following load when their chip is clicked.
  loadPosts();
  refreshNotifBadge();
  setInterval(refreshNotifBadge, 30000);
})();