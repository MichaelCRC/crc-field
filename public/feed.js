/* CRC Activity Feed — field app view.
 * Talks to the portal at PORTAL_URL using X-Field-App-Key + X-Field-Rep headers.
 */
const FEED_PORTAL_URL = 'https://crc-supplements-portal.onrender.com';
// The key is baked into the build for the field PWA. The portal expects it
// to match process.env.FIELD_APP_KEY. Rotate in both places when it changes.
const FEED_APP_KEY = 'crc-field-2026';
const FEED_REACTIONS = ['🔥', '👍', '👏', '💪'];
const FEED_POLL_MS = 60000;

let _feedEntries = [];
let _feedLoading = false;
let _feedPendingPhotoUrl = null;
let _feedPollTimer = null;
let _feedJobsCache = null;
let _feedChannel = 'activity'; // active channel

// Key events to show in activity channel (system events only these types)
const FEED_KEY_EVENTS = new Set(['job_created','claim_filed','scope_approved','supplement_submitted','scope_built']);

function feedHeaders(extra) {
  return Object.assign({
    'X-Field-App-Key': FEED_APP_KEY,
    'X-Field-Rep': (repCode || '').toUpperCase(),
  }, extra || {});
}

async function portalFetch(path, opts) {
  opts = opts || {};
  opts.headers = feedHeaders(opts.headers);
  return fetch(FEED_PORTAL_URL + path, opts);
}

async function initFeed() {
  await loadFeedJobs();
  await loadFeed();
  startFeedPolling();
  wireFeedPullToRefresh();
}

function startFeedPolling() {
  stopFeedPolling();
  _feedPollTimer = setInterval(function () {
    if (document.getElementById('view-feed')?.classList.contains('active')) {
      pollFeed();
    } else {
      stopFeedPolling();
    }
  }, FEED_POLL_MS);
}
function stopFeedPolling() { if (_feedPollTimer) { clearInterval(_feedPollTimer); _feedPollTimer = null; } }

async function loadFeed() {
  _feedLoading = true;
  try {
    const r = await portalFetch('/api/feed?limit=30', { headers: { 'Content-Type': 'application/json' } });
    const data = await r.json();
    _feedEntries = Array.isArray(data.entries) ? data.entries : [];
  } catch (e) {
    console.warn('[Feed] load failed:', e.message);
    _feedEntries = [];
  }
  _feedLoading = false;
  renderFeed();
}

// Poll only for entries newer than the latest we've rendered, prepend.
async function pollFeed() {
  const newest = _feedEntries[0]?.timestamp;
  try {
    const r = await portalFetch('/api/feed?limit=30', { headers: { 'Content-Type': 'application/json' } });
    const data = await r.json();
    const all = Array.isArray(data.entries) ? data.entries : [];
    if (!newest) { _feedEntries = all; renderFeed(); return; }
    const cutoff = new Date(newest).getTime();
    const fresh = all.filter(e => new Date(e.timestamp).getTime() > cutoff);
    if (fresh.length) {
      _feedEntries = fresh.concat(_feedEntries);
      renderFeed();
    }
  } catch { /* silent */ }
}

function wireFeedPullToRefresh() {
  const list = document.getElementById('feed-list');
  if (!list) return;
  let startY = 0, pulled = 0, active = false;
  list.addEventListener('touchstart', function (ev) {
    if (list.scrollTop > 0) return;
    active = true; startY = ev.touches[0].clientY; pulled = 0;
  });
  list.addEventListener('touchmove', function (ev) {
    if (!active) return;
    pulled = ev.touches[0].clientY - startY;
    if (pulled > 60) list.setAttribute('data-refresh-hint', '1');
  });
  list.addEventListener('touchend', function () {
    if (!active) return;
    active = false;
    const hinted = list.getAttribute('data-refresh-hint');
    list.removeAttribute('data-refresh-hint');
    if (hinted && pulled > 60) loadFeed();
  });
}

// Jobs list for the "Link job" dropdown — one fetch per feed session.
async function loadFeedJobs() {
  if (_feedJobsCache) { renderFeedJobOptions(_feedJobsCache); return; }
  try {
    const r = await portalFetch('/api/jobs');
    if (!r.ok) throw new Error('jobs fetch failed');
    _feedJobsCache = await r.json();
    renderFeedJobOptions(_feedJobsCache);
  } catch { _feedJobsCache = []; }
}
function renderFeedJobOptions(jobs) {
  const sel = document.getElementById('feed-post-job');
  if (!sel) return;
  const opts = ['<option value="">Link job (optional)</option>'].concat(
    (jobs || []).map(function (j) {
      const name = (j.homeowner && (j.homeowner.firstName || j.homeowner.lastName))
        ? ((j.homeowner.firstName || '') + ' ' + (j.homeowner.lastName || '')).trim()
        : (j.homeownerName || j.address || j.id);
      return '<option value="' + j.id + '">' + feedEscape(name + ' — ' + (j.address || '')) + '</option>';
    })
  );
  sel.innerHTML = opts.join('');
}

