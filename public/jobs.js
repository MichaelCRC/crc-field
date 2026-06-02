/* CRC Field Intel -- My Jobs View */

// JN insurance board stages 2026-06-01. Each entry has a canonical `key`,
// a display `label`, the section accent `color`, and `aliases` listing
// the raw JN stage values that bucket into this stage. Aliases let the
// renderer absorb stage-name drift between JN exports without losing
// jobs to silent-drop (the v3.1 Bug #4 root cause from the prior turn).
const JOB_STAGES = [
  { key: 'follow_up',             label: 'Follow Up',             color: '#0EA5E9', aliases: ['follow_up'] },
  { key: 'new_lead',              label: 'Uncontacted Lead',      color: '#6B7280', aliases: ['new_lead','uncontacted_lead','uncontacted'] },
  { key: 'appointment_set',       label: 'Appointment Scheduled', color: '#F59E0B', aliases: ['appointment_set','appointment_scheduled'] },
  { key: 'inspected',             label: 'Inspection Complete',   color: '#3B82F6', aliases: ['inspected','inspection_complete','inspection_done'] },
  { key: 'claim_filed',           label: 'Claim Filed',           color: '#8B5CF6', aliases: ['claim_filed'] },
  { key: 'waiting_on_scope',      label: 'Waiting on Scope',      color: '#7C3AED', aliases: ['waiting_on_scope','scope_received','crc_scope_built'] },
  { key: 'scope_dispute',         label: 'Scope Dispute',         color: '#EC4899', aliases: ['scope_dispute'] },
  { key: 'supplementing',         label: 'Supplementing',         color: '#F97316', aliases: ['supplementing'] },
  { key: 'color_selection',       label: 'Color Selection',       color: '#10B981', aliases: ['color_selection','ready_to_collect'] },
  { key: 'perfect_packet',        label: 'Perfect Packet',        color: '#059669', aliases: ['perfect_packet'] },
];

// Stages auto-hidden from default view after 90 days of no activity per
// v3.0 spec section 11 ("Lost jobs filter out of default My Jobs view
// but remain searchable") and the user's call to bump the cutoff from 30
// to 90 days (insurance lifecycle can run that long).
const LOST_STAGES = new Set([
  'lost','rehash_lost','lost_canceled','lost_unresponsive','lost_rehash','lost_no_show',
]);
const PAID_CLOSED_STAGES = new Set(['paid_closed','paid_and_closed']);
const ARCHIVE_HIDE_DAYS = 90;

// Map a raw job.stage value to its canonical JOB_STAGES key, or null if
// the stage belongs to no visible bucket (Lost / Paid&Closed / unknown).
function stageBucket(s) {
  if (!s) return 'new_lead';
  const lower = String(s).toLowerCase();
  const found = JOB_STAGES.find(x => x.aliases.includes(lower));
  return found ? found.key : null;
}

function stageColor(s) {
  const bucket = stageBucket(s) || s;
  const found = JOB_STAGES.find(x => x.key === bucket);
  return found ? found.color : '#6B7280';
}
function stageLabel(s) {
  const bucket = stageBucket(s) || s;
  const found = JOB_STAGES.find(x => x.key === bucket);
  return found ? found.label : (s || 'Unknown').replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
}

function pipelineBadge(p) {
  if (p === 'retail') return '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--navy);color:#fff;font-weight:600">Retail</span>';
  if (p === 'repair') return '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:#6B7280;color:#fff;font-weight:600">Repair</span>';
  return '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--teal);color:#fff;font-weight:600">Insurance</span>';
}

let _jobsCache = [];
let _jobsFilter = 'all';
let _jobsView = 'list'; // 'list' or 'board'

