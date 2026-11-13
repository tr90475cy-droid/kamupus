(() => {
'use strict';
const L = '\x3c';
const G = '\x3e';

const feedEl = document.getElementById('feed');
const chipsEl = document.getElementById('chips');
const fabEl = document.getElementById('fab');
const modalBackEl = document.getElementById('modalBack');
const modalCloseEl = document.getElementById('modalClose');
const postBtnEl = document.getElementById('postBtn');
const composerEl = document.getElementById('composer');
const anonToggleEl = document.getElementById('anonToggle');
const anonLabelEl = document.getElementById('anonLabel');
const anonShortcut = document.getElementById('anonShortcut');
const actionsEl = document.querySelector('.actions');
const navEl = document.querySelector('.nav');
const composerFile = document.getElementById('composerFile');
const toolPhoto = document.getElementById('toolPhoto');
const composerPreview = document.getElementById('composerPreview');
const previewImg = document.getElementById('previewImg');
const previewRemove = document.getElementById('previewRemove');
const commentsModal = document.getElementById('commentsModal');
const commentsClose = document.getElementById('commentsClose');
const commentsList = document.getElementById('commentsList');
const commentInput = document.getElementById('commentInput');
const commentAnon = document.getElementById('commentAnon');
const commentSend = document.getElementById('commentSend');
const searchBtn = document.getElementById('searchBtn');
const searchOverlay = document.getElementById('searchOverlay');
const searchInput = document.getElementById('searchInput');
const searchClose = document.getElementById('searchClose');
const searchResults = document.getElementById('searchResults');

let currentFilter = 'all';
let isAnon = false;
let isPosting = false;
let currentPostId = null;

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
  });
}
function escAttr(s) { return escHtml(s); }

// ═══════════════════════════════════════════════════════
// FEED
// ═══════════════════════════════════════════════════════
async function loadFeed(filter) {
  if (!feedEl) return;                       // BUG #2 fix: safe when #feed missing
  if (!filter) filter = 'all';
  currentFilter = filter;
  feedEl.innerHTML = L + 'div class="empty"' + G + 'Loading feed…' + L + '/div' + G;
  try {
    const res = await fetch('/api/feed?filter=' + encodeURIComponent(filter), { credentials: 'same-origin' });
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
}

function postHtml(p) {
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

  let badge = '';
  if (p.anonymous) {
    badge = L + 'span class="badge-anon"' + G + 'ANON' + L + '/span' + G;
  } else if (p.verified) {
    badge = L + 'span class="verified"' + G + '✓' + L + '/span' + G;
  }

  let followBtn = '';
  if (!p.anonymous && p.user_id) {
    followBtn = L + 'button class="follow-inline" data-action="follow" data-uid="' + p.user_id + '" data-following="false"' + G + 'Follow' + L + '/button' + G;
  }

  const authorHtml = p.anonymous
    ? L + 'span class="post-name"' + G + escHtml(p.author) + L + '/span' + G
    : L + 'a href="/user/' + p.user_id + '" class="post-name post-name-link"' + G + escHtml(p.author) + L + '/a' + G;

  const image = p.image
    ? L + 'img class="post-img" src="' + escAttr(p.image) + '" alt="" loading="lazy"' + G
    : '';

  const heartFill = p.liked ? 'currentColor' : 'none';
  const likedClass = p.liked ? 'liked' : '';

  const isMine = p.mine === true;
  const deleteBtn = isMine
    ? L + 'button class="act act-delete" data-action="delete" title="Delete post"' +
      ' style="color:#ef4444;"' + G
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
    + authorHtml
    + badge
    + followBtn
    + L + '/div' + G
    + L + 'div class="post-time"' + G + escHtml(p.time) + ' ago · Lead City University' + L + '/div' + G
    + L + '/div' + G
    + L + '/div' + G
    + L + 'p class="post-body"' + G + escHtml(p.content) + L + '/p' + G
    + image
    + L + 'div class="post-actions"' + G
    + L + 'button class="act like ' + likedClass + '" data-action="like"' + G
    + L + 'svg viewBox="0 0 24 24" fill="' + heartFill + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
    + L + 'path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"/' + G
    + L + '/svg' + G
    + L + 'span class="like-count"' + G + p.likes + L + '/span' + G
    + L + '/button' + G
    + L + 'button class="act" data-action="comment"' + G
    + L + 'svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
    + L + 'path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/' + G
    + L + '/svg' + G
    + L + 'span class="comment-count"' + G + p.comments + L + '/span' + G
    + L + '/button' + G
    + L + 'button class="act" data-action="share"' + G
    + L + 'svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
    + L + 'path d="m22 2-7 20-4-9-9-4Z"/' + G
    + L + 'path d="M22 2 11 13"/' + G
    + L + '/svg' + G
    + L + 'span' + G + 'Share' + L + '/span' + G
    + L + '/button' + G
    + L + 'div class="act-spacer"' + G + L + '/div' + G
    + deleteBtn
    + L + '/div' + G
    + L + '/article' + G;
}

// ─── Feed click handler (guarded) ───
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

    // 2. Post body expand/collapse — skip when user is selecting text (BUG #6 fix)
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

    if (action === 'like') await toggleLike(btn, id);
    else if (action === 'comment') await openComments(id);
    else if (action === 'follow') await toggleFollow(btn);
    else if (action === 'share') await sharePost(id);
    else if (action === 'delete') await deletePost(id, card);
  });
}

