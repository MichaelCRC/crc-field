/* CRC Field Intel — Field Observations
   Standalone panel: no frameworks, vanilla JS, mobile-first
   All field names match the portal's fieldNotes schema exactly (camelCase). */

let _fieldObsJobId = null;
let _fieldObsData  = {};

/* ─── Open / Close ─── */

function openFieldObs(jobId, existingFieldNotes) {
  _fieldObsJobId = jobId;
  _fieldObsData  = existingFieldNotes || {};
  var panel = document.getElementById('field-obs-panel');
  panel.innerHTML = _foRenderForm(_fieldObsData);
  panel.classList.add('open');
  panel.scrollTop = 0;
}

function closeFieldObs() {
  document.getElementById('field-obs-panel').classList.remove('open');
}

/* ─── DOM Interaction Helpers (called inline from rendered HTML) ─── */

// Toggle a sibling details div when a checkbox changes
function foToggleDetails(checkbox, detailId) {
  var el = document.getElementById(detailId);
  if (el) el.style.display = checkbox.checked ? 'flex' : 'none';
}

// Chimney toggle: also auto-checks Counter Flashing
function foChimneyChanged(checkbox) {
  foToggleDetails(checkbox, 'chimney-extra');
  var cf = document.getElementById('counterFlashing');
  if (cf && checkbox.checked && !cf.checked) cf.checked = true;
}

// Mutually-exclusive pairs (R&R vs D&R)
function foMutualExclude(checkbox, otherId) {
  if (checkbox.checked) {
    var other = document.getElementById(otherId);
    if (other) other.checked = false;
  }
}

/* ─── Sub-builders ─── */

function _foQtySelect(id, val, max) {
  val = parseInt(val) || 1;
  max = max || 20;
  var o = '';
  for (var n = 1; n <= max; n++) {
    o += '<option value="' + n + '"' + (n === val ? ' selected' : '') + '>' + n + '</option>';
  }
  return '<select id="' + id + '" style="padding:6px 8px;border:1px solid var(--border);'
    + 'border-radius:6px;font-size:14px;background:#fff;color:var(--navy);min-width:54px">'
    + o + '</select>';
}

function _foSizeSelect(id, val) {
  var sizes = ['small', 'medium', 'large'];
  var o = sizes.map(function(s) {
    return '<option value="' + s + '"' + (val === s ? ' selected' : '') + '>'
      + s[0].toUpperCase() + s.slice(1) + '</option>';
  }).join('');
  return '<select id="' + id + '" style="padding:6px 8px;border:1px solid var(--border);'
    + 'border-radius:6px;font-size:14px;background:#fff;color:var(--navy)">' + o + '</select>';
}

// Generic enum select: pass [{value, label}, ...]
// Always prepends an empty "--" option as the default so an untouched
// dropdown reads as null (not the first real enum value). This is load-
// bearing for the inspection-complete hard gate -- callers of this helper
// are all gated fields (chimneyType, valleyType, osbRedeck,
// atticVentilationType). Auto-selecting the first enum option would bypass
// the gate since the saved value would look "answered".
function _foEnumSelect(id, val, options) {
  var empty = '<option value=""' + (!val ? ' selected' : '') + '>--</option>';
  var o = options.map(function(opt) {
    return '<option value="' + opt.value + '"' + (val === opt.value ? ' selected' : '') + '>'
      + opt.label + '</option>';
  }).join('');
  return '<select id="' + id + '" style="padding:6px 10px;border:1px solid var(--border);'
    + 'border-radius:6px;font-size:14px;background:#fff;color:var(--navy)">'
    + empty + o + '</select>';
}

// Show/hide downspout row whenever either gutter checkbox changes
function foGutterChanged() {
  var r = document.getElementById('replaceGutters');
  var d = document.getElementById('existingGutters');
  var wrap = document.getElementById('downspoutCount-row');
  if (wrap) wrap.style.display = ((r && r.checked) || (d && d.checked)) ? 'flex' : 'none';
}

