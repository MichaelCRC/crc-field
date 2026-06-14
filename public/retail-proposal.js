/* CRC Retail Proposal — field trigger for the CRC engine (Mac Mini).
 *
 * Flow: rep opens a job that already has measurements (Hover pull / QuickMeasure
 * upload), fills the few complexities the engine needs that aren't in the
 * measurement data, and taps Generate. The field server enqueues a task on the
 * portal; the Mac Mini's Hermes runs build_retail_proposal.py and posts the
 * PDF back, which we surface here for download/share.
 *
 * The engine is the source of truth for pricing — this only collects inputs.
 */
var _rpState = null;
var _rpPortalBase = 'https://crc-supplements-dev.onrender.com';

function _rpEsc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _rpNum(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

async function openRetailProposal(jobId) {
  var job;
  try {
    job = await fetch('/api/field/jobs/' + jobId).then(function (r) { return r.json(); });
  } catch (e) { alert('Could not load job: ' + e.message); return; }
  if (!job || job.error) { alert('Could not load job.'); return; }

  // Measurements live at job.measurements.measurements (Hover/QuickMeasure shape).
  var m = (job.measurements && job.measurements.measurements) || {};
  var src = (job.measurements && (job.measurements.source || job.measurements.pdfFile)) || 'Hover';
  var hasMeasurements = !!(m.totalSquares || m.totalArea);

  _rpState = {
    jobId: jobId,
    job: job,
    hasMeasurements: hasMeasurements,
    source: src,
    // Prefilled from measurement data (editable — rep can correct).
    squares: m.totalSquares || '',
    pitch: m.predominantPitch || '',
    valley_lf: m.valleyLength || 0,
    eave_lf: m.eaveLength || 0,
    rake_lf: m.rakeLength || 0,
    facets: m.facetCount || 0,
    // Rep-entered (not in measurement data).
    steep_10_to_12_sq: (m.hoverParams && m.hoverParams.pitchTenTwelfthsArea) || 0,
    steep_over_12_sq: (m.hoverParams && m.hoverParams.pitchTwelveTwelfthsArea) || 0,
    two_story: false,
    chimney: '',
    skylights: 0, box_vents: 0, exhaust_caps: 0, pipe_jacks: 0,
    discount: 0,
  };
  _rpRender();
}

function _rpRender() {
  var s = _rpState; if (!s) return;
  var overlay = document.getElementById('rp-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'rp-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,21,48,0.55);z-index:9000;display:flex;flex-direction:column';
    document.body.appendChild(overlay);
  }
  var name = _rpEsc(s.job.homeownerName || '');
  overlay.innerHTML =
    '<div style="background:#fff;max-width:680px;width:100%;margin:auto;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;max-height:92vh">'
    +   '<div style="background:#0A1530;color:#fff;padding:16px 18px;display:flex;justify-content:space-between;align-items:center">'
    +     '<div><div style="font-size:16px;font-weight:800">Retail Proposal</div><div style="font-size:12px;color:#9FB2D6">' + name + '</div></div>'
    +     '<button onclick="_rpClose()" style="background:none;border:none;color:#fff;font-size:24px;cursor:pointer;line-height:1">&times;</button>'
    +   '</div>'
    +   '<div id="rp-body" style="padding:18px;overflow-y:auto">' + _rpBody() + '</div>'
    +   '<div style="padding:14px 18px;border-top:1px solid #E2E8F0;display:flex;gap:10px">'
    +     '<button onclick="_rpClose()" style="flex:1;padding:11px;background:#fff;color:#1B2360;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;min-height:44px">Cancel</button>'
    +     '<button id="rp-generate" onclick="_rpGenerate()" style="flex:2;padding:11px;background:#00B5CC;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:800;cursor:pointer;min-height:44px">Generate Proposal</button>'
    +   '</div>'
    + '</div>';
}

function _rpField(label, id, val, hint) {
  return '<div style="flex:1;min-width:120px"><label style="display:block;font-size:11px;font-weight:700;color:#64748B;margin-bottom:4px">' + label
    + (hint ? ' <span style="color:#94A3B8;font-weight:500">' + hint + '</span>' : '') + '</label>'
    + '<input id="' + id + '" value="' + _rpEsc(val) + '" style="width:100%;padding:9px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;box-sizing:border-box"></div>';
}

