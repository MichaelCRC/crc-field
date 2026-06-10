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
function openInsuranceReport(jobId) {
  _launchBuilder(jobId, 'insurance-report');
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
    damageSummary: '',
    // Insurance report extras
    insSummary: '',
    insDescription: '',
    insCondition: 'sound'   // sound | wear | damage — steers the CRC Brain tone
  };
  // Prefill damage summary template for claim-filing mode
  if (mode === 'claim-filing') {
    _irState.damageSummary = _defaultDamageSummary(job);
  }
  if (mode === 'insurance-report') {
    _irState.insSummary = _defaultInsuranceSummary(job);
  }
  _renderBuilder();
}

function _defaultDamageSummary(job) {
  var addr = job.address || 'the property';
  return 'Storm damage was identified on the roof and exterior of the property at ' + addr
    + ' following a recent storm event. Columbus Roofing Company recommends filing an insurance claim for professional repair or replacement.';
}

function _defaultInsuranceSummary(job) {
  var addr = job.address || 'the property';
  return 'Columbus Roofing Company completed a documented roof inspection at ' + addr
    + '. This report records the current condition of the roof and exterior for the homeowner to keep on file with their insurance carrier.';
}

// ── Render ──────────────────────────────────────────────────────────────────
function _renderBuilder() {
  var s = _irState; if (!s) return;
  var existing = document.getElementById('ir-overlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'ir-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1100;background:#F8FAFC;display:flex;flex-direction:column;overflow:hidden';

  var title = s.mode === 'claim-filing' ? 'Next Steps Packet'
    : s.mode === 'insurance-report' ? 'Insurance Report'
    : 'Photo Inspection Report';
  var subtitle = s.mode === 'claim-filing'
    ? 'Select photos and fill in details for the homeowner packet.'
    : s.mode === 'insurance-report'
    ? 'A roof condition report the homeowner keeps on file for their insurer.'
    : 'Select photos to include. Add a label and (optionally) markup to each.';

  overlay.innerHTML = ''
    + '<div style="background:#1B2360;color:#fff;padding:12px 14px;padding-top:calc(12px + env(safe-area-inset-top, 0px));display:flex;align-items:center;gap:10px;flex-shrink:0">'
    +   '<button onclick="_irClose()" style="background:none;border:none;color:#fff;font-size:26px;cursor:pointer;padding:4px 8px;line-height:1;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center">&times;</button>'
    +   '<div style="flex:1"><div style="font-weight:800;font-size:15px">' + title + '</div>'
    +     '<div style="font-size:11px;color:#94A3B8">' + subtitle + '</div></div>'
    + '</div>'
    + '<div style="flex:1;overflow-y:auto;padding:14px;-webkit-overflow-scrolling:touch" id="ir-body">'
    +   _buildBody()
    + '</div>'
    + '<div style="background:#fff;border-top:1px solid #E5E7EB;padding:10px 14px;display:flex;gap:10px;align-items:center;flex-shrink:0">'
    +   '<div style="flex:1;font-size:12px;color:#64748B"><span id="ir-count">' + s.selected.size + ' of ' + s.photos.length + ' photos selected</span></div>'
    +   (s.mode === 'insurance-report'
          ? '<button id="ir-generate" onclick="_irPreview()" style="padding:11px 18px;background:#00B5CC;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:800;cursor:pointer;min-height:44px">Preview Report</button>'
          : '<button id="ir-generate" onclick="_irGenerate()" style="padding:11px 18px;background:#00B5CC;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:800;cursor:pointer;min-height:44px">' + (s.mode === 'claim-filing' ? 'Generate Packet' : 'Generate Report') + '</button>')
    + '</div>';

  document.body.appendChild(overlay);
}

function _buildBody() {
  var s = _irState;
  var html = '';

  // Claim filing extras up top
  if (s.mode === 'claim-filing') {
    html += '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:12px;margin-bottom:12px">'
      + '<div style="font-size:12px;font-weight:800;color:#1B2360;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px">Claim Details</div>'
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
      + '<div style="font-size:12px;font-weight:800;color:#1B2360;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px">Inspection Summary</div>'
      + '<textarea id="ir-photo-summary" oninput="_irState.photoSummary=this.value" rows="3" placeholder="Describe the damage found, areas affected, recommended next steps..." style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box">' + _esc(s.photoSummary || '') + '</textarea>'
      + '</div>';
  }

  // Insurance report fields — summary + condition description the homeowner
  // keeps on file for their insurer.
  if (s.mode === 'insurance-report') {
    html += '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:12px;margin-bottom:12px">'
      + '<div style="font-size:12px;font-weight:800;color:#1B2360;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px">Insurance Report Details</div>'
      + '<label style="font-size:11px;font-weight:700;color:#64748B;display:block;margin-bottom:3px">Summary</label>'
      + '<textarea id="ir-ins-summary" oninput="_irState.insSummary=this.value" rows="3" placeholder="Brief summary for the homeowner\'s insurance file..." style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;margin-bottom:10px">' + _esc(s.insSummary || '') + '</textarea>'
      + '<label style="font-size:11px;font-weight:700;color:#64748B;display:block;margin-bottom:5px">Overall Condition <span style="font-weight:400">(steers the report tone)</span></label>'
      + '<div id="ir-ins-condition-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">'
      + [['sound','Sound — checks out'],['wear','Normal wear'],['damage','Damage observed']].map(function(c){
          var on = (s.insCondition || 'sound') === c[0];
          return '<button type="button" data-val="' + c[0] + '" onclick="_irSetCondition(this)" style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;background:' + (on?'#0A1530':'#F1F5F9') + ';color:' + (on?'#fff':'#1B2360') + ';border:1px solid ' + (on?'#0A1530':'#CBD5E1') + '">' + c[1] + '</button>';
        }).join('')
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px">'
      +   '<label style="font-size:11px;font-weight:700;color:#64748B">Description / Condition Notes</label>'
      +   '<button id="ir-ai-desc-btn" type="button" onclick="_irGenerateDescription()" style="font-size:11px;font-weight:700;color:#fff;background:#0A1530;border:1px solid #07BFEE;border-radius:999px;padding:5px 11px;cursor:pointer;white-space:nowrap">&#10024; Generate with CRC Brain</button>'
      + '</div>'
      + '<textarea id="ir-ins-desc" oninput="_irState.insDescription=this.value" rows="5" placeholder="Tap “Generate with CRC Brain” for an official statement, or write your own..." style="width:100%;padding:8px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box">' + _esc(s.insDescription || '') + '</textarea>'
      + '</div>';
  }

  // Options toolbar
  html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center">'
    + '<button onclick="_irSelectAll(true)" style="padding:7px 12px;background:#1B2360;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">Select All</button>'
    + '<button onclick="_irSelectAll(false)" style="padding:7px 12px;background:#fff;color:#1B2360;border:1px solid #CBD5E1;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">Deselect All</button>';
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
    + IR_LABEL_CHIPS.map(function(l){ return '<button onclick="_irApplyChip(\'' + l.replace(/\'/g,"&#39;") + '\')" style="padding:5px 10px;background:#F1F5F9;color:#1B2360;border:1px solid #CBD5E1;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer">' + l + '</button>'; }).join('')
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

// ── Preview (view before download — all report types) ───────────────────────
function _irReportMeta(s) {
  var d = new Date();
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  var dateStr = (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
  var stamp = '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  var code = { 'insurance-report': 'INS', 'photo-report': 'PIR', 'claim-filing': 'NSP' }[s.mode] || 'RPT';
  var tail = String(s.jobId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase() || 'XXXXX';
  return { dateStr: dateStr, reportNo: 'CRC-' + code + '-' + stamp + '-' + tail };
}
function _irSection(heading, inner) {
  return '<div style="margin-bottom:16px">'
    + '<div style="font-size:12px;font-weight:800;color:#0A1530;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;border-left:3px solid #07BFEE;padding-left:8px">' + heading + '</div>'
    + '<div style="font-size:13px;color:#334155;line-height:1.6">' + inner + '</div></div>';
}
function _irMetaRow(label, val) {
  return '<div><div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.4px">' + label + '</div>'
    + '<div style="font-size:13px;color:#0A1530;font-weight:600;margin-top:1px">' + _esc(val) + '</div></div>';
}
function _irBuildPreviewHtml(s) {
  var job = s.job || {};
  var meta = _irReportMeta(s);
  var rep = (typeof repName !== 'undefined' && repName) ? repName : 'CRC Representative';
  var title = { 'insurance-report': 'Roof Condition Report', 'photo-report': 'Photo Inspection Report', 'claim-filing': 'Insurance Claim — Next Steps' }[s.mode] || 'Property Report';
  var subtitle = { 'insurance-report': "Prepared for the homeowner's insurance records", 'photo-report': 'Documented roof & exterior inspection', 'claim-filing': 'Storm damage documentation for claim filing' }[s.mode] || '';

  var photos = Array.from(s.selected).map(function (url) {
    var p = s.photos.find(function (x) { return x.url === url; }) || { url: url };
    return { url: (p.thumbnail || p.url), label: (s.labels[url] || p.label || p.caption || '') };
  });

  var blocks = '';
  if (s.mode === 'insurance-report') {
    blocks += _irSection('Summary', _esc(s.insSummary || ''));
    if (s.insDescription) blocks += _irSection('Roof Condition &amp; Notes', _esc(s.insDescription));
    blocks += _irSection('Scope of Inspection', 'This inspection visually assessed the roof covering, flashings, penetrations, and accessible exterior components. Findings reflect the condition observed on the inspection date and are documented with the photographs below.');
  } else if (s.mode === 'photo-report') {
    if (s.photoSummary) blocks += _irSection('Inspection Summary', _esc(s.photoSummary));
  } else if (s.mode === 'claim-filing') {
    blocks += _irSection('Claim Details', '<strong>Date of Loss:</strong> ' + _esc(s.dateOfLoss || '—') + '<br><strong>Storm Type:</strong> ' + _esc(s.stormType || '—'));
    if (s.damageSummary) blocks += _irSection('Damage Summary', _esc(s.damageSummary));
    blocks += _irSection('What CRC Does For You',
      '<ul style="margin:0;padding-left:18px">'
      + '<li>CRC files the claim on your behalf with your authorization</li>'
      + '<li>We attend the adjuster meeting with your documentation</li>'
      + '<li>You pay only your deductible</li></ul>');
    var steps = [
      ['Sign the Authorization', 'You sign our Authorization to Represent — this lets CRC file the claim and work with your carrier on your behalf. No money changes hands.'],
      ['We File the Claim', 'CRC contacts your insurance carrier and files the claim with our full documentation package — inspection report, storm data, and photos.'],
      ['Adjuster Meeting', 'An adjuster is assigned. CRC attends with you, presents the documented evidence, and ensures nothing is overlooked.'],
      ['Approval & Scope', "Once approved, CRC reviews the carrier's scope and supplements any missed items. You don't pay more than your deductible."],
      ['Installation', 'CRC completes the work with GAF-certified materials to Ohio building code, with a warranty on materials and labor.'],
    ];
    var stepsHtml = steps.map(function (st, i) {
      return '<div style="display:flex;gap:10px;margin-bottom:8px">'
        + '<div style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#07BFEE;color:#0A1530;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center">' + (i + 1) + '</div>'
        + '<div><div style="font-weight:700;color:#0A1530;font-size:13px">' + st[0] + '</div>'
        + '<div style="font-size:12px;color:#555;line-height:1.5">' + st[1] + '</div></div></div>';
    }).join('');
    blocks += _irSection('Your Steps to a New Roof', stepsHtml);
  }

  var photoGrid = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">'
    + photos.map(function (p) {
        return '<div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;background:#fff">'
          + '<img src="' + p.url + '" style="width:100%;height:130px;object-fit:cover;display:block" onerror="this.style.opacity=0.2">'
          + (p.label ? '<div style="padding:6px 8px;font-size:12px;color:#0A1530;font-weight:600">' + _esc(p.label) + '</div>' : '')
          + '</div>';
      }).join('')
    + '</div>';

  return '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.1)">'
    + '<div style="background:#0A1530;color:#fff;padding:18px 20px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">'
    +   '<div><div style="font-size:17px;font-weight:800;letter-spacing:0.3px">COLUMBUS ROOFING COMPANY</div>'
    +     '<div style="font-size:11px;color:#07BFEE;margin-top:2px">GAF Master Elite&#174; · Licensed &amp; Insured</div>'
    +     '<div style="font-size:10px;color:#94A3B8;margin-top:1px">HIC-L00838 / G09361 · thecolumbusroofing.com</div></div>'
    +   '<div style="text-align:right;font-size:10px;color:#94A3B8">Report No.<div style="color:#fff;font-weight:700;font-size:12px">' + meta.reportNo + '</div></div>'
    + '</div>'
    + '<div style="padding:16px 20px;border-bottom:1px solid #E5E7EB">'
    +   '<div style="font-size:20px;font-weight:800;color:#0A1530">' + title + '</div>'
    +   '<div style="font-size:12px;color:#64748B;margin-top:2px">' + subtitle + '</div>'
    + '</div>'
    + '<div style="padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:12px 20px;border-bottom:1px solid #E5E7EB">'
    +   _irMetaRow('Prepared For', job.homeownerName || ((job.homeowner && (job.homeowner.firstName + ' ' + job.homeowner.lastName).trim()) || 'Homeowner'))
    +   _irMetaRow('Property', job.address || '—')
    +   _irMetaRow('Prepared By', rep + ', Columbus Roofing Co.')
    +   _irMetaRow('Inspection Date', meta.dateStr)
    + '</div>'
    + '<div style="padding:16px 20px">' + blocks + _irSection('Photo Documentation (' + photos.length + ')', photoGrid) + '</div>'
    + '<div style="background:#F8FAFC;border-top:1px solid #E5E7EB;padding:14px 20px;font-size:11px;color:#64748B;line-height:1.5">'
    +   'This report reflects conditions visually observed on ' + meta.dateStr + ' by Columbus Roofing Company and is provided for the homeowner&#39;s records. It is not a guarantee of insurance coverage. Keep on file with your insurance carrier.'
    + '</div></div>';
}
function _irPreview() {
  var s = _irState; if (!s) return;
  if (!s.selected.size) { alert('Select at least one photo.'); return; }
  if (s.mode === 'claim-filing' && !s.dateOfLoss) { alert('Enter the date of loss.'); return; }
  var body = document.getElementById('ir-body');
  if (!body) return;
  body.scrollTop = 0;
  body.innerHTML = '<div style="max-width:680px;margin:0 auto">' + _irBuildPreviewHtml(s) + '</div>';
  // Swap the footer to Back / Download.
  var bar = document.querySelector('#ir-overlay > div:last-child');
  if (bar) {
    bar.innerHTML = '<button onclick="_irBackToEdit()" style="flex:1;padding:11px;background:#fff;color:#1B2360;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;min-height:44px">&larr; Back to edit</button>'
      + '<button onclick="_irGenerate()" id="ir-generate" style="flex:2;padding:11px;background:#00B5CC;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:800;cursor:pointer;min-height:44px">&#11015;&#65039; Download PDF</button>';
    bar.style.display = 'flex';
    bar.style.gap = '10px';
  }
}
function _irBackToEdit() { _renderBuilder(); }

function _irSetCondition(el) {
  var s = _irState; if (!s) return;
  s.insCondition = el.dataset.val;
  var row = document.getElementById('ir-ins-condition-chips');
  if (row) row.querySelectorAll('button').forEach(function (b) {
    var on = b.dataset.val === s.insCondition;
    b.style.background = on ? '#0A1530' : '#F1F5F9';
    b.style.color = on ? '#fff' : '#1B2360';
    b.style.borderColor = on ? '#0A1530' : '#CBD5E1';
  });
}

// CRC Brain — generate an official condition statement so rep descriptions are
// consistent and professional. Fills the Description field; rep can still edit.
async function _irGenerateDescription() {
  var s = _irState; if (!s) return;
  var btn = document.getElementById('ir-ai-desc-btn');
  var ta = document.getElementById('ir-ins-desc');
  if (btn) { btn.disabled = true; btn.innerHTML = '&#10024; Generating…'; }
  try {
    var labels = Array.from(s.selected).map(function (u) { return s.labels[u]; }).filter(Boolean);
    var r = await fetch('/api/brain/generate-description', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: s.mode,
        address: s.job && s.job.address,
        homeownerName: s.job && s.job.homeownerName,
        summary: s.insSummary,
        condition: s.insCondition,
        photoLabels: labels,
      }),
    });
    var data = await r.json();
    if (!r.ok || !data.text) throw new Error(data.error || 'No text returned');
    s.insDescription = data.text;
    if (ta) ta.value = data.text;
  } catch (e) {
    alert('Could not generate: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '&#10024; Generate with CRC Brain'; }
  }
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
    // takenAt drives the date/time stamp the report prints under each photo
    // (homeowner's insurance reference). createdAt comes from CompanyCam's
    // capture time or the in-app upload time (collectJobPhotos).
    return { url: url, label: (s.labels[url] || p.label || p.caption || '').trim(), takenAt: p.createdAt || null };
  });

  var endpoint = s.mode === 'claim-filing' ? 'claim-filing-package'
    : s.mode === 'insurance-report' ? 'insurance-report'
    : 'photo-inspection-report';
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
  if (s.mode === 'insurance-report') {
    body.summary = s.insSummary;
    body.description = s.insDescription;
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
  var url = data.url ? ('https://crc-supplements-dev.onrender.com' + data.url) : '';

  // Refresh the job detail so the doc shows up immediately in the job's documents section
  // The portal already saved the doc to uploadedDocs -- we just need to reload
  var jobId = _irState && _irState.jobId;
  if (jobId && typeof openJobDetail === 'function') {
    // Delay slightly so overlay can close first
    setTimeout(function() {
      // Only reload if job detail is still open for this job
      if (typeof _currentJobDetail !== 'undefined' && _currentJobDetail && _currentJobDetail.id === jobId) {
        openJobDetail(jobId);
      }
    }, 800);
  }
  body.innerHTML = ''
    + '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;text-align:center">'
    +   '<div style="font-size:64px;margin-bottom:12px">&#9989;</div>'
    +   '<div style="font-size:20px;font-weight:800;color:#1B2360;margin-bottom:8px">' + (mode === 'claim-filing' ? 'Packet ready' : 'Report ready') + '</div>'
    +   '<div style="font-size:13px;color:#64748B;margin-bottom:24px;max-width:420px">Saved to this job\'s documents in the portal. You can open or share it below.</div>'
    +   '<div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:320px">'
    +     '<button onclick="_irDownloadPdf(\'' + url + '\')" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 20px;background:#1B2360;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent">&#11015;&#65039; Download PDF</button>'
    +     '<button onclick="_irCopyLink(\'' + url + '\')" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 20px;background:#00B5CC;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">&#128279; Copy Link</button>'
    +     '<button onclick="_irShowQR(\'' + url + '\')" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 20px;background:#fff;color:#1B2360;border:1.5px solid #CBD5E1;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">&#9638; QR Code</button>'
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
      + '<span style="font-size:15px;font-weight:800;color:#1B2360">Edit Labels</span>'
      + '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#64748B">&times;</button></div>'
      + current.map(function(l, i) {
          return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #F1F5F9">'
            + '<span style="flex:1;font-size:13px;color:#1B2360">' + l + '</span>'
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
  if (chipsEl) chipsEl.innerHTML = labels.map(function(l){ return '<button onclick="_irApplyChip(\'' + l.replace(/\'/g,"&#39;") + '\')" style="padding:5px 10px;background:#F1F5F9;color:#1B2360;border:1px solid #CBD5E1;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer">' + l + '</button>'; }).join('');
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
  if (chipsEl) chipsEl.innerHTML = labels.map(function(l){ return '<button onclick="_irApplyChip(\'' + l.replace(/\'/g,"&#39;") + '\')" style="padding:5px 10px;background:#F1F5F9;color:#1B2360;border:1px solid #CBD5E1;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer">' + l + '</button>'; }).join('');
}

function _irShare(url) {
  if (!url) return;
  if (navigator.share) navigator.share({ title: 'CRC Report', url: url }).catch(function(){});
  else _irCopyLink(url);
}
// Download via temp anchor -- no window.open, no target="_blank". Previous
// <a download target="_blank"> pattern opened a blank navy-chromed Safari
// tab alongside the download on iOS. This triggers ONLY the download.
function _irDownloadPdf(url) {
  if (!url) return;
  try {
    const a = document.createElement('a');
    a.href = url;
    // Derive a sensible filename from the URL tail.
    const tail = (url.split('/').pop() || 'download.pdf').split('?')[0];
    a.download = tail || 'download.pdf';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { if (a.parentNode) a.parentNode.removeChild(a); }, 0);
  } catch (e) { console.error('[Download] failed:', e); }
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
    + '<div style="font-size:13px;font-weight:700;color:#1B2360;margin-bottom:12px">Scan to open PDF</div>'
    + '<img src="' + qrUrl + '" alt="QR code to PDF" style="width:200px;height:200px;display:block">'
    + '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="margin-top:16px;padding:10px 24px;background:#1B2360;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Close</button>'
    + '</div>';
  document.body.appendChild(qrDiv);
}

// Expose
window.openPhotoInspectionReport = openPhotoInspectionReport;
window.openClaimFilingPackage = openClaimFilingPackage;
window.openInsuranceReport = openInsuranceReport;
window._irPreview = _irPreview;
window._irBackToEdit = _irBackToEdit;
window._irGenerateDescription = _irGenerateDescription;
window._irSetCondition = _irSetCondition;
window._irToggle = _irToggle;
window._irSelectAll = _irSelectAll;
window._irApplyChip = _irApplyChip;
window._irClose = _irClose;
window._irGenerate = _irGenerate;
window._irShare = _irShare;
window._irCopyLink = _irCopyLink;
window._irDownloadPdf = _irDownloadPdf;
window._irShowQR = _irShowQR;
window._irManageLabels = _irManageLabels;
window._irDeleteLabel = _irDeleteLabel;
window._irAddLabel = _irAddLabel;
