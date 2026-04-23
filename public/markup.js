/* Roof Diagram & Photo Markup Canvas -- iPad + Apple Pencil compatible */

// --- Roof Diagram Section ---
function renderRoofDiagramLegacy(job) {
  let html = '';
  const hasClean = !!job.roofDiagramClean;
  const hasMarkup = !!job.roofDiagramMarkup;

  // Auto-detect diagram sources if none set
  if (!hasClean && !hasMarkup) {
    // Priority 1: Hover wireframe images
    const hoverImgs = job.measurements?.hoverImages || job.hoverData?.model_images || job.hoverData?.images || null;
    const hoverWireframe = hoverImgs ? (Array.isArray(hoverImgs) ? hoverImgs[0] : hoverImgs) : null;
    // Priority 2: Check for overhead/aerial/drone photos
    const photos = job.photos?.rawPhotos || [];
    const overheadPhoto = photos.find(p => {
      const t = ((p.tags || []).join(' ') + ' ' + (p.caption || '') + ' ' + (p.label || '')).toLowerCase();
      return t.includes('overhead') || t.includes('aerial') || t.includes('drone') || t.includes('satellite') || t.includes('bird');
    });

    if (hoverWireframe) {
      // Auto-display Hover wireframe
      html += `<div style="margin-bottom:8px"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:#00B5CC;color:#fff">Hover Wireframe</span></div>`;
      html += `<div style="margin-bottom:12px"><img src="${hoverWireframe}" alt="Hover wireframe" style="max-width:100%;max-height:300px;border:1px solid var(--mid-gray);border-radius:4px" crossorigin="anonymous"></div>
      <div style="display:flex;gap:8px">
        <button class="btn-primary btn-sm" onclick="useImageAsDiagram('${hoverWireframe.replace(/'/g, "\\'")}')">Use as Diagram</button>
        <button class="btn-secondary btn-sm" onclick="selectDiagramFromPhotos()">Select from Photos</button>
        <button class="btn-secondary btn-sm" onclick="document.getElementById('roof-diagram-input').click()">Upload Instead</button>
        <input type="file" id="roof-diagram-input" accept="image/png,image/jpeg" style="display:none" onchange="uploadRoofDiagram(this.files[0])">
      </div>`;
    } else if (overheadPhoto) {
      // Offer overhead photo as diagram
      html += `<div style="margin-bottom:8px"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:#1B2360;color:#fff">Overhead Photo Available</span></div>`;
      html += `<div style="margin-bottom:12px"><img src="${overheadPhoto.url}" alt="Overhead roof photo" style="max-width:100%;max-height:300px;border:1px solid var(--mid-gray);border-radius:4px"></div>
      <div style="display:flex;gap:8px">
        <button class="btn-primary btn-sm" onclick="useImageAsDiagram('${overheadPhoto.url.replace(/'/g, "\\'")}')">Use as Diagram</button>
        <button class="btn-secondary btn-sm" onclick="selectDiagramFromPhotos()">Select Different Photo</button>
        <button class="btn-secondary btn-sm" onclick="document.getElementById('roof-diagram-input').click()">Upload Instead</button>
        <input type="file" id="roof-diagram-input" accept="image/png,image/jpeg" style="display:none" onchange="uploadRoofDiagram(this.files[0])">
      </div>`;
    } else {
      // No auto-source found
      html += `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        ${photos.length ? '<button class="btn-primary" onclick="selectDiagramFromPhotos()">Select from Photos</button>' : ''}
        <button class="${photos.length ? 'btn-secondary' : 'btn-primary'}" onclick="document.getElementById('roof-diagram-input').click()">Upload Roof Diagram</button>
        <input type="file" id="roof-diagram-input" accept="image/png,image/jpeg" style="display:none" onchange="uploadRoofDiagram(this.files[0])">
        <span style="font-size:12px;color:var(--dark-gray)">PNG or JPG</span>
      </div>`;
    }
  } else if (hasClean && !hasMarkup) {
    html += `<div style="margin-bottom:12px"><img src="${job.roofDiagramClean}" alt="Roof diagram" style="max-width:100%;max-height:300px;border:1px solid var(--mid-gray);border-radius:4px"></div>
    <div style="display:flex;gap:8px">
      <button class="btn-primary btn-sm" onclick="openMarkupCanvas('${job.roofDiagramClean}', currentJobId, 'roof')">Draw on Diagram</button>
      <button class="btn-sm" onclick="clearRoofDiagram()" style="background:none;border:1px solid var(--mid-gray);color:var(--dark-gray);font-size:11px">Clear Diagram</button>
    </div>`;
  } else {
    const displayImg = hasMarkup ? job.roofDiagramMarkup : job.roofDiagramClean;
    html += `<div style="margin-bottom:12px;cursor:pointer" onclick="viewFullSizeDiagram()"><img src="${displayImg}" alt="Roof diagram with markup" style="max-width:100%;max-height:300px;border:1px solid var(--mid-gray);border-radius:4px"></div>
    <div style="display:flex;gap:8px">
      <button class="btn-primary btn-sm" onclick="openMarkupCanvas('${job.roofDiagramClean || job.roofDiagramMarkup}', currentJobId, 'roof')">Edit Markup</button>
      <button class="btn-secondary btn-sm" onclick="clearRoofMarkup()">Clear Markup</button>
      <button class="btn-secondary btn-sm" onclick="viewFullSizeDiagram()">View Full Size</button>
    </div>`;
  }
  return html;
}

