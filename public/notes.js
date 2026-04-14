/* CRC Notes — field app view.
 *
 * Two-panel desktop (≥1200px), single-panel mobile. Auto-saves 2s after
 * the user stops typing. Talks to the portal at FEED_PORTAL_URL using
 * the same X-Field-App-Key + X-Field-Rep headers as feed.js. Offline
 * basics: a tiny pendingPatches queue in memory + last-list cache in
 * localStorage so re-entering the view feels instant. */
const NOTES_PORTAL_URL = (typeof FEED_PORTAL_URL !== 'undefined' && FEED_PORTAL_URL) || 'https://crc-supplements-portal.onrender.com';
const NOTES_APP_KEY = (typeof FEED_APP_KEY !== 'undefined' && FEED_APP_KEY) || 'crc-field-2026';
const NOTES_CACHE_KEY = 'crc_notes_cache_v1';

const NOTEBOOK_META = {
  all:        { label: 'All Notes',  icon: '📋', color: 'var(--text-muted)' },
  operations: { label: 'Operations', icon: '🏗', color: 'var(--teal)' },
  ideas:      { label: 'Ideas',      icon: '💡', color: 'var(--amber)' },
  meetings:   { label: 'Meetings',   icon: '📅', color: 'var(--navy)' },
  personal:   { label: 'Personal',   icon: '👤', color: 'var(--steel-mid)' },
  jobs:       { label: 'Job Notes',  icon: '📌', color: 'var(--green)' },
};

const notesState = {
  notes: [],
  notebooks: [],
  filterNotebook: 'all',
  search: '',
  selectedId: null,
  jobsCache: null,
  loading: false,
  saveStatus: '',
  saveTimer: null,
  pendingPatches: {},  // id → patch payload (queued while offline)
};

function notesHeaders(extra) {
  return Object.assign({
    'X-Field-App-Key': NOTES_APP_KEY,
    'X-Field-Rep': (typeof repCode !== 'undefined' && repCode ? repCode : (localStorage.getItem('crc-rep-code') || 'MCG')).toUpperCase(),
  }, extra || {});
}
async function notesFetch(path, opts) {
  opts = opts || {};
  opts.headers = notesHeaders(opts.headers);
  return fetch(NOTES_PORTAL_URL + path, opts);
}

async function initNotes() {
  // Render skeleton from cache for instant paint, then fetch.
  hydrateNotesFromCache();
  renderNotesView();
  await Promise.all([loadNotesList(), loadNotebooks(), ensureJobsCache()]);
  renderNotesView();
  flushPendingPatches();
}

function hydrateNotesFromCache() {
  try {
    const raw = localStorage.getItem(NOTES_CACHE_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw);
    if (Array.isArray(cached.notes)) notesState.notes = cached.notes;
    if (Array.isArray(cached.notebooks)) notesState.notebooks = cached.notebooks;
  } catch {}
}
function persistNotesCache() {
  try {
    localStorage.setItem(NOTES_CACHE_KEY, JSON.stringify({
      notes: notesState.notes, notebooks: notesState.notebooks,
    }));
  } catch {}
}

async function loadNotesList() {
  const params = new URLSearchParams();
  if (notesState.filterNotebook && notesState.filterNotebook !== 'all') params.set('notebook', notesState.filterNotebook);
  if (notesState.search) params.set('search', notesState.search);
  try {
    const r = await notesFetch('/api/notes?' + params.toString());
    if (!r.ok) throw new Error('list failed');
    const body = await r.json();
    notesState.notes = body.notes || [];
    persistNotesCache();
  } catch (e) {
    notesState.saveStatus = 'Offline';
  }
}

async function loadNotebooks() {
  try {
    const r = await notesFetch('/api/notes/notebooks');
    if (!r.ok) throw new Error();
    const body = await r.json();
    notesState.notebooks = body.notebooks || [];
    persistNotesCache();
  } catch {}
}

async function ensureJobsCache() {
  if (notesState.jobsCache) return;
  try {
    const r = await notesFetch('/api/jobs');
    if (!r.ok) throw new Error();
    notesState.jobsCache = await r.json();
  } catch { notesState.jobsCache = []; }
}

