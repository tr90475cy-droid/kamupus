(() => {
'use strict';
const L = '\x3c';
const G = '\x3e';

// ─── DOM ───
const feedEl           = document.getElementById('feed');
const chipsEl          = document.getElementById('chips');
const fabEl            = document.getElementById('fab');
const modalBackEl      = document.getElementById('modalBack');
const modalCloseEl     = document.getElementById('modalClose');
const postBtnEl        = document.getElementById('postBtn');
const composerEl       = document.getElementById('composer');
const anonToggleEl     = document.getElementById('anonToggle');
const anonLabelEl      = document.getElementById('anonLabel');
const anonShortcut     = document.getElementById('anonShortcut');
const composerFile     = document.getElementById('composerFile');
const toolPhoto        = document.getElementById('toolPhoto');
const composerPreview  = document.getElementById('composerPreview');
const previewImg       = document.getElementById('previewImg');
const previewRemove    = document.getElementById('previewRemove');
const commentsModal    = document.getElementById('commentsModal');
const commentsClose    = document.getElementById('commentsClose');
const commentsList     = document.getElementById('commentsList');
const commentInput     = document.getElementById('commentInput');
const commentAnon      = document.getElementById('commentAnon');
const commentSend      = document.getElementById('commentSend');
const searchBtn        = document.getElementById('searchBtn');
const searchOverlay    = document.getElementById('searchOverlay');
const searchInput      = document.getElementById('searchInput');
const searchClose      = document.getElementById('searchClose');
const searchResults    = document.getElementById('searchResults');

// ─── State ───
let currentFilter   = 'all';
let isAnon          = false;
let isPosting       = false;
let currentPostId   = null;
let pendingFile     = null;
let searchDebounce  = null;

// ═══════════════════════════════════════════════════════
// UTIL
// ═══════════════════════════════════════════════════════
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
  });
}
function escAttr(s) { return escHtml(s); }