async function useImageAsDiagram(url) {
  if (!currentJobId || !url) return;
  // Convert URL to data URL for storage
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async function() {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      await fetch(`/api/jobs/${currentJobId}/fields`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roofDiagramClean: dataUrl })
      });
      addTimelineEntry_client('Roof diagram set from photo');
      loadJobDetail(currentJobId);
    };
    img.onerror = function() {
      // If CORS fails, store the URL directly
      fetch(`/api/jobs/${currentJobId}/fields`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roofDiagramClean: url })
      }).then(() => { addTimelineEntry_client('Roof diagram set from photo'); loadJobDetail(currentJobId); });
    };
    img.src = url;
  } catch (e) { alert('Failed to set diagram: ' + e.message); }
}

function selectDiagramFromPhotos() {
  if (!currentJobId) return;
  fetch(`/api/jobs/${currentJobId}`).then(r => r.json()).then(job => {
    const photos = job.photos?.rawPhotos || [];
    if (!photos.length) { alert('No photos on this job. Upload a diagram instead.'); return; }
    let html = '<h3 style="margin-bottom:12px">Select Photo as Roof Diagram</h3><div class="photo-grid-v2">';
    photos.forEach((p, i) => {
      html += `<div class="photo-card-v2" style="cursor:pointer" onclick="useImageAsDiagram('${p.url.replace(/'/g, "\\'")}');closeModal()">
        <img src="${p.url}" alt="Photo ${i + 1}" loading="lazy">
      </div>`;
    });
    html += '</div><div style="margin-top:16px;text-align:right"><button class="btn-secondary" onclick="closeModal()">Cancel</button></div>';
    showModal(html);
  });
}

async function uploadRoofDiagram(file) {
  if (!file || !currentJobId) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    let dataUrl = e.target.result;
    // If PDF, we just store as-is (server could convert, but for now accept images)
    if (file.type === 'application/pdf') {
      alert('PDF support coming soon. Please upload PNG or JPG.');
      return;
    }
    await fetch(`/api/jobs/${currentJobId}/fields`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roofDiagramClean: dataUrl })
    });
    addTimelineEntry_client('Roof diagram uploaded');
    loadJobDetail(currentJobId);
  };
  reader.readAsDataURL(file);
}

async function clearRoofDiagram() {
  if (!currentJobId || !confirm('Remove roof diagram?')) return;
  await fetch(`/api/jobs/${currentJobId}/fields`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roofDiagramClean: null, roofDiagramMarkup: null, roofDiagramStrokes: null })
  });
  loadJobDetail(currentJobId);
}

async function clearRoofMarkup() {
  if (!currentJobId || !confirm('Clear all markups? Original diagram will be preserved.')) return;
  await fetch(`/api/jobs/${currentJobId}/fields`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roofDiagramMarkup: null, roofDiagramStrokes: null })
  });
  loadJobDetail(currentJobId);
}

function viewFullSizeDiagram() {
  if (!currentJobId) return;
  fetch(`/api/jobs/${currentJobId}`).then(r => r.json()).then(job => {
    const img = job.roofDiagramMarkup || job.roofDiagramClean;
    if (!img) return;
    showModal(`<div style="max-width:95vw;max-height:90vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <h3 style="margin:0">Roof Diagram</h3>
        <button class="btn-secondary btn-sm" onclick="closeModal()">Close</button>
      </div>
      <img src="${img}" alt="Roof diagram full size" style="max-width:100%">
    </div>`);
  });
}

function addTimelineEntry_client(msg) {
  fetch(`/api/jobs/${currentJobId}/activity`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, author: 'System' })
  }).catch(() => {});
}

