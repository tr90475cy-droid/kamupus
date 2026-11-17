(() => {
'use strict';
const L = '\x3c';
const G = '\x3e';

// ─── DOM ───
const feedEl         = document.getElementById('videoFeed');
const commentsModal  = document.getElementById('commentsModal');
const commentsList   = document.getElementById('commentsList');
const commentInput   = document.getElementById('commentInput');
const commentSend    = document.getElementById('commentSend');
const commentsClose  = document.getElementById('commentsClose');

const uploadModal    = document.getElementById('uploadModal');
const uploadClose    = document.getElementById('uploadClose');
const uploadPostBtn  = document.getElementById('uploadPostBtn');
const uploadChange   = document.getElementById('uploadChange');
const uploadVideo    = document.getElementById('uploadPreviewVideo');
const uploadCaption  = document.getElementById('uploadCaption');
const uploadHashtagInput = document.getElementById('uploadHashtagInput');
const uploadHashtagChips = document.getElementById('uploadHashtagChips');
const uploadTagInput     = document.getElementById('uploadTagInput');
const uploadTagChips     = document.getElementById('uploadTagChips');
const uploadTagResults   = document.getElementById('uploadTagResults');
const vfSearchInput  = document.getElementById('vfSearchInput');
const vfSearchClear  = document.getElementById('vfSearchClear');
const vfTrendingPills = document.getElementById('vfTrendingPills');
const vfMute        = document.getElementById('vfMute');
const vfMuteIconOff = document.getElementById('vfMuteIconOff');
const vfMuteIconOn  = document.getElementById('vfMuteIconOn');
const uploadStage = document.getElementById('uploadStage');
const uploadChoose = document.getElementById('uploadChoose');

// ─── State ───
let currentVideoId = null;
let viewedSet      = new Set();
let feedObserver   = null;

let searchQuery    = '';
let searchDebounce = null;

let pendingFile     = null;
let pendingUrl      = null;
let uploadHashtags  = [];
let uploadTags      = [];   // [{id, name, avatar}]
let uploadInFlight  = false;
let tagSearchTimer  = null;

let isMuted = (localStorage.getItem('vfMuted') !== '0');  // default muted

// ═══════════════════════════════════════════════════════
// UTIL
// ═══════════════════════════════════════════════════════
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}
function fmtCount(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

// ═══════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════
if (vfSearchInput) {
  vfSearchInput.addEventListener('input', () => {
    const raw = vfSearchInput.value.trim();
    if (vfSearchClear) vfSearchClear.style.display = raw ? '' : 'none';
    if (vfTrendingPills) vfTrendingPills.classList.toggle('hidden', !!raw);

    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchQuery = raw.replace(/^#+/, '');
      loadFeed();
    }, 300);
  });

  vfSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      vfSearchInput.value = '';
      vfSearchInput.dispatchEvent(new Event('input'));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      vfSearchInput.blur();
    }
  });
}

if (vfSearchClear) {
  vfSearchClear.addEventListener('click', () => {
    if (!vfSearchInput) return;
    vfSearchInput.value = '';
    vfSearchInput.dispatchEvent(new Event('input'));
    vfSearchInput.focus();
  });
}

// ═══════════════════════════════════════════════════════
// TRENDING HASHTAG PILLS
// ═══════════════════════════════════════════════════════
async function loadTrendingPills() {
  if (!vfTrendingPills) return;
  try {
    const res = await fetch('/api/videos/trending-hashtags', { credentials: 'same-origin' });
    if (!res.ok) return;
    const pills = await res.json();
    if (!Array.isArray(pills) || !pills.length) return;
    vfTrendingPills.innerHTML = pills.map((p) =>
      L + 'button class="vf-pill" data-tag="' + escHtml(p.tag) + '"' + G
        + '#' + escHtml(p.tag)
        + L + 'span class="pill-count"' + G + p.count + L + '/span' + G
      + L + '/button' + G
    ).join('');
  } catch (_) { /* silent */ }
}

if (vfTrendingPills) {
  vfTrendingPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.vf-pill');
    if (!pill) return;
    const tag = pill.dataset.tag;
    if (!tag || !vfSearchInput) return;
    vfSearchInput.value = '#' + tag;
    vfSearchInput.dispatchEvent(new Event('input'));
  });
}