function fmtCount(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

// ═══════════════════════════════════════════════════════
// FEED LOAD
// ═══════════════════════════════════════════════════════
async function loadFeed(filter) {
  if (!feedEl) return;
  if (!filter) filter = 'all';
  currentFilter = filter;
  feedEl.innerHTML = L + 'div class="empty"' + G + 'Loading feed…' + L + '/div' + G;
  try {
    const res = await fetch('/api/feed?filter=' + encodeURIComponent(filter), {
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    renderFeed(await res.json());
  } catch (err) {
    console.error('Feed load failed:', err);
    if (feedEl) feedEl.innerHTML = L + 'div class="empty"' + G + 'Could not load feed.' + L + '/div' + G;
  }
}

function renderFeed(posts) {
  if (!feedEl) return;
  if (!posts || !posts.length) {
    feedEl.innerHTML = L + 'div class="empty"' + G + 'No posts here yet. Be the first!' + L + '/div' + G;
    return;
  }
  feedEl.innerHTML = posts.map(postHtml).join('');
  trackPostViews();
}

// ═══════════════════════════════════════════════════════
// POST HTML
// ═══════════════════════════════════════════════════════
function postHtml(p) {
  // Avatar
  let avatar;
  if (p.anonymous) {
    avatar = L + 'div class="avatar avatar-anon"' + G + '🥷' + L + '/div' + G;
  } else if (p.avatar) {
    avatar = L + 'img class="avatar" src="' + escAttr(p.avatar) + '" alt=""' + G;
  } else {
    avatar = L + 'div class="avatar avatar-blank"' + G + L + '/div' + G;
  }
  const avatarLink = (!p.anonymous && p.user_id)
    ? L + 'a href="/user/' + p.user_id + '" class="avatar-link"' + G + avatar + L + '/a' + G
    : avatar;

  // Badge
  let badge = '';
  if (p.anonymous) {
    badge = L + 'span class="badge-anon"' + G + 'ANON' + L + '/span' + G;
  } else if (p.verified) {
    badge = L + 'span class="verified"' + G + '✓' + L + '/span' + G;
  }

  // Follow button
  let followBtn = '';
  if (!p.anonymous && p.user_id && !p.mine) {
    followBtn = L + 'button class="follow-inline" data-action="follow" data-uid="' + p.user_id + '" data-following="false"' + G + 'Follow' + L + '/button' + G;
  }

  // Author
  const authorHtml = p.anonymous
    ? L + 'span class="post-name"' + G + escHtml(p.author) + L + '/span' + G
    : L + 'a href="/user/' + p.user_id + '" class="post-name post-name-link"' + G + escHtml(p.author) + L + '/a' + G;

  // Image
  const image = p.image
    ? L + 'img class="post-img" src="' + escAttr(p.image) + '" alt="" loading="lazy"' + G
    : '';

  // State flags
  const heartFill   = p.liked    ? 'currentColor' : 'none';
  const repostFill  = p.reposted ? 'currentColor' : 'none';
  const likedClass  = p.liked    ? 'liked'    : '';
  const repostClass = p.reposted ? 'reposted' : '';

  // Delete button
  const deleteBtn = p.mine
    ? L + 'button class="act act-delete" data-action="delete" title="Delete post" style="color:#ef4444;"' + G
      + L + 'svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
      + L + 'path d="M3 6h18"/' + G
      + L + 'path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/' + G
      + L + 'path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/' + G
      + L + 'path d="M10 11v6"/' + G
      + L + 'path d="M14 11v6"/' + G
      + L + '/svg' + G
      + L + 'span' + G + 'Delete' + L + '/span' + G
      + L + '/button' + G
    : '';

  return L + 'article class="post ' + (p.anonymous ? 'anon' : '') + '" data-id="' + p.id + '"' + G
    + L + 'div class="post-head"' + G
      + avatarLink
      + L + 'div class="post-meta"' + G
        + L + 'div class="post-name-row"' + G
          + authorHtml + badge + followBtn
        + L + '/div' + G
        + L + 'div class="post-time"' + G
          + escHtml(p.time) + ' ago · Lead City University'
        + L + '/div' + G
      + L + '/div' + G
    + L + '/div' + G
    + L + 'p class="post-body"' + G + escHtml(p.content) + L + '/p' + G
    + image
    + L + 'div class="post-actions"' + G

      // Like
      + L + 'button class="act like ' + likedClass + '" data-action="like"' + G
        + L + 'svg viewBox="0 0 24 24" fill="' + heartFill + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
          + L + 'path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"/' + G
        + L + '/svg' + G
        + L + 'span class="like-count"' + G + fmtCount(p.likes) + L + '/span' + G
      + L + '/button' + G

      // Repost
      + L + 'button class="act repost ' + repostClass + '" data-action="repost" title="Repost"' + G
        + L + 'svg viewBox="0 0 24 24" fill="' + repostFill + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
          + L + 'path d="m17 2 4 4-4 4"/' + G
          + L + 'path d="M3 11v-1a4 4 0 0 1 4-4h14"/' + G
          + L + 'path d="m7 22-4-4 4-4"/' + G
          + L + 'path d="M21 13v1a4 4 0 0 1-4 4H3"/' + G
        + L + '/svg' + G
        + L + 'span class="repost-count"' + G + fmtCount(p.reposts) + L + '/span' + G
      + L + '/button' + G

      // Comment
      + L + 'button class="act" data-action="comment"' + G
        + L + 'svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
          + L + 'path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/' + G
        + L + '/svg' + G
        + L + 'span class="comment-count"' + G + fmtCount(p.comments) + L + '/span' + G
      + L + '/button' + G

      // Share
      + L + 'button class="act" data-action="share"' + G
        + L + 'svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
          + L + 'path d="m22 2-7 20-4-9-9-4Z"/' + G
          + L + 'path d="M22 2 11 13"/' + G
        + L + '/svg' + G
        + L + 'span' + G + 'Share' + L + '/span' + G
      + L + '/button' + G

      // Views (read-only)
      + L + 'span class="act view-count" title="Views"' + G
        + L + 'svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
          + L + 'path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/' + G
          + L + 'circle cx="12" cy="12" r="3"/' + G
        + L + '/svg' + G
        + L + 'span class="view-count-num"' + G + fmtCount(p.views) + L + '/span' + G
      + L + '/span' + G

      + L + 'div class="act-spacer"' + G + L + '/div' + G
      + deleteBtn
    + L + '/div' + G
  + L + '/article' + G;
}

// ═══════════════════════════════════════════════════════
// FEED CLICK DISPATCH
// ═══════════════════════════════════════════════════════
if (feedEl) {
  feedEl.addEventListener('click', async function(e) {
    // 1. Image lightbox
    const clickedImg = e.target.closest('.post-img');
    if (clickedImg) {
      const lightbox = document.getElementById('imageLightbox');
      const lightboxImg = document.getElementById('lightboxImg');
      if (lightbox && lightboxImg) {
        lightboxImg.src = clickedImg.src;
        lightbox.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
      return;
    }

    // 2. Post body expand (skip if selecting text)
    const postBody = e.target.closest('.post-body');
    if (postBody) {
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) return;
      postBody.classList.toggle('expanded');
      return;
    }

    // 3. Action buttons
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = btn.closest('.post');
    if (!card) return;
    const id = card.dataset.id;
    const action = btn.dataset.action;

    if (action === 'like')          await toggleLike(btn, id);
    else if (action === 'repost')   await toggleRepost(btn, id);
    else if (action === 'comment')  await openComments(id);
    else if (action === 'follow')   await toggleFollow(btn);
    else if (action === 'share')    await sharePost(id);
    else if (action === 'delete')   await deletePost(id, card);
  });
}

// ═══════════════════════════════════════════════════════
// LIKE
// ═══════════════════════════════════════════════════════
async function toggleLike(btn, postId) {
  const wasLiked = btn.classList.contains('liked');
  const countEl = btn.querySelector('.like-count');
  const current = parseInt(countEl.textContent.replace(/[KM]/g, ''), 10) || 0;

  btn.classList.toggle('liked', !wasLiked);
  btn.querySelector('svg').setAttribute('fill', !wasLiked ? 'currentColor' : 'none');
  countEl.textContent = fmtCount(wasLiked ? Math.max(0, current - 1) : current + 1);

  try {
    const res = await fetch('/api/posts/' + postId + '/like', {
      method: 'POST', credentials: 'same-origin',
    });
    const data = await res.json();
    btn.classList.toggle('liked', data.liked);
    btn.querySelector('svg').setAttribute('fill', data.liked ? 'currentColor' : 'none');
    countEl.textContent = fmtCount(data.likes);
  } catch (e) {
    btn.classList.toggle('liked', wasLiked);
    btn.querySelector('svg').setAttribute('fill', wasLiked ? 'currentColor' : 'none');
    countEl.textContent = fmtCount(current);
  }
}

// ═══════════════════════════════════════════════════════
// REPOST
// ═══════════════════════════════════════════════════════
async function toggleRepost(btn, postId) {
  const wasReposted = btn.classList.contains('reposted');
  const countEl = btn.querySelector('.repost-count');
  const current = parseInt(countEl.textContent.replace(/[KM]/g, ''), 10) || 0;

  // Optimistic
  btn.classList.toggle('reposted', !wasReposted);
  btn.querySelector('svg').setAttribute('fill', !wasReposted ? 'currentColor' : 'none');
  countEl.textContent = fmtCount(wasReposted ? Math.max(0, current - 1) : current + 1);

  try {
    const res = await fetch('/api/posts/' + postId + '/repost', {
      method: 'POST', credentials: 'same-origin',
    });
    const data = await res.json();
    btn.classList.toggle('reposted', data.reposted);
    btn.querySelector('svg').setAttribute('fill', data.reposted ? 'currentColor' : 'none');
    countEl.textContent = fmtCount(data.reposts);
  } catch (e) {
    btn.classList.toggle('reposted', wasReposted);
    btn.querySelector('svg').setAttribute('fill', wasReposted ? 'currentColor' : 'none');
    countEl.textContent = fmtCount(current);
  }
}

// ═══════════════════════════════════════════════════════
// FOLLOW
// ═══════════════════════════════════════════════════════
async function toggleFollow(btn) {
  const uid = btn.dataset.uid;
  const following = btn.dataset.following === 'true';
  const method = following ? 'DELETE' : 'POST';
  btn.disabled = true;
  try {
    const r = await fetch('/api/users/' + uid + '/follow', {
      method: method, credentials: 'same-origin',
    });
    if (!r.ok) throw new Error();
    const data = await r.json();
    btn.dataset.following = data.following ? 'true' : 'false';
    btn.textContent = data.following ? 'Following' : 'Follow';
    btn.classList.toggle('following', data.following);
  } catch (e) {
    console.error('Follow failed:', e);
  } finally {
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════
// SHARE
// ═══════════════════════════════════════════════════════
async function sharePost(postId) {
  const url = window.location.origin + '/home';
  if (navigator.share) {
    try {
      await navigator.share({ title: 'KAMUPUS', text: 'Check this out on KAMUPUS', url });
    } catch (_) {}
  } else if (navigator.clipboard) {
    try { await navigator.clipboard.writeText(url); alert('Link copied'); }
    catch (_) { alert('Could not copy link'); }
  } else {
    alert(url);
  }
}

// ═══════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════
async function deletePost(postId, card) {
  if (!confirm('Delete this post? This cannot be undone.')) return;
  const btn = card.querySelector('[data-action="delete"]');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  try {
    const res = await fetch('/api/posts/' + postId, {
      method: 'DELETE', credentials: 'same-origin',
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Server error ' + res.status);
    }
    card.style.transition = 'opacity 0.3s, transform 0.3s';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.95)';
    setTimeout(() => card.remove(), 320);
  } catch (err) {
    alert('Could not delete post: ' + err.message);
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
  }
}

// ═══════════════════════════════════════════════════════
// VIEWS — once per session per post
// ═══════════════════════════════════════════════════════
function trackPostViews() {
  if (!feedEl) return;
  let seen;
  try { seen = new Set(JSON.parse(sessionStorage.getItem('viewedPosts') || '[]')); }
  catch (_) { seen = new Set(); }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const card = entry.target;
      const pid = card.dataset.id;
      if (!pid || seen.has(pid)) return;

      seen.add(pid);
      fetch('/api/posts/' + pid + '/view', {
        method: 'POST', credentials: 'same-origin',
      }).catch(() => {});

      // bump local counter
      const numEl = card.querySelector('.view-count-num');
      if (numEl) {
        const cur = parseInt(numEl.textContent.replace(/[KM]/g, ''), 10) || 0;
        numEl.textContent = fmtCount(cur + 1);
      }
      observer.unobserve(card);
    });
  }, { threshold: 0.5 });

  feedEl.querySelectorAll('.post').forEach((el) => observer.observe(el));
  try { sessionStorage.setItem('viewedPosts', JSON.stringify([...seen])); } catch (_) {}
}

// ═══════════════════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════════════════
async function openComments(postId) {
  if (!commentsModal || !commentsList) return;
  currentPostId = postId;
  commentsModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  commentsList.innerHTML = L + 'div class="empty"' + G + 'Loading…' + L + '/div' + G;
  if (commentInput) commentInput.value = '';
  if (commentAnon) commentAnon.classList.remove('on');
  await loadComments(postId);
  setTimeout(() => { if (commentInput) commentInput.focus(); }, 250);
}

async function loadComments(postId) {
  if (!commentsList) return;
  try {
    const res = await fetch('/api/posts/' + postId + '/comments', {
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const comments = await res.json();
    if (!Array.isArray(comments) || !comments.length) {
      commentsList.innerHTML = L + 'div class="empty"' + G + 'No comments yet. Be the first!' + L + '/div' + G;
      return;
    }
    commentsList.innerHTML = comments.map((c) => {
      let cAvatar;
      if (c.anonymous) {
        cAvatar = L + 'div class="avatar avatar-anon comment-avatar"' + G + '🥷' + L + '/div' + G;
      } else if (c.avatar) {
        cAvatar = L + 'img class="avatar comment-avatar" src="' + escAttr(c.avatar) + '" alt=""' + G;
      } else {
        cAvatar = L + 'div class="avatar avatar-blank comment-avatar"' + G + L + '/div' + G;
      }
      return L + 'div class="comment-item ' + (c.anonymous ? 'anon' : '') + '"' + G
        + cAvatar
        + L + 'div class="comment-body"' + G
          + L + 'div class="comment-head"' + G
            + L + 'span class="comment-author"' + G + escHtml(c.author) + L + '/span' + G
            + L + 'span class="comment-time"' + G + escHtml(c.time) + L + '/span' + G
          + L + '/div' + G
          + L + 'p' + G + escHtml(c.content) + L + '/p' + G
        + L + '/div' + G
      + L + '/div' + G;
    }).join('');
    commentsList.scrollTop = commentsList.scrollHeight;
  } catch (e) {
    if (commentsList) commentsList.innerHTML = L + 'div class="empty"' + G + 'Could not load comments.' + L + '/div' + G;
  }
}

function closeComments() {
  if (!commentsModal) return;
  commentsModal.classList.remove('open');
  document.body.style.overflow = '';
  currentPostId = null;
}

if (commentsClose) commentsClose.addEventListener('click', closeComments);

if (commentAnon) {
  commentAnon.addEventListener('click', () => {
    commentAnon.classList.toggle('on');
  });
}

if (commentSend) {
  commentSend.addEventListener('click', async () => {
    if (!currentPostId || !commentInput) return;
    const content = commentInput.value.trim();
    if (!content) return;
    const anon = commentAnon && commentAnon.classList.contains('on');
    commentSend.disabled = true;
    try {
      const res = await fetch('/api/posts/' + currentPostId + '/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ content, anonymous: anon }),
      });
      if (!res.ok) throw new Error();
      commentInput.value = '';
      await loadComments(currentPostId);
      // bump comment count on the card
      const card = document.querySelector('.post[data-id="' + currentPostId + '"]');
      if (card) {
        const el = card.querySelector('.comment-count');
        if (el) {
          const n = parseInt(el.textContent.replace(/[KM]/g, ''), 10) || 0;
          el.textContent = fmtCount(n + 1);
        }
      }
    } catch (e) {
      alert('Could not post comment');
    } finally {
      commentSend.disabled = false;
    }
  });
}

if (commentInput) {
  commentInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commentSend && commentSend.click(); }
  });
}