// --- Drawing Canvas ---
let markupState = { strokes: [], currentStroke: null, color: '#CC0000', width: 4, tool: 'draw', history: [], bgImage: null, canvas: null, ctx: null, overlayCanvas: null, overlayCtx: null, type: 'roof', jobId: null, originalUrl: '' };

function openMarkupCanvas(imageUrl, jobId, type) {
  markupState.jobId = jobId;
  markupState.type = type;
  markupState.originalUrl = imageUrl;
  markupState.strokes = [];
  markupState.history = [];
  markupState.tool = 'draw';
  markupState.color = '#CC0000';
  markupState.width = 4;

  // Load existing strokes if available
  fetch(`/api/jobs/${jobId}`).then(r => r.json()).then(job => {
    if (type === 'roof' && job.roofDiagramStrokes) {
      markupState.strokes = job.roofDiagramStrokes;
    }

    const modal = document.createElement('div');
    modal.id = 'markup-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.9);z-index:10000;display:flex;flex-direction:column;align-items:center';

    modal.innerHTML = `
      <div style="width:100%;background:#222;padding:8px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex-shrink:0">
        <span style="color:#CC0000;font-weight:700;cursor:pointer;padding:4px 10px;border:2px solid #CC0000;border-radius:4px;font-size:12px" onclick="setMarkupColor('#CC0000')" id="mc-red">Red</span>
        <span style="color:#2563EB;font-weight:700;cursor:pointer;padding:4px 10px;border:2px solid #2563EB;border-radius:4px;font-size:12px" onclick="setMarkupColor('#2563EB')" id="mc-blue">Blue</span>
        <span style="color:#16A34A;font-weight:700;cursor:pointer;padding:4px 10px;border:2px solid #16A34A;border-radius:4px;font-size:12px" onclick="setMarkupColor('#16A34A')" id="mc-green">Green</span>
        <span style="color:#000;font-weight:700;cursor:pointer;padding:4px 10px;border:2px solid #fff;border-radius:4px;font-size:12px;background:#fff" onclick="setMarkupColor('#000000')" id="mc-black">Black</span>
        <span style="color:#666;font-size:10px;margin-left:4px">|</span>
        <span style="color:#fff;cursor:pointer;padding:4px 8px;font-size:11px;border:1px solid #555;border-radius:4px" onclick="setMarkupWidth(2)" id="mw-2">Thin</span>
        <span style="color:#fff;cursor:pointer;padding:4px 8px;font-size:11px;border:1px solid #fff;border-radius:4px;background:#444" onclick="setMarkupWidth(4)" id="mw-4">Medium</span>
        <span style="color:#fff;cursor:pointer;padding:4px 8px;font-size:11px;border:1px solid #555;border-radius:4px" onclick="setMarkupWidth(6)" id="mw-6">Thick</span>
        <span style="color:#666;font-size:10px;margin-left:4px">|</span>
        <span style="color:#fff;cursor:pointer;padding:4px 8px;font-size:11px;border:1px solid #fff;border-radius:4px;background:#444" onclick="setMarkupTool('draw')" id="mt-draw">Draw</span>
        <span style="color:#fff;cursor:pointer;padding:4px 8px;font-size:11px;border:1px solid #555;border-radius:4px" onclick="setMarkupTool('text')" id="mt-text">Text</span>
        <span style="color:#fff;cursor:pointer;padding:4px 8px;font-size:11px;border:1px solid #555;border-radius:4px" onclick="setMarkupTool('eraser')" id="mt-eraser">Eraser</span>
        <span style="color:#fff;cursor:pointer;padding:4px 8px;font-size:11px;border:1px solid #555;border-radius:4px" onclick="markupUndo()">Undo</span>
        <span style="color:#fff;cursor:pointer;padding:4px 8px;font-size:11px;border:1px solid #555;border-radius:4px" onclick="markupClearAll()">Clear</span>
        <div style="flex:1"></div>
        <button class="btn-primary btn-sm" onclick="saveMarkupCanvas()" style="background:#00B5CC">Save Markup</button>
        <button class="btn-sm" onclick="closeMarkupCanvas()" style="background:none;border:1px solid #666;color:#fff;font-size:11px">Cancel</button>
      </div>
      <div id="markup-canvas-container" style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;width:100%;padding:16px">
        <div id="markup-canvas-wrapper" style="position:relative;display:inline-block"></div>
      </div>`;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Load background image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      const wrapper = document.getElementById('markup-canvas-wrapper');
      const maxW = window.innerWidth - 32;
      const maxH = window.innerHeight - 80;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w < 800) { const scale = 800 / w; w = 800; h = Math.round(h * scale); }
      if (w > maxW) { const scale = maxW / w; w = maxW; h = Math.round(h * scale); }
      if (h > maxH) { const scale = maxH / h; h = maxH; w = Math.round(w * scale); }

      // Background canvas
      const bgCanvas = document.createElement('canvas');
      bgCanvas.width = w; bgCanvas.height = h;
      bgCanvas.style.cssText = 'position:absolute;top:0;left:0';
      const bgCtx = bgCanvas.getContext('2d');
      bgCtx.drawImage(img, 0, 0, w, h);

      // Overlay canvas
      const overlay = document.createElement('canvas');
      overlay.width = w; overlay.height = h;
      overlay.id = 'markup-overlay';
      overlay.style.cssText = 'position:relative;cursor:crosshair;touch-action:none';

      wrapper.style.width = w + 'px';
      wrapper.style.height = h + 'px';
      wrapper.appendChild(bgCanvas);
      wrapper.appendChild(overlay);

      markupState.bgImage = img;
      markupState.canvas = bgCanvas;
      markupState.ctx = bgCtx;
      markupState.overlayCanvas = overlay;
      markupState.overlayCtx = overlay.getContext('2d');

      // Redraw existing strokes
      redrawStrokes();

      // Mouse events
      overlay.addEventListener('mousedown', onMarkupStart);
      overlay.addEventListener('mousemove', onMarkupMove);
      overlay.addEventListener('mouseup', onMarkupEnd);
      overlay.addEventListener('mouseleave', onMarkupEnd);

      // Touch events (iPad / Apple Pencil)
      overlay.addEventListener('touchstart', onTouchStart, { passive: false });
      overlay.addEventListener('touchmove', onTouchMove, { passive: false });
      overlay.addEventListener('touchend', onTouchEnd);
      overlay.addEventListener('touchcancel', onTouchEnd);
    };
    img.onerror = function() { alert('Failed to load image'); closeMarkupCanvas(); };
    img.src = imageUrl;
  });
}

