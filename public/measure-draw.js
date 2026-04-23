/**
 * CRC Measure — drawing overlay on the satellite image and field notes
 * whiteboard. Loads into the measure bottom sheet when results are rendered.
 *
 * Drawings overlay the satellite image (transparent layer). Satellite can be
 * toggled off to show drawings only. Auto-saves to the portal job 2s after
 * the last stroke.
 *
 *   Roof diagram  -> roofDiagramMarkup (composite) + roofDiagramStrokes (raw)
 *   Field notes   -> fieldNotesWhiteboard { imageUrl, strokes, savedAt }
 */

var _md = {
  // Roof drawing
  roof: null,           // { wrap, bg, ov, bgCtx, ovCtx, strokes, history, color, size, tool, current, satImg, jobId, address, imgW, imgH }
  // Field notes whiteboard
  notes: null,          // { wrap, canvas, ctx, strokes, current, size, jobId }
  saveTimer: null,
  labelChips: ['Hail Impact','Wind Damage','Missing Shingle','Cracked Shingle','Lifted Flashing','Gutter Damage','Soft Spot','Exposed Nail'],
};

// ── Public entry — mount drawing UI on the measure sheet ────────────────────
// Called from measure.js after results render. container = element to append
// into. jobId may be null if the measure was run from the map without a job —
// in that case saves are skipped.
function measureMountDrawing(container, opts) {
  opts = opts || {};
  var imgUrl = opts.satelliteImageUrl || '';
  var jobId = opts.jobId || null;
  var address = opts.address || '';

  // Roof diagram section
  var roofSection = document.createElement('div');
  roofSection.style.cssText = 'margin-top:14px;padding-top:14px;border-top:1px solid #E5E7EB';
  roofSection.innerHTML = _roofSectionHtml();
  container.appendChild(roofSection);

  // Field notes section
  var notesSection = document.createElement('div');
  notesSection.style.cssText = 'margin-top:18px;padding-top:14px;border-top:1px solid #E5E7EB';
  notesSection.innerHTML = _notesSectionHtml();
  container.appendChild(notesSection);

  // Init roof canvas (needs satellite to load)
  if (imgUrl) {
    _initRoofCanvas(imgUrl, jobId, address);
  } else {
    var empty = roofSection.querySelector('#md-roof-empty');
    if (empty) empty.style.display = 'block';
  }
  _initNotesCanvas(jobId);

  // Load existing saved drawings if we have a job
  if (jobId) _loadExistingDrawings(jobId);
}

function _roofSectionHtml() {
  return ''
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<div style="font-size:12px;font-weight:800;color:#001A4D;letter-spacing:0.4px;text-transform:uppercase">Roof Diagram</div>'
    + '<div id="md-roof-save" style="font-size:11px;color:#64748B"></div>'
    + '</div>'
    // Toolbar
    + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">'
    + _toolbarBtn('md-color-black','Black','background:#0D0D0D;color:#fff', "mdSetRoofColor(\\'#0D0D0D\\',this)", true)
    + _toolbarBtn('md-color-red','Red','background:#DC2626;color:#fff', "mdSetRoofColor(\\'#DC2626\\',this)")
    + '<span style="width:1px;background:#cbd5e1;margin:0 2px"></span>'
    + _toolbarBtn('md-tool-pen','Pen','', "mdSetRoofTool(\\'pen\\',this)", true)
    + _toolbarBtn('md-tool-eraser','Erase','', "mdSetRoofTool(\\'eraser\\',this)")
    + '<span style="width:1px;background:#cbd5e1;margin:0 2px"></span>'
    + _toolbarBtn('md-undo','Undo','', 'mdRoofUndo()')
    + _toolbarBtn('md-clear','Clear','background:#fff;color:#DC2626;border-color:#DC2626', 'mdRoofClear()')
    + '<span style="width:1px;background:#cbd5e1;margin:0 2px"></span>'
    + '<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#334155;cursor:pointer">'
    + '<input type="checkbox" id="md-show-sat" checked onchange="mdToggleSatellite(this.checked)" style="margin:0;width:16px;height:16px;accent-color:#00B5CC"> Satellite'
    + '</label>'
    + '</div>'
    // Canvas wrapper
    + '<div id="md-roof-wrap" style="position:relative;width:100%;border:1px solid #CBD5E1;border-radius:8px;overflow:hidden;background:#F8FAFC;min-height:240px"></div>'
    + '<div id="md-roof-empty" style="display:none;padding:40px 20px;text-align:center;font-size:13px;color:#64748B">No satellite image available. Skip to field notes below.</div>';
}