function updateMuteIcon() {
  if (!vfMuteIconOff || !vfMuteIconOn) return;
  vfMuteIconOff.style.display = isMuted ? '' : 'none';
  vfMuteIconOn.style.display  = isMuted ? 'none' : '';
}

function applyMuteToAllVideos() {
  if (!feedEl) return;
  feedEl.querySelectorAll('video').forEach((v) => {
    const r = v.getBoundingClientRect();
    const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    if (visible / window.innerHeight > 0.5) {
      v.muted = isMuted;
      if (!isMuted && v.paused) v.play().catch(() => {});
    }
  });
}

if (vfMute) {
  vfMute.addEventListener('click', () => {
    isMuted = !isMuted;
    localStorage.setItem('vfMuted', isMuted ? '1' : '0');
    updateMuteIcon();
    applyMuteToAllVideos();
  });
  updateMuteIcon();
}

// ═══════════════════════════════════════════════════════
// LOAD FEED
// ═══════════════════════════════════════════════════════
async function loadFeed() {
  if (!feedEl) return;
  feedEl.innerHTML = L + 'div class="empty"' + G + 'Loading videos…' + L + '/div' + G;

  try {
    const url = searchQuery
      ? '/api/videos?q=' + encodeURIComponent(searchQuery)
      : '/api/videos';
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    renderFeed(await res.json());
  } catch (err) {
    console.error('Video feed failed:', err);
    feedEl.innerHTML = L + 'div class="empty"' + G + 'Could not load videos.' + L + '/div' + G;
  }
}

function renderFeed(videos) {
  if (!feedEl) return;
  if (!videos || !videos.length) {
    if (searchQuery) {
      feedEl.innerHTML =
        L + 'div class="vf-empty"' + G
          + L + 'div class="icon"' + G + '🔍' + L + '/div' + G
          + L + 'h2' + G + 'No results for "' + escHtml(searchQuery) + '"' + L + '/h2' + G
          + L + 'p' + G + 'Try a different search or clear the bar above' + L + '/p' + G
        + L + '/div' + G;
    } else {
      feedEl.innerHTML =
        L + 'div class="vf-empty"' + G
          + L + 'div class="icon"' + G + '🎬' + L + '/div' + G
          + L + 'h2' + G + 'No videos yet' + L + '/h2' + G
          + L + 'p' + G + 'Be the first to post a video on campus!' + L + '/p' + G
          + L + 'button class="vf-empty-btn" onclick="window.openVideoUpload()"' + G + 'Upload a video' + L + '/button' + G
        + L + '/div' + G;
    }
    return;
  }
  feedEl.innerHTML = videos.map(videoCardHtml).join('');
  attachObservers();
}