function getCanvasPos(e) {
  const rect = markupState.overlayCanvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  onMarkupStart({ clientX: touch.clientX, clientY: touch.clientY });
}

function onTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  onMarkupMove({ clientX: touch.clientX, clientY: touch.clientY });
}

function onTouchEnd(e) {
  onMarkupEnd();
}

let isDrawing = false;

function onMarkupStart(e) {
  if (markupState.tool === 'text') {
    const pos = getCanvasPos(e);
    const text = prompt('Enter label text:');
    if (!text) return;
    markupState.strokes.push({ type: 'text', text, x: pos.x, y: pos.y, color: markupState.color, size: markupState.width * 4 });
    markupState.history.push(markupState.strokes.length - 1);
    if (markupState.history.length > 20) markupState.history.shift();
    redrawStrokes();
    return;
  }
  isDrawing = true;
  const pos = getCanvasPos(e);
  markupState.currentStroke = {
    type: markupState.tool === 'eraser' ? 'eraser' : 'draw',
    points: [pos],
    color: markupState.tool === 'eraser' ? 'rgba(0,0,0,1)' : markupState.color,
    width: markupState.tool === 'eraser' ? markupState.width * 3 : markupState.width
  };
}

function onMarkupMove(e) {
  if (!isDrawing || !markupState.currentStroke) return;
  const pos = getCanvasPos(e);
  markupState.currentStroke.points.push(pos);
  // Draw current stroke on overlay
  const ctx = markupState.overlayCtx;
  const pts = markupState.currentStroke.points;
  if (pts.length < 2) return;
  ctx.clearRect(0, 0, markupState.overlayCanvas.width, markupState.overlayCanvas.height);
  // Redraw all saved strokes
  drawAllStrokes(ctx);
  // Draw current stroke
  drawStroke(ctx, markupState.currentStroke);
}

function onMarkupEnd() {
  if (!isDrawing) return;
  isDrawing = false;
  if (markupState.currentStroke?.points?.length > 1) {
    markupState.strokes.push(markupState.currentStroke);
    markupState.history.push(markupState.strokes.length - 1);
    if (markupState.history.length > 20) markupState.history.shift();
  }
  markupState.currentStroke = null;
  redrawStrokes();
}

