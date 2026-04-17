/* CRC Field Intel -- My Jobs View */

const JOB_STAGES = [
  { key: 'new_lead',        label: 'New Lead',          color: '#6B7280' },
  { key: 'appointment_set', label: 'Appointment Set',   color: '#F59E0B' },
  { key: 'inspected',       label: 'Inspected',         color: '#3B82F6' },
  { key: 'claim_filed',     label: 'Claim Filed',       color: '#8B5CF6' },
  { key: 'crc_scope_built', label: 'CRC Scope Built',   color: '#7C3AED' },
  { key: 'scope_received',  label: 'Scope Received',    color: '#EC4899' },
  { key: 'supplementing',   label: 'Supplementing',     color: '#F97316' },
  { key: 'ready_to_collect',label: 'Ready to Collect',  color: '#10B981' },
  { key: 'follow_up',       label: 'Follow Up',         color: '#0EA5E9' },
  { key: 'lost',            label: 'Lost',              color: '#DC2626' },
];

function stageColor(s) {
  const found = JOB_STAGES.find(x => x.key === s);
  return found ? found.color : '#6B7280';
}
function stageLabel(s) {
  const found = JOB_STAGES.find(x => x.key === s);
  return found ? found.label : (s || 'New Lead').replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
}

function pipelineBadge(p) {
  if (p === 'retail') return '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--navy);color:#fff;font-weight:600">Retail</span>';
  if (p === 'repair') return '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:#6B7280;color:#fff;font-weight:600">Repair</span>';
  return '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--teal);color:#fff;font-weight:600">Insurance</span>';
}

let _jobsCache = [];
let _jobsFilter = 'all';
let _jobsView = 'list'; // 'list' or 'board'

// ─── Swipe state ───────────────────────────────────────────────────────────
let _swipeStart = null;
let _swipeEl = null;

// ─── Load ──────────────────────────────────────────────────────────────────
async function loadJobs() {
  const el = document.getElementById('view-jobs');
  if (!el) return;
  el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gray)">Loading jobs...</div>';
  try {
    const url = (typeof repRole !== 'undefined' && repRole === 'admin')
      ? '/api/field/jobs'
      : '/api/field/jobs?repCode=' + (typeof repCode !== 'undefined' ? repCode : '');
    const jobs = await fetch(url).then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json(); });
    _jobsCache = jobs;
    renderJobsList();
  } catch (e) {
    el.innerHTML = '<div style="padding:40px;text-align:center"><p style="color:var(--gray);margin-bottom:12px">' + e.message + '</p>'
      + '<button class="btn-add" onclick="loadJobs()" style="max-width:200px;margin:0 auto">Retry</button></div>';
  }
}

// ─── Search state ──────────────────────────────────────────────────────────
let _jobsSearch = '';