function renderNotesView() {
  const host = document.getElementById('view-notes');
  if (!host) return;
  host.innerHTML = `
    <div class="notes-shell">
      <aside class="notes-sidebar">
        <div class="notes-sidebar-search">
          <input type="text" id="notes-search" placeholder="Search notes..." value="${escNotes(notesState.search)}" oninput="onNotesSearchInput(this.value)">
        </div>
        <button class="notes-new-btn" onclick="newNote()">+ NEW NOTE</button>
        <div class="notes-section-label">NOTEBOOKS</div>
        <div class="notes-notebook-list">${renderNotebookList()}</div>
        <div class="notes-section-label">${notesState.search ? 'RESULTS' : 'NOTES'}</div>
        <div class="notes-list">${renderNoteList()}</div>
      </aside>
      <main class="notes-editor" id="notes-editor">${renderEditor()}</main>
      <button class="notes-fab" onclick="newNote()" aria-label="New note">+</button>
    </div>
  `;
}

function renderNotebookList() {
  const items = notesState.notebooks.length
    ? notesState.notebooks
    : Object.keys(NOTEBOOK_META).map(id => ({ id, label: NOTEBOOK_META[id].label, count: 0 }));
  return items.map(nb => {
    const meta = NOTEBOOK_META[nb.id] || { icon: '•', color: 'var(--text-muted)' };
    const active = notesState.filterNotebook === nb.id ? ' active' : '';
    return `<button class="notes-notebook${active}" onclick="setNotebookFilter('${nb.id}')">
      <span class="notes-notebook-icon" style="color:${meta.color}">${meta.icon}</span>
      <span class="notes-notebook-label">${escNotes(nb.label)}</span>
      <span class="notes-notebook-count">${nb.count || 0}</span>
    </button>`;
  }).join('');
}

function renderNoteList() {
  if (notesState.loading && !notesState.notes.length) return '<div class="notes-empty">Loading...</div>';
  if (!notesState.notes.length) {
    return '<div class="notes-empty">' + (notesState.search ? 'No matches' : 'No notes yet — tap + to create one') + '</div>';
  }
  return notesState.notes.map(n => {
    const meta = NOTEBOOK_META[n.notebook] || NOTEBOOK_META.operations;
    const sel = notesState.selectedId === n.id ? ' selected' : '';
    const pinned = n.pinned ? '<span class="notes-pin-mark">📌</span>' : '';
    const job = n.jobName ? `<span class="notes-job-pill">${escNotes(n.jobName)}</span>` : '';
    const preview = (n.body || '').slice(0, 80).replace(/\n/g, ' ');
    return `<button class="notes-row${sel}" style="border-left-color:${meta.color}" onclick="selectNote('${n.id}')">
      <div class="notes-row-top">${pinned}<span class="notes-row-title">${escNotes(n.title || 'Untitled')}</span><span class="notes-row-time">${notesRelTime(n.updatedAt)}</span></div>
      ${preview ? `<div class="notes-row-preview">${escNotes(preview)}</div>` : ''}
      ${job ? `<div class="notes-row-meta">${job}</div>` : ''}
    </button>`;
  }).join('');
}