// Checkbox row — plain or with inline qty/size extras on the right
// cfg: { id, label, checked, onchange, qtyId, qtyVal, qtyMax, sizeId, sizeVal }
function _foCheckRow(cfg) {
  var chk = cfg.checked ? 'checked' : '';
  var oc  = cfg.onchange
    ? ' onchange="' + cfg.onchange + '"'
    : (cfg.qtyId ? ' onchange="foToggleDetails(this,\'' + cfg.id + '-extra\')"' : '');

  var row = '<label style="display:flex;align-items:center;gap:10px;padding:11px 0;'
          + 'cursor:pointer;border-bottom:1px solid var(--bg)">';
  row += '<input type="checkbox" id="' + cfg.id + '" ' + chk + oc
       + ' style="width:22px;height:22px;accent-color:var(--teal);flex-shrink:0">';
  row += '<span style="font-size:14px;color:var(--navy);flex:1">' + cfg.label + '</span>';

  if (cfg.qtyId) {
    row += '<div id="' + cfg.id + '-extra" '
         + 'style="display:' + (cfg.checked ? 'flex' : 'none') + ';align-items:center;gap:6px;flex-wrap:wrap" '
         + 'onclick="event.stopPropagation()">';
    row += '<span style="font-size:12px;color:var(--gray)">Qty</span>';
    row += _foQtySelect(cfg.qtyId, cfg.qtyVal, cfg.qtyMax || 20);
    if (cfg.sizeId) row += _foSizeSelect(cfg.sizeId, cfg.sizeVal);
    if (cfg.typeId && cfg.typeOptions) row += _foEnumSelect(cfg.typeId, cfg.typeVal, cfg.typeOptions);
    row += '</div>';
  }

  row += '</label>';
  return row;
}

// Named section wrapper (title + white card)
function _foSection(title, content) {
  return '<div style="margin-bottom:16px">'
    + '<div style="font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;'
    + 'letter-spacing:0.5px;margin-bottom:8px">' + title + '</div>'
    + '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:4px 14px">'
    + content
    + '</div></div>';
}

// Grouped box (Gutters / Gutter Guards)
function _foGroupBox(title, content) {
  return '<div style="margin-bottom:16px">'
    + '<div style="font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;'
    + 'letter-spacing:0.5px;margin-bottom:8px">' + title + '</div>'
    + '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:4px 14px">'
    + content
    + '</div></div>';
}

/* ─── Main Form Renderer ─── */

