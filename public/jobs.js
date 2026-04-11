/* CRC Field Intel -- My Jobs View */

const JOB_STAGE_COLORS = {
  new_lead: '#6B7280',
  appointment_set: '#F59E0B',
  inspected: '#3B82F6',
  claim_filed: '#8B5CF6',
  scope_received: '#EC4899',
  supplementing: '#F97316',
  ready_to_collect: '#10B981'
};

function stageColor(stage) { return JOB_STAGE_COLORS[stage] || '#6B7280'; }
function stageLabel(s) { return (s || 'new_lead').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

function pipelineBadge(p) {
  if (p === 'retail') return '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--navy);color:#fff;font-weight:600">Retail</span>';
  if (p === 'repair') return '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:#6B7280;color:#fff;font-weight:600">Repair</span>';
  return '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--teal);color:#fff;font-weight:600">Insurance</span>';
}

let _jobsCache = [];
let _jobsFilter = 'all';

async function loadJobs() {
  const el = document.getElementById('view-jobs');
  if (!el) return;
  el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gray)">Loading jobs...</div>';

  try {
    const url = repRole === 'admin' ? '/api/field/jobs' : '/api/field/jobs?repCode=' + repCode;
    const jobs = await fetch(url).then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json(); });
    _jobsCache = jobs;
    renderJobsList();
  } catch (e) {
    el.innerHTML = '<div style="padding:40px;text-align:center"><p style="color:var(--gray);margin-bottom:12px">' + e.message + '</p>'
      + '<button class="btn-add" onclick="loadJobs()" style="max-width:200px;margin:0 auto">Retry</button></div>';
  }
}

function renderJobsList() {
  const el = document.getElementById('view-jobs');
  if (!el) return;

  let jobs = _jobsCache;
  if (_jobsFilter === 'insurance') jobs = jobs.filter(j => j.pipeline === 'insurance');
  else if (_jobsFilter === 'retail') jobs = jobs.filter(j => j.pipeline === 'retail');
  else if (_jobsFilter === 'active') jobs = jobs.filter(j => j.stage !== 'new_lead');

  const totalTasks = _jobsCache.reduce((n, j) => n + (j.openTasks || 0), 0);

  let html = '<div style="padding:12px 16px">';
  // Summary bar
  html += '<div style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap">';
  html += '<span style="font-size:13px;color:var(--gray)">' + _jobsCache.length + ' jobs</span>';
  if (totalTasks > 0) html += '<span style="font-size:12px;padding:2px 8px;border-radius:10px;background:#DC2626;color:#fff;font-weight:600">' + totalTasks + ' open tasks</span>';
  html += '</div>';

  // Filter chips
  html += '<div class="chip-row" style="margin-bottom:12px">';
  var filters = [['all','All'],['insurance','Insurance'],['retail','Retail'],['active','Active']];
  for (var i = 0; i < filters.length; i++) {
    var f = filters[i];
    html += '<button class="chip' + (_jobsFilter === f[0] ? ' active' : '') + '" onclick="_jobsFilter=\'' + f[0] + '\';renderJobsList()">' + f[1] + '</button>';
  }
  html += '</div>';

  if (!jobs.length) {
    html += '<div style="padding:40px;text-align:center;color:var(--gray)">No jobs match this filter</div>';
  }

  for (var j = 0; j < jobs.length; j++) {
    var job = jobs[j];
    var sc = stageColor(job.stage);
    html += '<div onclick="openJobDetail(\'' + job.id + '\')" style="background:var(--white);border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:14px 16px;margin-bottom:10px;cursor:pointer;border-left:4px solid ' + sc + '">';
    // Row 1: name + pipeline
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">';
    html += '<span style="font-size:15px;font-weight:700;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;margin-right:8px">' + (job.homeownerName || 'Unknown') + '</span>';
    html += pipelineBadge(job.pipeline);
    html += '</div>';
    // Row 2: address
    html += '<div style="font-size:13px;color:var(--gray);margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (job.address || '') + '</div>';
    // Row 3: stage
    html += '<div style="font-size:12px;font-weight:600;color:' + sc + ';margin-bottom:6px">' + stageLabel(job.stage) + '</div>';
    // Row 4: meta
    html += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:11px;color:var(--gray)">';
    if (job.carrier) html += '<span>' + job.carrier + '</span>';
    if (job.overdueTasks > 0) html += '<span style="background:#DC2626;color:#fff;padding:1px 6px;border-radius:8px;font-weight:600">' + job.overdueTasks + ' overdue</span>';
    else if (job.openTasks > 0) html += '<span>' + job.openTasks + ' tasks</span>';
    if (job.noteCount) html += '<span>' + job.noteCount + ' notes</span>';
    if (job.lastActivity) html += '<span>' + timeAgo(job.lastActivity) + '</span>';
    html += '</div></div>';
  }

  html += '</div>';
  el.innerHTML = html;
}