// ═══════════════════════════════════════════════════════
// CARD HTML
// ═══════════════════════════════════════════════════════
function videoCardHtml(v) {
  const likedClass    = v.liked    ? 'liked'    : '';
  const savedClass    = v.saved    ? 'saved'    : '';
  const repostedClass = v.reposted ? 'reposted' : '';
  const repostFill    = v.reposted ? 'currentColor' : 'none';

  const hashtagsHtml = (v.hashtags || []).length
    ? L + 'div class="video-hashtags"' + G
        + (v.hashtags || []).map((h) =>
            L + 'span class="hashtag"' + G + escHtml(h.startsWith('#') ? h : '#' + h) + L + '/span' + G
          ).join(' ')
      + L + '/div' + G
    : '';

  const taggedHtml = (v.tagged || []).length
    ? L + 'div class="video-tagged"' + G
        + '👤 ' + (v.tagged || []).map((t) =>
            L + 'a href="/user/' + t.id + '" class="tagged-user"' + G + '@' + escHtml(t.name) + L + '/a' + G
          ).join(' ')
      + L + '/div' + G
    : '';

  const musicHtml = v.music
    ? L + 'div class="video-music"' + G + '🎵 ' + escHtml(v.music) + L + '/div' + G
    : '';

  const captionHtml = v.caption
    ? L + 'p class="video-caption"' + G + escHtml(v.caption) + L + '/p' + G
    : '';

  return L + 'div class="video-card" data-id="' + v.id + '"' + G

    + L + 'video src="' + escHtml(v.video_url) + '"'
      + (v.thumbnail_url ? ' poster="' + escHtml(v.thumbnail_url) + '"' : '')
      + ' loop muted playsinline preload="metadata"' + G
    + L + '/video' + G

    + L + 'div class="video-overlay"' + G
      + L + 'div class="video-author"' + G
        + L + 'a href="/user/' + v.author_id + '" class="video-author-link"' + G
          + '@' + escHtml(v.author)
        + L + '/a' + G
        + L + 'span class="video-time"' + G + escHtml(v.time) + L + '/span' + G
      + L + '/div' + G
      + captionHtml
      + hashtagsHtml
      + taggedHtml
      + musicHtml
      + L + 'div class="video-stats"' + G
        + L + 'span class="video-view-count-wrap"' + G
          + L + 'svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
            + L + 'path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/' + G
            + L + 'circle cx="12" cy="12" r="3"/' + G
          + L + '/svg' + G
          + L + 'span class="video-view-count"' + G + fmtCount(v.views) + L + '/span' + G
          + ' views'
        + L + '/span' + G
      + L + '/div' + G
    + L + '/div' + G

    + L + 'div class="video-actions"' + G

      + L + 'button class="v-act act-like ' + likedClass + '" data-action="like"' + G
        + L + 'svg viewBox="0 0 24 24" fill="' + (v.liked ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
          + L + 'path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"/' + G
        + L + '/svg' + G
        + L + 'span class="count like-count"' + G + fmtCount(v.likes) + L + '/span' + G
      + L + '/button' + G

      + L + 'button class="v-act act-repost ' + repostedClass + '" data-action="repost"' + G
        + L + 'svg viewBox="0 0 24 24" fill="' + repostFill + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
          + L + 'path d="m17 2 4 4-4 4"/' + G
          + L + 'path d="M3 11v-1a4 4 0 0 1 4-4h14"/' + G
          + L + 'path d="m7 22-4-4 4-4"/' + G
          + L + 'path d="M21 13v1a4 4 0 0 1-4 4H3"/' + G
        + L + '/svg' + G
        + L + 'span class="count repost-count"' + G + fmtCount(v.reposts) + L + '/span' + G
      + L + '/button' + G

      + L + 'button class="v-act" data-action="comment"' + G
        + L + 'svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
          + L + 'path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/' + G
        + L + '/svg' + G
        + L + 'span class="count comment-count"' + G + fmtCount(v.comments) + L + '/span' + G
      + L + '/button' + G

      + L + 'button class="v-act act-save ' + savedClass + '" data-action="save"' + G
        + L + 'svg viewBox="0 0 24 24" fill="' + (v.saved ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
          + L + 'path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/' + G
        + L + '/svg' + G
        + L + 'span class="count save-count"' + G + fmtCount(v.saves) + L + '/span' + G
      + L + '/button' + G

      + L + 'button class="v-act" data-action="share"' + G
        + L + 'svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
          + L + 'path d="m22 2-7 20-4-9-9-4Z"/' + G
          + L + 'path d="M22 2 11 13"/' + G
        + L + '/svg' + G
      + L + '/button' + G

      + L + 'button class="v-act" data-action="report"' + G
        + L + 'svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + G
          + L + 'path d="M4 22V4a2 2 0 0 1 2-2h11l-2 5 2 5H6"/' + G
        + L + '/svg' + G
      + L + '/button' + G

    + L + '/div' + G
  + L + '/div' + G;
}

// ═══════════════════════════════════════════════════════
// AUTOPLAY + VIEW TRACKING
// ═══════════════════════════════════════════════════════
function attachObservers() {
  if (!feedEl) return;
  if (feedObserver) feedObserver.disconnect();

  feedObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const vid = entry.target;
      const card = vid.closest('.video-card');
      if (!card) return;
      if (entry.isIntersecting) {
        vid.muted = ismuted;
        vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); });
        registerView(card, vid);
      } else {
        vid.pause();
      }
    });
  }, { threshold: 0.6 });

  feedEl.querySelectorAll('video').forEach((v) => feedObserver.observe(v));
}