// ─── Filter + render ───────────────────────────────────────────────────────
function renderJobsList() {
  const el = document.getElementById('view-jobs');
  if (!el) return;

  let jobs = _jobsCache;
  if (_jobsFilter === 'insurance') jobs = jobs.filter(j => (j.pipeline || 'insurance') === 'insurance');
  else if (_jobsFilter === 'retail')    jobs = jobs.filter(j => j.pipeline === 'retail');
  else if (_jobsFilter === 'repair')    jobs = jobs.filter(j => j.pipeline === 'repair');
  else if (_jobsFilter === 'follow_up') jobs = jobs.filter(j => j.stage === 'follow_up' || j.subStatus === 'follow_up');

  // Search filter
  if (_jobsSearch.trim()) {
    const q = _jobsSearch.trim().toLowerCase();
    jobs = jobs.filter(j => {
      const name = ((j.homeowner?.firstName || '') + ' ' + (j.homeowner?.lastName || '') + ' ' + (j.homeownerName || '')).toLowerCase();
      const addr = (j.address || '').toLowerCase();
      const claim = (j.claimNumber || '').toLowerCase();
      const carrier = (j.carrier || '').toLowerCase();
      return name.includes(q) || addr.includes(q) || claim.includes(q) || carrier.includes(q);
    });
  }

  const totalTasks = _jobsCache.reduce((n, j) => n + (j.openTasks || 0), 0);

  let html = '<div style="padding:12px 16px;padding-bottom:calc(80px + env(safe-area-inset-bottom, 0px))">';

  // ── Top bar: summary + view toggle ──
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
  html += '<div style="display:flex;gap:10px;align-items:center">';
  html += '<span style="font-size:13px;color:var(--gray)">' + _jobsCache.length + ' jobs</span>';
  if (totalTasks > 0) html += '<span style="font-size:12px;padding:2px 8px;border-radius:10px;background:#DC2626;color:#fff;font-weight:600">' + totalTasks + ' open tasks</span>';
  html += '</div>';
  // View toggle
  html += '<div style="display:flex;gap:4px">';
  html += '<button onclick="_jobsView=\'list\';renderJobsList()" style="padding:6px 10px;border-radius:6px 0 0 6px;border:1px solid var(--border);background:' + (_jobsView==='list'?'var(--navy)':'var(--white)') + ';color:' + (_jobsView==='list'?'#fff':'var(--gray)') + ';cursor:pointer;font-size:12px;font-weight:600">&#9776; List</button>';
  html += '<button onclick="_jobsView=\'board\';renderJobsList()" style="padding:6px 10px;border-radius:0 6px 6px 0;border:1px solid var(--border);border-left:none;background:' + (_jobsView==='board'?'var(--navy)':'var(--white)') + ';color:' + (_jobsView==='board'?'#fff':'var(--gray)') + ';cursor:pointer;font-size:12px;font-weight:600">&#9707; Board</button>';
  html += '</div></div>';

  // ── Search bar ──
  html += '<div style="position:relative;margin-bottom:10px">';
  html += '<span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:15px;pointer-events:none">🔍</span>';
  html += '<input id="jobs-search-input" type="text" placeholder="Search name, address, claim, carrier..." value="' + _jobsSearch.replace(/"/g,'&quot;') + '" '
    + 'oninput="_jobsSearch=this.value;renderJobsList()" '
    + 'style="width:100%;padding:10px 36px 10px 36px;border-radius:10px;border:1px solid var(--border);background:var(--white);color:#000;font-size:14px;box-sizing:border-box;-webkit-appearance:none">';
  if (_jobsSearch) {
    html += '<button onclick="_jobsSearch=\'\';document.getElementById(\'jobs-search-input\').value=\'\';renderJobsList()" '
      + 'style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;font-size:20px;color:var(--gray);cursor:pointer;padding:0;line-height:1">&times;</button>';
  }
  html += '</div>';

  // ── Filter tabs ──
  html += '<div style="display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:6px;margin-bottom:12px;scrollbar-width:none">';
  var tabs = [['all','All'],['insurance','Insurance'],['retail','Retail'],['repair','Repair'],['follow_up','Follow Up']];
  for (var i = 0; i < tabs.length; i++) {
    var t = tabs[i];
    var active = _jobsFilter === t[0];
    html += '<button onclick="_jobsFilter=\'' + t[0] + '\';renderJobsList()" style="flex-shrink:0;padding:6px 14px;border-radius:20px;border:1px solid ' + (active?'var(--navy)':'var(--border)') + ';background:' + (active?'var(--navy)':'var(--white)') + ';color:' + (active?'#fff':'var(--gray)') + ';font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">' + t[1] + '</button>';
  }
  html += '</div>';

  if (!jobs.length) {
    html += '<div style="padding:40px;text-align:center;color:var(--gray)">No jobs match this filter</div>';
    html += '</div>';
    el.innerHTML = html;
    return;
  }

  if (_jobsView === 'board') {
    html += renderBoardView(jobs);
  } else {
    html += renderListView(jobs);
  }

  html += '</div>';
  el.innerHTML = html;
  attachSwipeListeners();
}

// ─── List view: grouped by stage ──────────────────────────────────────────
function renderListView(jobs) {
  // Group by stage, in pipeline order
  const stageOrder = JOB_STAGES.map(s => s.key);
  const grouped = {};
  for (const s of stageOrder) grouped[s] = [];
  for (const j of jobs) {
    const s = j.stage || 'new_lead';
    if (!grouped[s]) grouped[s] = [];
    grouped[s].push(j);
  }

  let html = '';
  for (const s of stageOrder) {
    const group = grouped[s];
    if (!group.length) continue;
    const sc = stageColor(s);
    html += '<div style="margin-bottom:20px">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
    html += '<div style="width:10px;height:10px;border-radius:50%;background:' + sc + ';flex-shrink:0"></div>';
    html += '<span style="font-size:12px;font-weight:700;color:' + stageColor(s) + ';text-transform:uppercase;letter-spacing:0.5px">' + stageLabel(s) + '</span>';
    html += '<span style="font-size:11px;color:var(--gray);background:var(--bg);padding:1px 7px;border-radius:10px">' + group.length + '</span>';
    html += '</div>';
    for (const job of group) {
      html += renderJobCard(job, true);
    }
    html += '</div>';
  }
  return html;
}

// ─── Board view: kanban columns ────────────────────────────────────────────
function renderBoardView(jobs) {
  // Show active stages only (exclude lost unless there are lost jobs)
  const activeStages = JOB_STAGES.filter(s => {
    if (s.key === 'lost') return jobs.some(j => j.stage === 'lost');
    return true;
  });

  let html = '<div style="display:flex;gap:10px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:12px;scrollbar-width:thin">';
  for (const s of activeStages) {
    const group = jobs.filter(j => (j.stage || 'new_lead') === s.key);
    html += '<div style="flex-shrink:0;width:200px">';
    html += '<div style="background:' + s.color + ';color:#fff;padding:6px 10px;border-radius:8px 8px 0 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;display:flex;justify-content:space-between">';
    html += '<span>' + s.label + '</span><span>' + group.length + '</span></div>';
    html += '<div style="background:var(--bg);border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;min-height:80px;padding:6px">';
    if (!group.length) {
      html += '<div style="font-size:11px;color:var(--gray);text-align:center;padding:12px 0">Empty</div>';
    }
    for (const job of group) {
      html += renderJobCard(job, false);
    }
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

// ─── Single job card ───────────────────────────────────────────────────────
function renderJobCard(job, showSwipeHint) {
  const sc = stageColor(job.stage);
  const isFollowUp = job.stage === 'follow_up' || job.subStatus === 'follow_up';
  const isLost = job.stage === 'lost';
  const cardOpacity = isLost ? 'opacity:0.6;' : '';

  let html = '<div class="job-card" data-id="' + job.id + '" onclick="openJobDetail(\'' + job.id + '\')" '
    + 'style="' + cardOpacity + 'position:relative;background:var(--white);border-radius:10px;'
    + 'box-shadow:0 2px 8px rgba(0,0,0,0.18);padding:12px 14px;margin-bottom:8px;cursor:pointer;'
    + 'border-left:4px solid ' + sc + ';overflow:hidden;touch-action:pan-y;user-select:none">';

  // Swipe action labels (hidden behind card)
  html += '<div class="swipe-left-hint" style="position:absolute;right:0;top:0;bottom:0;width:70px;background:#0EA5E9;display:flex;align-items:center;justify-content:center;border-radius:0 10px 10px 0;opacity:0;transition:opacity 0.2s;pointer-events:none">'
    + '<span style="color:#fff;font-size:11px;font-weight:700;text-align:center">Follow<br>Up</span></div>';
  html += '<div class="swipe-right-hint" style="position:absolute;left:0;top:0;bottom:0;width:70px;background:#10B981;display:flex;align-items:center;justify-content:center;border-radius:10px 0 0 10px;opacity:0;transition:opacity 0.2s;pointer-events:none">'
    + '<span style="color:#fff;font-size:11px;font-weight:700;text-align:center">Move<br>Stage</span></div>';

  // Card content
  html += '<div class="job-card-inner" style="position:relative;z-index:1">';
  // Row 1: name + pipeline
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">';
  html += '<span style="font-size:15px;font-weight:800;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;margin-right:6px">' + (job.homeownerName || 'Unknown') + '</span>';
  html += pipelineBadge(job.pipeline);
  html += '</div>';
  // Row 2: address
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (job.address || '') + '</div>';
  // Row 3: meta
  html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:11px;color:var(--gray)">';
  if (job.carrier) html += '<span>' + job.carrier + '</span>';
  if (job.overdueTasks > 0) html += '<span style="background:#DC2626;color:#fff;padding:1px 6px;border-radius:8px;font-weight:600">' + job.overdueTasks + ' overdue</span>';
  else if (job.openTasks > 0) html += '<span style="color:var(--teal);font-weight:600">' + job.openTasks + ' tasks</span>';
  if (job.noteCount) html += '<span>' + job.noteCount + ' notes</span>';
  if (job.lastActivity) html += '<span style="margin-left:auto">' + timeAgo(job.lastActivity) + '</span>';
  html += '</div>';
  html += '</div></div>';
  return html;
}

// ─── Swipe gestures ────────────────────────────────────────────────────────
function attachSwipeListeners() {
  document.querySelectorAll('.job-card').forEach(function(card) {
    card.addEventListener('touchstart', function(e) {
      _swipeStart = e.touches[0].clientX;
      _swipeEl = card;
    }, { passive: true });
    card.addEventListener('touchmove', function(e) {
      if (!_swipeStart || _swipeEl !== card) return;
      var dx = e.touches[0].clientX - _swipeStart;
      var inner = card.querySelector('.job-card-inner');
      var leftHint = card.querySelector('.swipe-right-hint');
      var rightHint = card.querySelector('.swipe-left-hint');
      if (Math.abs(dx) < 10) return;
      if (inner) inner.style.transform = 'translateX(' + Math.max(-70, Math.min(70, dx)) + 'px)';
      if (dx < -20 && rightHint) rightHint.style.opacity = Math.min(1, Math.abs(dx) / 70);
      if (dx > 20 && leftHint) leftHint.style.opacity = Math.min(1, dx / 70);
    }, { passive: true });
    card.addEventListener('touchend', function(e) {
      if (!_swipeStart || _swipeEl !== card) return;
      var dx = e.changedTouches[0].clientX - _swipeStart;
      var inner = card.querySelector('.job-card-inner');
      var leftHint = card.querySelector('.swipe-right-hint');
      var rightHint = card.querySelector('.swipe-left-hint');
      if (inner) inner.style.transform = '';
      if (leftHint) leftHint.style.opacity = 0;
      if (rightHint) rightHint.style.opacity = 0;
      var jobId = card.dataset.id;
      if (dx < -60) {
        // Swipe left = Follow Up
        e.preventDefault();
        updateJobField(jobId, { stage: 'follow_up' }, 'Moved to Follow Up');
      } else if (dx > 60) {
        // Swipe right = advance stage picker
        e.preventDefault();
        openStagePickerForJob(jobId);
      }
      _swipeStart = null;
      _swipeEl = null;
    }, { passive: false });
  });
}

// ─── Stage picker (swipe right action) ────────────────────────────────────
function openStagePickerForJob(jobId) {
  var job = _jobsCache.find(j => j.id === jobId);
  if (!job) return;
  showActionSheet('Move Stage', JOB_STAGES.filter(s => s.key !== 'follow_up' && s.key !== 'lost').map(s => ({
    label: s.label, color: s.color,
    action: function() { updateJobField(jobId, { stage: s.key }, 'Stage: ' + s.label); }
  })));
}

// ─── Lightweight action sheet ──────────────────────────────────────────────
// Two prior bugs:
//   1. Text used color:var(--navy) inside an inline style. The modal body is
//      hardcoded white in both themes, so token resolution wasn't reliable on
//      every device — labels disappeared next to the dots on iPhone. Fixed by
//      hardcoding #0D0D0D / #FFFFFF on the modal so this is theme-independent.
//   2. The onclick wrapped opt.action.toString() and re-eval'd it. That loses
//      every closure variable (jobId, s) so clicking a stage did nothing. Fixed
//      by keeping the callbacks in a real array and calling by index.
window._actionSheetCallbacks = [];
function showActionSheet(title, options) {
  var existing = document.getElementById('_action_sheet');
  if (existing) existing.remove();
  window._actionSheetCallbacks = options.map(function (o) { return o.action; });

  var sheet = document.createElement('div');
  sheet.id = '_action_sheet';
  sheet.style.cssText = 'position:fixed;inset:0;z-index:500;display:flex;flex-direction:column;justify-content:flex-end';

  var backdrop = '<div onclick="closeActionSheet()" style="flex:1;background:rgba(0,0,0,0.4)"></div>';
  // Modal stays white in both themes (overlays are mode-independent).
  // Text hardcoded near-black so there's no CSS-variable lookup involved.
  var body = '<div style="background:#FFFFFF;border-radius:16px 16px 0 0;padding:16px 0 calc(16px + env(safe-area-inset-bottom));max-height:75vh;overflow-y:auto">';
  body += '<div style="font-size:13px;font-weight:700;color:#6B7280;text-align:center;padding:0 16px 12px;text-transform:uppercase;letter-spacing:0.5px">' + title + '</div>';

  for (var i = 0; i < options.length; i++) {
    var opt = options[i];
    var dot = opt.color
      ? '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + opt.color + ';margin-right:12px;vertical-align:middle;flex-shrink:0"></span>'
      : '';
    body += '<button onclick="runActionSheet(' + i + ')" '
         +  'style="width:100%;padding:14px 20px;text-align:left;background:#FFFFFF;border:none;border-top:1px solid #E5E7EB;font-size:15px;font-weight:600;cursor:pointer;color:#0D0D0D;display:flex;align-items:center;min-height:48px">'
         +  dot + '<span>' + opt.label + '</span></button>';
  }
  body += '<button onclick="closeActionSheet()" style="width:100%;padding:14px 20px;text-align:center;background:#FFFFFF;border:none;border-top:1px solid #E5E7EB;font-size:15px;font-weight:600;cursor:pointer;color:#6B7280;margin-top:4px">Cancel</button>';
  body += '</div>';

  sheet.innerHTML = backdrop + body;
  document.body.appendChild(sheet);
}
function runActionSheet(i) {
  var fn = (window._actionSheetCallbacks || [])[i];
  closeActionSheet();
  if (typeof fn === 'function') fn();
}
function closeActionSheet() {
  var el = document.getElementById('_action_sheet');
  if (el) el.remove();
  window._actionSheetCallbacks = [];
}

// ─── Update job field ──────────────────────────────────────────────────────
async function updateJobField(jobId, fields, successMsg) {
  try {
    const r = await fetch('/api/field/jobs/' + jobId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields)
    });
    if (!r.ok) throw new Error('Update failed');
    // Update cache
    var cached = _jobsCache.find(j => j.id === jobId);
    if (cached) Object.assign(cached, fields);
    renderJobsList();
    // Toast
    showToast(successMsg || 'Updated');
  } catch (e) {
    showToast('Error: ' + e.message, true);
  }
}

function showToast(msg, isError) {
  var t = document.getElementById('_toast');
  if (t) t.remove();
  t = document.createElement('div');
  t.id = '_toast';
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:600;background:' + (isError?'#DC2626':'var(--navy)') + ';color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:600;pointer-events:none;white-space:nowrap';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { if (t.parentNode) t.remove(); }, 2500);
}

// ─── Job Detail ────────────────────────────────────────────────────────────
let _currentJobDetail = null;

// Toggle photo section expand/collapse in job detail
function toggleJobPhotos(jobId) {
  window._jobPhotosExpanded = window._jobPhotosExpanded || {};
  var current = window._jobPhotosExpanded[jobId];
  // Default is expanded (true), toggle to false and back
  window._jobPhotosExpanded[jobId] = current === false ? true : false;
  openJobDetail(jobId);
}

function toggleJobInfo(jobId) {
  window._jobInfoExpanded = window._jobInfoExpanded || {};
  window._jobInfoExpanded[jobId] = (window._jobInfoExpanded[jobId] === false) ? true : false;
  openJobDetail(jobId);
}

async function saveJobInfo(jobId) {
  var btn = document.querySelector('button[onclick*="saveJobInfo"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  var patch = {
    carrier:       document.getElementById('ji-carrier')?.value?.trim() || '',
    claimNumber:   document.getElementById('ji-claim')?.value?.trim() || '',
    adjusterName:  document.getElementById('ji-adjname')?.value?.trim() || '',
    adjusterPhone: document.getElementById('ji-adjphone')?.value?.trim() || '',
    adjusterEmail: document.getElementById('ji-adjemail')?.value?.trim() || '',
    adjusterDate:  document.getElementById('ji-adjdate')?.value || '',
  };
  try {
    await fetch('/api/field/jobs/' + jobId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    showToast('Job info saved');
    openJobDetail(jobId);
  } catch (e) {
    showToast('Save failed: ' + e.message, true);
    if (btn) { btn.disabled = false; btn.textContent = 'Save Job Info'; }
  }
}

// Navigate to My Jobs view then open a specific job — used by lead confirm "View Job" button
async function loadAndOpenJob(jobId) {
  switchView('jobs');
  await loadJobs();
  setTimeout(() => openJobDetail(jobId), 300);
}

async function openJobDetail(jobId) {
  var detail = document.getElementById('job-detail');
  var list = document.getElementById('view-jobs');
  detail.classList.add('open');
  detail.scrollTop = 0;
  list.style.display = 'none';
  detail.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gray)">Loading...</div>';
  try {
    var job = await fetch('/api/field/jobs/' + jobId).then(function(r) { if (!r.ok) throw new Error('Failed'); return r.json(); });
    _currentJobDetail = job;
    renderJobDetail(job);
  } catch (e) {
    detail.innerHTML = '<div style="padding:40px;text-align:center"><p style="color:var(--gray)">' + e.message + '</p>'
      + '<button onclick="closeJobDetail()" style="margin-top:12px;padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:var(--white);cursor:pointer">Back</button></div>';
  }
}

function renderJobDetail(job) {
  var detail = document.getElementById('job-detail');
  var sc = stageColor(job.stage || 'new_lead');
  var phone = job.homeowner?.phone || job.phone || '';
  var name = job.homeownerName || ((job.homeowner?.firstName||'') + ' ' + (job.homeowner?.lastName||'')).trim() || 'Unknown';
  var jid = job.id;

  var html = '<div style="padding:16px;max-width:540px;margin:0 auto">';

  // ── Header ──
  // Hardcoded near-black + true navy on the breadcrumb + h2 so the page is
  // readable in light mode regardless of CSS-variable cascade quirks. The
  // address line stays muted (steel mid) — readable but visually secondary.
  html += '<div style="margin-bottom:16px">';
  html += '<button onclick="closeJobDetail()" style="background:none;border:none;color:#001A4D;font-size:14px;font-weight:700;cursor:pointer;padding:0;margin-bottom:10px;display:inline-flex;align-items:center;gap:4px">&larr; <u>My Jobs</u></button>';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start">';
  html += '<div style="flex:1;min-width:0">';
  html += '<h2 style="font-size:20px;font-weight:700;color:#0D0D0D;margin:0 0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + name + '</h2>';
  html += '<div style="font-size:13px;color:#6B7280;margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (job.address||'') + '</div>';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
  html += pipelineBadge(job.pipeline || job.jobCategory || 'insurance');
  html += ' <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:' + sc + ';color:#fff;font-weight:600">' + stageLabel(job.stage) + '</span>';
  html += '</div></div>';
  // Action menu button
  html += '<button onclick="openJobActionMenu(\'' + jid + '\')" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:18px;cursor:pointer;flex-shrink:0;margin-left:8px;line-height:1">&#8943;</button>';
  html += '</div></div>';

  // ── Contact actions (phone / text / portal / camera) ──
  html += '<div style="display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:12px;padding-bottom:4px">';
  if (phone) {
    html += '<a href="tel:' + phone + '" style="text-decoration:none;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0">'
      + '<span style="font-size:20px">&#128222;</span><span style="font-size:11px;color:var(--gray)">Call</span></a>';
    html += '<a href="sms:' + phone + '" style="text-decoration:none;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0">'
      + '<span style="font-size:20px">&#128172;</span><span style="font-size:11px;color:var(--gray)">Text</span></a>';
  }
  html += '<a href="https://crc-supplements-portal.onrender.com/#job-' + jid + '" target="_blank" style="text-decoration:none;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0">'
    + '<span style="font-size:20px">&#128187;</span><span style="font-size:11px;color:var(--gray)">Portal</span></a>';
  html += '<button onclick="jobTakePhoto(\'' + jid + '\')" style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0;cursor:pointer"><span style="font-size:20px">&#128247;</span><span style="font-size:11px;color:var(--gray)">Camera</span></button>';
  var hoverAddr = encodeURIComponent(job.address || '');
  var hoverName = encodeURIComponent(name || '');
  html += '<a href="https://app.hover.to/new?address=' + hoverAddr + '&name=' + hoverName + '" target="_blank" style="text-decoration:none;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0"><span style="font-size:20px">&#128016;</span><span style="font-size:11px;color:var(--gray)">Hover</span></a>';
  html += '</div>';

  // ── Workflow action row (Section 8) ──
  // Five steps shown as chips with status. Photo count uses the same
  // aggregator as the grid so it stays in sync.
  var wfPhotos = collectJobPhotos(job);
  var _sigAddr = (job.address || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var _sigName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var signed = !!(job.authorizations && job.authorizations.claim && job.authorizations.claim.signed) || !!(job.selections && job.selections.authorized);
  var squares = job.measurements && job.measurements.measurements && job.measurements.measurements.totalSquares;
  var claimReady = !!job.claimFilingReady;
  var claimSent = (job.uploadedDocs || []).some(function(d){ return d.docType === 'claim-filing-package'; });
  var photoReportBuilt = (job.uploadedDocs || []).some(function(d){ return d.docType === 'photo-inspection-report'; });

  html += '<div style="display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:16px;padding-bottom:4px">';
  html += _workflowChip('&#128221;', 'Authorization',
    signed ? '&#10003; Signed' : 'Not signed',
    signed ? '#16A34A' : '#94A3B8',
    'openSignatureScreen(\'' + jid + '\',\'' + _sigAddr + '\',\'' + _sigName + '\')');
  html += _workflowChip('&#127968;', 'Roof Overview',
    squares ? '&#10003; ' + squares + ' SQ' : 'Open',
    squares ? '#16A34A' : '#00B5CC',
    'runFieldMeasure(\'' + (job.address || '').replace(/\'/g,"\\'") + '\',\'' + jid + '\')');
  // Photos workflow chip removed — photos section below + camera button above handle this
  html += _workflowChip('&#128220;', 'Photo Report',
    photoReportBuilt ? '&#10003; Built' : (wfPhotos.length ? 'Build' : 'No photos yet'),
    photoReportBuilt ? '#16A34A' : '#94A3B8',
    wfPhotos.length ? ('openPhotoInspectionReport(\'' + jid + '\')') : '');
  var claimLabel = claimSent ? '&#10003; Sent' : (claimReady ? 'Build' : 'Mark ready');
  var claimColor = claimSent ? '#16A34A' : (claimReady ? '#F59E0B' : '#94A3B8');
  html += _workflowChip('&#128203;', 'File Claim',
    claimLabel, claimColor,
    claimReady ? ('openClaimFilingPackage(\'' + jid + '\')') : ('toggleClaimReady(\'' + jid + '\')'));
  html += '</div>';

  // ── Move Stage + Transfer + Mark buttons ──
  // Hardcoded teal/navy backgrounds + literal white text so the buttons render
  // correctly in both modes even if a CSS variable somewhere fails to resolve.
  html += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">';
  html += '<button onclick="openStagePickerInDetail(\'' + jid + '\')" style="flex:1;padding:11px;background:#00B5CC;color:#FFFFFF;border:none;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:0.04em;cursor:pointer;min-width:100px;min-height:44px">Move Stage</button>';
  html += '<button onclick="openPipelineTransfer(\'' + jid + '\')" style="flex:1;padding:11px;background:#1e3a6e;color:#FFFFFF;border:1.5px solid #4a6fa5;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:0.04em;cursor:pointer;min-width:100px;min-height:44px">Transfer Type</button>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-bottom:16px">';
  html += '<button onclick="markJobFollowUp(\'' + jid + '\')" style="flex:1;padding:9px;background:#0EA5E9;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Follow Up</button>';
  html += '<button onclick="markJobLost(\'' + jid + '\')" style="flex:1;padding:9px;background:none;color:#DC2626;border:1px solid #DC2626;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Mark Lost</button>';
  html += '</div>';
  html += '<button onclick="openFieldObs(\'' + jid + '\', _currentJobDetail && _currentJobDetail.fieldNotes)" '
    + 'style="width:100%;padding:9px;background:#10B981;color:#fff;border:none;border-radius:8px;'
    + 'font-size:13px;font-weight:600;cursor:pointer;margin-bottom:16px">'
    + '&#128203; Fill Field Observations</button>';

  // Roof diagram is now rendered inside the CRC Measure bottom sheet — removed
  // the standalone Job Detail section 2026-04 to avoid duplicate surfaces.

  // ── Job Info (collapsible) ──
  var jobInfoExpanded = (window._jobInfoExpanded || {})[jid] !== false;
  html += '<div style="background:var(--white);border-radius:10px;border:1px solid var(--border);padding:14px;margin-bottom:16px">';
  html += '<button onclick="toggleJobInfo(\'' + jid + '\')" style="display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:none;cursor:pointer;padding:0;margin-bottom:' + (jobInfoExpanded ? '12' : '0') + 'px">';
  html += '<span style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.5px">Job Info</span>';
  html += '<span style="font-size:14px;color:var(--gray)">' + (jobInfoExpanded ? '▲' : '▼') + '</span></button>';
  if (jobInfoExpanded) {
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">';
    html += '<div><label style="font-size:11px;font-weight:700;color:var(--gray);display:block;margin-bottom:3px">CARRIER</label>'
      + '<input type="text" id="ji-carrier" value="' + (job.carrier||'') + '" placeholder="e.g. State Farm" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box"></div>';
    html += '<div><label style="font-size:11px;font-weight:700;color:var(--gray);display:block;margin-bottom:3px">CLAIM #</label>'
      + '<input type="text" id="ji-claim" value="' + (job.claimNumber||'') + '" placeholder="Claim number" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box"></div>';
    html += '<div><label style="font-size:11px;font-weight:700;color:var(--gray);display:block;margin-bottom:3px">ADJUSTER NAME</label>'
      + '<input type="text" id="ji-adjname" value="' + (job.adjusterName||'') + '" placeholder="Adjuster name" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box"></div>';
    html += '<div><label style="font-size:11px;font-weight:700;color:var(--gray);display:block;margin-bottom:3px">ADJUSTER PHONE</label>'
      + '<input type="tel" id="ji-adjphone" value="' + (job.adjusterPhone||'') + '" placeholder="Phone" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box"></div>';
    html += '<div><label style="font-size:11px;font-weight:700;color:var(--gray);display:block;margin-bottom:3px">ADJUSTER EMAIL</label>'
      + '<input type="email" id="ji-adjemail" value="' + (job.adjusterEmail||'') + '" placeholder="Email" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box"></div>';
    html += '<div><label style="font-size:11px;font-weight:700;color:var(--gray);display:block;margin-bottom:3px">ADJUSTER MEETING</label>'
      + '<input type="date" id="ji-adjdate" value="' + (job.adjusterDate ? job.adjusterDate.split("T")[0] : '') + '" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box"></div>';
    html += '</div>';
    html += '<button onclick="saveJobInfo(\'' + jid + '\')" style="width:100%;padding:9px;background:var(--teal);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Save Job Info</button>';
    html += '<div style="font-size:11px;color:var(--gray);margin-top:6px">Created: ' + (job.created_at ? new Date(job.created_at).toLocaleDateString() : '—') + '</div>';
  }
  html += '</div>';

  // ── Notes ──
  html += '<div style="background:var(--white);border-radius:10px;border:1px solid var(--border);padding:14px;margin-bottom:16px">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Notes</div>';
  html += '<div id="job-notes-list">' + renderJobNotes(job.jobNotes||[]) + '</div>';
  html += '<div style="margin-top:10px">';
  html += '<textarea id="job-note-input" placeholder="Add a note..." rows="2" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;resize:none;box-sizing:border-box"></textarea>';
  html += '<button onclick="addJobNote(\'' + jid + '\')" style="margin-top:6px;background:var(--teal);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;width:100%">Add Note</button>';
  html += '</div></div>';

  // ── Tasks ──
  html += '<div style="background:var(--white);border-radius:10px;border:1px solid var(--border);padding:14px;margin-bottom:16px">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Tasks</div>';
  html += '<div id="job-tasks-list">' + renderJobTasks(job.tasks||[], jid) + '</div>';
  html += '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">';
  html += '<input type="text" id="job-task-input" placeholder="New task..." style="flex:1;min-width:120px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px">';
  html += '<input type="date" id="job-task-date" style="padding:8px;border:1px solid var(--border);border-radius:8px;font-size:13px">';
  html += '<button onclick="addJobTask(\'' + jid + '\')" style="background:var(--navy);color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">Add</button>';
  html += '</div></div>';

  // ── Photos ──
  // Aggregate from all three portal sources: rawPhotos (CompanyCam sync),
  // simplePhotos (direct uploads via field app + portal), fieldPhotos (legacy).
  // De-dupe by URL so a photo present in more than one bucket only renders
  // once.
  var allPhotos = collectJobPhotos(job);
  var photosExpanded = (window._jobPhotosExpanded || {})[jid] !== false; // default expanded
  html += '<div style="background:var(--white);border-radius:10px;border:1px solid var(--border);padding:14px;margin-bottom:16px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;' + (photosExpanded && allPhotos.length ? 'margin-bottom:10px' : '') + '">';
  html += '<button onclick="toggleJobPhotos(\'' + jid + '\')" style="display:flex;align-items:center;gap:6px;background:none;border:none;cursor:pointer;padding:0">'
    + '<span style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.5px">Photos</span>'
    + '<span style="background:var(--teal);color:#fff;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700">' + allPhotos.length + '</span>'
    + '<span style="font-size:14px;color:var(--gray);margin-left:2px">' + (photosExpanded ? '▲' : '▼') + '</span>'
    + '</button>';
  html += '<button onclick="jobTakePhoto(\'' + jid + '\')" style="background:var(--teal);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">+ Add Photo</button>';
  html += '</div>';
  if (photosExpanded) {
    if (allPhotos.length === 0) {
      html += '<div style="text-align:center;padding:20px;color:var(--gray);font-size:13px">No photos yet. Tap camera above or Add Photo to start.</div>';
    } else {
      window._jobPhotosById = window._jobPhotosById || {};
      window._jobPhotosById[jid] = allPhotos;
      html += '<div class="job-photo-grid">';
      allPhotos.slice(0, 18).forEach(function(p, i) {
        var url = p.thumbnail || p.url || '';
        var caption = p.caption || p.tag || '';
        if (!url) return;
        html += '<div class="job-photo-cell" onclick="openJobPhotoLightboxFor(\'' + jid + '\',' + i + ')">'
          + '<img src="' + url + '" loading="lazy" onerror="this.parentElement.classList.add(\'job-photo-bad\');this.src=\'\';this.style.display=\'none\'" alt="Photo ' + (i+1) + '">'
          + '<span class="job-photo-bad-label">Photo unavailable</span>'
          + (caption ? '<div class="job-photo-caption">' + caption + '</div>' : '')
          + '</div>';
      });
      if (allPhotos.length > 18) {
        html += '<div class="job-photo-cell job-photo-more" onclick="openJobPhotoLightboxFor(\'' + jid + '\',18)">+' + (allPhotos.length - 18) + '<div style="font-size:10px;font-weight:400;margin-top:2px">more</div></div>';
      }
      html += '</div>';
    }
  }
  html += '</div>';

  html += '<button onclick="closeJobDetail()" style="width:100%;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:14px;cursor:pointer;margin-bottom:20px">Back to My Jobs</button>';
  html += '</div>';
  detail.innerHTML = html;
}

// ─── In-detail stage / pipeline pickers ────────────────────────────────────
function openStagePickerInDetail(jobId) {
  showActionSheet('Move to Stage', JOB_STAGES.map(s => ({
    label: s.label, color: s.color,
    action: function() {
      updateJobField(jobId, { stage: s.key }, 'Stage: ' + s.label);
      // Refresh detail header without full reload
      setTimeout(function() { openJobDetail(jobId); }, 400);
    }
  })));
}

function openPipelineTransfer(jobId) {
  var pipelines = [
    { key: 'insurance', label: 'Insurance', color: '#00B5CC' },
    { key: 'retail',    label: 'Retail',    color: '#001A4D' },
    { key: 'repair',    label: 'Repair',    color: '#6B7280' },
  ];
  showActionSheet('Transfer Job Type', pipelines.map(p => ({
    label: p.label, color: p.color,
    action: function() {
      updateJobField(jobId, { pipeline: p.key }, 'Transferred to ' + p.label);
      setTimeout(function() { openJobDetail(jobId); }, 400);
    }
  })));
}

function markJobFollowUp(jobId) {
  updateJobField(jobId, { stage: 'follow_up' }, 'Moved to Follow Up');
  setTimeout(function() { openJobDetail(jobId); }, 400);
}

function markJobLost(jobId) {
  showActionSheet('Mark as Lost', [{
    label: 'Confirm — Mark Lost', color: '#DC2626',
    action: function() {
      updateJobField(jobId, { stage: 'lost' }, 'Marked as Lost');
      setTimeout(function() { closeJobDetail(); }, 600);
    }
  }]);
}

function openJobActionMenu(jobId) {
  showActionSheet('Job Actions', [
    { label: 'Move Stage',    color: '#00B5CC', action: function() { openStagePickerInDetail(jobId); } },
    { label: 'Transfer Type', color: '#001A4D', action: function() { openPipelineTransfer(jobId); } },
    { label: 'Follow Up',     color: '#0EA5E9', action: function() { markJobFollowUp(jobId); } },
    { label: 'Mark Lost',     color: '#DC2626', action: function() { markJobLost(jobId); } },
  ]);
}

// ─── Notes / Tasks renderers ───────────────────────────────────────────────
function renderJobNotes(notes) {
  if (!notes.length) return '<div style="font-size:13px;color:var(--gray);padding:4px 0">No notes yet</div>';
  return notes.slice().reverse().map(function(n) {
    return '<div style="padding:8px 0;border-bottom:1px solid var(--bg)">'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray);margin-bottom:2px">'
      + '<span style="font-weight:600">' + (n.repName||n.repCode||'System') + '</span>'
      + '<span>' + timeAgo(n.createdAt||n.timestamp) + '</span></div>'
      + '<div style="font-size:13px;color:var(--navy)">' + (n.text||'') + '</div></div>';
  }).join('');
}

function renderJobTasks(tasks, jobId) {
  if (!tasks.length) return '<div style="font-size:13px;color:var(--gray);padding:4px 0">No tasks</div>';
  var open = tasks.filter(t => !t.completed);
  var done = tasks.filter(t => t.completed);
  return open.concat(done).map(function(t) {
    var overdue = !t.completed && t.dueDate && new Date(t.dueDate) < new Date();
    return '<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--bg)">'
      + '<input type="checkbox" ' + (t.completed?'checked':'') + ' onchange="toggleJobTask(\'' + jobId + '\',\'' + (t.id||t._id) + '\',this.checked)" style="margin-top:2px;width:18px;height:18px;accent-color:var(--teal)">'
      + '<div style="flex:1;' + (t.completed?'text-decoration:line-through;color:var(--gray)':'') + '">'
      + '<div style="font-size:13px">' + (t.text||'') + '</div>'
      + (t.dueDate ? '<div style="font-size:11px;color:' + (overdue?'#DC2626;font-weight:600':'var(--gray)') + '">' + (overdue?'Overdue - ':'Due ') + new Date(t.dueDate).toLocaleDateString() + '</div>' : '')
      + '</div></div>';
  }).join('');
}

// Workflow chip (Section 8) — icon + title + status line.
function _workflowChip(icon, title, status, statusColor, onclick) {
  var click = onclick ? (' onclick="' + onclick + '"') : '';
  var cursor = onclick ? 'cursor:pointer' : 'cursor:default;opacity:0.7';
  return '<button type="button"' + click + ' style="' + cursor + ';background:var(--white);border:1px solid var(--border);border-radius:10px;padding:9px 12px;display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:112px;flex-shrink:0;text-align:left">'
    + '<div style="display:flex;align-items:center;gap:6px"><span style="font-size:16px">' + icon + '</span>'
    + '<span style="font-size:11px;font-weight:700;color:var(--navy);letter-spacing:0.3px;text-transform:uppercase">' + title + '</span></div>'
    + '<div style="font-size:11px;font-weight:700;color:' + statusColor + '">' + status + '</div>'
    + '</button>';
}

// Toggle "Ready to File" — flips the flag then reopens job detail so the
// File Claim chip offers Build instead of Mark ready.
async function toggleClaimReady(jobId) {
  try {
    var r = await fetch('/api/field/jobs/' + jobId, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimFilingReady: true })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    showToast('Ready to file — tap "Build" to assemble the package');
    openJobDetail(jobId);
  } catch (e) { showToast('Error: ' + e.message, true); }
}

// Collect every photo attached to a portal job, de-duplicated by URL.
// Sources: job.photos.rawPhotos (CompanyCam), job.simplePhotos (direct
// uploads), job.fieldPhotos (legacy field app). Each normalized to { url,
// thumbnail, caption, label, tag, id, createdAt, source }.
function collectJobPhotos(job) {
  var out = [];
  var seen = Object.create(null);
  function push(p, source) {
    if (!p) return;
    var url = p.url || p.thumbnail || '';
    if (!url || seen[url]) return;
    seen[url] = true;
    out.push({
      url: url,
      thumbnail: p.thumbnail || p.url || '',
      caption: p.caption || p.label || '',
      label: p.label || p.caption || '',
      tag: (Array.isArray(p.tags) ? p.tags[0] : p.tag) || '',
      id: p.id || p._id || '',
      createdAt: p.created_at || p.createdAt || p.takenAt || null,
      source: source,
    });
  }
  ((job && job.photos && job.photos.rawPhotos) || []).forEach(function(p){ push(p,'companycam'); });
  (job && job.simplePhotos || []).forEach(function(p){ push(p,'simple'); });
  (job && job.fieldPhotos || []).forEach(function(p){ push(p,'field'); });
  return out;
}

// ── Job Photo Lightbox ──────────────────────────────────────────────────────
var _jobPhotoFull = [];
var _jobPhotoIdx = 0;
var _jobPhotoJobId = null;
var _jobPhotoZoom = 1;

function openJobPhotoLightbox(idx, jobId) {
  _jobPhotoIdx = idx;
  _jobPhotoZoom = 1;
  _jobPhotoJobId = jobId || (_currentJobDetail && _currentJobDetail.id) || null;
  var existing = document.getElementById('job-photo-lightbox');
  if (existing) existing.remove();

  var lb = document.createElement('div');
  lb.id = 'job-photo-lightbox';
  lb.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;user-select:none';
  document.body.appendChild(lb);
  _renderJobLightbox();

  // Swipe navigation
  var startX = null, startY = null;
  lb.addEventListener('touchstart', function(e) { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener('touchend', function(e) {
    if (startX == null) return;
    var dx = e.changedTouches[0].clientX - startX;
    var dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) jobLightboxNext(); else jobLightboxPrev();
    }
    startX = null; startY = null;
  });
  // Keyboard arrow nav
  lb._keyHandler = function(e) {
    if (e.key === 'ArrowRight') jobLightboxNext();
    else if (e.key === 'ArrowLeft') jobLightboxPrev();
    else if (e.key === 'Escape') closeJobLightbox();
  };
  document.addEventListener('keydown', lb._keyHandler);
}

function _renderJobLightbox() {
  var lb = document.getElementById('job-photo-lightbox');
  if (!lb) return;
  var photos = _jobPhotoFull;
  var p = photos[_jobPhotoIdx] || {};
  var url = p.url || p.thumbnail || '';
  var caption = p.caption || p.label || p.tag || '';
  var total = photos.length;
  var date = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '';
  var zoomed = _jobPhotoZoom > 1;

  lb.innerHTML = ''
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;flex-shrink:0;background:rgba(0,0,0,0.5)">'
    + '<button onclick="closeJobLightbox()" style="background:none;border:none;color:#fff;font-size:28px;cursor:pointer;line-height:1">&times;</button>'
    + '<span style="color:#fff;font-size:13px;font-weight:600">' + (_jobPhotoIdx + 1) + ' of ' + total + (date ? ' · ' + date : '') + '</span>'
    + '<div style="display:flex;gap:10px;align-items:center">'
    + '<button onclick="toggleJobPhotoZoom()" title="Zoom" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1">' + (zoomed ? '&#128270;' : '&#128269;') + '</button>'
    + '<a href="' + url + '" download target="_blank" style="color:#00B5CC;font-size:12px;font-weight:600;text-decoration:none">Save</a>'
    + '</div>'
    + '</div>'
    + '<div id="job-lightbox-stage" style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:' + (zoomed ? 'auto' : 'hidden') + '" ondblclick="toggleJobPhotoZoom()">'
    + '<img src="' + url + '" ondblclick="event.stopPropagation();toggleJobPhotoZoom()" style="max-width:100%;max-height:100%;object-fit:contain;transform:scale(' + _jobPhotoZoom + ');transform-origin:center center;transition:transform .2s ease;cursor:' + (zoomed ? 'zoom-out' : 'zoom-in') + '" onerror="this.alt=\'Photo unavailable\';this.style.opacity=0.35">'
    + (_jobPhotoIdx > 0 ? '<button onclick="jobLightboxPrev()" style="position:absolute;left:0;top:0;bottom:0;width:60px;background:none;border:none;color:rgba(255,255,255,0.7);font-size:36px;cursor:pointer">&#8249;</button>' : '')
    + (_jobPhotoIdx < total - 1 ? '<button onclick="jobLightboxNext()" style="position:absolute;right:0;top:0;bottom:0;width:60px;background:none;border:none;color:rgba(255,255,255,0.7);font-size:36px;cursor:pointer">&#8250;</button>' : '')
    + '</div>'
    + '<div style="padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(0,0,0,0.5);flex-shrink:0">'
    + '<div style="color:#ccc;font-size:12px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (caption || '') + '</div>'
    + '<button onclick="deleteJobPhoto()" style="background:none;border:1px solid rgba(255,255,255,0.25);color:#FCA5A5;font-size:12px;padding:6px 12px;border-radius:6px;cursor:pointer">Delete</button>'
    + '</div>';
}

// Open the lightbox using the pre-collected photo list for a job. Keeps
// per-cell onclicks tiny (no inline JSON blob).
function openJobPhotoLightboxFor(jobId, idx) {
  var list = (window._jobPhotosById || {})[jobId] || [];
  _jobPhotoFull = list;
  openJobPhotoLightbox(idx, jobId);
}

function jobLightboxNext() { if (_jobPhotoIdx < _jobPhotoFull.length - 1) { _jobPhotoIdx++; _jobPhotoZoom = 1; _renderJobLightbox(); } }
function jobLightboxPrev() { if (_jobPhotoIdx > 0) { _jobPhotoIdx--; _jobPhotoZoom = 1; _renderJobLightbox(); } }
function toggleJobPhotoZoom() { _jobPhotoZoom = _jobPhotoZoom > 1 ? 1 : 2.25; _renderJobLightbox(); }
function closeJobLightbox() {
  var lb = document.getElementById('job-photo-lightbox');
  if (!lb) return;
  if (lb._keyHandler) document.removeEventListener('keydown', lb._keyHandler);
  lb.remove();
}
async function deleteJobPhoto() {
  var p = _jobPhotoFull[_jobPhotoIdx]; if (!p) return;
  if (!_jobPhotoJobId) { showToast('Cannot delete without job context', true); return; }
  if (!confirm('Delete this photo? This cannot be undone.')) return;
  try {
    var r = await fetch('/api/field/jobs/' + _jobPhotoJobId + '/photos/' + encodeURIComponent(p.id || ''), { method: 'DELETE' });
    if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status);
    _jobPhotoFull.splice(_jobPhotoIdx, 1);
    showToast('Photo deleted');
    if (!_jobPhotoFull.length) closeJobLightbox();
    else { if (_jobPhotoIdx >= _jobPhotoFull.length) _jobPhotoIdx = _jobPhotoFull.length - 1; _renderJobLightbox(); }
    if (typeof openJobDetail === 'function' && _jobPhotoJobId) openJobDetail(_jobPhotoJobId);
  } catch (e) { showToast('Delete failed: ' + e.message, true); }
}

function closeJobDetail() {
  document.getElementById('job-detail').classList.remove('open');
  document.getElementById('view-jobs').style.display = '';
  loadJobs();
}

// ─── Note / Task actions ───────────────────────────────────────────────────
async function addJobNote(jobId) {
  var input = document.getElementById('job-note-input');
  var text = input.value.trim();
  if (!text) return;
  input.disabled = true;
  try {
    await fetch('/api/field/jobs/' + jobId + '/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, repCode: typeof repCode!=='undefined'?repCode:'', repName: typeof repName!=='undefined'?repName:'' })
    });
    input.value = '';
    var job = await fetch('/api/field/jobs/' + jobId).then(r => r.json());
    _currentJobDetail = job;
    var el = document.getElementById('job-notes-list');
    if (el) el.innerHTML = renderJobNotes(job.jobNotes||[]);
  } catch (e) { showToast('Error: ' + e.message, true); }
  input.disabled = false;
}

