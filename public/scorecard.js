/* My Day — daily rep scorecard. Tap counters; persists to /api/scorecard.
   repCode is the global set at login (app.js). */
var _scData = null;
var SC_METRICS = [
  { k: 'talk_tos',        label: 'Talk Tos',        icon: '🗣️', goal: 20 },
  { k: 'inspections_ran', label: 'Inspections Ran', icon: '🔍' },
  { k: 'sales_appts',     label: 'Sit-Downs',       icon: '🤝' },
  { k: 'claims_filed',    label: 'Claims Filed',    icon: '📋' },
  { k: 'approvals',       label: 'Approvals',       icon: '✅' },
];

function scRep() { return (typeof repCode !== 'undefined' ? repCode : '').toUpperCase(); }
function scHeaders() { return { 'Content-Type': 'application/json', 'X-Field-Rep': scRep() }; }

function initScorecard() {
  var v = document.getElementById('view-scorecard');
  if (!v) return;
  var today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  v.innerHTML = '<div style="padding:18px 16px 90px">'
    + '<div style="font-size:22px;font-weight:800;color:#ffffff">My Day</div>'
    + '<div style="color:#94a3b8;font-size:13px;margin-bottom:16px">' + today + '</div>'
    + '<div id="sc-tiles"><div style="color:#94a3b8">Loading…</div></div></div>';
  scLoad();
}

function scLoad() {
  fetch('/api/scorecard?rep=' + encodeURIComponent(scRep()))
    .then(function (r) { return r.json(); })
    .then(function (d) { _scData = d.scorecard || {}; scRender(); })
    .catch(function () { document.getElementById('sc-tiles').innerHTML = '<div style="color:#c00;font-size:13px">Could not load your scorecard.</div>'; });
}

function scRender() {
  var wrap = document.getElementById('sc-tiles');
  if (!wrap) return;
  wrap.innerHTML = '';
  SC_METRICS.forEach(function (m) {
    var val = _scData[m.k] || 0;
    var tile = document.createElement('div');
    tile.style.cssText = 'background:#fff;border:1px solid #e3e8f0;border-radius:14px;padding:15px 16px;margin-bottom:12px;display:flex;align-items:center;gap:14px';
    var left = document.createElement('div'); left.style.cssText = 'flex:1;min-width:0';
    var goalTxt = m.goal ? ' <span style="font-size:15px;color:#94a3b8;font-weight:700">/ ' + m.goal + '</span>' : '';
    var bar = '';
    if (m.goal) {
      var pct = Math.min(100, Math.round(val / m.goal * 100));
      bar = '<div style="height:6px;background:#e8edf5;border-radius:3px;margin-top:9px;overflow:hidden">'
          + '<div style="height:100%;width:' + pct + '%;background:' + (pct >= 100 ? '#16a34a' : '#07BFEE') + '"></div></div>';
    }
    left.innerHTML = '<div style="font-size:13px;color:#566;font-weight:700">' + m.icon + '  ' + m.label + '</div>'
      + '<div style="font-size:32px;font-weight:800;color:#0A1530;line-height:1.05;margin-top:3px">' + val + goalTxt + '</div>' + bar;
    var btns = document.createElement('div'); btns.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex:0 0 auto';
    btns.appendChild(scBtn('+', function () { scBump(m.k, 1); }));
    btns.appendChild(scBtn('–', function () { scBump(m.k, -1); }));
    tile.appendChild(left); tile.appendChild(btns); wrap.appendChild(tile);
  });

  // Money Collected — a dollar entry (adds), not a tap counter.
  var collected = Number(_scData.collected || 0);
  var mt = document.createElement('div');
  mt.style.cssText = 'background:#fff;border:1px solid #e3e8f0;border-radius:14px;padding:15px 16px;margin-bottom:12px';
  mt.innerHTML = '<div style="font-size:13px;color:#566;font-weight:700">💵  Money Collected Today</div>'
    + '<div style="font-size:30px;font-weight:800;color:#16a34a;line-height:1.05;margin:3px 0 11px">$' + collected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</div>'
    + '<div style="display:flex;gap:8px">'
    + '<input id="sc-collect-amt" type="number" inputmode="decimal" placeholder="Add a payment ($)" style="flex:1;min-width:0;padding:12px;border:1px solid #d8dee9;border-radius:10px;font-size:15px">'
    + '<button id="sc-collect-btn" type="button" style="flex:0 0 auto;padding:0 20px;border:none;border-radius:10px;background:#16a34a;color:#fff;font-weight:800;font-size:15px;cursor:pointer">Add</button>'
    + '</div>';
  wrap.appendChild(mt);
  var btn = document.getElementById('sc-collect-btn');
  var inp = document.getElementById('sc-collect-amt');
  if (btn) btn.onclick = scAddMoney;
  if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') scAddMoney(); });
}

function scAddMoney() {
  var inp = document.getElementById('sc-collect-amt');
  var amt = Math.round((parseFloat(inp && inp.value) || 0) * 100) / 100;
  if (!amt || amt <= 0) { if (inp) inp.focus(); return; }
  _scData.collected = (Number(_scData.collected) || 0) + amt; // optimistic
  scRender();
  fetch('/api/scorecard/collect', { method: 'POST', headers: scHeaders(), body: JSON.stringify({ amount: amt }) })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d && d.scorecard) { _scData = d.scorecard; scRender(); } })
    .catch(function () { /* keep optimistic */ });
}

function scBtn(txt, fn) {
  var b = document.createElement('button');
  b.type = 'button'; b.textContent = txt; b.onclick = fn;
  b.style.cssText = 'width:50px;height:42px;border-radius:11px;border:none;font-size:24px;font-weight:800;cursor:pointer;'
    + (txt === '+' ? 'background:#07BFEE;color:#06263a' : 'background:#eef2f7;color:#667');
  return b;
}

function scBump(metric, delta) {
  _scData[metric] = Math.max(0, (_scData[metric] || 0) + delta); // optimistic
  scRender();
  fetch('/api/scorecard/increment', { method: 'POST', headers: scHeaders(), body: JSON.stringify({ metric: metric, delta: delta }) })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d && d.scorecard) { _scData = d.scorecard; scRender(); } })
    .catch(function () { /* keep optimistic value */ });
}
