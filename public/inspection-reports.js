/**
 * CRC Field — Photo Inspection Report + Claim Filing Package builders.
 *
 * Both flows share a photo selection + labeling overlay. The Photo Report
 * generates a clean photo doc for the rep; the Claim Filing Package
 * generates the "Next Steps" PDF the homeowner takes to their carrier.
 */

var IR_LABEL_CHIPS_DEFAULT = [
  'Hail Impact','Wind Damage','Missing Shingle','Cracked Shingle',
  'Missing Granules','Lifted Flashing','Gutter Damage',
  'Soft Spot','Exposed Nail','Collateral Damage'
];
// Persisted to localStorage so user edits survive
function _irGetLabels() {
  try { var s = localStorage.getItem('crc_ir_labels'); if (s) return JSON.parse(s); } catch(e) {}
  return IR_LABEL_CHIPS_DEFAULT.slice();
}
function _irSaveLabels(arr) {
  try { localStorage.setItem('crc_ir_labels', JSON.stringify(arr)); } catch(e) {}
}
var IR_LABEL_CHIPS = _irGetLabels();

var _irState = null;

// ── Entry points ────────────────────────────────────────────────────────────
function openPhotoInspectionReport(jobId) {
  _launchBuilder(jobId, 'photo-report');
}
function openClaimFilingPackage(jobId) {
  _launchBuilder(jobId, 'claim-filing');
}

async function _launchBuilder(jobId, mode) {
  var job;
  try {
    job = await fetch('/api/field/jobs/' + jobId).then(function(r){ return r.json(); });
  } catch (e) {
    alert('Could not load job');
    return;
  }
  var photos = (typeof collectJobPhotos === 'function') ? collectJobPhotos(job) : [];
  if (!photos.length) {
    alert('No photos on this job yet. Capture a few with the Camera button first.');
    return;
  }

  _irState = {
    mode: mode,
    jobId: jobId,
    job: job,
    photos: photos,
    selected: new Set(),
    labels: {}, // url -> label
    includeDiagram: !!(job.roofDiagramMarkup || job.roofDiagramClean),
    markPhoto: null,
    photoSummary: '',
    // Claim filing extras
    dateOfLoss: '',
    stormType: 'Wind & Hail',
    damageSummary: ''
  };
  // Prefill damage summary template for claim-filing mode
  if (mode === 'claim-filing') {
    _irState.damageSummary = _defaultDamageSummary(job);
  }
  _renderBuilder();
}

function _defaultDamageSummary(job) {
  var addr = job.address || 'the property';
  return 'Storm damage was identified on the roof and exterior of the property at ' + addr
    + ' following a recent storm event. Columbus Roofing Company recommends filing an insurance claim for professional repair or replacement.';
}