// ═══════════════════════════════════════════════════════
// DELETE POST
// ═══════════════════════════════════════════════════════
async function deletePost(postId, card) {
  if (!confirm('Delete this post? This cannot be undone.')) return;

  const btn = card.querySelector('[data-action="delete"]');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  }

  try {
    const res = await fetch('/api/posts/' + postId, {
      method: 'DELETE',
      credentials: 'same-origin'
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Server error ' + res.status);
    }

    card.style.transition = 'opacity 0.3s, transform 0.3s';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.95)';
    setTimeout(function() { card.remove(); }, 320);
  } catch (err) {
    alert('Could not delete post: ' + err.message);
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '';
    }
  }
}

// ═══════════════════════════════════════════════════════
// SHARE POST — BUG #4 fix: was pointing to /user/<id> (wrong route)
// ═══════════════════════════════════════════════════════
async function sharePost(postId) {
  // If you later add a /post/<id> permalink route, change this to:
  //   const url = window.location.origin + '/post/' + postId;
  const url = window.location.origin + '/home';

  if (navigator.share) {
    try {
      await navigator.share({ title: 'KAMUPUS', text: 'Check this out on KAMUPUS', url: url });
    } catch (e) { /* user cancelled */ }
  } else if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copied to clipboard');
    } catch (e) {
      alert('Could not copy link');
    }
  } else {
    alert(url);
  }
}