function _notesSectionHtml() {
  return ''
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<div style="font-size:12px;font-weight:800;color:#001A4D;letter-spacing:0.4px;text-transform:uppercase">Field Notes</div>'
    + '<div id="md-notes-save" style="font-size:11px;color:#64748B"></div>'
    + '</div>'
    + '<div style="display:flex;gap:6px;margin-bottom:8px">'
    + _toolbarBtn('md-notes-s','S','', 'mdNotesSize(2,this)')
    + _toolbarBtn('md-notes-m','M','', 'mdNotesSize(4,this)', true)
    + _toolbarBtn('md-notes-l','L','', 'mdNotesSize(8,this)')
    + _toolbarBtn('md-notes-undo','Undo','', 'mdNotesUndo()')
    + _toolbarBtn('md-notes-clear','Clear','background:#fff;color:#DC2626;border-color:#DC2626', 'mdNotesClear()')
    + '</div>'
    + '<canvas id="md-notes-canvas" style="width:100%;height:280px;background:#fff;border:1px solid #CBD5E1;border-radius:8px;touch-action:none;display:block"></canvas>'
    + '<div style="margin-top:4px;font-size:11px;color:#94A3B8">Black ink. Sketch measurements, jot numbers, take notes. Auto-saves 2s after you stop drawing.</div>';
}

function _toolbarBtn(id, label, extraStyle, onclick, active) {
  var base = 'padding:6px 10px;border:1px solid #CBD5E1;border-radius:6px;font-size:12px;font-weight:600;background:#fff;color:#001A4D;cursor:pointer;min-height:32px';
  var act  = active ? ';background:#001A4D;color:#fff;border-color:#001A4D' : '';
  return '<button id="' + id + '" onclick="' + onclick + '" style="' + base + act + ';' + (extraStyle||'') + '">' + label + '</button>';
}

// ── Roof canvas ─────────────────────────────────────────────────────────────
function _initRoofCanvas(imgUrl, jobId, address) {
  var wrap = document.getElementById('md-roof-wrap');
  if (!wrap) return;

  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() {
    var aspect = img.naturalHeight / img.naturalWidth;
    var w = wrap.clientWidth || 640;
    var h = Math.round(w * aspect);

    wrap.style.height = h + 'px';
    wrap.innerHTML = '';

    var bg = document.createElement('canvas');
    bg.width = img.naturalWidth; bg.height = img.naturalHeight;
    bg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    bg.getContext('2d').drawImage(img, 0, 0);

    var ov = document.createElement('canvas');
    ov.width = img.naturalWidth; ov.height = img.naturalHeight;
    ov.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair';

    wrap.appendChild(bg);
    wrap.appendChild(ov);

    _md.roof = {
      wrap: wrap, bg: bg, ov: ov,
      bgCtx: bg.getContext('2d'),
      ovCtx: ov.getContext('2d'),
      strokes: [], current: null,
      color: '#0D0D0D', size: 4, tool: 'pen',
      satImg: img, satVisible: true,
      jobId: jobId, address: address,
      imgW: img.naturalWidth, imgH: img.naturalHeight,
    };

    _attachDrawHandlers(ov, _md.roof, _mdRoofOnStart, _mdRoofOnMove, _mdRoofOnEnd);
    // If roof canvas is backed by a job with stored strokes, load will happen
    // in _loadExistingDrawings.
  };
  img.onerror = function() {
    wrap.innerHTML = '<div style="padding:30px;text-align:center;color:#94A3B8;font-size:13px">Satellite image failed to load.</div>';
  };
  img.src = imgUrl;
}