function registerView(card, videoEl) {
  const id = card.dataset.id;
  if (!id || viewedSet.has(id)) return;
  viewedSet.add(id);
  const vc = card.querySelector('.video-view-count');
  if (vc) {
    const cur = parseInt(vc.textContent.replace(/[KM]/g, ''), 10) || 0;
    vc.textContent = fmtCount(cur + 1);
  }
  fetch('/api/videos/' + id + '/view', {
    method: 'POST', credentials: 'same-origin',
  }).catch(() => {});
}

// Tab visibility
document.addEventListener('visibilitychange', () => {
  if (!feedEl) return;
  feedEl.querySelectorAll('video').forEach((v) => {
    if (document.hidden) v.pause();
    else {
      const r = v.getBoundingClientRect();
      const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      if (visible / window.innerHeight > 0.6) v.play().catch(() => {});
    }
  });
});

// Tap to pause
if (feedEl) {
  feedEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-action]')) return;
    const vid = e.target.closest('video');
    if (!vid) return;
    if (vid.paused) vid.play().catch(() => {});
    else vid.pause();
  });
}

// ═══════════════════════════════════════════════════════
// ACTION DISPATCH
// ═══════════════════════════════════════════════════════
if (feedEl) {
  feedEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = btn.closest('.video-card');
    if (!card) return;
    const id = card.dataset.id;
    const action = btn.dataset.action;

    if (action === 'like') {
      const countEl = btn.querySelector('.like-count');
      const was = btn.classList.contains('liked');
      const cur = parseInt(countEl.textContent.replace(/[KM]/g, ''), 10) || 0;
      btn.classList.toggle('liked', !was);
      btn.querySelector('svg').setAttribute('fill', !was ? 'currentColor' : 'none');
      countEl.textContent = fmtCount(was ? Math.max(0, cur - 1) : cur + 1);
      try {
        const r = await fetch('/api/videos/' + id + '/like', { method: 'POST', credentials: 'same-origin' });
        const d = await r.json();
        btn.classList.toggle('liked', d.liked);
        btn.querySelector('svg').setAttribute('fill', d.liked ? 'currentColor' : 'none');
        countEl.textContent = fmtCount(d.likes);
      } catch (_) {
        btn.classList.toggle('liked', was);
        btn.querySelector('svg').setAttribute('fill', was ? 'currentColor' : 'none');
        countEl.textContent = fmtCount(cur);
      }

    } else if (action === 'repost') {
      const c = btn.querySelector('.repost-count');
      const was = btn.classList.contains('reposted');
      const cur = parseInt(c.textContent.replace(/[KM]/g, ''), 10) || 0;
      btn.classList.toggle('reposted', !was);
      btn.querySelector('svg').setAttribute('fill', !was ? 'currentColor' : 'none');
      c.textContent = fmtCount(was ? Math.max(0, cur - 1) : cur + 1);
      try {
        const r = await fetch('/api/videos/' + id + '/repost', { method: 'POST', credentials: 'same-origin' });
        const d = await r.json();
        btn.classList.toggle('reposted', d.reposted);
        btn.querySelector('svg').setAttribute('fill', d.reposted ? 'currentColor' : 'none');
        c.textContent = fmtCount(d.reposts);
      } catch (_) {
        btn.classList.toggle('reposted', was);
        btn.querySelector('svg').setAttribute('fill', was ? 'currentColor' : 'none');
        c.textContent = fmtCount(cur);
      }

    } else if (action === 'save') {
      const c = btn.querySelector('.save-count');
      const was = btn.classList.contains('saved');
      const cur = parseInt(c.textContent.replace(/[KM]/g, ''), 10) || 0;
      btn.classList.toggle('saved', !was);
      btn.querySelector('svg').setAttribute('fill', !was ? 'currentColor' : 'none');
      c.textContent = fmtCount(was ? Math.max(0, cur - 1) : cur + 1);
      try {
        const r = await fetch('/api/videos/' + id + '/save', { method: 'POST', credentials: 'same-origin' });
        const d = await r.json();
        btn.classList.toggle('saved', d.saved);
        btn.querySelector('svg').setAttribute('fill', d.saved ? 'currentColor' : 'none');
        c.textContent = fmtCount(d.saves);
      } catch (_) {
        btn.classList.toggle('saved', was);
        btn.querySelector('svg').setAttribute('fill', was ? 'currentColor' : 'none');
        c.textContent = fmtCount(cur);
      }

    } else if (action === 'comment') {
      openComments(id);

    } else if (action === 'share') {
      const url = window.location.origin + '/videos';
      if (navigator.share) { try { await navigator.share({ title: 'KAMUPUS', url }); } catch (_) {} }
      else if (navigator.clipboard) { try { await navigator.clipboard.writeText(url); alert('Link copied'); } catch (_) {} }
      else alert(url);

    } else if (action === 'report') {
      const reason = prompt('Why are you reporting this video?');
      if (!reason) return;
      try {
        const r = await fetch('/api/videos/' + id + '/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ reason }),
        });
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
        alert('Reported — thank you');
      } catch (err) { alert('Could not report: ' + err.message); }
    }
  });
}