// ═══════════════════════════════════════════════════════
// LIKE
// ═══════════════════════════════════════════════════════
async function toggleLike(btn, postId) {
  const wasLiked = btn.classList.contains('liked');
  const countEl = btn.querySelector('.like-count');
  const current = parseInt(countEl.textContent, 10) || 0;
  btn.classList.toggle('liked', !wasLiked);
  btn.querySelector('svg').setAttribute('fill', !wasLiked ? 'currentColor' : 'none');
  countEl.textContent = wasLiked ? Math.max(0, current - 1) : current + 1;
  try {
    const res = await fetch('/api/posts/' + postId + '/like', { method: 'POST', credentials: 'same-origin' });
    const data = await res.json();
    btn.classList.toggle('liked', data.liked);
    btn.querySelector('svg').setAttribute('fill', data.liked ? 'currentColor' : 'none');
    countEl.textContent = data.likes;
  } catch (e) {
    btn.classList.toggle('liked', wasLiked);
    btn.querySelector('svg').setAttribute('fill', wasLiked ? 'currentColor' : 'none');
    countEl.textContent = current;
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
    const r = await fetch('/api/users/' + uid + '/follow', { method: method, credentials: 'same-origin' });
    if (!r.ok) throw new Error();
    const data = await r.json();
    btn.dataset.following = data.following ? 'true' : 'false';
    btn.textContent = data.following ? 'Following' : 'Follow';
  } catch (e) {
    console.error('Follow failed:', e);
  } finally {
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════
// COMMENTS — guards added to every function
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
  setTimeout(function() { if (commentInput) commentInput.focus(); }, 250);
}

async function loadComments(postId) {
  if (!commentsList) return;
  try {
    const res = await fetch('/api/posts/' + postId + '/comments', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);   // BUG #5 fix
    const comments = await res.json();
    if (!Array.isArray(comments) || !comments.length) {   // BUG #5 fix
      commentsList.innerHTML = L + 'div class="empty"' + G + 'No comments yet. Be the first!' + L + '/div' + G;
      return;
    }
    commentsList.innerHTML = comments.map(function(c) {
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

async function sendComment() {
  if (!commentInput || !commentSend || !currentPostId) return;
  const content = commentInput.value.trim();
  if (!content) return;
  commentSend.disabled = true;
  try {
    const res = await fetch('/api/posts/' + currentPostId + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        content: content,
        anonymous: commentAnon ? commentAnon.classList.contains('on') : false
      })
    });
    if (!res.ok) throw new Error();
    commentInput.value = '';
    if (commentAnon) commentAnon.classList.remove('on');
    await loadComments(currentPostId);
    if (feedEl) {
      const card = feedEl.querySelector('.post[data-id="' + currentPostId + '"]');
      if (card) {
        const cc = card.querySelector('.comment-count');
        if (cc) cc.textContent = parseInt(cc.textContent, 10) + 1;
      }
    }
  } catch (e) {
    alert('Could not post comment. Please try again.');
  } finally {
    commentSend.disabled = false;
  }
}

// ─── Comment listeners (guarded) ───
if (commentsClose) commentsClose.addEventListener('click', closeComments);
if (commentsModal) commentsModal.addEventListener('click', function(e) {
  if (e.target === commentsModal) closeComments();
});
if (commentAnon) commentAnon.addEventListener('click', function() {
  commentAnon.classList.toggle('on');
});
if (commentSend) commentSend.addEventListener('click', sendComment);
if (commentInput) commentInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); }
});

// ═══════════════════════════════════════════════════════
// CHIPS (feed filter)
// ═══════════════════════════════════════════════════════
if (chipsEl) {
  chipsEl.addEventListener('click', function(e) {
    const chip = e.target.closest('.chip');
    if (!chip || chip.classList.contains('active')) return;
    chipsEl.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
    chip.classList.add('active');
    loadFeed(chip.dataset.filter);
  });
}

// ═══════════════════════════════════════════════════════
// COMPOSER
// ═══════════════════════════════════════════════════════
function openComposer(opts) {
  if (!modalBackEl) return;
  const anonymous = opts && opts.anonymous;
  modalBackEl.classList.add('open');
  document.body.style.overflow = 'hidden';
  setAnonymous(!!anonymous);
  setTimeout(function() { if (composerEl) composerEl.focus(); }, 250);
}

function closeComposer() {
  if (!modalBackEl) return;
  modalBackEl.classList.remove('open');
  document.body.style.overflow = '';
  if (composerEl) composerEl.value = '';
  if (composerFile) composerFile.value = '';
  if (composerPreview) composerPreview.classList.add('hidden');
  if (previewImg) previewImg.src = '';
  if (postBtnEl) postBtnEl.disabled = true;
  isPosting = false;
  setAnonymous(false);
}