function _rpBody() {
  var s = _rpState;
  if (!s.hasMeasurements) {
    return '<div style="padding:24px;text-align:center;color:#475569">'
      + '<div style="font-size:15px;font-weight:700;color:#0A1530;margin-bottom:8px">No measurements on this job yet</div>'
      + '<div style="font-size:13px;line-height:1.5">Pull Hover or upload a QuickMeasure report first, then come back to generate the proposal. The engine builds off the measurements.</div>'
      + '</div>';
  }
  var chimneyOpts = ['', 'small', 'medium', 'large'].map(function (o) {
    var lbl = o === '' ? 'None' : (o.charAt(0).toUpperCase() + o.slice(1));
    return '<option value="' + o + '"' + (s.chimney === o ? ' selected' : '') + '>' + lbl + '</option>';
  }).join('');
  return ''
    + '<div style="font-size:12px;color:#0A7;font-weight:700;margin-bottom:6px">&#10003; Measurements from ' + _rpEsc(s.source) + ' (edit if needed)</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">'
    +   _rpField('Squares', 'rp-squares', s.squares)
    +   _rpField('Pitch', 'rp-pitch', s.pitch)
    +   _rpField('Facets', 'rp-facets', s.facets)
    + '</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">'
    +   _rpField('Valley LF', 'rp-valley', s.valley_lf)
    +   _rpField('Eave LF', 'rp-eave', s.eave_lf)
    +   _rpField('Rake LF', 'rp-rake', s.rake_lf)
    + '</div>'
    + '<div style="font-size:12px;color:#0A1530;font-weight:800;margin:4px 0 6px">Complexities</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
    +   _rpField('Steep 10/12-12/12 (SQ)', 'rp-steep10', s.steep_10_to_12_sq)
    +   _rpField('Steep 12/12+ (SQ)', 'rp-steep12', s.steep_over_12_sq)
    + '</div>'
    + '<div style="margin-bottom:14px"><label style="display:block;font-size:11px;font-weight:700;color:#64748B;margin-bottom:6px">Two story?</label>'
    +   '<div id="rp-twostory" style="display:flex;gap:8px">'
    +   [['no','No',false],['yes','Yes',true]].map(function (o) { var on = s.two_story === o[2]; return '<button type="button" data-val="' + o[0] + '" onclick="_rpTwoStory(' + o[2] + ')" style="padding:8px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;background:' + (on ? '#0A1530' : '#F1F5F9') + ';color:' + (on ? '#fff' : '#1B2360') + ';border:1px solid ' + (on ? 'transparent' : '#CBD5E1') + '">' + o[1] + '</button>'; }).join('')
    +   '</div></div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;align-items:flex-end">'
    +   '<div style="flex:1;min-width:120px"><label style="display:block;font-size:11px;font-weight:700;color:#64748B;margin-bottom:4px">Chimney</label>'
    +     '<select id="rp-chimney" style="width:100%;padding:9px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;box-sizing:border-box">' + chimneyOpts + '</select></div>'
    +   _rpField('Skylights', 'rp-skylights', s.skylights)
    +   _rpField('Pipe jacks', 'rp-pipejacks', s.pipe_jacks)
    + '</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">'
    +   _rpField('Box vents', 'rp-boxvents', s.box_vents)
    +   _rpField('Exhaust caps', 'rp-exhaustcaps', s.exhaust_caps)
    +   _rpField('Discount %', 'rp-discount', s.discount, '(optional)')
    + '</div>';
}

function _rpTwoStory(v) {
  if (_rpState) _rpState.two_story = v;
  var row = document.getElementById('rp-twostory');
  if (row) row.querySelectorAll('button').forEach(function (b) {
    var on = (b.getAttribute('data-val') === 'yes') === v;
    b.style.background = on ? '#0A1530' : '#F1F5F9';
    b.style.color = on ? '#fff' : '#1B2360';
    b.style.border = '1px solid ' + (on ? 'transparent' : '#CBD5E1');
  });
}

function _rpVal(id) { var el = document.getElementById(id); return el ? el.value : ''; }

function _rpBuildPayload() {
  var s = _rpState;
  var now = new Date();
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  var date = pad(now.getMonth() + 1) + '/' + pad(now.getDate()) + '/' + now.getFullYear();
  var discount = _rpNum(_rpVal('rp-discount'));
  var payload = {
    customer: { name: s.job.homeownerName || '', address: s.job.address || '' },
    date: date,
    estimator: 'CRC',
    measurements: {
      source: s.source,
      squares: _rpNum(_rpVal('rp-squares')),
      predominant_pitch: _rpVal('rp-pitch'),
      steep_10_to_12_sq: _rpNum(_rpVal('rp-steep10')),
      steep_over_12_sq: _rpNum(_rpVal('rp-steep12')),
      two_story: !!s.two_story,
      valley_lf: _rpNum(_rpVal('rp-valley')),
      eave_lf: _rpNum(_rpVal('rp-eave')),
      rake_lf: _rpNum(_rpVal('rp-rake')),
      facets: _rpNum(_rpVal('rp-facets')),
    },
    features: {
      chimney: _rpVal('rp-chimney') || undefined,
      skylights: _rpNum(_rpVal('rp-skylights')),
      box_vents: _rpNum(_rpVal('rp-boxvents')),
      exhaust_caps: _rpNum(_rpVal('rp-exhaustcaps')),
      pipe_jacks: _rpNum(_rpVal('rp-pipejacks')),
    },
    // Runner hints (stripped before retail_input.json is written).
    trade: 'roofing',
  };
  if (discount > 0) payload.discount = discount > 1 ? discount / 100 : discount; // accept 10 or 0.10
  return payload;
}