// ═══════════════════════════════════════════════════════
// COMPOSER (open / close / submit)
// ═══════════════════════════════════════════════════════
function openComposer() {
  if (modalBackEl) modalBackEl.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeComposer() {
  if (modalBackEl) modalBackEl.classList.remove('open');
  document.body.style.overflow = '';
  if (composerEl) composerEl.value = '';
  isAnon = false;
  if (anonToggleEl) anonToggleEl.classList.remove('on');
  if (anonLabelEl) anonLabelEl.textContent = 'Post as Anonymous';
  pendingFile = null;
  if (composerPreview) composerPreview.style.display = 'none';
  if (previewImg) previewImg.src = '';
  if (composerFile) composerFile.value = '';
}

if (fabEl) fabEl.addEventListener('click', openComposer);
if (modalCloseEl) modalCloseEl.addEventListener('click', closeComposer);
if (modalBackEl) {
  modalBackEl.addEventListener('click', (e) => {
    if (e.target === modalBackEl) closeComposer();
  });
}

// Anonymous toggle
function setAnon(state) {
  isAnon = !!state;
  if (anonToggleEl) anonToggleEl.classList.toggle('on', isAnon);
  if (anonLabelEl) anonLabelEl.textContent = isAnon ? 'Posting as Anonymous' : 'Post as Anonymous';
}
if (anonToggleEl) anonToggleEl.addEventListener('click', () => setAnon(!isAnon));
if (anonShortcut) anonShortcut.addEventListener('click', () => setAnon(!isAnon));

// Image picker
if (toolPhoto && composerFile) {
  toolPhoto.addEventListener('click', () => composerFile.click());
}
if (composerFile) {
  composerFile.addEventListener('change', () => {
    const file = composerFile.files && composerFile.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { alert('Only image files allowed'); return; }
    pendingFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (previewImg) previewImg.src = ev.target.result;
      if (composerPreview) composerPreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });
}
if (previewRemove) {
  previewRemove.addEventListener('click', () => {
    pendingFile = null;
    if (composerPreview) composerPreview.style.display = 'none';
    if (previewImg) previewImg.src = '';
    if (composerFile) composerFile.value = '';
  });
}

// Submit
if (postBtnEl) {
  postBtnEl.addEventListener('click', async () => {
    if (isPosting) return;
    const content = composerEl ? composerEl.value.trim() : '';
    if (!content && !pendingFile) return;

    isPosting = true;
    postBtnEl.disabled = true;
    const origLabel = postBtnEl.textContent;
    postBtnEl.textContent = 'Posting…';

    try {
      let res;
      if (pendingFile) {
        const fd = new FormData();
        fd.append('content', content);
        fd.append('anonymous', isAnon ? 'true' : 'false');
        if (isAnon) fd.append('tag', 'anon');
        fd.append('image', pendingFile);
        res = await fetch('/api/posts', {
          method: 'POST',
          credentials: 'same-origin',
          body: fd,
        });
      } else {
        res = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            content,
            anonymous: isAnon,
            tag: isAnon ? 'anon' : 'gist',
          }),
        });
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Server error');
      }
      closeComposer();
      await loadFeed(currentFilter);
    } catch (err) {
      alert('Could not create post: ' + err.message);
    } finally {
      isPosting = false;
      postBtnEl.disabled = false;
      postBtnEl.textContent = origLabel || 'Post';
    }
  });
}