function _foRenderForm(fn) {
  var h = '';

  /* ── Sticky Header ── */
  h += '<div style="position:sticky;top:0;z-index:10;background:var(--navy);'
     + 'padding:12px 16px;display:flex;align-items:center;gap:10px;'
     + 'box-shadow:0 2px 6px rgba(0,0,0,0.25)">';
  h += '<button onclick="closeFieldObs()" style="background:none;border:none;color:var(--teal);'
     + 'font-size:14px;font-weight:600;cursor:pointer;padding:4px 0;flex-shrink:0">'
     + '\u2190 Job Detail</button>';
  h += '<span style="flex:1;text-align:center;font-size:15px;font-weight:700;color:#fff">'
     + 'Field Observations</span>';
  h += '<button onclick="saveFieldObs()" id="fo-save-btn" '
     + 'style="background:var(--teal);color:#fff;border:none;border-radius:8px;padding:8px 14px;'
     + 'font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0;white-space:nowrap">'
     + 'Save &amp; Sync</button>';
  h += '</div>';

  /* ── Error bar ── */
  h += '<div id="fo-error" style="display:none;background:#FEE2E2;color:#DC2626;'
     + 'padding:10px 16px;font-size:13px;font-weight:600;'
     + 'border-bottom:2px solid #FCA5A5"></div>';

  /* ── Scrollable body ── */
  h += '<div style="padding:16px;max-width:540px;margin:0 auto">';

  /* ══ SECTION: Roof Features ══ */
  var roof = '';

  // Chimney — custom onchange auto-checks Counter Flashing
  roof += _foCheckRow({
    id: 'chimney', label: 'Chimney', checked: fn.chimney,
    onchange: 'foChimneyChanged(this)',
    qtyId: 'chimneyQty', qtyVal: fn.chimneyQty || 1, qtyMax: 10,
    sizeId: 'chimneySize', sizeVal: fn.chimneySize,
    typeId: 'chimneyType', typeVal: fn.chimneyType,
    typeOptions: [
      { value: 'masonry', label: 'Masonry' },
      { value: 'metal',   label: 'Metal'   }
    ]
  });

  // Skylights
  roof += _foCheckRow({
    id: 'skylights', label: 'Skylights', checked: fn.skylights,
    qtyId: 'skylightQty', qtyVal: fn.skylightQty || 1, qtyMax: 10,
    sizeId: 'skylightSize', sizeVal: fn.skylightSize
  });

  // Pipe Jacks — always visible number input (0-20)
  roof += '<div style="display:flex;align-items:center;justify-content:space-between;'
        + 'padding:11px 0;border-bottom:1px solid var(--bg)">';
  roof += '<label for="pipeJacks" style="font-size:14px;color:var(--navy);cursor:pointer">'
        + 'Pipe Jacks (qty)</label>';
  roof += '<input type="number" id="pipeJacks" min="0" max="20" value="'
        + (fn.pipeJacks || 0) + '" '
        + 'style="width:64px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;'
        + 'font-size:14px;text-align:center;color:var(--navy)">';
  roof += '</div>';

  // Counter Flashing (auto-checked by chimney)
  roof += _foCheckRow({ id: 'counterFlashing', label: 'Counter Flashing', checked: fn.counterFlashing });

  // Ridge Vent — default true
  roof += _foCheckRow({ id: 'ridgeVent', label: 'Ridge Vent', checked: fn.ridgeVent !== false });

  // Existing Drip Edge
  roof += _foCheckRow({
    id: 'existingDripEdge',
    label: 'Existing Drip Edge (R&amp;R vs install new)',
    checked: fn.existingDripEdge
  });

  // Valley Metal (conditional — drives RFG VMTLW inclusion). Woven / closed-cut
  // valleys have no metal, so this must be an explicit observation.
  roof += _foCheckRow({
    id: 'valleyMetalRequired',
    label: 'Metal valley installed / required',
    checked: fn.valleyMetalRequired
  });

  // Valley type (detailed classification — keep valleyMetalRequired for backwards
  // compatibility with existing scope logic; this adds protocol-required detail.)
  roof += '<div style="display:flex;align-items:center;justify-content:space-between;'
        + 'padding:11px 0;border-bottom:1px solid var(--bg)">';
  roof += '<label for="valleyType" style="font-size:14px;color:var(--navy);cursor:pointer">'
        + 'Valley Type</label>';
  roof += _foEnumSelect('valleyType', fn.valleyType, [
    { value: 'california_cut', label: 'California Cut' },
    { value: 'closed_cut',     label: 'Closed Cut'     },
    { value: 'open_metal',     label: 'Open Metal'     }
  ]);
  roof += '</div>';

  // OSB redeck (none / spot / full) — drives decking supplement math
  roof += '<div style="display:flex;align-items:center;justify-content:space-between;'
        + 'padding:11px 0;border-bottom:1px solid var(--bg)">';
  roof += '<label for="osbRedeck" style="font-size:14px;color:var(--navy);cursor:pointer">'
        + 'OSB Redeck</label>';
  roof += _foEnumSelect('osbRedeck', fn.osbRedeck, [
    { value: 'none', label: 'None' },
    { value: 'spot', label: 'Spot' },
    { value: 'full', label: 'Full' }
  ]);
  roof += '</div>';

  // Eave Depth select
  roof += '<div style="display:flex;align-items:center;justify-content:space-between;'
        + 'padding:11px 0;border-bottom:1px solid var(--bg)">';
  roof += '<label for="eaveDepth" style="font-size:14px;color:var(--navy);cursor:pointer">'
        + 'Eave Depth</label>';
  roof += '<select id="eaveDepth" style="padding:6px 10px;border:1px solid var(--border);'
        + 'border-radius:6px;font-size:14px;background:#fff;color:var(--navy)">';
  roof += '<option value="standard"' + (fn.eaveDepth === 'extended' ? '' : ' selected') + '>Standard</option>';
  roof += '<option value="extended"' + (fn.eaveDepth === 'extended' ? ' selected' : '') + '>Extended</option>';
  roof += '</select></div>';

  // 2+ Stories
  roof += _foCheckRow({ id: 'twoStory', label: '2+ Stories', checked: fn.twoStory });

  h += _foSection('Roof Features', roof);

  /* ══ SECTION: Vents ══ */
  var vents = '';
  vents += _foCheckRow({ id: 'exhaustVent', label: 'Exhaust Vent Cap', checked: fn.exhaustVent, qtyId: 'exhaustVentQty', qtyVal: fn.exhaustVentQty || 1 });
  vents += _foCheckRow({ id: 'dryerVent',   label: 'Dryer Vent Cap',   checked: fn.dryerVent,   qtyId: 'dryerVentQty',   qtyVal: fn.dryerVentQty   || 1 });
  vents += _foCheckRow({ id: 'powerVent',   label: 'Power Vent',       checked: fn.powerVent,   qtyId: 'powerVentQty',   qtyVal: fn.powerVentQty   || 1 });
  vents += _foCheckRow({ id: 'boxVent',     label: 'Box Vent',         checked: fn.boxVent,     qtyId: 'boxVentQty',     qtyVal: fn.boxVentQty     || 1 });
  h += _foSection('Vents', vents);

  /* ══ SECTION: Gutters (mutually exclusive R&R vs D&R) ══ */
  var gutters = '';
  gutters += _foCheckRow({
    id: 'replaceGutters', label: 'R&amp;R Gutters (Replace &amp; Reinstall)',
    checked: fn.replaceGutters,
    onchange: 'foMutualExclude(this,"existingGutters");foGutterChanged()'
  });
  gutters += _foCheckRow({
    id: 'existingGutters', label: 'D&amp;R Gutters (Detach &amp; Reset)',
    checked: fn.existingGutters,
    onchange: 'foMutualExclude(this,"replaceGutters");foGutterChanged()'
  });

  // Downspout count — conditional reveal when either gutter option is checked
  var hasGutters = !!(fn.replaceGutters || fn.existingGutters);
  gutters += '<div id="downspoutCount-row" '
           + 'style="display:' + (hasGutters ? 'flex' : 'none') + ';'
           + 'align-items:center;justify-content:space-between;'
           + 'padding:11px 0;border-bottom:1px solid var(--bg)">';
  gutters += '<label for="downspoutCount" style="font-size:14px;color:var(--navy);cursor:pointer">'
           + 'Downspouts (qty)</label>';
  gutters += '<input type="number" id="downspoutCount" min="0" max="20" value="'
           + (fn.downspoutCount != null ? fn.downspoutCount : '') + '" '
           + 'placeholder="0" style="width:64px;padding:6px 8px;border:1px solid var(--border);'
           + 'border-radius:6px;font-size:14px;text-align:center;color:var(--navy)">';
  gutters += '</div>';

  h += _foGroupBox('Gutters', gutters);

  /* ══ SECTION: Gutter Guards (mutually exclusive R&R vs D&R) ══ */
  var guards = '';
  guards += _foCheckRow({
    id: 'replaceGutterGuards', label: 'R&amp;R Gutter Guards',
    checked: fn.replaceGutterGuards, onchange: 'foMutualExclude(this,"gutterGuards")'
  });
  guards += _foCheckRow({
    id: 'gutterGuards', label: 'D&amp;R Gutter Guards',
    checked: fn.gutterGuards, onchange: 'foMutualExclude(this,"replaceGutterGuards")'
  });
  h += _foGroupBox('Gutter Guards', guards);

  /* ══ SECTION: Attic ══ */
  var attic = '';
  attic += _foCheckRow({
    id: 'atticAccess', label: 'Attic Access', checked: fn.atticAccess,
    onchange: 'foToggleDetails(this,\'atticVent-row\')'
  });
  // Intake ventilation type — conditional on atticAccess
  attic += '<div id="atticVent-row" '
         + 'style="display:' + (fn.atticAccess ? 'flex' : 'none') + ';'
         + 'align-items:center;justify-content:space-between;'
         + 'padding:11px 0;border-bottom:1px solid var(--bg)">';
  attic += '<label for="atticVentilationType" style="font-size:14px;color:var(--navy);cursor:pointer">'
         + 'Intake Ventilation</label>';
  attic += _foEnumSelect('atticVentilationType', fn.atticVentilationType, [
    { value: 'soffit', label: 'Soffit' },
    { value: 'gable',  label: 'Gable'  },
    { value: 'none',   label: 'None'   },
    { value: 'other',  label: 'Other'  }
  ]);
  attic += '</div>';
  h += _foSection('Attic', attic);

  /* ══ SECTION: Other ══ */
  var other = '';

  // Satellite Dish
  other += _foCheckRow({
    id: 'satelliteDish', label: 'Satellite Dish',
    checked: fn.satelliteDish,
    qtyId: 'satelliteDishQty', qtyVal: fn.satelliteDishQty || 1, qtyMax: 10
  });

  // Tarp — yellow warning box
  other += '<div style="background:#FFFBEB;border:1px solid #F59E0B;border-radius:8px;'
         + 'padding:8px 12px;margin-top:8px">';
  other += '<div style="font-size:11px;color:#92400E;font-weight:600;margin-bottom:4px">'
         + '&#9888;&#65039; Only check if YOU installed tarps on this property</div>';
  other += '<label style="display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer">';
  other += '<input type="checkbox" id="tarpInstalled" ' + (fn.tarpInstalled ? 'checked' : '')
         + ' onchange="foToggleDetails(this,\'tarp-extra\')"'
         + ' style="width:22px;height:22px;accent-color:#F59E0B;flex-shrink:0">';
  other += '<span style="font-size:14px;color:var(--navy)">Tarp Installed</span></label>';
  other += '<div id="tarp-extra" style="display:' + (fn.tarpInstalled ? 'flex' : 'none') + ';'
         + 'align-items:center;gap:8px;padding:4px 0 4px 32px;flex-wrap:wrap">';
  other += '<span style="font-size:12px;color:var(--gray)">Qty</span>'
         + _foQtySelect('tarpQty', fn.tarpQty || 1, 20);
  other += '<span style="font-size:12px;color:var(--gray)">SF:</span>';
  other += '<input type="number" id="tarpSF" min="0" value="' + (fn.tarpSF || '') + '" '
         + 'placeholder="0" style="width:72px;padding:6px 8px;border:1px solid var(--border);'
         + 'border-radius:6px;font-size:14px;text-align:center;color:var(--navy)">';
  other += '</div></div>';

  h += _foSection('Other', other);

  h += '</div>'; // end body
  return h;
}

