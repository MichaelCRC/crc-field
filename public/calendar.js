/* Company Calendar — crc@ company events (trainings/builds/meetings) + the
   rep's own appointments. Read-only. repCode is the global set at login. */
function initCalendar() {
  var v = document.getElementById('view-calendar');
  if (!v) return;
  v.innerHTML = '<div style="padding:18px 16px 90px">'
    + '<div style="font-size:22px;font-weight:800;color:#fff">Company Calendar</div>'
    + '<div style="color:#94a3b8;font-size:13px;margin-bottom:16px">CRC trainings, builds &amp; meetings — plus your own appointments</div>'
    + '<div id="cal-body"><div style="color:#94a3b8">Loading…</div></div></div>';
  var rep = (typeof repCode !== 'undefined' ? repCode : '').toUpperCase();
  fetch('/api/calendar?rep=' + encodeURIComponent(rep))
    .then(function (r) { return r.json(); })
    .then(calRender)
    .catch(function () { var b = document.getElementById('cal-body'); if (b) b.innerHTML = '<div style="color:#fca5a5;font-size:13px">Could not load the calendar.</div>'; });
}

function calRender(d) {
  var body = document.getElementById('cal-body');
  if (!body) return;
  var company = (d.company || []).map(function (e) { e._co = true; return e; });
  var personal = (d.personal || []).map(function (e) { e._co = false; return e; });
  var all = company.concat(personal).filter(function (e) { return e.start; });
  all.sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
  if (!all.length) { body.innerHTML = '<div style="color:#94a3b8;font-size:14px">Nothing scheduled in the next 30 days.</div>'; return; }

  var groups = {}, order = [];
  all.forEach(function (e) {
    var key = new Date(e.start).toISOString().slice(0, 10);
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(e);
  });

  body.innerHTML = order.map(function (key) {
    var dt = new Date(key + 'T12:00:00');
    var hdr = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    var items = groups[key].map(function (e) {
      var t = new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      var tag = e._co
        ? '<span style="background:#07BFEE;color:#06263a;font-size:10px;font-weight:800;padding:2px 7px;border-radius:6px">COMPANY</span>'
        : '<span style="background:#334155;color:#cbd5e1;font-size:10px;font-weight:800;padding:2px 7px;border-radius:6px">MINE</span>';
      return '<div style="background:#16213e;border:1px solid #2a3a5c;border-radius:10px;padding:11px 13px;margin-bottom:8px">'
        + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div style="font-weight:700;color:#fff;font-size:14px">' + (e.summary || '(busy)') + '</div>' + tag + '</div>'
        + '<div style="color:#94a3b8;font-size:12px;margin-top:3px">' + t + (e.location ? ' · ' + e.location : '') + '</div></div>';
    }).join('');
    return '<div style="margin-bottom:16px"><div style="color:#07BFEE;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">' + hdr + '</div>' + items + '</div>';
  }).join('');
}