// 2026-06-01: search input debounce + focus preservation. The renderer
// rebuilds the entire view's innerHTML on each keystroke, which would
// otherwise drop focus from the new input node and feel like the box
// "loses" characters. We debounce the actual re-render and re-acquire
// focus + cursor position after.
let _jobsSearchTimer = null;
function _scheduleJobsSearch(value) {
  _jobsSearch = value;
  if (_jobsSearchTimer) clearTimeout(_jobsSearchTimer);
  _jobsSearchTimer = setTimeout(renderJobsList, 180);
}

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

  // Auto-archive (2026-06-01): hide Paid & Closed + Lost variants from
  // default view after ARCHIVE_HIDE_DAYS of no activity. Bumped from 30
  // to 90 days per user — insurance lifecycle can legitimately run that
  // long. Server-side cron (v3.2 §5 line 8) is separate work; this is
  // the client-side filter that keeps the rep's My Jobs view focused on
  // currently active work. Archived jobs remain searchable.
  const archiveCutoff = Date.now() - (ARCHIVE_HIDE_DAYS * 86400000);
  const isArchivable = (j) => {
    const stage = String(j.stage || '').toLowerCase();
    return (
      j.status_name === 'Paid & Closed' ||
      LOST_STAGES.has(stage) ||
      PAID_CLOSED_STAGES.has(stage)
    );
  };
  const lastTouchTs = (j) => {
    const candidate = j.lastActivity || j.updated_at || j.last_modified || j.closed_at || j.created_at;
    const t = candidate ? Date.parse(candidate) : NaN;
    return Number.isNaN(t) ? Date.now() : t;
  };

  let jobs = _jobsCache.filter(j => !isArchivable(j) || lastTouchTs(j) >= archiveCutoff);
  const afterArchiveCount = jobs.length;

  // Stage tab filter (2026-06-01): replaces the prior pipeline tabs
  // (Insurance / Retail / Repair / Follow Up). Tabs now mirror the JN
  // insurance board so reps can drill into a single stage. Pipeline
  // distinction stays visible via the per-card colored badge.
  if (_jobsFilter !== 'all') {
    jobs = jobs.filter(j => stageBucket(j.stage) === _jobsFilter);
  }

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
  // v3.1 Bug #4 (2026-06-01): show "Y of X jobs" when filtered so the
  // counter doesn't mismatch what's rendered. X reflects what's visible
  // after auto-archive (Paid & Closed > 30 days hidden), so the counter
  // matches the rep's actual working pile.
  const visibleCount = jobs.length;
  const countLabel = (visibleCount === afterArchiveCount)
    ? visibleCount + ' jobs'
    : visibleCount + ' of ' + afterArchiveCount + ' jobs';
  html += '<span style="font-size:13px;color:var(--gray)">' + countLabel + '</span>';
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
    + 'oninput="_scheduleJobsSearch(this.value)" '
    + 'style="width:100%;padding:10px 36px 10px 36px;border-radius:10px;border:1px solid var(--border);background:var(--white);color:#000;font-size:14px;box-sizing:border-box;-webkit-appearance:none">';
  if (_jobsSearch) {
    html += '<button onclick="_jobsSearch=\'\';document.getElementById(\'jobs-search-input\').value=\'\';renderJobsList()" '
      + 'style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;font-size:20px;color:var(--gray);cursor:pointer;padding:0;line-height:1">&times;</button>';
  }
  html += '</div>';

  // ── Filter tabs ──
  html += '<div style="display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:6px;margin-bottom:12px;scrollbar-width:none">';
  // Tabs mirror the JN insurance board (2026-06-01). 'All' shows the
  // grouped-by-stage list view; any other tab filters to that stage and
  // renders flat. Retail / Repair pipelines surface as colored badges on
  // each card (per-card pipelineBadge), so dropping the pipeline tabs
  // doesn't lose that distinction.
  var tabs = [
    ['all',                  'All'],
    ['follow_up',            'Follow Up'],
    ['new_lead',             'Uncontacted Lead'],
    ['appointment_set',      'Appointment Scheduled'],
    ['inspected',            'Inspection Complete'],
    ['claim_filed',          'Claim Filed'],
    ['waiting_on_scope',     'Waiting on Scope'],
    ['scope_dispute',        'Scope Dispute'],
    ['supplementing',        'Supplementing'],
    ['color_selection',      'Color Selection'],
    ['perfect_packet',       'Perfect Packet'],
  ];
  for (var i = 0; i < tabs.length; i++) {
    var t = tabs[i];
    var active = _jobsFilter === t[0];
    html += '<button onclick="_jobsFilter=\'' + t[0] + '\';renderJobsList()" style="flex-shrink:0;padding:6px 14px;border-radius:20px;border:1px solid ' + (active?'var(--navy)':'var(--border)') + ';background:' + (active?'var(--navy)':'var(--white)') + ';color:' + (active?'#fff':'var(--gray)') + ';font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">' + t[1] + '</button>';
  }
  html += '</div>';

  if (!jobs.length) {
    const stageLbl = (_jobsFilter === 'all')
      ? 'No jobs match this filter'
      : 'No jobs in ' + (tabs.find(t => t[0] === _jobsFilter) || [])[1] + ' yet';
    html += '<div style="padding:40px;text-align:center;color:var(--gray)">' + stageLbl + '</div>';
    html += '</div>';
    _replaceJobsHtmlPreservingSearch(el, html);
    return;
  }

  if (_jobsView === 'board') {
    html += renderBoardView(jobs);
  } else if (_jobsFilter === 'all') {
    html += renderListView(jobs);
  } else {
    // Stage tab selected — flat list, no group headers (the tab itself names the stage)
    for (const job of jobs) html += renderJobCard(job, true);
  }

  html += '</div>';
  _replaceJobsHtmlPreservingSearch(el, html);
  attachSwipeListeners();
}