/* ─── Data Collection ─── */

function _foChk(id) { var e = document.getElementById(id); return !!(e && e.checked); }
function _foVal(id) { var e = document.getElementById(id); return e ? e.value : ''; }
function _foInt(id) { var e = document.getElementById(id); return e ? (parseInt(e.value) || 0) : 0; }
function _foNum(id) { var e = document.getElementById(id); return e ? (parseFloat(e.value) || 0) : 0; }

function _collectFieldObs() {
  var chimney   = _foChk('chimney');
  var skylights = _foChk('skylights');
  var satDish   = _foChk('satelliteDish');
  var exVent    = _foChk('exhaustVent');
  var drVent    = _foChk('dryerVent');
  var pwVent    = _foChk('powerVent');
  var bxVent    = _foChk('boxVent');
  var tarp      = _foChk('tarpInstalled');

  var atticAccess = _foChk('atticAccess');
  var hasGutters  = _foChk('replaceGutters') || _foChk('existingGutters');

  return {
    chimney:              chimney,
    chimneyQty:           chimney   ? _foInt('chimneyQty')       : 0,
    chimneySize:          chimney   ? _foVal('chimneySize')      : null,
    chimneyType:          chimney   ? (_foVal('chimneyType') || null) : null,
    skylights:            skylights,
    skylightQty:          skylights ? _foInt('skylightQty')      : 0,
    skylightSize:         skylights ? _foVal('skylightSize')     : null,
    pipeJacks:            _foInt('pipeJacks'),
    twoStory:             _foChk('twoStory'),
    existingDripEdge:     _foChk('existingDripEdge'),
    valleyMetalRequired:  _foChk('valleyMetalRequired'),
    valleyType:           _foVal('valleyType') || null,
    osbRedeck:            _foVal('osbRedeck') || null,
    eaveDepth:            _foVal('eaveDepth') || 'standard',
    replaceGutters:       _foChk('replaceGutters'),
    existingGutters:      _foChk('existingGutters'),
    downspoutCount:       hasGutters ? _foInt('downspoutCount')  : 0,
    replaceGutterGuards:  _foChk('replaceGutterGuards'),
    gutterGuards:         _foChk('gutterGuards'),
    atticAccess:          atticAccess,
    atticVentilationType: atticAccess ? (_foVal('atticVentilationType') || null) : null,
    satelliteDish:        satDish,
    satelliteDishQty:     satDish   ? _foInt('satelliteDishQty') : 0,
    exhaustVent:          exVent,
    exhaustVentQty:       exVent    ? _foInt('exhaustVentQty')   : 0,
    dryerVent:            drVent,
    dryerVentQty:         drVent    ? _foInt('dryerVentQty')     : 0,
    powerVent:            pwVent,
    powerVentQty:         pwVent    ? _foInt('powerVentQty')     : 0,
    boxVent:              bxVent,
    boxVentQty:           bxVent    ? _foInt('boxVentQty')       : 0,
    ridgeVent:            _foChk('ridgeVent'),
    tarpInstalled:        tarp,
    tarpQty:              tarp      ? _foInt('tarpQty')          : 0,
    tarpSF:               tarp      ? _foNum('tarpSF')           : 0,
    counterFlashing:      _foChk('counterFlashing')
  };
}

/* ─── Save & Sync ─── */

async function saveFieldObs() {
  var btn   = document.getElementById('fo-save-btn');
  var errEl = document.getElementById('fo-error');
  if (btn)   { btn.disabled = true; btn.textContent = 'Saving...'; }
  if (errEl)   errEl.style.display = 'none';

  var fieldNotes = _collectFieldObs();

  try {
    var r = await fetch('/api/field/jobs/' + _fieldObsJobId + '/fieldnotes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fieldNotes)
    });
    if (!r.ok) {
      var errData = await r.json().catch(function() { return {}; });
      throw new Error(errData.error || 'HTTP ' + r.status);
    }

    // Also sync to local lead record if currentLeadId is set (global from app.js)
    var lid = (typeof currentLeadId !== 'undefined') ? currentLeadId : null;
    if (lid) {
      fetch('/api/leads/' + lid, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldNotes: fieldNotes })
      }).catch(function() { /* non-critical */ });
    }

    showToast('Field observations saved');
    closeFieldObs();
  } catch (e) {
    if (errEl) { errEl.textContent = 'Error: ' + e.message; errEl.style.display = 'block'; }
    if (btn)   { btn.disabled = false; btn.textContent = 'Save & Sync'; }
  }
}