function renderEditor() {
  const n = notesState.notes.find(x => x.id === notesState.selectedId);
  if (!n) {
    return `<div class="notes-editor-empty">
      <div class="notes-editor-empty-icon">📝</div>
      <div>Select a note to edit, or tap "+ NEW NOTE" to start.</div>
    </div>`;
  }
  const jobOptions = ['<option value="">— None —</option>'].concat(
    (notesState.jobsCache || []).map(j => {
      const name = (j.homeowner?.firstName || '') + ' ' + (j.homeowner?.lastName || '');
      const label = (name.trim() || j.homeownerName || j.address || j.id) + ' — ' + (j.address || '');
      const sel = j.id === n.jobId ? ' selected' : '';
      return `<option value="${escNotes(j.id)}"${sel}>${escNotes(label)}</option>`;
    })
  ).join('');
  const notebookOptions = ['operations', 'ideas', 'meetings', 'personal', 'jobs'].map(id => {
    const sel = id === n.notebook ? ' selected' : '';
    return `<option value="${id}"${sel}>${NOTEBOOK_META[id].label}</option>`;
  }).join('');
  return `
    <div class="notes-editor-head">
      <button class="notes-back" onclick="closeNote()">&larr; Back</button>
      <span class="notes-save-status">${escNotes(notesState.saveStatus || '')}</span>
    </div>
    <input class="notes-title" id="notes-title" type="text" value="${escNotes(n.title || '')}" placeholder="Note title..." oninput="queueSave()">
    <div class="notes-meta-row">
      <label>Notebook
        <select id="notes-notebook" onchange="queueSave()">${notebookOptions}</select>
      </label>
      <label>Job
        <select id="notes-job" onchange="queueSave()">${jobOptions}</select>
      </label>
      <label>Tags
        <input id="notes-tags" type="text" value="${escNotes((n.tags || []).join(', '))}" placeholder="adjuster, prep" oninput="queueSave()">
      </label>
    </div>
    ${n.jobId ? renderJobContextCard(n) : ''}
    <textarea class="notes-body" id="notes-body" placeholder="Write here…" oninput="queueSave()">${escNotes(n.body || '')}</textarea>
    <div class="notes-editor-actions">
      <button class="notes-action" onclick="togglePin()">${n.pinned ? '📌 Unpin' : '📌 Pin'}</button>
      <button class="notes-action" onclick="copyNote()">📋 Copy</button>
      <button class="notes-action notes-action-archive" onclick="archiveNote()">📦 Archive</button>
      <button class="notes-action notes-action-danger" onclick="deleteNote()">🗑 Delete</button>
    </div>
  `;
}

function renderJobContextCard(n) {
  const job = (notesState.jobsCache || []).find(j => j.id === n.jobId);
  if (!job) return '';
  const name = job.homeownerName || ((job.homeowner?.firstName || '') + ' ' + (job.homeowner?.lastName || '')).trim() || 'Job';
  return `<div class="notes-job-card">
    <div class="notes-job-card-name">${escNotes(name)}</div>
    <div class="notes-job-card-sub">${escNotes(job.address || '')} · ${escNotes(job.stage || '')} · ${escNotes(job.carrier || '')}</div>
  </div>`;
}

// ── Interaction ───────────────────────────────────────────────────
async function setNotebookFilter(id) {
  notesState.filterNotebook = id;
  notesState.selectedId = null;
  await loadNotesList();
  renderNotesView();
}

let _searchTimer = null;
function onNotesSearchInput(v) {
  notesState.search = v;
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(async () => {
    await loadNotesList();
    renderNotesView();
  }, 300);
}