// 2026-06-01: assign innerHTML while preserving focus + cursor position
// on the search input. Without this the search box drops focus on every
// keystroke because the input node gets replaced.
function _replaceJobsHtmlPreservingSearch(el, html) {
  const wasSearchFocused = document.activeElement && document.activeElement.id === 'jobs-search-input';
  const cursorPos = wasSearchFocused ? document.activeElement.selectionStart : null;
  el.innerHTML = html;
  if (wasSearchFocused) {
    const input = document.getElementById('jobs-search-input');
    if (input) {
      input.focus();
      if (cursorPos != null) try { input.setSelectionRange(cursorPos, cursorPos); } catch {}
    }
  }
}

// ─── List view: grouped by stage (only used when _jobsFilter === 'all') ──
function renderListView(jobs) {
  // Group via stageBucket so raw stage values like 'ready_to_collect'
  // land in the 'color_selection' bucket (and any unknown stage drops
  // into 'new_lead' fallback so no job is silently lost — that was the
  // bug that hid 29 jobs in the prior turn).
  const stageOrder = JOB_STAGES.map(s => s.key);
  const grouped = {};
  for (const s of stageOrder) grouped[s] = [];
  for (const j of jobs) {
    const s = stageBucket(j.stage) || 'new_lead';
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
  // All JN board stages render as columns even if empty so the rep sees
  // the full pipeline at a glance. Lost / Paid&Closed are already
  // filtered upstream by the 90-day archive in renderJobsList.
  let html = '<div style="display:flex;gap:10px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:12px;scrollbar-width:thin">';
  for (const s of JOB_STAGES) {
    const group = jobs.filter(j => stageBucket(j.stage) === s.key);
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
  html += '<span style="font-size:15px;font-weight:800;color:#0D0D0D;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;margin-right:6px">' + (job.homeownerName || 'Unknown') + '</span>';
  html += pipelineBadge(job.pipeline);
  html += '</div>';
  // Row 2: address
  html += '<div style="font-size:13px;font-weight:700;color:#0D0D0D;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (job.address || '') + '</div>';
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

// ─── Inspection Complete hard gate ────────────────────────────────────────
// Returns { ok: true } or { ok: false, issues: [plain-english-string, ...] }.
// Only checks fields with unambiguous null defaults + measurements + photo
// count. Boolean observation fields are not gated (can't distinguish "No"
// from "not answered" without a schema change — see Build 3 STEP 3 notes).
function validateInspectionComplete(job) {
  var issues = [];
  var fn = (job && job.fieldNotes) || null;
  var photos = collectJobPhotos(job || {});
  var totalSq = job && job.measurements && job.measurements.measurements && job.measurements.measurements.totalSquares;

  if (!totalSq || totalSq <= 0) {
    issues.push('Pull Hover measurements');
  }
  if (photos.length < 5) {
    issues.push('Upload at least 5 photos (currently: ' + photos.length + ')');
  }
  if (!fn || !Object.keys(fn).length) {
    issues.push('Complete field observations form');
    return { ok: issues.length === 0, issues: issues };
  }
  if (!fn.valleyType) {
    issues.push('Select the valley type (California cut, closed cut, or open metal)');
  }
  if (!fn.osbRedeck) {
    issues.push('Select decking condition (none, spot boards, or full redeck)');
  }
  if (fn.chimney && !fn.chimneyType) {
    issues.push('Select chimney type (masonry or metal)');
  }
  if ((fn.replaceGutters || fn.existingGutters) &&
      (fn.downspoutCount == null || fn.downspoutCount === '')) {
    issues.push('Enter the downspout count');
  }
  if (fn.atticAccess && !fn.atticVentilationType) {
    issues.push('Select attic intake ventilation type');
  }
  return { ok: issues.length === 0, issues: issues };
}

// Show a non-dismissible-on-overlay modal listing specific issues.
function showInspectionIssues(issues) {
  var existing = document.getElementById('_inspection-issues');
  if (existing) existing.remove();
  var wrap = document.createElement('div');
  wrap.id = '_inspection-issues';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:800;background:rgba(0,0,0,0.55);' +
    'display:flex;align-items:flex-end;justify-content:center';
  var card = '<div style="background:#FFFFFF;width:100%;max-width:540px;border-radius:16px 16px 0 0;' +
    'padding:20px 18px 24px;box-shadow:0 -8px 24px rgba(0,0,0,0.35)">' +
    '<div style="font-size:16px;font-weight:700;color:#0D0D0D;margin-bottom:6px">' +
    'Can’t complete inspection yet</div>' +
    '<div style="font-size:12px;color:#555;margin-bottom:14px">Fix these before advancing:</div>' +
    '<ul style="list-style:none;padding:0;margin:0 0 16px">' +
    issues.map(function(it) {
      return '<li style="padding:10px 0;border-bottom:1px solid #F0F0F0;' +
        'font-size:14px;color:#0D0D0D;display:flex;align-items:flex-start;gap:10px">' +
        '<span style="color:#DC2626;font-size:16px;flex-shrink:0;line-height:1">•</span>' +
        '<span>' + it + '</span></li>';
    }).join('') +
    '</ul>' +
    '<button onclick="document.getElementById(\'_inspection-issues\').remove()" ' +
    'style="width:100%;padding:12px;background:#00B5CC;color:#FFFFFF;border:none;' +
    'border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">OK, got it</button>' +
    '</div>';
  wrap.innerHTML = card;
  document.body.appendChild(wrap);
}

// Single entry point for advancing a job to 'inspected'. Runs validation
// first and blocks with plain-English issues if anything is missing.
async function markInspectionComplete(jobId) {
  var job = _jobsCache.find(j => j.id === jobId);
  // Cache may be stale for fieldNotes; prefer _currentJobDetail if same job.
  if (_currentJobDetail && _currentJobDetail.id === jobId) job = _currentJobDetail;
  if (!job) { showToast('Job not found', true); return; }
  var v = validateInspectionComplete(job);
  if (!v.ok) { showInspectionIssues(v.issues); return; }
  await updateJobField(jobId, { stage: 'inspected' }, 'Inspection complete. Scope builds when claim # is filed.');
  setTimeout(function() { openJobDetail(jobId); }, 400);
}

// ─── Stage picker (swipe right action) ────────────────────────────────────
function openStagePickerForJob(jobId) {
  var job = _jobsCache.find(j => j.id === jobId);
  if (!job) return;
  showActionSheet('Move Stage', JOB_STAGES.filter(s => s.key !== 'follow_up' && s.key !== 'lost').map(s => ({
    label: s.label, color: s.color,
    action: function() {
      // Hard-gate: picking "Inspected" on an insurance job runs validation.
      if (s.key === 'inspected' && (job.pipeline || 'insurance') === 'insurance') {
        return markInspectionComplete(jobId);
      }
      updateJobField(jobId, { stage: s.key }, 'Stage: ' + s.label);
    }
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

// Create Report chooser — Photo Report / Insurance Report / Next Steps Packet.
// Photo + Insurance reports apply to any job type; Next Steps Packet (claim
// filing) is insurance-only.
function openCreateReport(jobId) {
  var job = _currentJobDetail || {};
  var isIns = String(job.pipeline || job.jobCategory || 'insurance').toLowerCase() === 'insurance';
  function opt(title, desc, color, fn) {
    return { color: color, action: fn,
      label: '<span style="display:block;font-weight:700;color:#0D0D0D">' + title + '</span>'
           + '<span style="display:block;font-size:12px;color:#6B7280;font-weight:400;margin-top:2px">' + desc + '</span>' };
  }
  var opts = [
    opt('Photo Report', 'Clean photo documentation — roof is in good shape', '#1B2360', function(){ openPhotoInspectionReport(jobId); }),
    opt('Insurance Report', 'On-file roof condition report for the homeowner’s insurer', '#00B5CC', function(){ openInsuranceReport(jobId); }),
  ];
  // Next Steps Packet — opens the builder and generates directly, the same
  // smooth flow as Photo + Insurance Report (no "mark ready" two-tap). The
  // packet PDF itself (portal generator) is unchanged.
  if (isIns) opts.push(opt('Next Steps Packet', 'Homeowner is ready to file a claim', '#16A34A', function(){ openClaimFilingPackage(jobId); }));
  showActionSheet('Create Report', opts);
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

function toggleHomeownerInfo(jobId) {
  window._homeownerExpanded = window._homeownerExpanded || {};
  window._homeownerExpanded[jobId] = (window._homeownerExpanded[jobId] === true) ? false : true;
  openJobDetail(jobId);
}

async function saveHomeownerInfo(jobId) {
  var btn = document.querySelector('button[onclick*="saveHomeownerInfo"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  // Sent as a whole homeowner object; the portal maps sub-fields to canonical
  // customers columns (email→primary_email, secondaryPhone→secondary_phone,
  // spouse→spouse_name, bestTime→best_time_to_contact,
  // preferredContact→preferred_contact_method).
  var patch = { homeowner: {
    email:            document.getElementById('ho-email')?.value?.trim() || '',
    secondaryPhone:   document.getElementById('ho-secphone')?.value?.trim() || '',
    spouse:           document.getElementById('ho-spouse')?.value?.trim() || '',
    bestTime:         document.getElementById('ho-besttime')?.value || '',
    preferredContact: document.getElementById('ho-prefcontact')?.value || '',
  } };
  try {
    var r = await fetch('/api/field/jobs/' + jobId, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!r.ok) throw new Error('Update failed');
    showToast('Homeowner info saved');
    var ov = document.getElementById('ho-overlay'); if (ov) ov.remove();
    openJobDetail(jobId);
  } catch (e) {
    showToast('Save failed: ' + e.message, true);
    if (btn) { btn.disabled = false; btn.textContent = 'Save Homeowner Info'; }
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
  // Job Type drives what shows. Insurance (Phase 1) surfaces carrier/claim
  // info + the Next Steps Packet; retail/repair don't. Single source for the
  // conditionals below.
  var isInsurance = String(job.pipeline || job.jobCategory || 'insurance').toLowerCase() === 'insurance';

  var html = '<div style="padding:16px;max-width:540px;margin:0 auto">';

  // ── Header ──
  // Hardcoded near-black + true navy on the breadcrumb + h2 so the page is
  // readable in light mode regardless of CSS-variable cascade quirks. The
  // address line stays muted (steel mid) — readable but visually secondary.
  html += '<div style="margin-bottom:16px">';
  html += '<button onclick="closeJobDetail()" style="background:none;border:none;color:#00B5CC;font-size:14px;font-weight:700;cursor:pointer;padding:0;margin-bottom:10px;display:inline-flex;align-items:center;gap:4px">&larr; <u>My Jobs</u></button>';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start">';
  html += '<div style="flex:1;min-width:0">';
  html += '<h2 style="font-size:20px;font-weight:700;color:#FFFFFF;margin:0 0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + name + '</h2>';
  html += '<div style="font-size:13px;color:#6B7280;margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (job.address||'') + '</div>';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
  html += pipelineBadge(job.pipeline || job.jobCategory || 'insurance');
  html += ' <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:' + sc + ';color:#fff;font-weight:600">' + stageLabel(job.stage) + '</span>';
  html += '</div></div>';
  // Action menu button
  html += '<button onclick="openJobActionMenu(\'' + jid + '\')" style="background:#1C2333;border:1px solid #00B5CC;border-radius:8px;padding:8px 12px;font-size:18px;cursor:pointer;flex-shrink:0;margin-left:8px;line-height:1;color:#FFFFFF">&#8943;</button>';
  html += '</div></div>';

  // ── Contact actions (phone / text / portal / camera) ──
  html += '<div style="display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:12px;padding-bottom:4px">';
  if (phone) {
    html += '<a href="tel:' + phone + '" style="text-decoration:none;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0">'
      + '<span style="font-size:20px">&#128222;</span><span style="font-size:11px;color:var(--gray)">Call</span></a>';
    html += '<a href="sms:' + phone + '" style="text-decoration:none;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0">'
      + '<span style="font-size:20px">&#128172;</span><span style="font-size:11px;color:var(--gray)">Text</span></a>';
  }
  // Portal tile removed from the rep Job Detail (2026-06-01) — only ceo/admin/
  // operator have portal access and they don't need the link on this screen.
  html += '<button onclick="jobTakePhoto(\'' + jid + '\')" style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0;cursor:pointer"><span style="font-size:20px">&#128247;</span><span style="font-size:11px;color:var(--gray)">Camera</span></button>';
  // Hover launch: pre-fill not supported (see HOVER_SPRINT_FINDINGS.md).
  // Helper copies address+name to clipboard, tries hover://, falls back to web.
  var _hAddr = (job.address || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var _hName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  html += '<button onclick="openHoverForJob({address:\'' + _hAddr + '\',homeowner:\'' + _hName + '\'})" style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0;cursor:pointer"><span style="font-size:20px">&#128016;</span><span style="font-size:11px;color:var(--gray)">Hover</span></button>';
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
  // Create Report — one entry, three outputs (Photo Report / Insurance Report
  // / Next Steps Packet) chosen in a sheet. Replaces the separate Photo Report
  // + Next Steps chips. Needs photos; chooser content adapts by job type.
  var insReportBuilt = (job.uploadedDocs || []).some(function(d){ return d.docType === 'insurance-report'; });
  var anyReport = photoReportBuilt || claimSent || insReportBuilt;
  html += _workflowChip('&#128220;', 'Create Report',
    anyReport ? '&#10003; Built' : (wfPhotos.length ? 'Create' : 'No photos yet'),
    anyReport ? '#16A34A' : (wfPhotos.length ? '#00B5CC' : '#94A3B8'),
    wfPhotos.length ? ('openCreateReport(\'' + jid + '\')') : '');
  html += '</div>';

  // ── Move Stage + Transfer + Mark buttons ──
  // Hardcoded teal/navy backgrounds + literal white text so the buttons render
  // correctly in both modes even if a CSS variable somewhere fails to resolve.
  html += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">';
  html += '<button onclick="openStagePickerInDetail(\'' + jid + '\')" style="flex:1;padding:11px;background:#00B5CC;color:#FFFFFF;border:none;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:0.04em;cursor:pointer;min-width:100px;min-height:44px">Move Stage</button>';
  html += '<button onclick="openPipelineTransfer(\'' + jid + '\')" style="flex:1;padding:11px;background:#1e3a6e;color:#FFFFFF;border:1.5px solid #4a6fa5;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:0.04em;cursor:pointer;min-width:100px;min-height:44px">Job Type</button>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-bottom:16px">';
  html += '<button onclick="markJobFollowUp(\'' + jid + '\')" style="flex:1;padding:9px;background:#0EA5E9;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Follow Up</button>';
  html += '<button onclick="markJobLost(\'' + jid + '\')" style="flex:1;padding:9px;background:none;color:#DC2626;border:1px solid #DC2626;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Mark Lost</button>';
  html += '</div>';
  html += '<button onclick="openFieldObs(\'' + jid + '\', _currentJobDetail && _currentJobDetail.fieldNotes)" '
    + 'style="width:100%;padding:9px;background:#10B981;color:#fff;border:none;border-radius:8px;'
    + 'font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px">'
    + '&#128203; Fill Field Observations</button>';

  // Mark Inspection Complete -- hard-gate button. Insurance pipeline only,
  // visible at pre-inspected stages (new_lead, appointment_set). Validation
  // runs on click; fail -> issue sheet with plain-English items.
  var pipelineKey = job.pipeline || 'insurance';
  var preInspected = !job.stage || job.stage === 'new_lead' || job.stage === 'appointment_set';
  if (pipelineKey === 'insurance' && preInspected) {
    html += '<button onclick="markInspectionComplete(\'' + jid + '\')" '
      + 'style="width:100%;padding:14px;background:#16A34A;color:#FFFFFF;border:none;border-radius:10px;'
      + 'font-size:15px;font-weight:700;letter-spacing:0.02em;cursor:pointer;margin-bottom:16px;'
      + 'box-shadow:0 2px 6px rgba(22,163,74,0.3);min-height:48px">'
      + '&#10003; Mark Inspection Complete</button>';
  }

  // Roof diagram is now rendered inside the CRC Measure bottom sheet — removed
  // the standalone Job Detail section 2026-04 to avoid duplicate surfaces.

  // Homeowner Info moved into the ⋯ menu (top-right) to declutter the job
  // screen — opens as an overlay via openHomeownerInfo(). See openJobActionMenu.

  // ── Insurance Info (collapsible) — insurance jobs only (Phase 1) ──
  // Carrier / claim / adjuster are meaningless on retail/repair, so the whole
  // card only renders for insurance jobs.
  if (isInsurance) {
  var jobInfoExpanded = (window._jobInfoExpanded || {})[jid] !== false;
  html += '<div style="background:var(--white);border-radius:10px;border:1px solid var(--border);padding:14px;margin-bottom:16px">';
  html += '<button onclick="toggleJobInfo(\'' + jid + '\')" style="display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:none;cursor:pointer;padding:0;margin-bottom:' + (jobInfoExpanded ? '12' : '0') + 'px">';
  html += '<span style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.5px">Insurance Info</span>';
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
  }

  // ── Notes ──
  html += '<div style="background:var(--white);border-radius:10px;border:1px solid var(--border);padding:14px;margin-bottom:16px">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Notes</div>';
  html += '<div id="job-notes-list">' + renderJobNotes(job.jobNotes||[]) + '</div>';
  html += '<div style="margin-top:10px">';
  html += '<textarea id="job-note-input" placeholder="Add a note..." rows="2" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;resize:none;box-sizing:border-box"></textarea>';
  html += '<button onclick="addJobNote(\'' + jid + '\')" style="margin-top:6px;background:var(--teal);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;width:100%">Add Note</button>';
  html += '</div></div>';

  // ── Storm History ──
  // Populated async after render via loadJobStormHistory(). We key off the
  // job address (portal side-of-the-house) and hit /api/storms/for-address
  // so the server does the geocode. Falls back to lat/lng if the job has
  // them already.
  html += '<div id="job-storm-history" style="background:var(--white);border-radius:10px;border:1px solid var(--border);padding:14px;margin-bottom:16px">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Storm History</div>';
  html += '<div id="job-storm-history-body" style="font-size:13px;color:var(--gray)">Loading storms near property...</div>';
  html += '</div>';

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
  // Diagnostic (Build 3.3.1): photos upload successfully post-3.3 but render
  // as "Photo unavailable" placeholders. Log the shape the gallery receives
  // so we can see whether URLs are malformed, missing, or require a base URL.
  try {
    console.log('[photo-gallery-fetch]', {
      photoCount: allPhotos && allPhotos.length,
      firstPhoto: allPhotos && allPhotos[0],
      sampleUrls: allPhotos && allPhotos.slice(0, 3).map(function(p) { return p.url || p.thumbnail || p.src; }),
    });
  } catch (e) { /* logging must not break render */ }
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
          + '<img src="' + url + '" loading="lazy" onerror="console.log(\'[photo-img-failed]\', { src: this.src, index: ' + i + ' });this.parentElement.classList.add(\'job-photo-bad\');this.src=\'\';this.style.display=\'none\'" alt="Photo ' + (i+1) + '">'
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

  html += '<button onclick="closeJobDetail()" style="width:100%;padding:12px;background:transparent;border:1.5px solid var(--teal);border-radius:8px;font-size:14px;font-weight:700;color:var(--teal);cursor:pointer;margin-bottom:20px;-webkit-tap-highlight-color:transparent">Back to My Jobs</button>';
  html += '</div>';
  detail.innerHTML = html;

  // Kick off storm history lookup after DOM is in place.
  loadJobStormHistory(job);
}

function _stormTypeLabel(t) {
  if (t === 'hail') return 'Hail';
  if (t === 'thunderstorm_wind') return 'T-storm Wind';
  if (t === 'high_wind') return 'High Wind';
  return t;
}

async function loadJobStormHistory(job) {
  var body = document.getElementById('job-storm-history-body');
  if (!body || !job) return;
  // Prefer lat/lng if the portal has them -- skips a geocode round-trip.
  var hasCoords = Number.isFinite(Number(job.lat)) && Number.isFinite(Number(job.lng));
  var url;
  if (hasCoords) {
    url = '/api/storms/near?lat=' + Number(job.lat) + '&lng=' + Number(job.lng);
  } else if (job.address) {
    url = '/api/storms/for-address?address=' + encodeURIComponent(job.address);
  } else {
    body.innerHTML = '<span style="color:var(--gray)">No address on this job</span>';
    return;
  }
  try {
    var res = await fetch(url);
    if (res.status === 503) {
      body.innerHTML = '<span style="color:var(--red)">Storm data temporarily unavailable</span>';
      return;
    }
    if (!res.ok) {
      body.innerHTML = '<span style="color:var(--red)">Could not load storms (HTTP ' + res.status + ')</span>';
      return;
    }
    var data = await res.json();
    var storms = data.storms || [];
    if (!storms.length) {
      body.innerHTML = '<div style="color:var(--gray)">No storms within 5 miles in the last 12 months.</div>'
        + (data.notice ? '<div style="font-size:11px;color:var(--text-muted);margin-top:6px">' + data.notice + '</div>' : '');
      return;
    }
    var rows = storms.slice(0, 10).map(function(s) {
      var label = _stormTypeLabel(s.eventType);
      var mapLink = (s.lat != null && s.lng != null)
        ? '<a href="#" onclick="viewStormOnMap(' + s.lat + ',' + s.lng + ');return false" style="color:#00B5CC;text-decoration:none;font-weight:600">View on map</a>'
        : '';
      return '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;border-bottom:1px solid #F1F5F9">'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-weight:600;font-size:13px;color:#1e293b">' + s.magnitude + ' ' + label + '</div>'
        + '<div style="font-size:11px;color:var(--gray)">' + s.date + ' &middot; ' + s.distanceMiles + ' mi away</div>'
        + '</div>'
        + '<div style="font-size:12px;margin-left:8px">' + mapLink + '</div>'
        + '</div>';
    }).join('');
    var header = '<div style="font-size:12px;color:var(--gray);margin-bottom:6px">'
      + storms.length + ' storm' + (storms.length === 1 ? '' : 's')
      + ' within 5 mi in last 12 months</div>';
    var notice = data.notice ? '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">' + data.notice + '</div>' : '';
    body.innerHTML = header + rows + notice;
  } catch (e) {
    body.innerHTML = '<span style="color:var(--red)">' + e.message + '</span>';
  }
}

function viewStormOnMap(lat, lng) {
  if (typeof switchView !== 'function') return;
  switchView('map');
  setTimeout(function() {
    if (typeof showStormOverlay === 'function' && typeof stormOverlayVisible !== 'undefined' && !stormOverlayVisible) {
      showStormOverlay();
    }
    if (typeof gmap !== 'undefined' && gmap) {
      gmap.panTo({ lat: lat, lng: lng });
      gmap.setZoom(14);
    }
  }, 300);
}

// ─── In-detail stage / pipeline pickers ────────────────────────────────────
function openStagePickerInDetail(jobId) {
  var job = _currentJobDetail && _currentJobDetail.id === jobId
    ? _currentJobDetail
    : _jobsCache.find(j => j.id === jobId);
  showActionSheet('Move to Stage', JOB_STAGES.map(s => ({
    label: s.label, color: s.color,
    action: function() {
      // Hard-gate: picking "Inspected" on an insurance job runs validation.
      if (s.key === 'inspected' && job && (job.pipeline || 'insurance') === 'insurance') {
        return markInspectionComplete(jobId);
      }
      updateJobField(jobId, { stage: s.key }, 'Stage: ' + s.label);
      // Refresh detail header without full reload
      setTimeout(function() { openJobDetail(jobId); }, 400);
    }
  })));
}

function openPipelineTransfer(jobId) {
  var pipelines = [
    { key: 'insurance', label: 'Insurance', color: '#00B5CC' },
    { key: 'retail',    label: 'Retail',    color: '#1B2360' },
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

// The ⋯ (top-right of Job Detail) opens Homeowner Info. The four actions that
// used to live here (Move Stage, Job Type, Follow Up, Mark Lost) are already
// dedicated buttons on the screen, so this menu was pure duplication.
function openJobActionMenu(jobId) { openHomeownerInfo(jobId); }

function openHomeownerInfo(jobId) {
  var job = _currentJobDetail || {};
  var ho = job.homeowner || {};
  function opt(cur, val, label) { return '<option value="' + val + '"' + (String(cur||'') === val ? ' selected' : '') + '>' + (label || (val || '— select —')) + '</option>'; }
  var existing = document.getElementById('ho-overlay'); if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'ho-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:1100;background:rgba(10,21,48,0.6);display:flex;align-items:flex-end;justify-content:center';
  ov.innerHTML = '<div style="background:var(--white);width:100%;max-width:540px;border-radius:16px 16px 0 0;max-height:85vh;overflow-y:auto;padding:18px 16px calc(18px + env(safe-area-inset-bottom))">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
    +   '<span style="font-size:14px;font-weight:800;color:var(--navy);text-transform:uppercase;letter-spacing:0.5px">Homeowner Info</span>'
    +   '<button onclick="document.getElementById(\'ho-overlay\').remove()" style="background:none;border:none;font-size:26px;color:var(--gray);cursor:pointer;line-height:1;min-width:44px;min-height:44px">&times;</button>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'
    +   '<div><label style="font-size:11px;font-weight:700;color:var(--gray);display:block;margin-bottom:3px">EMAIL</label><input type="email" id="ho-email" value="' + (ho.email || '') + '" placeholder="homeowner@email.com" style="width:100%;padding:8px 9px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box"></div>'
    +   '<div><label style="font-size:11px;font-weight:700;color:var(--gray);display:block;margin-bottom:3px">SECONDARY PHONE</label><input type="tel" id="ho-secphone" value="' + (ho.secondaryPhone || '') + '" placeholder="(614) 555-0000" style="width:100%;padding:8px 9px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box"></div>'
    +   '<div><label style="font-size:11px;font-weight:700;color:var(--gray);display:block;margin-bottom:3px">SPOUSE / CO-OWNER</label><input type="text" id="ho-spouse" value="' + (ho.spouse || '') + '" placeholder="Name" style="width:100%;padding:8px 9px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box"></div>'
    +   '<div><label style="font-size:11px;font-weight:700;color:var(--gray);display:block;margin-bottom:3px">BEST TIME</label><select id="ho-besttime" style="width:100%;padding:8px 9px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box">' + opt(ho.bestTime,'') + opt(ho.bestTime,'Anytime') + opt(ho.bestTime,'Morning') + opt(ho.bestTime,'Afternoon') + opt(ho.bestTime,'Evening') + opt(ho.bestTime,'Weekend') + '</select></div>'
    +   '<div style="grid-column:1 / -1"><label style="font-size:11px;font-weight:700;color:var(--gray);display:block;margin-bottom:3px">PREFERRED CONTACT</label><select id="ho-prefcontact" style="width:100%;padding:8px 9px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box">' + opt(ho.preferredContact,'') + opt(ho.preferredContact,'Call') + opt(ho.preferredContact,'Text') + opt(ho.preferredContact,'Email') + '</select></div>'
    + '</div>'
    + '<button onclick="saveHomeownerInfo(\'' + jobId + '\')" style="width:100%;padding:12px;background:var(--teal);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">Save Homeowner Info</button>'
    + '</div>';
  ov.addEventListener('click', function(e){ if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
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
  // Markup photos are annotations on existing photos; push with the markup
  // dataURL so unique annotations count, while references back to an original
  // url naturally dedupe against the companycam/simple/field entry.
  (job && job.markupPhotos || []).forEach(function(p){
    push({
      url: p.markupData || p.originalUrl || '',
      thumbnail: p.markupData || p.originalUrl || '',
      caption: p.caption || 'Markup',
      id: p.id || '',
      createdAt: p.createdAt || null,
    }, 'markup');
  });
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