function _mdRoofOnStart(p) {
  var r = _md.roof; if (!r) return;
  if (r.tool === 'text') {
    var txt = prompt('Label text:');
    if (!txt) return;
    r.strokes.push({ type:'text', x:p.x, y:p.y, text:txt, color:r.color, size:r.size*6 });
    _mdRoofRedraw(); _scheduleSave();
    return;
  }
  if (r.tool === 'eraser') {
    // Hit-test and remove strokes whose path passes near the point
    var hit = _hitTest(r.strokes, p, 12 * (r.imgW / Math.max(1, r.ov.clientWidth)));
    if (hit >= 0) { r.strokes.splice(hit,1); _mdRoofRedraw(); _scheduleSave(); }
    return;
  }
  r.current = { type:r.tool, color:r.color, size:r.size, points:[p] };
}

function _mdRoofOnMove(p) {
  var r = _md.roof; if (!r || !r.current) return;
  r.current.points.push(p);
  _mdRoofRedraw();
}

function _mdRoofOnEnd() {
  var r = _md.roof; if (!r || !r.current) return;
  if (r.current.points.length < 2 && r.current.type !== 'circle') { r.current = null; return; }
  r.strokes.push(r.current);
  r.current = null;
  _mdRoofRedraw();
  _scheduleSave();
}

function _mdRoofRedraw() {
  var r = _md.roof; if (!r) return;
  // Background
  r.bgCtx.clearRect(0,0,r.imgW,r.imgH);
  if (r.satVisible && r.satImg) r.bgCtx.drawImage(r.satImg, 0, 0);
  else { r.bgCtx.fillStyle = '#FFFFFF'; r.bgCtx.fillRect(0,0,r.imgW,r.imgH); }
  // Overlay
  r.ovCtx.clearRect(0,0,r.imgW,r.imgH);
  r.strokes.forEach(function(s){ _drawStroke(r.ovCtx, s); });
  if (r.current) _drawStroke(r.ovCtx, r.current);
}

function mdSetRoofColor(c, btn) {
  if (!_md.roof) return;
  _md.roof.color = c;
  _groupActive(btn, ['md-color-black','md-color-red']);
}
function mdSetRoofSize(s, btn) {
  if (!_md.roof) return;
  _md.roof.size = s;
  _groupActive(btn, ['md-size-s','md-size-m','md-size-l']);
}
function mdSetRoofTool(t, btn) {
  if (!_md.roof) return;
  _md.roof.tool = t;
  _md.roof.ov.style.cursor = t === 'text' ? 'text' : t === 'eraser' ? 'cell' : 'crosshair';
  _groupActive(btn, ['md-tool-pen','md-tool-line','md-tool-circle','md-tool-arrow','md-tool-text','md-tool-eraser']);
}
function mdRoofUndo() {
  if (!_md.roof) return;
  _md.roof.strokes.pop();
  _mdRoofRedraw(); _scheduleSave();
}
function mdRoofClear() {
  if (!_md.roof) return;
  if (!confirm('Clear all roof drawings?')) return;
  _md.roof.strokes = [];
  _mdRoofRedraw(); _scheduleSave();
}
function mdToggleSatellite(show) {
  if (!_md.roof) return;
  _md.roof.satVisible = !!show;
  _mdRoofRedraw();
}

// ── Notes canvas ────────────────────────────────────────────────────────────
function _initNotesCanvas(jobId) {
  var canvas = document.getElementById('md-notes-canvas');
  if (!canvas) return;
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  canvas.width  = Math.max(800, Math.round(rect.width * dpr));
  canvas.height = Math.round(rect.height * dpr);
  var ctx = canvas.getContext('2d');
  // Keep stroke coordinates in internal canvas units (no scale) so we can
  // serialize and replay at the same resolution.
  _md.notes = {
    canvas: canvas, ctx: ctx,
    strokes: [], current: null,
    size: 4, jobId: jobId,
    scale: canvas.width / (rect.width || 1)
  };
  _mdNotesRedraw();
  _attachDrawHandlers(canvas, _md.notes, _mdNotesOnStart, _mdNotesOnMove, _mdNotesOnEnd);
}