// ═══════════════════════════════════════════════════════
// FILTER CHIPS
// ═══════════════════════════════════════════════════════
if (chipsEl) {
  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const filter = chip.dataset.filter || 'all';
    chipsEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    loadFeed(filter);
  });
}

// ═══════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════
function openSearch() {
  if (!searchOverlay) return;
  searchOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => { if (searchInput) searchInput.focus(); }, 150);
}
function closeSearch() {
  if (!searchOverlay) return;
  searchOverlay.classList.remove('open');
  document.body.style.overflow = '';
  if (searchResults) searchResults.innerHTML = '';
  if (searchInput) searchInput.value = '';
}

if (searchBtn) searchBtn.addEventListener('click', openSearch);
if (searchClose) searchClose.addEventListener('click', closeSearch);
if (searchOverlay) {
  searchOverlay.addEventListener('click', (e) => {
    if (e.target === searchOverlay) closeSearch();
  });
}

if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = searchInput.value.trim();
    if (!q) { if (searchResults) searchResults.innerHTML = ''; return; }
    searchDebounce = setTimeout(() => runSearch(q), 280);
  });
}

async function runSearch(q) {
  if (!searchResults) return;
  searchResults.innerHTML = L + 'div class="empty"' + G + 'Searching…' + L + '/div' + G;
  try {
    const res = await fetch('/api/search?q=' + encodeURIComponent(q), {
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderSearchResults(data, q);
  } catch (e) {
    searchResults.innerHTML = L + 'div class="empty"' + G + 'Search failed.' + L + '/div' + G;
  }
}

function renderSearchResults(data, q) {
  if (!searchResults) return;
  const sections = [];

  if (data.people && data.people.length) {
    sections.push(
      L + 'div class="search-section"' + G
        + L + 'div class="search-label"' + G + 'People' + L + '/div' + G
        + data.people.map((p) =>
            L + 'a class="search-row" href="/user/' + p.id + '"' + G
              + L + 'div class="avatar avatar-blank"' + G + L + '/div' + G
              + L + 'div class="search-row-body"' + G
                + L + 'div class="search-row-title"' + G + escHtml(p.name) + L + '/div' + G
                + L + 'div class="search-row-sub"' + G
                  + escHtml([p.department, p.level].filter(Boolean).join(' · '))
                + L + '/div' + G
              + L + '/div' + G
            + L + '/a' + G
          ).join('')
      + L + '/div' + G
    );
  }

  if (data.listings && data.listings.length) {
    sections.push(
      L + 'div class="search-section"' + G
        + L + 'div class="search-label"' + G + 'Marketplace' + L + '/div' + G
        + data.listings.map((l) =>
            L + 'a class="search-row" href="/market"' + G
              + L + 'div class="search-row-body"' + G
                + L + 'div class="search-row-title"' + G + escHtml(l.title) + L + '/div' + G
                + L + 'div class="search-row-sub"' + G + '₦' + l.price + L + '/div' + G
              + L + '/div' + G
            + L + '/a' + G
          ).join('')
      + L + '/div' + G
    );
  }

  if (data.events && data.events.length) {
    sections.push(
      L + 'div class="search-section"' + G
        + L + 'div class="search-label"' + G + 'Events' + L + '/div' + G
        + data.events.map((ev) =>
            L + 'a class="search-row" href="/parties"' + G
              + L + 'div class="search-row-body"' + G
                + L + 'div class="search-row-title"' + G + escHtml(ev.title) + L + '/div' + G
                + L + 'div class="search-row-sub"' + G + escHtml(ev.starts_label) + L + '/div' + G
              + L + '/div' + G
            + L + '/a' + G
          ).join('')
      + L + '/div' + G
    );
  }

  if (data.posts && data.posts.length) {
    sections.push(
      L + 'div class="search-section"' + G
        + L + 'div class="search-label"' + G + 'Posts' + L + '/div' + G
        + data.posts.map((p) =>
            L + 'a class="search-row" href="/home"' + G
              + L + 'div class="search-row-body"' + G
                + L + 'div class="search-row-title"' + G + escHtml(p.snippet) + L + '/div' + G
                + L + 'div class="search-row-sub"' + G
                  + escHtml(p.author) + ' · ' + escHtml(p.time)
                + L + '/div' + G
              + L + '/div' + G
            + L + '/a' + G
          ).join('')
      + L + '/div' + G
    );
  }

  searchResults.innerHTML = sections.length
    ? sections.join('')
    : L + 'div class="empty"' + G + 'No results for "' + escHtml(q) + '"' + L + '/div' + G;
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
loadFeed(currentFilter);

})();