function renderFeed() {
  const host = document.getElementById('feed-list');
  if (!host) return;
  if (_feedLoading && !_feedEntries.length) { host.innerHTML = '<div class="feed-loading">Loading feed...</div>'; return; }
  // Filter by channel
  let entries = _feedEntries;
  if (_feedChannel === 'activity') {
    // Show rep posts + key system events only
    entries = entries.filter(e => e.type === 'rep_post' || FEED_KEY_EVENTS.has(e.event));
  } else if (_feedChannel === 'leadership' || _feedChannel === 'projects') {
    // Show rep posts tagged for this channel, or all rep posts if no channel tag
    entries = entries.filter(e => e.type === 'rep_post' && (e.channel === _feedChannel || (!e.channel && _feedChannel === 'activity')));
  }
  if (!entries.length) { host.innerHTML = '<div class="feed-empty">No posts in this channel yet.</div>'; return; }
  host.innerHTML = entries.map(renderFeedCard).join('');
}

function switchFeedChannel(channel) {
  _feedChannel = channel;
  document.querySelectorAll('.feed-channel-tab').forEach(function(tab) {
    tab.classList.toggle('active', tab.dataset.channel === channel);
  });
  renderFeed();
}

function feedTakePhoto() {
  triggerPhotoCapture({ base64: false }, function(result) {
    if (!result || !result.file) return;
    // Simulate a file input change with the captured file
    var dt = new DataTransfer();
    dt.items.add(result.file);
    var fakeInput = { files: dt.files };
    feedPickPhoto(fakeInput);
  });
}

function feedEventClass(e) {
  if (e.type === 'rep_post') return 'rep_post';
  return e.event || 'system';
}

function renderFeedCard(e) {
  const cls = feedEventClass(e);
  const REP_NAMES = { MCG: 'Michael McGovern', LANE: 'Lane Campbell', NICK: 'Nick' };
  const displayName = e.repName || (e.repId && REP_NAMES[e.repId.toUpperCase()]) || e.repId || 'CRC';
  const initials = feedInitials(displayName);
  const when = feedRelativeTime(e.timestamp);
  const jobPill = e.jobId
    ? '<button class="feed-job-pill" onclick="feedOpenJob(\'' + feedAttr(e.jobId) + '\')">&#128205; Job</button>'
    : '';
  let body;
  if (e.type === 'rep_post') {
    body = '<div class="feed-card-body">' + feedEscape(e.body || '') + '</div>';
  } else {
    body = '<div class="feed-card-headline">' + feedEscape(e.headline || '') + '</div>'
         + (e.subline ? '<div class="feed-card-sub">' + feedEscape(e.subline) + '</div>' : '');
  }
  const photo = e.photoUrl
    ? '<div class="feed-card-photo"><img src="' + feedAttr(resolveFeedPhotoUrl(e.photoUrl)) + '" alt=""></div>'
    : '';
  return '<div class="feed-card ' + cls + '" data-id="' + feedAttr(e.id) + '">'
    + '<div class="feed-card-head">'
    +   '<div class="feed-avatar">' + feedEscape(initials) + '</div>'
    +   '<div class="feed-card-meta">'
    +     '<div class="feed-card-rep">' + feedEscape(displayName) + '</div>'
    +     '<div class="feed-card-when">' + feedEscape(when) + '</div>'
    +   '</div>'
    +   jobPill
    + '</div>'
    + body
    + photo
    + renderFeedReactionBar(e)
    + renderFeedCommentsBlock(e)
    + '</div>';
}

function resolveFeedPhotoUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : FEED_PORTAL_URL + url;
}

function renderFeedReactionBar(e) {
  const me = (repCode || '').toUpperCase();
  const r = e.reactions || {};
  const btns = FEED_REACTIONS.map(function (emoji) {
    const list = r[emoji] || [];
    const mine = list.indexOf(me) >= 0;
    return '<button class="feed-rx-btn' + (mine ? ' mine' : '') + '" onclick="feedToggleReaction(\'' + feedAttr(e.id) + '\',\'' + emoji + '\')">'
      + emoji + (list.length ? ' <span>' + list.length + '</span>' : '')
      + '</button>';
  }).join('');
  return '<div class="feed-rx-bar">' + btns + '</div>';
}

function renderFeedCommentsBlock(e) {
  const comments = (e.comments || []).slice();
  const shown = comments.slice(-1);
  const hidden = comments.length - shown.length;
  const list = shown.map(renderFeedComment).join('');
  const viewAll = hidden > 0
    ? '<button class="feed-comment-more" onclick="feedExpandComments(\'' + feedAttr(e.id) + '\',this)">View all ' + comments.length + ' comments</button>'
    : '';
  return '<div class="feed-comments">'
    + viewAll + list
    + '<div class="feed-comment-input-row">'
    +   '<input class="feed-comment-input" type="text" placeholder="Add comment..." onkeydown="if(event.key===\'Enter\'){feedSubmitComment(\'' + feedAttr(e.id) + '\',this)}">'
    + '</div>'
    + '</div>';
}