async function addJobTask(jobId) {
  var input = document.getElementById('job-task-input');
  var dateInput = document.getElementById('job-task-date');
  var text = input.value.trim();
  if (!text) return;
  input.disabled = true;
  try {
    await fetch('/api/field/jobs/' + jobId + '/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, repCode: typeof repCode!=='undefined'?repCode:'', dueDate: dateInput.value||null })
    });
    input.value = ''; dateInput.value = '';
    var job = await fetch('/api/field/jobs/' + jobId).then(r => r.json());
    _currentJobDetail = job;
    var el = document.getElementById('job-tasks-list');
    if (el) el.innerHTML = renderJobTasks(job.tasks||[], jobId);
  } catch (e) { showToast('Error: ' + e.message, true); }
  input.disabled = false;
}

async function toggleJobTask(jobId, taskId, completed) {
  try {
    await fetch('/api/field/jobs/' + jobId + '/tasks/' + taskId, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed })
    });
    var job = await fetch('/api/field/jobs/' + jobId).then(r => r.json());
    _currentJobDetail = job;
    var el = document.getElementById('job-tasks-list');
    if (el) el.innerHTML = renderJobTasks(job.tasks||[], jobId);
  } catch (e) { showToast('Error: ' + e.message, true); }
}

// ── Camera from Job Detail ─────────────────────────────────────────────────
// Opens the full CRC viewfinder (compass, HAAG tags, tap-to-shoot, pinch zoom).
// Sets currentLeadId to the portal job ID so uploads go to the right job.
// photo-camera.js upload path sends to /api/leads/:id/photos — for portal
// jobs we intercept via a monkey-patch on uploadQueue processing.
function jobTakePhoto(jobId) {
  if (typeof openCameraMode !== 'function') {
    alert('Camera not available');
    return;
  }
  // Set context so photo-camera.js knows which job to attach photos to
  if (typeof currentLeadId !== 'undefined') currentLeadId = jobId;
  if (typeof activePhotoTab !== 'undefined') activePhotoTab = 'inspection';
  // Override the upload endpoint for this session to use portal job route
  window._jobPhotoUploadId = jobId;
  openCameraMode();
}
