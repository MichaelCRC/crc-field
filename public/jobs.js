/* CRC Field Intel -- My Jobs View */

const JOB_STAGES = [
  { key: 'new_lead',        label: 'New Lead',          color: '#6B7280' },
  { key: 'appointment_set', label: 'Appointment Set',   color: '#F59E0B' },
  { key: 'inspected',       label: 'Inspected',         color: '#3B82F6' },
  { key: 'claim_filed',     label: 'Claim Filed',       color: '#8B5CF6' },
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

// ─── Filter + render ───────────────────────────────────────────────────────
function renderJobsList() {
  const el = document.getElementById('view-jobs');
  if (!el) return;

  let jobs = _jobsCache;
  if (_jobsFilter === 'insurance') jobs = jobs.filter(j => (j.pipeline || 'insurance') === 'insurance');
  else if (_jobsFilter === 'retail')    jobs = jobs.filter(j => j.pipeline === 'retail');
  else if (_jobsFilter === 'repair')    jobs = jobs.filter(j => j.pipeline === 'repair');
  else if (_jobsFilter === 'follow_up') jobs = jobs.filter(j => j.stage === 'follow_up' || j.subStatus === 'follow_up');

  const totalTasks = _jobsCache.reduce((n, j) => n + (j.openTasks || 0), 0);

  let html = '<div style="padding:12px 16px">';

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
    html += '<span style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.5px">' + stageLabel(s) + '</span>';
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
    + 'box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:12px 14px;margin-bottom:8px;cursor:pointer;'
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
  html += '<span style="font-size:14px;font-weight:700;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;margin-right:6px">' + (job.homeownerName || 'Unknown') + '</span>';
  html += pipelineBadge(job.pipeline);
  html += '</div>';
  // Row 2: address
  html += '<div style="font-size:12px;color:var(--gray);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (job.address || '') + '</div>';
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
function showActionSheet(title, options) {
  var existing = document.getElementById('_action_sheet');
  if (existing) existing.remove();
  var sheet = document.createElement('div');
  sheet.id = '_action_sheet';
  sheet.style.cssText = 'position:fixed;inset:0;z-index:500;display:flex;flex-direction:column;justify-content:flex-end';
  var backdrop = '<div onclick="document.getElementById(\'_action_sheet\').remove()" style="flex:1;background:rgba(0,0,0,0.4)"></div>';
  var body = '<div style="background:var(--white);border-radius:16px 16px 0 0;padding:16px 0 calc(16px + env(safe-area-inset-bottom));max-height:75vh;overflow-y:auto">';
  body += '<div style="font-size:13px;font-weight:700;color:var(--gray);text-align:center;padding:0 16px 12px;text-transform:uppercase;letter-spacing:0.5px">' + title + '</div>';
  for (var i = 0; i < options.length; i++) {
    var opt = options[i];
    var dot = opt.color ? '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + opt.color + ';margin-right:10px;vertical-align:middle"></span>' : '';
    body += '<button onclick="(function(){document.getElementById(\'_action_sheet\').remove();(' + opt.action.toString() + ')()})()" '
      + 'style="width:100%;padding:14px 20px;text-align:left;background:none;border:none;border-top:1px solid var(--bg);font-size:15px;cursor:pointer;color:var(--navy)">'
      + dot + opt.label + '</button>';
  }
  body += '<button onclick="document.getElementById(\'_action_sheet\').remove()" style="width:100%;padding:14px 20px;text-align:center;background:none;border:none;border-top:1px solid var(--border);font-size:15px;cursor:pointer;color:var(--gray);margin-top:4px">Cancel</button>';
  body += '</div>';
  sheet.innerHTML = backdrop + body;
  document.body.appendChild(sheet);
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
  html += '<div style="margin-bottom:16px">';
  html += '<button onclick="closeJobDetail()" style="background:none;border:none;color:var(--teal);font-size:14px;font-weight:600;cursor:pointer;padding:0;margin-bottom:10px">&larr; My Jobs</button>';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start">';
  html += '<div style="flex:1;min-width:0">';
  html += '<h2 style="font-size:18px;color:var(--navy);margin:0 0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + name + '</h2>';
  html += '<div style="font-size:13px;color:var(--gray);margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (job.address||'') + '</div>';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
  html += pipelineBadge(job.pipeline || job.jobCategory || 'insurance');
  html += ' <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:' + sc + ';color:#fff;font-weight:600">' + stageLabel(job.stage) + '</span>';
  html += '</div></div>';
  // Action menu button
  html += '<button onclick="openJobActionMenu(\'' + jid + '\')" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:18px;cursor:pointer;flex-shrink:0;margin-left:8px;line-height:1">&#8943;</button>';
  html += '</div></div>';

  // ── Quick Actions ──
  html += '<div style="display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:16px;padding-bottom:4px">';
  if (phone) {
    html += '<a href="tel:' + phone + '" style="text-decoration:none;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0">'
      + '<span style="font-size:20px">&#128222;</span><span style="font-size:11px;color:var(--gray)">Call</span></a>';
    html += '<a href="sms:' + phone + '" style="text-decoration:none;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0">'
      + '<span style="font-size:20px">&#128172;</span><span style="font-size:11px;color:var(--gray)">Text</span></a>';
  }
  html += '<a href="https://crc-supplements-portal.onrender.com/#job-' + jid + '" target="_blank" style="text-decoration:none;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0">'
    + '<span style="font-size:20px">&#128187;</span><span style="font-size:11px;color:var(--gray)">Portal</span></a>';
  var _sigAddr = (job.address || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var _sigName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  html += '<button onclick="openSignatureScreen(\'' + jid + '\',\'' + _sigAddr + '\',\'' + _sigName + '\')" style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0;cursor:pointer">'
    + '<span style="font-size:20px">\u270D\uFE0F</span><span style="font-size:11px;color:var(--gray)">Sign</span></button>';
  html += '<button onclick="typeof switchView===\'function\'?switchView(\'camera\'):alert(\'Camera coming soon\')" style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0;cursor:pointer">'
    + '<span style="font-size:20px">&#128247;</span><span style="font-size:11px;color:var(--gray)">Camera</span></button>';
  html += '</div>';

  // ── Move Stage + Transfer + Mark buttons ──
  html += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">';
  html += '<button onclick="openStagePickerInDetail(\'' + jid + '\')" style="flex:1;padding:9px;background:var(--teal);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;min-width:100px">Move Stage</button>';
  html += '<button onclick="openPipelineTransfer(\'' + jid + '\')" style="flex:1;padding:9px;background:var(--navy);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;min-width:100px">Transfer Type</button>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-bottom:16px">';
  html += '<button onclick="markJobFollowUp(\'' + jid + '\')" style="flex:1;padding:9px;background:#0EA5E9;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Follow Up</button>';
  html += '<button onclick="markJobLost(\'' + jid + '\')" style="flex:1;padding:9px;background:none;color:#DC2626;border:1px solid #DC2626;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Mark Lost</button>';
  html += '</div>';
  html += '<button onclick="openFieldObs(\'' + jid + '\', _currentJobDetail && _currentJobDetail.fieldNotes)" '
    + 'style="width:100%;padding:9px;background:#10B981;color:#fff;border:none;border-radius:8px;'
    + 'font-size:13px;font-weight:600;cursor:pointer;margin-bottom:16px">'
    + '&#128203; Fill Field Observations</button>';

  // ── Job Info ──
  html += '<div style="background:var(--white);border-radius:10px;border:1px solid var(--border);padding:14px;margin-bottom:16px">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Job Info</div>';
  var rows = [
    ['Carrier', job.carrier||''],
    ['Claim #', job.claimNumber||''],
    ['Adjuster Meeting', job.adjusterDate ? new Date(job.adjusterDate).toLocaleDateString() : 'Not set'],
    ['Created', job.created_at ? new Date(job.created_at).toLocaleDateString() : '']
  ].filter(r => r[1]);
  for (var i = 0; i < rows.length; i++) {
    html += '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px' + (i<rows.length-1?';border-bottom:1px solid var(--bg)':'') + '">';
    html += '<span style="color:var(--gray)">' + rows[i][0] + '</span><span style="color:var(--navy);font-weight:500">' + rows[i][1] + '</span></div>';
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