async function _rpGenerate() {
  var s = _rpState; if (!s || !s.hasMeasurements) return;
  if (_rpNum(_rpVal('rp-squares')) <= 0) { alert('Squares are required to build the proposal.'); return; }
  var btn = document.getElementById('rp-generate');
  if (btn) { btn.disabled = true; btn.textContent = 'Queueing…'; }
  try {
    var r = await fetch('/api/field/jobs/' + s.jobId + '/retail-estimate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_rpBuildPayload()),
    });
    var data = await r.json();
    if (!r.ok || !data.taskId) throw new Error(data.error || 'Could not queue proposal');
    _rpShowWaiting(data.taskId);
    _rpPoll(data.taskId, 0);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Generate Proposal'; }
    alert('Error: ' + e.message);
  }
}

function _rpShowWaiting(taskId) {
  var body = document.getElementById('rp-body');
  if (body) body.innerHTML = '<div id="rp-wait" style="padding:32px;text-align:center;color:#475569">'
    + '<div style="font-size:15px;font-weight:800;color:#0A1530;margin-bottom:8px">Building your proposal…</div>'
    + '<div style="font-size:13px;line-height:1.5">The CRC engine is generating the PDF. This usually takes a minute or two — you can leave this open.</div>'
    + '<div id="rp-elapsed" style="font-size:12px;color:#94A3B8;margin-top:10px"></div></div>';
  var foot = document.querySelector('#rp-overlay [onclick="_rpGenerate()"]');
  if (foot) foot.style.display = 'none';
}

async function _rpPoll(taskId, tries) {
  var s = _rpState; if (!s) return;
  if (tries > 60) { // ~5 min at 5s
    var el = document.getElementById('rp-wait');
    if (el) el.innerHTML = '<div style="color:#DC2626;font-weight:700">Still working — taking longer than expected.</div><div style="font-size:13px;margin-top:8px;color:#475569">The proposal will appear in this job\'s documents when ready. You can close this.</div>';
    return;
  }
  var elapsed = document.getElementById('rp-elapsed');
  if (elapsed) elapsed.textContent = (tries * 5) + 's';
  try {
    var r = await fetch('/api/field/jobs/' + s.jobId + '/retail-estimate/' + taskId);
    var data = await r.json();
    var t = data.task;
    if (t && t.status === 'done') { _rpShowDone(t); return; }
    if (t && t.status === 'error') { _rpShowError(t.error); return; }
  } catch (e) { /* transient — keep polling */ }
  setTimeout(function () { _rpPoll(taskId, tries + 1); }, 5000);
}

function _rpShowDone(task) {
  var body = document.getElementById('rp-body');
  if (!body) return;
  var docs = (task.result && task.result.documents) || [];
  var links = docs.map(function (d) {
    var url = _rpPortalBase + d.url;
    return '<a href="' + url + '" target="_blank" style="display:block;padding:12px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;margin-bottom:8px;color:#0A1530;font-weight:700;text-decoration:none">&#11015;&#65039; ' + _rpEsc(d.filename) + '</a>';
  }).join('');
  body.innerHTML = '<div style="text-align:center;padding:8px 0 16px"><div style="font-size:18px;font-weight:800;color:#0A7;margin-bottom:4px">&#10003; Proposal ready</div>'
    + '<div style="font-size:12px;color:#64748B">Also saved to this job\'s documents.</div></div>'
    + (links || '<div style="color:#64748B;text-align:center">Generated — check the job\'s documents.</div>');
  // Refresh job detail so the docs show up immediately.
  if (typeof openJobDetail === 'function') { try { openJobDetail(_rpState.jobId); } catch (e) {} }
}

function _rpShowError(msg) {
  var body = document.getElementById('rp-body');
  if (body) body.innerHTML = '<div style="padding:24px;text-align:center">'
    + '<div style="font-size:15px;font-weight:800;color:#DC2626;margin-bottom:8px">Proposal failed</div>'
    + '<div style="font-size:13px;color:#475569;line-height:1.5">' + _rpEsc(msg || 'The engine could not generate this proposal.') + '</div>'
    + '<button onclick="openRetailProposal(_rpState.jobId)" style="margin-top:14px;padding:10px 18px;background:#00B5CC;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer">Try again</button></div>';
}

function _rpClose() {
  var o = document.getElementById('rp-overlay');
  if (o) o.remove();
  _rpState = null;
}