// --- Job Detail ---
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
  var name = job.homeownerName || ((job.homeowner?.firstName || '') + ' ' + (job.homeowner?.lastName || '')).trim() || 'Unknown';

  var html = '<div style="padding:16px;max-width:540px;margin:0 auto">';

  // Header
  html += '<div style="margin-bottom:16px">';
  html += '<button onclick="closeJobDetail()" style="background:none;border:none;color:var(--teal);font-size:14px;font-weight:600;cursor:pointer;padding:0;margin-bottom:8px">&larr; My Jobs</button>';
  html += '<h2 style="font-size:18px;color:var(--navy);margin:0 0 4px">' + name + '</h2>';
  html += '<div style="font-size:13px;color:var(--gray);margin-bottom:8px">' + (job.address || '') + '</div>';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap">' + pipelineBadge(job.pipeline || job.jobCategory || 'insurance');
  html += ' <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:' + sc + ';color:#fff;font-weight:600">' + stageLabel(job.stage) + '</span></div>';
  html += '</div>';

  // Quick Actions
  html += '<div style="display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:16px;padding-bottom:4px">';
  if (phone) {
    html += '<a href="tel:' + phone + '" style="text-decoration:none;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0">'
      + '<span style="font-size:20px">&#128222;</span><span style="font-size:11px;color:var(--gray)">Call</span></a>';
    html += '<a href="sms:' + phone + '" style="text-decoration:none;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0">'
      + '<span style="font-size:20px">&#128172;</span><span style="font-size:11px;color:var(--gray)">Text</span></a>';
  }
  html += '<a href="https://crc-supplements-portal.onrender.com/#job-' + job.id + '" target="_blank" style="text-decoration:none;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0">'
    + '<span style="font-size:20px">&#128187;</span><span style="font-size:11px;color:var(--gray)">Portal</span></a>';
  html += '<button onclick="typeof switchView===\'function\'?switchView(\'camera\'):alert(\'Camera coming soon\')" style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;flex-shrink:0;cursor:pointer">'
    + '<span style="font-size:20px">&#128247;</span><span style="font-size:11px;color:var(--gray)">Camera</span></button>';
  html += '</div>';

  // Job Info
  html += '<div style="background:var(--white);border-radius:10px;border:1px solid var(--border);padding:14px;margin-bottom:16px">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Job Info</div>';
  var infoRows = [
    ['Carrier', job.carrier || 'Not set'],
    ['Claim #', job.claimNumber || 'None'],
    ['Adjuster Meeting', job.adjusterDate ? new Date(job.adjusterDate).toLocaleDateString() : 'Not set'],
    ['Created', job.created_at ? new Date(job.created_at).toLocaleDateString() : '']
  ];
  for (var i = 0; i < infoRows.length; i++) {
    if (!infoRows[i][1]) continue;
    html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px' + (i < infoRows.length - 1 ? ';border-bottom:1px solid var(--bg)' : '') + '">';
    html += '<span style="color:var(--gray)">' + infoRows[i][0] + '</span><span style="color:var(--navy);font-weight:500">' + infoRows[i][1] + '</span></div>';
  }
  html += '</div>';

  // Notes
  html += '<div style="background:var(--white);border-radius:10px;border:1px solid var(--border);padding:14px;margin-bottom:16px">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Notes</div>';
  html += '<div id="job-notes-list">';
  html += renderJobNotes(job.jobNotes || []);
  html += '</div>';
  html += '<div style="margin-top:10px">';
  html += '<textarea id="job-note-input" placeholder="Add a note..." rows="2" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;resize:none;box-sizing:border-box"></textarea>';
  html += '<button onclick="addJobNote(\'' + job.id + '\')" style="margin-top:6px;background:var(--teal);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;width:100%">Add Note</button>';
  html += '</div></div>';

  // Tasks
  html += '<div style="background:var(--white);border-radius:10px;border:1px solid var(--border);padding:14px;margin-bottom:16px">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Tasks</div>';
  html += '<div id="job-tasks-list">';
  html += renderJobTasks(job.tasks || [], job.id);
  html += '</div>';
  html += '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">';
  html += '<input type="text" id="job-task-input" placeholder="New task..." style="flex:1;min-width:120px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px">';
  html += '<input type="date" id="job-task-date" style="padding:8px;border:1px solid var(--border);border-radius:8px;font-size:13px">';
  html += '<button onclick="addJobTask(\'' + job.id + '\')" style="background:var(--navy);color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">Add Task</button>';
  html += '</div></div>';

  // Back
  html += '<button onclick="closeJobDetail()" style="width:100%;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:14px;cursor:pointer;margin-bottom:20px">Back to My Jobs</button>';
  html += '</div>';

  detail.innerHTML = html;
}