// ── Render ──────────────────────────────────────────────────────────────────
function _renderBuilder() {
  var s = _irState; if (!s) return;
  var existing = document.getElementById('ir-overlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'ir-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1100;background:#F8FAFC;display:flex;flex-direction:column;overflow:hidden';

  var title = s.mode === 'claim-filing' ? 'Next Steps Packet' : 'Photo Inspection Report';
  var subtitle = s.mode === 'claim-filing'
    ? 'Select photos and fill in details for the homeowner packet.'
    : 'Select photos to include. Add a label and (optionally) markup to each.';

  overlay.innerHTML = ''
    + '<div style="background:#001A4D;color:#fff;padding:12px 14px;padding-top:calc(12px + env(safe-area-inset-top, 0px));display:flex;align-items:center;gap:10px;flex-shrink:0">'
    +   '<button onclick="_irClose()" style="background:none;border:none;color:#fff;font-size:26px;cursor:pointer;padding:4px 8px;line-height:1;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center">&times;</button>'
    +   '<div style="flex:1"><div style="font-weight:800;font-size:15px">' + title + '</div>'
    +     '<div style="font-size:11px;color:#94A3B8">' + subtitle + '</div></div>'
    + '</div>'
    + '<div style="flex:1;overflow-y:auto;padding:14px;-webkit-overflow-scrolling:touch" id="ir-body">'
    +   _buildBody()
    + '</div>'
    + '<div style="background:#fff;border-top:1px solid #E5E7EB;padding:10px 14px;display:flex;gap:10px;align-items:center;flex-shrink:0">'
    +   '<div style="flex:1;font-size:12px;color:#64748B"><span id="ir-count">' + s.selected.size + ' of ' + s.photos.length + ' photos selected</span></div>'
    +   '<button id="ir-generate" onclick="_irGenerate()" style="padding:11px 18px;background:#00B5CC;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:800;cursor:pointer;min-height:44px">' + (s.mode === 'claim-filing' ? 'Generate Packet' : 'Generate Report') + '</button>'
    + '</div>';

  document.body.appendChild(overlay);
}

function _buildBody() {
  var s = _irState;
  var html = '';

  // Claim filing extras up top
  if (s.mode === 'claim-filing') {
    html += '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:12px;margin-bottom:12px">'
      + '<div style="font-size:12px;font-weight:800;color:#001A4D;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px">Claim Details</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      + '<div><label style="font-size:11px;font-weight:700;color:#64748B;display:block;margin-bottom:3px">Date of Loss</label>'
      + '<input type="date" id="ir-dol" value="' + s.dateOfLoss + '" oninput="_irState.dateOfLoss=this.value" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px"></div>'
      + '<div><label style="font-size:11px;font-weight:700;color:#64748B;display:block;margin-bottom:3px">Storm Type</label>'
      + '<select id="ir-storm" oninput="_irState.stormType=this.value" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px">'
      + ['Wind & Hail','Hail Only','Wind Only','Other'].map(function(o){ return '<option ' + (s.stormType===o?'selected':'') + '>' + o + '</option>'; }).join('')
      + '</select></div></div>'
      + '<label style="font-size:11px;font-weight:700;color:#64748B;display:block;margin-bottom:3px">Damage Summary</label>'
      + '<textarea id="ir-summary" oninput="_irState.damageSummary=this.value" rows="3" style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box">' + _esc(s.damageSummary) + '</textarea>'
      + '</div>';
  }

  // Photo report summary section
  if (s.mode === 'photo-report') {
    html += '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:12px;margin-bottom:12px">'
      + '<div style="font-size:12px;font-weight:800;color:#001A4D;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px">Inspection Summary</div>'
      + '<textarea id="ir-photo-summary" oninput="_irState.photoSummary=this.value" rows="3" placeholder="Describe the damage found, areas affected, recommended next steps..." style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box">' + _esc(s.photoSummary || '') + '</textarea>'
      + '</div>';
  }

  // Options toolbar
  html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center">'
    + '<button onclick="_irSelectAll(true)" style="padding:7px 12px;background:#001A4D;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">Select All</button>'
    + '<button onclick="_irSelectAll(false)" style="padding:7px 12px;background:#fff;color:#001A4D;border:1px solid #CBD5E1;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">Deselect All</button>';
  var hasDiag = !!(s.job.roofDiagramMarkup || s.job.roofDiagramClean);
  if (hasDiag) {
    html += '<label style="margin-left:6px;display:flex;align-items:center;gap:6px;font-size:12px;color:#334155;cursor:pointer">'
      + '<input type="checkbox" ' + (s.includeDiagram ? 'checked' : '') + ' onchange="_irState.includeDiagram=this.checked" style="width:16px;height:16px;accent-color:#00B5CC;margin:0"> Include roof diagram from CRC Measure'
      + '</label>';
  }
  html += '</div>';

  // Label chips
  html += '<div style="margin-bottom:10px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><span style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.4px">Quick Labels</span><button onclick="_irManageLabels()" style="font-size:11px;color:#00B5CC;background:none;border:none;cursor:pointer;font-weight:700">Edit Labels</button></div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:6px" id="ir-label-chips">'
    + IR_LABEL_CHIPS.map(function(l){ return '<button onclick="_irApplyChip(\'' + l.replace(/\'/g,"&#39;") + '\')" style="padding:5px 10px;background:#F1F5F9;color:#001A4D;border:1px solid #CBD5E1;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer">' + l + '</button>'; }).join('')
    + '</div>'
    + '<div style="font-size:11px;color:#94A3B8;margin-top:4px">Tap a chip to label all selected photos at once.</div></div>';

  // Photo grid (3-col phone, wider on tablet/desktop via CSS)
  html += '<div class="ir-photo-grid">';
  s.photos.forEach(function(p, i) {
    var sel = s.selected.has(p.url);
    var label = s.labels[p.url] || p.label || p.caption || '';
    html += '<div class="ir-cell' + (sel ? ' ir-cell-on' : '') + '" onclick="_irToggle(' + i + ',event)">'
      + '<img src="' + (p.thumbnail || p.url) + '" alt="Photo ' + (i+1) + '" onerror="this.style.opacity=0.25">'
      + '<div class="ir-cell-check">' + (sel ? '&#10003;' : '') + '</div>'
      + '<input type="text" class="ir-cell-label" placeholder="Label (optional)" value="' + _esc(label) + '" oninput="_irState.labels[\'' + p.url.replace(/\'/g,"\\\'") + '\']=this.value" onclick="event.stopPropagation()">'
      + '</div>';
  });
  html += '</div>';

  return html;
}

function _esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Actions ────────────────────────────────────────────────────────────────
function _irToggle(i, ev) {
  if (ev && ev.target && ev.target.tagName === 'INPUT') return;
  var s = _irState; if (!s) return;
  var p = s.photos[i]; if (!p) return;
  if (s.selected.has(p.url)) s.selected.delete(p.url); else s.selected.add(p.url);
  _irRefresh();
}
function _irSelectAll(on) {
  var s = _irState; if (!s) return;
  s.selected = on ? new Set(s.photos.map(function(p){ return p.url; })) : new Set();
  _irRefresh();
}
function _irApplyChip(chip) {
  var s = _irState; if (!s) return;
  if (!s.selected.size) { alert('Select one or more photos first.'); return; }
  s.selected.forEach(function(url){ s.labels[url] = chip; });
  _irRefresh();
}

function _irRefresh() {
  document.getElementById('ir-body').innerHTML = _buildBody();
  var c = document.getElementById('ir-count');
  if (c) c.textContent = _irState.selected.size + ' of ' + _irState.photos.length + ' photos selected';
}

function _irClose() {
  var el = document.getElementById('ir-overlay');
  if (el) el.remove();
  _irState = null;
}

// ── Generate ───────────────────────────────────────────────────────────────
async function _irGenerate() {
  var s = _irState; if (!s) return;
  if (!s.selected.size) { alert('Select at least one photo.'); return; }
  if (s.mode === 'claim-filing' && !s.dateOfLoss) { alert('Enter the date of loss.'); return; }

  var btn = document.getElementById('ir-generate');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

  var selections = Array.from(s.selected).map(function(url){
    var p = s.photos.find(function(x){ return x.url === url; }) || { url: url };
    return { url: url, label: (s.labels[url] || p.label || p.caption || '').trim() };
  });

  var endpoint = s.mode === 'claim-filing' ? 'claim-filing-package' : 'photo-inspection-report';
  var body = {
    selections: selections,
    includeDiagram: !!s.includeDiagram,
    diagramUrl: s.job.roofDiagramMarkup || s.job.roofDiagramClean || null,
    repName: (typeof repName !== 'undefined' ? repName : ''),
    inspectionDate: new Date().toISOString(),
  };
  if (s.mode === 'claim-filing') {
    body.dateOfLoss = s.dateOfLoss;
    body.stormType = s.stormType;
    body.damageSummary = s.damageSummary;
  }
  if (s.mode === 'photo-report' && s.photoSummary) {
    body.damageSummary = s.photoSummary;
  }

  try {
    var r = await fetch('/api/field/jobs/' + s.jobId + '/' + endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await r.json();
    if (!r.ok || !data.success) throw new Error(data.error || 'PDF build failed');
    _irShowSuccess(data, s.mode);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = s.mode === 'claim-filing' ? 'Generate Packet' : 'Generate Report'; }
    alert('Error: ' + e.message);
  }
}

function _irShowSuccess(data, mode) {
  var body = document.getElementById('ir-body');
  if (!body) return;
  var url = data.url ? ('https://crc-supplements-portal.onrender.com' + data.url) : '';
  body.innerHTML = ''
    + '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;text-align:center">'
    +   '<div style="font-size:64px;margin-bottom:12px">&#9989;</div>'
    +   '<div style="font-size:20px;font-weight:800;color:#001A4D;margin-bottom:8px">' + (mode === 'claim-filing' ? 'Packet ready' : 'Report ready') + '</div>'
    +   '<div style="font-size:13px;color:#64748B;margin-bottom:24px;max-width:420px">Saved to this job\'s documents in the portal. You can open or share it below.</div>'
    +   '<div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:320px">'
    +     '<a href="' + url + '" download target="_blank" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 20px;background:#001A4D;color:#fff;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none">&#11015;&#65039; Download PDF</a>'
    +     '<button onclick="_irCopyLink(\'' + url + '\')" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 20px;background:#00B5CC;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">&#128279; Copy Link</button>'
    +     '<button onclick="_irShowQR(\'' + url + '\')" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 20px;background:#fff;color:#001A4D;border:1.5px solid #CBD5E1;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">&#9638; QR Code</button>'
    +     '<button onclick="_irClose()" style="padding:10px;background:none;color:#64748B;border:none;font-size:13px;cursor:pointer">Close</button>'
    +   '</div>'
    + '</div>';
  var bar = document.querySelector('#ir-overlay > div:last-child');
  if (bar) bar.style.display = 'none';
}

function _irManageLabels() {
  var current = _irGetLabels();
  var modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';
  function render() {
    current = _irGetLabels();
    modal.innerHTML = '<div style="background:#fff;border-radius:14px;padding:20px;width:100%;max-width:360px;max-height:80vh;overflow-y:auto">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
      + '<span style="font-size:15px;font-weight:800;color:#001A4D">Edit Labels</span>'
      + '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#64748B">&times;</button></div>'
      + current.map(function(l, i) {
          return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #F1F5F9">'
            + '<span style="flex:1;font-size:13px;color:#001A4D">' + l + '</span>'
            + '<button onclick="_irDeleteLabel(' + i + ')" style="background:none;border:none;color:#DC2626;font-size:18px;cursor:pointer;line-height:1">&times;</button></div>';
        }).join('')
      + '<div style="display:flex;gap:6px;margin-top:12px">'
      + '<input id="ir-new-label" type="text" placeholder="Add label..." style="flex:1;padding:8px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px">'
      + '<button onclick="_irAddLabel()" style="padding:8px 14px;background:#00B5CC;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">Add</button></div>'
      + '</div>';
  }
  render();
  document.body.appendChild(modal);
}
function _irDeleteLabel(idx) {
  var labels = _irGetLabels();
  labels.splice(idx, 1);
  _irSaveLabels(labels);
  IR_LABEL_CHIPS = labels;
  // Re-render modal
  var modal = document.querySelector('div[style*="position:fixed"][style*="2000"]');
  if (modal) { modal.remove(); _irManageLabels(); }
  // Refresh chips in builder
  var chipsEl = document.getElementById('ir-label-chips');
  if (chipsEl) chipsEl.innerHTML = labels.map(function(l){ return '<button onclick="_irApplyChip(\'' + l.replace(/\'/g,"&#39;") + '\')" style="padding:5px 10px;background:#F1F5F9;color:#001A4D;border:1px solid #CBD5E1;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer">' + l + '</button>'; }).join('');
}
function _irAddLabel() {
  var input = document.getElementById('ir-new-label');
  var val = input ? input.value.trim() : '';
  if (!val) return;
  var labels = _irGetLabels();
  if (!labels.includes(val)) { labels.push(val); _irSaveLabels(labels); IR_LABEL_CHIPS = labels; }
  // Re-render modal
  var modal = document.querySelector('div[style*="position:fixed"][style*="2000"]');
  if (modal) { modal.remove(); _irManageLabels(); }
  var chipsEl = document.getElementById('ir-label-chips');
  if (chipsEl) chipsEl.innerHTML = labels.map(function(l){ return '<button onclick="_irApplyChip(\'' + l.replace(/\'/g,"&#39;") + '\')" style="padding:5px 10px;background:#F1F5F9;color:#001A4D;border:1px solid #CBD5E1;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer">' + l + '</button>'; }).join('');
}

function _irShare(url) {
  if (!url) return;
  if (navigator.share) navigator.share({ title: 'CRC Report', url: url }).catch(function(){});
  else _irCopyLink(url);
}
function _irCopyLink(url) {
  if (!url) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(function() {
      var btn = document.querySelector('#ir-body button[onclick*="CopyLink"]');
      if (btn) { var orig = btn.innerHTML; btn.innerHTML = '&#10003; Copied!'; setTimeout(function(){ btn.innerHTML = orig; }, 2000); }
    }).catch(function(){ window.open(url); });
  } else { window.open(url); }
}
function _irShowQR(url) {
  if (!url) return;
  var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url);
  var body = document.getElementById('ir-body');
  if (!body) return;
  var qrDiv = document.createElement('div');
  qrDiv.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.8);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px';
  qrDiv.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;text-align:center">'
    + '<div style="font-size:13px;font-weight:700;color:#001A4D;margin-bottom:12px">Scan to open PDF</div>'
    + '<img src="' + qrUrl + '" style="width:200px;height:200px;display:block">'
    + '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="margin-top:16px;padding:10px 24px;background:#001A4D;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Close</button>'
    + '</div>';
  document.body.appendChild(qrDiv);
}

// Expose
window.openPhotoInspectionReport = openPhotoInspectionReport;
window.openClaimFilingPackage = openClaimFilingPackage;
window._irToggle = _irToggle;
window._irSelectAll = _irSelectAll;
window._irApplyChip = _irApplyChip;
window._irClose = _irClose;
window._irGenerate = _irGenerate;
window._irShare = _irShare;
window._irCopyLink = _irCopyLink;
window._irShowQR = _irShowQR;
window._irManageLabels = _irManageLabels;
window._irDeleteLabel = _irDeleteLabel;
window._irAddLabel = _irAddLabel;