// ═══════════════════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════════════════
async function openComments(videoId) {
  if (!commentsModal || !commentsList) return;
  currentVideoId = videoId;
  commentsModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  commentsList.innerHTML = L + 'div class="empty"' + G + 'Loading…' + L + '/div' + G;
  if (commentInput) commentInput.value = '';
  await loadComments(videoId);
  setTimeout(() => { if (commentInput) commentInput.focus(); }, 250);
}

async function loadComments(videoId) {
  if (!commentsList) return;
  try {
    const r = await fetch('/api/videos/' + videoId + '/comments', { credentials: 'same-origin' });
    if (!r.ok) throw new Error();
    const tree = await r.json();
    if (!Array.isArray(tree) || !tree.length) {
      commentsList.innerHTML = L + 'div class="empty"' + G + 'No comments yet. Be the first!' + L + '/div' + G;
      return;
    }
    commentsList.innerHTML = tree.map((c) => renderComment(c, false)).join('');
    bindReplyEvents();
  } catch (_) {
    if (commentsList) commentsList.innerHTML = L + 'div class="empty"' + G + 'Could not load comments.' + L + '/div' + G;
  }
}

function renderComment(c, isReply) {
  const replies = c.replies || [];
  const hasReplies = replies.length > 0;

  let av;
  if (c.anonymous) av = L + 'div class="comment-avatar comment-avatar-anon"' + G + '🥷' + L + '/div' + G;
  else if (c.avatar) av = L + 'img class="comment-avatar" src="' + escHtml(c.avatar) + '" alt=""' + G;
  else av = L + 'div class="comment-avatar"' + G + L + '/div' + G;

  const repliesHtml = hasReplies
    ? L + 'div class="comment-replies" id="replies-' + c.id + '"' + G
        + replies.map((r) => renderComment(r, true)).join('')
      + L + '/div' + G
    : '';

  const replyToggle = hasReplies
    ? L + 'button class="comment-replies-toggle" data-toggle-replies="' + c.id + '"' + G
        + L + 'svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"' + G
          + L + 'polyline points="6 9 12 15 18 9"/' + G
        + L + '/svg' + G
        + 'View ' + replies.length + ' ' + (replies.length === 1 ? 'reply' : 'replies')
      + L + '/button' + G
    : '';

  const replyBtn = isReply ? ''
    : L + 'button class="comment-reply-btn" data-reply-to="' + c.id + '"' + G + 'Reply' + L + '/button' + G;

  const replyForm = isReply ? ''
    : L + 'div class="comment-reply-form" id="reply-form-' + c.id + '"' + G
        + L + 'textarea placeholder="Reply to @' + escHtml(c.author) + '…" rows="1" data-reply-input="' + c.id + '"' + G + L + '/textarea' + G
        + L + 'button class="reply-send" data-reply-send="' + c.id + '" aria-label="Send reply"' + G
          + L + 'svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"' + G
            + L + 'line x1="22" y1="2" x2="11" y2="13"/' + G
            + L + 'polygon points="22 2 15 22 11 13 2 9 22 2"/' + G
          + L + '/svg' + G
        + L + '/button' + G
      + L + '/div' + G;

  return L + 'div class="comment-item ' + (c.anonymous ? 'anon' : '') + '" data-comment-id="' + c.id + '"' + G
    + av
    + L + 'div class="comment-body"' + G
      + L + 'div class="comment-head"' + G
        + L + 'span class="comment-author"' + G + escHtml(c.author) + L + '/span' + G
        + L + 'span class="comment-time"' + G + escHtml(c.time) + L + '/span' + G
      + L + '/div' + G
      + L + 'p' + G + escHtml(c.content) + L + '/p' + G
      + replyBtn
      + replyForm
      + replyToggle
      + repliesHtml
    + L + '/div' + G
  + L + '/div' + G;
}