function setAnonymous(v) {
  isAnon = v;
  if (anonToggleEl) anonToggleEl.classList.toggle('on', v);
  if (anonLabelEl) anonLabelEl.textContent = v ? 'Posting anonymously' : 'Post anonymously';
  if (composerEl) composerEl.placeholder = v ? 'Share a gist anonymously…' : "What's happening on campus?";
}

if (fabEl) fabEl.addEventListener('click', function() { openComposer(); });
if (anonShortcut) anonShortcut.addEventListener('click', function() { openComposer({ anonymous: true }); });
if (modalCloseEl) modalCloseEl.addEventListener('click', closeComposer);
if (modalBackEl) modalBackEl.addEventListener('click', function(e) {
  if (e.target === modalBackEl) closeComposer();
});
if (anonToggleEl) anonToggleEl.addEventListener('click', function() { setAnonymous(!isAnon); });

if (toolPhoto) toolPhoto.addEventListener('click', function() {
  if (composerFile) composerFile.click();
});
if (composerFile) composerFile.addEventListener('change', function() {
  const file = composerFile.files[0];
  if (!file || !previewImg || !composerPreview) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    previewImg.src = ev.target.result;
    composerPreview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
  updatePostBtn();
});
if (previewRemove) previewRemove.addEventListener('click', function() {
  if (composerFile) composerFile.value = '';
  if (composerPreview) composerPreview.classList.add('hidden');
  if (previewImg) previewImg.src = '';
  updatePostBtn();
});

function updatePostBtn() {
  if (!postBtnEl) return;
  const hasText = composerEl && composerEl.value.trim().length > 0;
  const hasImg = composerFile && composerFile.files.length > 0;
  postBtnEl.disabled = (!hasText && !hasImg) || isPosting;
}

if (composerEl) composerEl.addEventListener('input', updatePostBtn);
if (composerEl) composerEl.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submitPost(); }
});
if (postBtnEl) postBtnEl.addEventListener('click', submitPost);

async function submitPost() {
  if (!composerEl || !postBtnEl) return;
  const content = composerEl.value.trim();
  const hasImg = composerFile && composerFile.files.length > 0;
  if ((!content && !hasImg) || isPosting) return;
  isPosting = true;
  postBtnEl.disabled = true;
  postBtnEl.textContent = 'Posting…';

  const fd = new FormData();
  fd.append('content', content);
  fd.append('anonymous', isAnon ? 'true' : 'false');
  fd.append('tag', isAnon ? 'anon' : 'gist');
  if (hasImg) fd.append('image', composerFile.files[0]);

  try {
    const res = await fetch('/api/posts', { method: 'POST', body: fd, credentials: 'same-origin' });

    if (!res.ok) {
      let errorMsg = 'Unknown error';
      try {
        const errorData = await res.json();
        errorMsg = errorData.error || 'Server rejected the post';
      } catch (err) {
        errorMsg = 'Server error (' + res.status + ')';
      }
      throw new Error(errorMsg);
    }

    closeComposer();
    await loadFeed(currentFilter);
  } catch (e) {
    alert('Upload failed: ' + e.message);
    postBtnEl.disabled = false;
  } finally {
    isPosting = false;
    postBtnEl.textContent = 'Post';
  }
}

// ═══════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════
function openSearch() {
  if (!searchOverlay) return;
  searchOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(function() { if (searchInput) searchInput.focus(); }, 100);
}

function closeSearch() {
  if (!searchOverlay) return;
  searchOverlay.classList.remove('open');
  document.body.style.overflow = '';
  if (searchInput) searchInput.value = '';
  if (searchResults) searchResults.innerHTML = L + 'div class="search-tip"' + G + 'Try typing a name, a topic, a course code…' + L + '/div' + G;
}

if (searchBtn) searchBtn.addEventListener('click', openSearch);
if (searchClose) searchClose.addEventListener('click', closeSearch);

let searchTimer = null;
if (searchInput) searchInput.addEventListener('input', function() {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (q.length < 1) {
    if (searchResults) searchResults.innerHTML = L + 'div class="search-tip"' + G + 'Try typing a name, a topic, a course code…' + L + '/div' + G;
    return;
  }
  searchTimer = setTimeout(function() { runSearch(q); }, 220);
});