function renderJobNotes(notes) {
  if (!notes.length) return '<div style="font-size:13px;color:var(--gray);padding:4px 0">No notes yet</div>';
  return notes.slice().reverse().map(function(n) {
    return '<div style="padding:8px 0;border-bottom:1px solid var(--bg)">'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray);margin-bottom:2px">'
      + '<span style="font-weight:600">' + (n.repName || n.repCode || 'System') + '</span>'
      + '<span>' + timeAgo(n.createdAt || n.timestamp) + '</span></div>'
      + '<div style="font-size:13px;color:var(--navy)">' + (n.text || '') + '</div></div>';
  }).join('');
}

function renderJobTasks(tasks, jobId) {
  if (!tasks.length) return '<div style="font-size:13px;color:var(--gray);padding:4px 0">No tasks</div>';
  var open = tasks.filter(function(t) { return !t.completed; });
  var done = tasks.filter(function(t) { return t.completed; });
  var sorted = open.concat(done);
  return sorted.map(function(t) {
    var overdue = !t.completed && t.dueDate && new Date(t.dueDate) < new Date();
    var checked = t.completed ? 'checked' : '';
    var strike = t.completed ? 'text-decoration:line-through;color:var(--gray)' : '';
    return '<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--bg)">'
      + '<input type="checkbox" ' + checked + ' onchange="toggleJobTask(\'' + jobId + '\',\'' + (t.id || t._id) + '\',this.checked)" style="margin-top:2px;width:18px;height:18px;accent-color:var(--teal)">'
      + '<div style="flex:1;' + strike + '">'
      + '<div style="font-size:13px">' + (t.text || '') + '</div>'
      + (t.dueDate ? '<div style="font-size:11px;color:' + (overdue ? '#DC2626;font-weight:600' : 'var(--gray)') + '">' + (overdue ? 'Overdue - ' : 'Due ') + new Date(t.dueDate).toLocaleDateString() + '</div>' : '')
      + '</div></div>';
  }).join('');
}

function closeJobDetail() {
  document.getElementById('job-detail').classList.remove('open');
  document.getElementById('view-jobs').style.display = '';
  loadJobs();
}

// --- Actions ---
async function addJobNote(jobId) {
  var input = document.getElementById('job-note-input');
  var text = input.value.trim();
  if (!text) return;
  input.disabled = true;
  try {
    await fetch('/api/field/jobs/' + jobId + '/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, repCode: repCode, repName: repName })
    });
    input.value = '';
    // Refresh notes only
    var job = await fetch('/api/field/jobs/' + jobId).then(function(r) { return r.json(); });
    _currentJobDetail = job;
    var el = document.getElementById('job-notes-list');
    if (el) el.innerHTML = renderJobNotes(job.jobNotes || []);
  } catch (e) { alert('Error: ' + e.message); }
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, repCode: repCode, dueDate: dateInput.value || null })
    });
    input.value = ''; dateInput.value = '';
    var job = await fetch('/api/field/jobs/' + jobId).then(function(r) { return r.json(); });
    _currentJobDetail = job;
    var el = document.getElementById('job-tasks-list');
    if (el) el.innerHTML = renderJobTasks(job.tasks || [], jobId);
  } catch (e) { alert('Error: ' + e.message); }
  input.disabled = false;
}

async function toggleJobTask(jobId, taskId, completed) {
  try {
    await fetch('/api/field/jobs/' + jobId + '/tasks/' + taskId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: completed })
    });
    var job = await fetch('/api/field/jobs/' + jobId).then(function(r) { return r.json(); });
    _currentJobDetail = job;
    var el = document.getElementById('job-tasks-list');
    if (el) el.innerHTML = renderJobTasks(job.tasks || [], jobId);
  } catch (e) { alert('Error: ' + e.message); }
}