function bindReplyEvents() {
  // Expand / collapse replies
  commentsList.querySelectorAll('[data-toggle-replies]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.toggleReplies;
      const box = document.getElementById('replies-' + id);
      if (!box) return;
      const isOpen = box.classList.toggle('open');
      const n = box.querySelectorAll('.comment-item').length;
      b.innerHTML = isOpen
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>Hide replies'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>View ' + n + ' ' + (n === 1 ? 'reply' : 'replies');
    });
  });

  // Show reply form under a comment
  commentsList.querySelectorAll('[data-reply-to]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.replyTo;
      const form = document.getElementById('reply-form-' + id);
      if (!form) return;
      commentsList.querySelectorAll('.comment-reply-form.open').forEach((f) => {
        if (f !== form) f.classList.remove('open');
      });
      form.classList.toggle('open');
      if (form.classList.contains('open')) {
        const ta = form.querySelector('textarea');
        if (ta) setTimeout(() => ta.focus(), 50);
      }
    });
  });

  // Send a reply
  commentsList.querySelectorAll('[data-reply-send]').forEach((b) => {
    b.addEventListener('click', async () => {
      const id = b.dataset.replySend;
      const form = document.getElementById('reply-form-' + id);
      const ta = form ? form.querySelector('textarea') : null;
      const content = ta ? ta.value.trim() : '';
      if (!content || !currentVideoId) return;

      b.disabled = true;
      try {
        const r = await fetch('/api/videos/' + currentVideoId + '/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            content,
            parent_id: Number(id),
            anonymous: commentAnon && commentAnon.classList.contains('on'),
          }),
        });
        if (!r.ok) throw new Error();

        await loadComments(currentVideoId);

        // Auto-open the thread we just replied to
        const box = document.getElementById('replies-' + id);
        if (box) {
          box.classList.add('open');
          const toggle = commentsList.querySelector('[data-toggle-replies="' + id + '"]');
          if (toggle) toggle.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>Hide replies';
        }

        // Bump comment count on the video card
        const card = document.querySelector('.video-card[data-id="' + currentVideoId + '"]');
        if (card) {
          const el = card.querySelector('.comment-count');
          if (el) {
            const n = parseInt(el.textContent.replace(/[KM]/g, ''), 10) || 0;
            el.textContent = fmtCount(n + 1);
          }
        }
      } catch (_) {
        alert('Could not post reply');
      } finally {
        b.disabled = false;
      }
    });
  });
}

if (commentsClose) {
  commentsClose.addEventListener('click', () => {
    commentsModal.classList.remove('open');
    document.body.style.overflow = '';
    currentVideoId = null;
  });
}

if (commentSend) {
  commentSend.addEventListener('click', async () => {
    if (!currentVideoId || !commentInput) return;
    const content = commentInput.value.trim();
    if (!content) return;
    commentSend.disabled = true;
    try {
      const r = await fetch('/api/videos/' + currentVideoId + '/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ content }),
      });
      if (!r.ok) throw new Error();
      commentInput.value = '';
      await loadComments(currentVideoId);
      const card = document.querySelector('.video-card[data-id="' + currentVideoId + '"]');
      if (card) {
        const el = card.querySelector('.comment-count');
        if (el) {
          const n = parseInt(el.textContent.replace(/[KM]/g, ''), 10) || 0;
          el.textContent = fmtCount(n + 1);
        }
      }
    } catch (_) { alert('Could not post comment'); }
    finally { commentSend.disabled = false; }
  });
}

if (commentInput) {
  commentInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commentSend && commentSend.click(); }
  });
}

// ── Comments panel: backdrop tap + Escape to close ──
(function () {
  if (!commentsModal) return;

  commentsModal.addEventListener('click', (e) => {
    if (e.target === commentsModal) {
      commentsModal.classList.remove('open');
      document.body.style.overflow = '';
      currentVideoId = null;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && commentsModal.classList.contains('open')) {
      commentsModal.classList.remove('open');
      document.body.style.overflow = '';
      currentVideoId = null;
    }
  });
})();