function drawStroke(ctx, stroke) {
  if (stroke.type === 'text') {
    ctx.font = `bold ${stroke.size || 16}px sans-serif`;
    ctx.fillStyle = stroke.color;
    ctx.fillText(stroke.text, stroke.x, stroke.y);
    return;
  }
  if (stroke.type === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
  } else {
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.beginPath();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pts = stroke.points;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

function drawAllStrokes(ctx) {
  for (const s of markupState.strokes) {
    drawStroke(ctx, s);
  }
}

function redrawStrokes() {
  const ctx = markupState.overlayCtx;
  if (!ctx) return;
  ctx.clearRect(0, 0, markupState.overlayCanvas.width, markupState.overlayCanvas.height);
  drawAllStrokes(ctx);
}

function setMarkupColor(color) {
  markupState.color = color;
  document.querySelectorAll('[id^="mc-"]').forEach(el => el.style.background = 'transparent');
  const map = { '#CC0000': 'mc-red', '#2563EB': 'mc-blue', '#16A34A': 'mc-green', '#000000': 'mc-black' };
  const el = document.getElementById(map[color]);
  if (el) el.style.background = color === '#000000' ? '#fff' : color + '33';
}

function setMarkupWidth(w) {
  markupState.width = w;
  document.querySelectorAll('[id^="mw-"]').forEach(el => { el.style.background = 'transparent'; el.style.borderColor = '#555'; });
  const el = document.getElementById('mw-' + w);
  if (el) { el.style.background = '#444'; el.style.borderColor = '#fff'; }
}

function setMarkupTool(tool) {
  markupState.tool = tool;
  document.querySelectorAll('[id^="mt-"]').forEach(el => { el.style.background = 'transparent'; el.style.borderColor = '#555'; });
  const el = document.getElementById('mt-' + tool);
  if (el) { el.style.background = '#444'; el.style.borderColor = '#fff'; }
  if (markupState.overlayCanvas) {
    markupState.overlayCanvas.style.cursor = tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair';
  }
}

function markupUndo() {
  if (!markupState.strokes.length) return;
  markupState.strokes.pop();
  redrawStrokes();
}

function markupClearAll() {
  if (!confirm('Clear all drawings?')) return;
  markupState.strokes = [];
  markupState.history = [];
  redrawStrokes();
}

async function saveMarkupCanvas() {
  const { overlayCanvas, canvas, strokes, jobId, type, originalUrl } = markupState;
  if (!canvas || !overlayCanvas) return;

  // Composite background + overlay
  const composite = document.createElement('canvas');
  composite.width = canvas.width;
  composite.height = canvas.height;
  const compCtx = composite.getContext('2d');
  compCtx.drawImage(canvas, 0, 0);
  compCtx.drawImage(overlayCanvas, 0, 0);
  const imageData = composite.toDataURL('image/png');

  try {
    await fetch(`/api/jobs/${jobId}/fields`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roofDiagramMarkup: imageData,
        roofDiagramStrokes: strokes,
        ...(type === 'roof' && !originalUrl.startsWith('data:') ? {} : {})
      })
    });
    addTimelineEntry_client('Roof diagram markup saved');
    closeMarkupCanvas();
    loadJobDetail(jobId);
  } catch (e) { alert('Save failed: ' + e.message); }
}

function closeMarkupCanvas() {
  const modal = document.getElementById('markup-modal');
  if (modal) modal.remove();
  document.body.style.overflow = '';
}

// --- Photo Markup ---
function openPhotoMarkup(photoIndex) {
  if (!currentJobId) return;
  fetch(`/api/jobs/${currentJobId}`).then(r => r.json()).then(job => {
    const photos = job.photos?.rawPhotos || [];
    if (!photos[photoIndex]) return;
    const url = photos[photoIndex].url;
    openMarkupCanvas(url, currentJobId, 'photo');
    // Override save to handle photo markup
    const origSave = saveMarkupCanvas;
    window._photoMarkupSave = async function() {
      const { overlayCanvas, canvas, strokes } = markupState;
      if (!canvas || !overlayCanvas) return;
      const composite = document.createElement('canvas');
      composite.width = canvas.width;
      composite.height = canvas.height;
      const compCtx = composite.getContext('2d');
      compCtx.drawImage(canvas, 0, 0);
      compCtx.drawImage(overlayCanvas, 0, 0);
      const imageData = composite.toDataURL('image/png');

      try {
        await fetch(`/api/jobs/${currentJobId}/photos/markup`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ originalIndex: photoIndex, markupData: imageData, strokes })
        });
        addTimelineEntry_client('Photo markup saved');
        closeMarkupCanvas();
        loadJobDetail(currentJobId);
      } catch (e) { alert('Save failed: ' + e.message); }
    };
    // Rebind save button after canvas loads
    setTimeout(() => {
      const saveBtn = document.querySelector('#markup-modal .btn-primary');
      if (saveBtn) saveBtn.setAttribute('onclick', 'window._photoMarkupSave()');
    }, 500);
  });
}