function _mdNotesOnStart(p) {
  var n = _md.notes; if (!n) return;
  n.current = { type:'pen', color:'#0D0D0D', size:n.size, points:[p] };
}
function _mdNotesOnMove(p) { var n = _md.notes; if (!n || !n.current) return; n.current.points.push(p); _mdNotesRedraw(); }
function _mdNotesOnEnd() {
  var n = _md.notes; if (!n || !n.current) return;
  if (n.current.points.length < 2) { n.current = null; return; }
  n.strokes.push(n.current); n.current = null;
  _mdNotesRedraw(); _scheduleSave();
}
function _mdNotesRedraw() {
  var n = _md.notes; if (!n) return;
  n.ctx.fillStyle = '#FFFFFF';
  n.ctx.fillRect(0,0,n.canvas.width,n.canvas.height);
  n.strokes.forEach(function(s){ _drawStroke(n.ctx, s); });
  if (n.current) _drawStroke(n.ctx, n.current);
}
function mdNotesSize(s, btn) { if (_md.notes) _md.notes.size = s; _groupActive(btn, ['md-notes-s','md-notes-m','md-notes-l']); }
function mdNotesUndo() { if (!_md.notes) return; _md.notes.strokes.pop(); _mdNotesRedraw(); _scheduleSave(); }
function mdNotesClear() { if (!_md.notes) return; if (!confirm('Clear all notes?')) return; _md.notes.strokes=[]; _mdNotesRedraw(); _scheduleSave(); }

// ── Shared draw helpers ─────────────────────────────────────────────────────
function _drawStroke(ctx, s) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = s.color || '#0D0D0D';
  ctx.fillStyle = s.color || '#0D0D0D';
  ctx.lineWidth = s.size || 3;
  var pts = s.points || [];

  if (s.type === 'pen') {
    ctx.beginPath();
    pts.forEach(function(p, i){ if (i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); });
    ctx.stroke();
  } else if (s.type === 'line' && pts.length >= 2) {
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); ctx.lineTo(pts[pts.length-1].x,pts[pts.length-1].y); ctx.stroke();
  } else if (s.type === 'circle' && pts.length >= 2) {
    var a = pts[0], b = pts[pts.length-1];
    var cx = (a.x+b.x)/2, cy = (a.y+b.y)/2;
    var rx = Math.abs(b.x-a.x)/2, ry = Math.abs(b.y-a.y)/2;
    ctx.beginPath(); ctx.ellipse(cx,cy,Math.max(2,rx),Math.max(2,ry),0,0,Math.PI*2); ctx.stroke();
  } else if (s.type === 'arrow' && pts.length >= 2) {
    var p1 = pts[0], p2 = pts[pts.length-1];
    ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
    var angle = Math.atan2(p2.y-p1.y, p2.x-p1.x);
    var ah = 10 + (s.size || 3) * 2;
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - ah*Math.cos(angle - Math.PI/7), p2.y - ah*Math.sin(angle - Math.PI/7));
    ctx.lineTo(p2.x - ah*Math.cos(angle + Math.PI/7), p2.y - ah*Math.sin(angle + Math.PI/7));
    ctx.closePath(); ctx.fill();
  } else if (s.type === 'text') {
    ctx.font = 'bold ' + (s.size || 20) + 'px sans-serif';
    ctx.fillText(s.text || '', s.x, s.y);
  }
  ctx.restore();
}

function _hitTest(strokes, p, thresh) {
  for (var i = strokes.length - 1; i >= 0; i--) {
    var s = strokes[i];
    if (s.type === 'text') {
      var fs = s.size || 20;
      if (p.x > s.x - 4 && p.x < s.x + 6*fs && p.y > s.y - fs && p.y < s.y + 4) return i;
      continue;
    }
    var pts = s.points || [];
    for (var j = 0; j < pts.length; j++) {
      var dx = pts[j].x - p.x, dy = pts[j].y - p.y;
      if (dx*dx + dy*dy < thresh*thresh) return i;
    }
  }
  return -1;
}

function _attachDrawHandlers(el, target, onStart, onMove, onEnd) {
  function norm(e) {
    var r = el.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    var scale = (el.width && r.width) ? (el.width / r.width) : 1;
    return { x: (t.clientX - r.left) * scale, y: (t.clientY - r.top) * scale };
  }
  var drawing = false;
  function start(e){ if (e.touches && e.touches.length > 1) return; e.preventDefault(); drawing = true; onStart(norm(e)); }
  function move(e) { if (!drawing) return; e.preventDefault(); onMove(norm(e)); }
  function end(e)  { if (!drawing) return; drawing = false; onEnd(); }
  el.addEventListener('mousedown', start);
  el.addEventListener('mousemove', move);
  el.addEventListener('mouseup', end);
  el.addEventListener('mouseleave', end);
  el.addEventListener('touchstart', start, { passive: false });
  el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
}