// ═══════════════════════════════════════════════════════
// UPLOAD COMPOSER
// ═══════════════════════════════════════════════════════
window.openVideoUpload = function () {
  if (uploadInFlight) return;

  // 1. Open composer FIRST with empty state
  resetComposer();
  uploadModal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // 2. Auto-trigger file picker on top of the sheet
  setTimeout(() => pickVideoFile(), 220);
};

function resetComposer() {
  pendingFile = null;
  if (pendingUrl) {
    URL.revokeObjectURL(pendingUrl);
    pendingUrl = null;
  }
  uploadVideo.removeAttribute('src');
  uploadVideo.load();

  if (uploadStage) uploadStage.classList.remove('has-video');
  if (uploadChange) uploadChange.style.display = 'none';

  uploadPostBtn.textContent = 'Post';
  uploadPostBtn.disabled = true;

  uploadCaption.value = '';
  uploadHashtagInput.value = '';
  uploadTagInput.value = '';
  uploadTagResults.innerHTML = '';
  uploadHashtags = [];
  uploadTags = [];
  renderHashtagChips();
  renderTagChips();
}

function pickVideoFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/*';
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      alert('Video must be 50 MB or smaller. Yours is '
        + (file.size / 1024 / 1024).toFixed(1) + ' MB.');
      return;
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) {
      alert('Only MP4, MOV, AVI, WEBM, or MKV allowed.');
      return;
    }

    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    pendingFile = file;
    pendingUrl = URL.createObjectURL(file);

    uploadVideo.src = pendingUrl;
    uploadVideo.load();

    // Show video, hide empty state
    if (uploadStage) uploadStage.classList.add('has-video');
    if (uploadChange) uploadChange.style.display = 'inline-block';

    uploadPostBtn.disabled = false;
  };
  input.click();
}

// Choose / Change buttons
if (uploadChoose) uploadChoose.addEventListener('click', pickVideoFile);
if (uploadChange) uploadChange.addEventListener('click', pickVideoFile);

// Close
function closeUploadSheet() {
  uploadModal.classList.remove('open');
  document.body.style.overflow = '';
  if (pendingUrl) {
    URL.revokeObjectURL(pendingUrl);
    pendingUrl = null;
  }
  pendingFile = null;
  uploadVideo.removeAttribute('src');
  uploadVideo.load();
}

if (uploadClose) {
  uploadClose.addEventListener('click', () => { if (!uploadInFlight) closeUploadSheet(); });
}

if (uploadModal) {
  uploadModal.addEventListener('click', (e) => {
    if (e.target === uploadModal && !uploadInFlight) closeUploadSheet();
  });
}

// ── Hashtags ──
function renderHashtagChips() {
  if (!uploadHashtagChips) return;
  uploadHashtagChips.innerHTML = uploadHashtags.map((h, i) =>
    L + 'span class="upload-chip hashtag-chip"' + G
      + escHtml(h)
      + L + 'button class="chip-x" data-hash-idx="' + i + '"' + G + '✕' + L + '/button' + G
    + L + '/span' + G
  ).join('');
  uploadHashtagChips.querySelectorAll('[data-hash-idx]').forEach((b) => {
    b.addEventListener('click', () => {
      uploadHashtags.splice(Number(b.dataset.hashIdx), 1);
      renderHashtagChips();
    });
  });
}

if (uploadHashtagInput) {
  uploadHashtagInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    let raw = uploadHashtagInput.value.trim().replace(/^#+/, '');
    if (!raw) return;
    const clean = '#' + raw.replace(/[^A-Za-z0-9_]/g, '');
    if (clean.length < 2) return;
    if (uploadHashtags.some((h) => h.toLowerCase() === clean.toLowerCase())) {
      uploadHashtagInput.value = ''; return;
    }
    if (uploadHashtags.length >= 10) {
      alert('Maximum 10 hashtags'); return;
    }
    uploadHashtags.push(clean);
    uploadHashtagInput.value = '';
    renderHashtagChips();
  });
}

// ── Tags ──
function renderTagChips() {
  if (!uploadTagChips) return;
  uploadTagChips.innerHTML = uploadTags.map((t, i) =>
    L + 'span class="upload-chip tag-chip"' + G
      + escHtml(t.name)
      + L + 'button class="chip-x" data-tag-idx="' + i + '"' + G + '✕' + L + '/button' + G
    + L + '/span' + G
  ).join('');
  uploadTagChips.querySelectorAll('[data-tag-idx]').forEach((b) => {
    b.addEventListener('click', () => {
      uploadTags.splice(Number(b.dataset.tagIdx), 1);
      renderTagChips();
    });
  });
}

if (uploadTagInput) {
  uploadTagInput.addEventListener('input', () => {
    clearTimeout(tagSearchTimer);
    const q = uploadTagInput.value.trim();
    if (q.length < 2) {
      uploadTagResults.innerHTML = '';
      return;
    }
    tagSearchTimer = setTimeout(() => searchTagUsers(q), 300);
  });
}

async function searchTagUsers(q) {
  try {
    const r = await fetch('/api/users/search?q=' + encodeURIComponent(q), { credentials: 'same-origin' });
    if (!r.ok) return;
    const users = await r.json();
    const filtered = (users || []).filter((u) => !uploadTags.some((t) => t.id === u.id));
    if (!filtered.length) {
      uploadTagResults.innerHTML = L + 'div class="tag-empty"' + G + 'No matches' + L + '/div' + G;
      return;
    }
    uploadTagResults.innerHTML = filtered.slice(0, 8).map((u) =>
      L + 'button type="button" class="tag-result" data-uid="' + u.id + '" data-name="' + escHtml(u.name) + '"' + G
        + (u.avatar
            ? L + 'img src="' + escHtml(u.avatar) + '" class="tag-result-av" alt=""' + G
            : L + 'div class="tag-result-av tag-result-av-blank"' + G + L + '/div' + G)
        + L + 'span' + G + escHtml(u.name) + L + '/span' + G
      + L + '/button' + G
    ).join('');
    uploadTagResults.querySelectorAll('.tag-result').forEach((b) => {
      b.addEventListener('click', () => {
        if (uploadTags.length >= 10) { alert('Maximum 10 tags'); return; }
        uploadTags.push({ id: Number(b.dataset.uid), name: b.dataset.name, avatar: null });
        renderTagChips();
        uploadTagInput.value = '';
        uploadTagResults.innerHTML = '';
      });
    });
  } catch (_) {}
}

// ── Post ──
if (uploadPostBtn) {
  uploadPostBtn.addEventListener('click', async () => {
    if (uploadInFlight || !pendingFile) return;
    uploadInFlight = true;
    uploadPostBtn.disabled = true;

    const fd = new FormData();
    fd.append('video', pendingFile);
    fd.append('caption', uploadCaption.value.trim());
    fd.append('hashtags', uploadHashtags.join(','));
    fd.append('tagged_user_ids', uploadTags.map((t) => t.id).join(','));
    fd.append('draft', 'false');

    try {
      await uploadWithProgress(fd, (pct) => {
        uploadPostBtn.textContent = 'Uploading ' + pct + '%';
      });

      uploadPostBtn.textContent = 'Posted ✓';

      setTimeout(() => {
        closeUploadSheet();
        uploadInFlight = false;
        loadFeed();
      }, 700);
    } catch (err) {
      alert('Upload failed: ' + err.message);
      uploadPostBtn.textContent = 'Post';
      uploadPostBtn.disabled = false;
      uploadInFlight = false;
    }
  });
}

function uploadWithProgress(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || 'Upload failed (' + xhr.status + ')'));
      } catch (_) {
        reject(new Error('Invalid server response'));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('abort', () => reject(new Error('Cancelled')));
    xhr.open('POST', '/api/videos/upload');
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}

// ═══════════════════════════════════════════════════════
// AUTO-TRIGGER — /videos?compose=1 opens the picker
// ═══════════════════════════════════════════════════════
(function autoCompose() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('compose') === '1') {
    history.replaceState(null, '', window.location.pathname);
    setTimeout(() => window.openVideoUpload(), 400);
  }
})();

loadFeed();
loadTrendingPills();

})();