function renderFeedComment(c) {
  return '<div class="feed-comment"><strong>' + feedEscape(c.repName || c.repId || '') + '</strong> '
    + feedEscape(c.text) + ' <span class="feed-comment-when">' + feedRelativeTime(c.timestamp) + '</span></div>';
}

function feedExpandComments(id, btn) {
  const entry = _feedEntries.find(x => x.id === id);
  if (!entry) return;
  const container = btn.parentElement;
  const full = (entry.comments || []).map(renderFeedComment).join('');
  container.innerHTML = full
    + '<div class="feed-comment-input-row">'
    +   '<input class="feed-comment-input" type="text" placeholder="Add comment..." onkeydown="if(event.key===\'Enter\'){feedSubmitComment(\'' + feedAttr(id) + '\',this)}">'
    + '</div>';
}

async function feedToggleReaction(id, emoji) {
  try {
    const r = await portalFetch('/api/feed/' + encodeURIComponent(id) + '/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji })
    });
    if (!r.ok) return;
    const body = await r.json();
    const entry = _feedEntries.find(x => x.id === id);
    if (entry) { entry.reactions = body.reactions; renderFeed(); }
  } catch {}
}

async function feedSubmitComment(id, input) {
  const text = (input.value || '').trim();
  if (!text) return;
  try {
    const r = await portalFetch('/api/feed/' + encodeURIComponent(id) + '/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!r.ok) return;
    const body = await r.json();
    const entry = _feedEntries.find(x => x.id === id);
    if (entry) { entry.comments = (entry.comments || []).concat([body.comment]); renderFeed(); }
    input.value = '';
  } catch {}
}

async function feedPickPhoto(input) {
  const f = input.files && input.files[0];
  const preview = document.getElementById('feed-post-photo-preview');
  if (!f) { _feedPendingPhotoUrl = null; if (preview) preview.innerHTML = ''; return; }
  if (preview) preview.innerHTML = '<div class="feed-preview-chip">Uploading...</div>';
  const fd = new FormData();
  fd.append('photo', f);
  try {
    const r = await fetch(FEED_PORTAL_URL + '/api/feed/upload-photo', {
      method: 'POST',
      headers: feedHeaders(),  // no Content-Type — let browser set multipart boundary
      body: fd
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || 'upload failed');
    _feedPendingPhotoUrl = body.url;
    if (preview) preview.innerHTML = '<div class="feed-preview-chip">'
      + '<img src="' + resolveFeedPhotoUrl(body.url) + '" alt="">'
      + '<button onclick="feedClearPhoto()" aria-label="Remove">&times;</button>'
      + '</div>';
  } catch (e) {
    _feedPendingPhotoUrl = null;
    if (preview) preview.innerHTML = '<div class="feed-preview-chip error">Upload failed</div>';
  }
}
function feedClearPhoto() {
  _feedPendingPhotoUrl = null;
  const preview = document.getElementById('feed-post-photo-preview');
  if (preview) preview.innerHTML = '';
}

async function feedSubmitPost() {
  const textEl = document.getElementById('feed-post-text');
  const jobSel = document.getElementById('feed-post-job');
  const text = (textEl && textEl.value || '').trim();
  if (!text) return;
  try {
    const r = await portalFetch('/api/feed/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: text,
        photoUrl: _feedPendingPhotoUrl || null,
        channel: _feedChannel !== 'activity' ? _feedChannel : null,
        jobId: jobSel && jobSel.value || null,
      })
    });
    const body = await r.json();
    if (!r.ok) { alert(body.error || 'Post failed'); return; }
    _feedEntries = [body.entry].concat(_feedEntries);
    if (textEl) textEl.value = '';
    if (jobSel) jobSel.value = '';
    feedClearPhoto();
    renderFeed();
    const list = document.getElementById('feed-list');
    if (list) list.scrollTop = 0;
  } catch {
    alert('Network error posting to feed.');
  }
}

function feedOpenJob(jobId) {
  if (typeof openJobDetail === 'function') openJobDetail(jobId);
  else switchView('jobs');
}

// --- Helpers ---
function feedInitials(s) {
  return String(s || '').trim().split(/\s+/).slice(0, 2).map(function (w) { return (w[0] || '').toUpperCase(); }).join('') || '??';
}
function feedEscape(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function feedAttr(s) { return feedEscape(s).replace(/'/g, '&#39;'); }
function feedRelativeTime(ts) {
  if (!ts) return '';
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.round(d / 60000) + 'm ago';
  if (d < 86400000) return Math.round(d / 3600000) + 'h ago';
  if (d < 7 * 86400000) return Math.round(d / 86400000) + 'd ago';
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
