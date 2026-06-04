/* Leadership board (L10) — Rocks / To-Dos / Issues. Admin-only.
   repCode is the global set at login; appended as ?auth= for the admin gate. */
var LEAD_DATA = { rocks: [], todos: [], issues: [] };
var LEAD_SECTIONS = [
  { key: 'rocks', type: 'rock', label: 'Rocks', sub: 'Quarterly priorities', cycle: ['on_track', 'off_track', 'done'] },
  { key: 'todos', type: 'todo', label: 'To-Dos', sub: 'This week', cycle: ['open', 'done'] },
  { key: 'issues', type: 'issue', label: 'Issues', sub: 'Identify · Discuss · Solve', cycle: ['open', 'solved'] },
];
var LEAD_STATUS = {
  on_track: { t: 'On Track', bg: '#16a34a', fg: '#fff' }, off_track: { t: 'Off Track', bg: '#dc2626', fg: '#fff' },
  done: { t: 'Done', bg: '#334155', fg: '#cbd5e1' }, open: { t: 'Open', bg: '#07BFEE', fg: '#06263a' },
  solved: { t: 'Solved', bg: '#16a34a', fg: '#fff' },
};
function _leadAuth() { return (typeof repCode !== 'undefined' ? repCode : '').toUpperCase(); }
function _leadQS() { return '?auth=' + encodeURIComponent(_leadAuth()); }
function _leadEsc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function initLeadership() {
  var v = document.getElementById('view-leadership');
  if (!v) return;
  v.innerHTML = '<div style="padding:18px 16px 90px">'
    + '<div style="font-size:22px;font-weight:800;color:#fff">Leadership</div>'
    + '<div style="color:#94a3b8;font-size:13px;margin-bottom:18px">Rocks · To-Dos · Issues — run your L10 from here</div>'
    + '<div id="lead-body"><div style="color:#94a3b8">Loading…</div></div></div>';
  leadLoad();
}
function leadLoad() {
  fetch('/api/leadership' + _leadQS())
    .then(function (r) { return r.json(); })
    .then(function (d) { LEAD_DATA = { rocks: d.rocks || [], todos: d.todos || [], issues: d.issues || [] }; leadRender(); })
    .catch(function () { var b = document.getElementById('lead-body'); if (b) b.innerHTML = '<div style="color:#fca5a5;font-size:13px">Could not load the board.</div>'; });
}
function leadRender() {
  var body = document.getElementById('lead-body');
  if (!body) return;
  body.innerHTML = '';
  LEAD_SECTIONS.forEach(function (sec) {
    var wrap = document.createElement('div'); wrap.style.cssText = 'margin-bottom:24px';
    var hd = document.createElement('div'); hd.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px';
    hd.innerHTML = '<div style="color:#07BFEE;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.5px">' + sec.label + '</div><div style="color:#64748b;font-size:11px">' + sec.sub + '</div>';
    wrap.appendChild(hd);
    var items = LEAD_DATA[sec.key] || [];
    if (!items.length) { var empty = document.createElement('div'); empty.style.cssText = 'color:#64748b;font-size:13px;padding:4px 0 4px'; empty.textContent = 'Nothing here yet.'; wrap.appendChild(empty); }
    items.forEach(function (it) { wrap.appendChild(leadItem(it, sec)); });
    var add = document.createElement('div'); add.style.cssText = 'display:flex;gap:8px;margin-top:8px';
    add.innerHTML = '<input placeholder="Add a ' + sec.type + '…" style="flex:1;min-width:0;padding:11px;border:1px solid #2a3a5c;background:#0d1830;color:#fff;border-radius:10px;font-size:14px"><button type="button" style="flex:0 0 auto;padding:0 18px;border:none;border-radius:10px;background:#07BFEE;color:#06263a;font-weight:800;cursor:pointer">Add</button>';
    var inp = add.querySelector('input'), btn = add.querySelector('button');
    var doAdd = function () { var t = inp.value.trim(); if (!t) return; inp.value = ''; leadAdd(sec.type, t); };
    btn.onclick = doAdd; inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doAdd(); });
    wrap.appendChild(add);
    body.appendChild(wrap);
  });
}
function leadItem(it, sec) {
  var row = document.createElement('div'); row.style.cssText = 'background:#16213e;border:1px solid #2a3a5c;border-radius:10px;padding:11px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px';
  var st = LEAD_STATUS[it.status] || { t: it.status, bg: '#334155', fg: '#fff' };
  var done = it.status === 'done' || it.status === 'solved';
  var chip = document.createElement('button'); chip.type = 'button'; chip.textContent = st.t; chip.title = 'Tap to change';
  chip.style.cssText = 'flex:0 0 auto;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:800;cursor:pointer;background:' + st.bg + ';color:' + st.fg;
  chip.onclick = function () { var c = sec.cycle; var ni = (c.indexOf(it.status) + 1) % c.length; leadUpdate(it.id, { status: c[ni] }); };
  var mid = document.createElement('div'); mid.style.cssText = 'flex:1;min-width:0';
  mid.innerHTML = '<div style="font-size:14px;font-weight:600;color:' + (done ? '#64748b' : '#fff') + ';' + (done ? 'text-decoration:line-through' : '') + '">' + _leadEsc(it.title) + '</div>' + (it.owner ? '<div style="font-size:12px;color:#94a3b8;margin-top:2px">' + _leadEsc(it.owner) + '</div>' : '');
  var del = document.createElement('button'); del.type = 'button'; del.innerHTML = '&times;'; del.title = 'Delete';
  del.style.cssText = 'flex:0 0 auto;border:none;background:none;color:#64748b;font-size:22px;cursor:pointer;line-height:1;padding:0 4px';
  del.onclick = function () { if (confirm('Delete this ' + sec.type + '?')) leadDelete(it.id); };
  row.appendChild(chip); row.appendChild(mid); row.appendChild(del);
  return row;
}
function leadAdd(type, title) {
  fetch('/api/leadership' + _leadQS(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: type, title: title, createdBy: _leadAuth() }) })
    .then(function (r) { return r.json(); }).then(function () { leadLoad(); }).catch(function () {});
}
function leadUpdate(id, patch) {
  fetch('/api/leadership/' + id + _leadQS(), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    .then(function (r) { return r.json(); }).then(function () { leadLoad(); }).catch(function () {});
}
function leadDelete(id) {
  fetch('/api/leadership/' + id + _leadQS(), { method: 'DELETE' })
    .then(function (r) { return r.json(); }).then(function () { leadLoad(); }).catch(function () {});
}