function _groupActive(btn, ids) {
  ids.forEach(function(id){
    var el = document.getElementById(id);
    if (!el) return;
    el.style.background = '#fff';
    el.style.color = '#001A4D';
    el.style.borderColor = '#CBD5E1';
  });
  if (btn) { btn.style.background = '#001A4D'; btn.style.color = '#fff'; btn.style.borderColor = '#001A4D'; }
}

// ── Persistence ─────────────────────────────────────────────────────────────
function _scheduleSave() {
  if (_md.saveTimer) clearTimeout(_md.saveTimer);
  _setSaveStatus('Saving…');
  _md.saveTimer = setTimeout(_doSave, 2000);
}

function _setSaveStatus(msg, kind) {
  ['md-roof-save','md-notes-save'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) {
      el.textContent = msg;
      el.style.color = kind === 'ok' ? '#16A34A' : kind === 'err' ? '#DC2626' : '#64748B';
    }
  });
}

async function _doSave() {
  var jobId = (_md.roof && _md.roof.jobId) || (_md.notes && _md.notes.jobId);
  if (!jobId) { _setSaveStatus('Saved locally'); return; }
  var payload = {};

  if (_md.roof) {
    try {
      var composite = _compositeRoof();
      payload.roofDiagramClean = _satelliteDataUrl();
      payload.roofDiagramMarkup = composite;
      payload.roofDiagramStrokes = _md.roof.strokes;
    } catch (e) { /* skip roof on error */ }
  }
  if (_md.notes) {
    payload.fieldNotesWhiteboard = {
      imageUrl: _md.notes.canvas.toDataURL('image/png'),
      strokes: _md.notes.strokes,
      savedAt: new Date().toISOString(),
    };
  }

  try {
    var r = await fetch('/api/field/jobs/' + jobId, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _setSaveStatus('Saved', 'ok');
  } catch (e) {
    _setSaveStatus('Save failed. Retrying', 'err');
    setTimeout(_doSave, 10000);
  }
}

function _compositeRoof() {
  var r = _md.roof; if (!r) return null;
  var c = document.createElement('canvas');
  c.width = r.imgW; c.height = r.imgH;
  var ctx = c.getContext('2d');
  if (r.satImg) ctx.drawImage(r.satImg, 0, 0);
  else { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0,0,c.width,c.height); }
  r.strokes.forEach(function(s){ _drawStroke(ctx, s); });
  return c.toDataURL('image/jpeg', 0.82);
}

function _satelliteDataUrl() {
  var r = _md.roof; if (!r || !r.satImg) return null;
  var c = document.createElement('canvas');
  c.width = r.imgW; c.height = r.imgH;
  c.getContext('2d').drawImage(r.satImg, 0, 0);
  return c.toDataURL('image/jpeg', 0.82);
}

async function _loadExistingDrawings(jobId) {
  try {
    var job = await fetch('/api/field/jobs/' + jobId).then(function(r){ return r.json(); });
    if (job && Array.isArray(job.roofDiagramStrokes) && _md.roof) {
      _md.roof.strokes = job.roofDiagramStrokes;
      _mdRoofRedraw();
    }
    if (job && job.fieldNotesWhiteboard && Array.isArray(job.fieldNotesWhiteboard.strokes) && _md.notes) {
      _md.notes.strokes = job.fieldNotesWhiteboard.strokes;
      _mdNotesRedraw();
    }
  } catch (e) { /* ignore */ }
}

// Expose globally
window.measureMountDrawing = measureMountDrawing;
window.mdSetRoofColor = mdSetRoofColor;
window.mdSetRoofSize = mdSetRoofSize;
window.mdSetRoofTool = mdSetRoofTool;
window.mdRoofUndo = mdRoofUndo;
window.mdRoofClear = mdRoofClear;
window.mdToggleSatellite = mdToggleSatellite;
window.mdNotesSize = mdNotesSize;
window.mdNotesUndo = mdNotesUndo;
window.mdNotesClear = mdNotesClear;