async function runSearch(q) {
  if (!searchResults) return;
  searchResults.innerHTML = L + 'div class="search-loading"' + G + 'Searching…' + L + '/div' + G;
  try {
    // NOTE: /api/search endpoint must exist in app.py — see backend section
    const res = await fetch('/api/search?q=' + encodeURIComponent(q), { credentials: 'same-origin' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderSearchResults(data, q);
  } catch (e) {
    searchResults.innerHTML = L + 'div class="search-empty"' + G + 'Could not search right now.' + L + '/div' + G;
  }
}

function sectionHtml(title, rows) {
  return L + 'div class="search-section"' + G
    + L + 'div class="search-section-title"' + G + title + L + '/div' + G
    + L + 'div class="search-section-body"' + G + rows + L + '/div' + G
    + L + '/div' + G;
}

function personRow(u) {
  const avatar = u.avatar
    ? L + 'img class="search-avatar" src="' + escAttr(u.avatar) + '" alt=""' + G
    : L + 'div class="search-avatar search-avatar-blank"' + G + L + '/div' + G;
  const meta = [u.level ? u.level + 'L' : '', u.department].filter(Boolean).join(' · ');
  return L + 'button class="search-row" data-type="person" data-uid="' + u.id + '"' + G
    + avatar
    + L + 'div class="search-row-body"' + G
    + L + 'div class="search-row-title"' + G + escHtml(u.name) + L + '/div' + G
    + (meta ? L + 'div class="search-row-meta"' + G + escHtml(meta) + L + '/div' + G : '')
    + L + '/div' + G
    + L + '/button' + G;
}

function groupRow(g) {
  return L + 'button class="search-row" data-type="group" data-rid="' + g.id + '"' + G
    + L + 'div class="search-avatar search-avatar-group"' + G + '👥' + L + '/div' + G
    + L + 'div class="search-row-body"' + G
    + L + 'div class="search-row-title"' + G + escHtml(g.name) + L + '/div' + G
    + L + 'div class="search-row-meta"' + G + g.member_count + ' member' + (g.member_count !== 1 ? 's' : '') + L + '/div' + G
    + L + '/div' + G
    + L + '/button' + G;
}

function postRow(p) {
  return L + 'button class="search-row" data-type="post" data-pid="' + p.id + '"' + G
    + L + 'div class="search-avatar search-avatar-emoji"' + G + (p.anonymous ? '🥷' : '📝') + L + '/div' + G
    + L + 'div class="search-row-body"' + G
    + L + 'div class="search-row-title"' + G + escHtml(p.snippet) + L + '/div' + G
    + L + 'div class="search-row-meta"' + G + escHtml(p.author) + ' · ' + escHtml(p.time) + L + '/div' + G
    + L + '/div' + G
    + L + '/button' + G;
}

function eventRow(e) {
  return L + 'button class="search-row" data-type="event"' + G
    + L + 'div class="search-avatar search-avatar-emoji"' + G + '🎉' + L + '/div' + G
    + L + 'div class="search-row-body"' + G
    + L + 'div class="search-row-title"' + G + escHtml(e.title) + L + '/div' + G
    + L + 'div class="search-row-meta"' + G + escHtml(e.starts_label) + (e.venue ? ' · ' + escHtml(e.venue) : '') + L + '/div' + G
    + L + '/div' + G
    + L + '/button' + G;
}

function listingRow(l) {
  return L + 'button class="search-row" data-type="listing"' + G
    + L + 'div class="search-avatar search-avatar-emoji"' + G + '🛒' + L + '/div' + G
    + L + 'div class="search-row-body"' + G
    + L + 'div class="search-row-title"' + G + escHtml(l.title) + L + '/div' + G
    + L + 'div class="search-row-meta"' + G + '₦' + Number(l.price).toLocaleString() + L + '/div' + G
    + L + '/div' + G
    + L + '/button' + G;
}

function renderSearchResults(data, q) {
  if (!searchResults) return;
  const sections = [];
  if (data.people && data.people.length) sections.push(sectionHtml('People', data.people.map(personRow).join('')));
  if (data.groups && data.groups.length) sections.push(sectionHtml('Groups', data.groups.map(groupRow).join('')));
  if (data.posts && data.posts.length) sections.push(sectionHtml('Posts', data.posts.map(postRow).join('')));
  if (data.events && data.events.length) sections.push(sectionHtml('Events', data.events.map(eventRow).join('')));
  if (data.listings && data.listings.length) sections.push(sectionHtml('Marketplace', data.listings.map(listingRow).join('')));
  if (!sections.length) {
    searchResults.innerHTML = L + 'div class="search-empty"' + G + 'No results for "' + escHtml(q) + '"' + L + '/div' + G;
    return;
  }
  searchResults.innerHTML = sections.join('');
}

if (searchResults) {
  searchResults.addEventListener('click', async function(e) {
    const row = e.target.closest('.search-row');
    if (!row) return;
    const type = row.dataset.type;
    if (type === 'person') {
      const uid = parseInt(row.dataset.uid, 10);
      closeSearch();
      try { await fetch('/api/chat/dm/' + uid, { method: 'POST', credentials: 'same-origin' }); } catch (err) {}
      window.location.href = '/chat?dm=' + uid;
    } else if (type === 'group') {
      closeSearch();
      window.location.href = '/chat?room=' + row.dataset.rid;
    } else if (type === 'post') {
      const pid = row.dataset.pid;
      closeSearch();
      await loadFeed('all');
      if (feedEl) {
        const card = feedEl.querySelector('.post[data-id="' + pid + '"]');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (type === 'event') {
      closeSearch();
      window.location.href = '/parties';
    } else if (type === 'listing') {
      closeSearch();
      window.location.href = '/market';
    }
  });
}

// ═══════════════════════════════════════════════════════
// NAV / ACTIONS
// ═══════════════════════════════════════════════════════
if (actionsEl) {
  actionsEl.addEventListener('click', function(e) {
    const action = e.target.closest('.action');
    if (!action) return;
    const kind = action.dataset.action;
    if (kind === 'anonymous') return;
    const routes = {
  market:      '/market',
  assignments: '/assignments',
  chat:        '/chat',
  parties:     '/parties',
  connect:     '/connect',
  pastq:       '/past-questions',
};
    if (routes[kind]) window.location.href = routes[kind];
  });
}

if (navEl) {
  navEl.addEventListener('click', function(e) {
    const item = e.target.closest('.nav-item');
    if (!item || item.classList.contains('active')) return;
    const tab = item.dataset.tab;
    const routes = { market: '/market', chat: '/chat', me: '/me', connect: '/connect' };
    if (routes[tab]) window.location.href = routes[tab];
  });
}

// ═══════════════════════════════════════════════════════
// KEYBOARD (Escape closes modals)
// ═══════════════════════════════════════════════════════
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  if (commentsModal && commentsModal.classList.contains('open')) closeComments();
  if (modalBackEl && modalBackEl.classList.contains('open')) closeComposer();
  if (searchOverlay && searchOverlay.classList.contains('open')) closeSearch();
});

// ═══════════════════════════════════════════════════════
// IMAGE LIGHTBOX CLOSE
// ═══════════════════════════════════════════════════════
const lightbox = document.getElementById('imageLightbox');
if (lightbox) {
  lightbox.addEventListener('click', function() {
    this.style.display = 'none';
    const img = document.getElementById('lightboxImg');
    if (img) img.src = '';
    document.body.style.overflow = '';
  });
}

// ═══════════════════════════════════════════════════════
// BOOT — BUG #2 fix
// ═══════════════════════════════════════════════════════
if (feedEl) loadFeed();
})();