async function newNote() {
  const payload = {
    title: '',
    body: '',
    notebook: notesState.filterNotebook && notesState.filterNotebook !== 'all' ? notesState.filterNotebook : 'operations',
  };
  try {
    const r = await notesFetch('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error();
    const body = await r.json();
    notesState.notes.unshift(body.note);
    notesState.selectedId = body.note.id;
    persistNotesCache();
    renderNotesView();
    setTimeout(() => document.getElementById('notes-title')?.focus(), 50);
  } catch { alert('Could not create note (offline?)'); }
}

function selectNote(id) {
  notesState.selectedId = id;
  notesState.saveStatus = '';
  document.body.classList.add('notes-editing');
  renderNotesView();
}
function closeNote() {
  notesState.selectedId = null;
  document.body.classList.remove('notes-editing');
  renderNotesView();
}

function readEditorPatch() {
  const sel = document.getElementById('notes-job');
  const jobId = sel ? sel.value || null : null;
  const job = jobId ? (notesState.jobsCache || []).find(j => j.id === jobId) : null;
  return {
    title: document.getElementById('notes-title')?.value || '',
    body: document.getElementById('notes-body')?.value || '',
    notebook: document.getElementById('notes-notebook')?.value || 'operations',
    jobId: jobId,
    jobName: job ? (job.homeownerName || ((job.homeowner?.firstName || '') + ' ' + (job.homeowner?.lastName || '')).trim()) : null,
    jobAddress: job ? (job.address || null) : null,
    tags: (document.getElementById('notes-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean),
  };
}

function queueSave() {
  if (!notesState.selectedId) return;
  notesState.saveStatus = 'Saving…';
  document.querySelector('.notes-save-status') && (document.querySelector('.notes-save-status').textContent = 'Saving…');
  clearTimeout(notesState.saveTimer);
  notesState.saveTimer = setTimeout(commitSave, 1500);
}

async function commitSave() {
  const id = notesState.selectedId;
  if (!id) return;
  const patch = readEditorPatch();
  try {
    const r = await notesFetch('/api/notes/' + encodeURIComponent(id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!r.ok) throw new Error();
    const body = await r.json();
    Object.assign(notesState.notes.find(n => n.id === id) || {}, body.note);
    notesState.saveStatus = 'Saved ✓';
    persistNotesCache();
    refreshNotebookCounts();
  } catch {
    // Queue for later flush.
    notesState.pendingPatches[id] = patch;
    notesState.saveStatus = 'Offline — queued';
  }
  const el = document.querySelector('.notes-save-status');
  if (el) el.textContent = notesState.saveStatus;
}

async function flushPendingPatches() {
  const ids = Object.keys(notesState.pendingPatches);
  if (!ids.length) return;
  for (const id of ids) {
    try {
      const r = await notesFetch('/api/notes/' + encodeURIComponent(id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notesState.pendingPatches[id])
      });
      if (r.ok) delete notesState.pendingPatches[id];
    } catch {}
  }
}

async function refreshNotebookCounts() {
  await loadNotebooks();
  const el = document.querySelector('.notes-notebook-list');
  if (el) el.innerHTML = renderNotebookList();
}

async function togglePin() {
  const id = notesState.selectedId;
  const n = notesState.notes.find(x => x.id === id);
  if (!n) return;
  try {
    const r = await notesFetch('/api/notes/' + encodeURIComponent(id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !n.pinned })
    });
    if (r.ok) {
      const body = await r.json();
      Object.assign(n, body.note);
      // Re-sort so pinned moves to the top.
      notesState.notes.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.updatedAt) - new Date(a.updatedAt)));
      renderNotesView();
    }
  } catch {}
}

function copyNote() {
  const body = document.getElementById('notes-body')?.value || '';
  navigator.clipboard?.writeText(body).then(() => { notesState.saveStatus = 'Copied'; const el = document.querySelector('.notes-save-status'); if (el) el.textContent = 'Copied'; });
}

async function archiveNote() {
  const id = notesState.selectedId;
  if (!id || !confirm('Archive this note? It can be restored later.')) return;
  try {
    await notesFetch('/api/notes/' + encodeURIComponent(id), { method: 'DELETE' });
    notesState.notes = notesState.notes.filter(n => n.id !== id);
    notesState.selectedId = null;
    persistNotesCache();
    refreshNotebookCounts();
    renderNotesView();
  } catch { alert('Could not archive (offline?)'); }
}

async function deleteNote() {
  const id = notesState.selectedId;
  if (!id || !confirm('Permanently delete this note?')) return;
  try {
    await notesFetch('/api/notes/' + encodeURIComponent(id) + '?hard=true', { method: 'DELETE' });
    notesState.notes = notesState.notes.filter(n => n.id !== id);
    notesState.selectedId = null;
    persistNotesCache();
    refreshNotebookCounts();
    renderNotesView();
  } catch { alert('Could not delete (offline?)'); }
}

// ── Helpers ───────────────────────────────────────────────────────
function escNotes(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function notesRelTime(ts) {
  if (!ts) return '';
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.round(d / 60000) + 'm';
  if (d < 86400000) return Math.round(d / 3600000) + 'h';
  if (d < 7 * 86400000) return Math.round(d / 86400000) + 'd';
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
