/* CRC Field Intel -- Live Camera Viewfinder
   getUserMedia-based continuous capture. No native camera app.
   Tap to capture instantly. Camera stays open for rapid shooting.
   Falls back to file input if getUserMedia unavailable. */

let cameraActive = false, cameraTag = 'overview';
let cameraSessionCount = 0, uploadQueue = [], uploadsInFlight = 0, uploadsDone = 0;
let compassHeading = null, compassWatchId = null;

// Live camera state
let liveStream = null, liveVideo = null, liveCanvas = null;
let flashMode = 'off'; // 'off', 'on', 'auto'
let torchSupported = false;
let liveThumbnails = []; // data URLs for bottom strip

function openCameraMode() {
  cameraActive = true;
  cameraSessionCount = 0; uploadsDone = 0; uploadsInFlight = 0; uploadQueue = [];
  liveThumbnails = [];
  cameraTag = activePhotoTab === 'inspection' ? 'overview' : 'during';
  startCompass();

  // Try live camera first, fall back to file input
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    openLiveViewfinder();
  } else {
    console.log('[Camera] getUserMedia not supported, using file input fallback');
    renderCameraHUD();
    triggerCamera();
  }
}

async function openLiveViewfinder() {
  const modal = document.getElementById('photo-capture-modal');
  modal.style.display = 'flex';

  // Build viewfinder DOM
  const labels = activePhotoTab === 'inspection' ? INSPECTION_TAG_LABELS : BUILD_TAG_LABELS;
  const icons = activePhotoTab === 'inspection' ? INSPECTION_TAG_ICONS : BUILD_TAG_ICONS;
  const tags = (activePhotoTab === 'inspection' ? INSPECTION_TAGS : BUILD_TAGS).filter(t => t !== 'all');

  // HAAG report sections as tags for inspection, build tags for build
  const haagTags = ['Overview', 'North Slope', 'South Slope', 'East Slope', 'West Slope', 'Soft Metals', 'Test Squares', 'Components', 'Interior'];
  const haagKeys = ['overview', 'north-slope', 'south-slope', 'east-slope', 'west-slope', 'soft-metal', 'test-squares', 'components', 'interior'];
  const camTags = activePhotoTab === 'inspection' ? haagKeys : tags;
  const camLabels = activePhotoTab === 'inspection' 
    ? Object.fromEntries(haagKeys.map((k, i) => [k, haagTags[i]]))
    : labels;
  if (!camLabels[cameraTag]) cameraTag = camTags[0];

  modal.innerHTML = `
    <div class="cam-viewfinder" id="cam-viewfinder" onclick="captureFrame()">
      <video id="cam-live-video" autoplay playsinline muted></video>
      <div class="cam-flash" id="cam-flash"></div>

      <button class="cam-x" onclick="event.stopPropagation();closeLiveCamera()">&times;</button>
      
      <div class="cam-count" id="cam-count" onclick="event.stopPropagation();closeLiveCamera()">${cameraSessionCount || ''}</div>

      <div class="cam-tag-strip-min" id="cam-tag-strip-top">
        ${camTags.map(t => `<button class="cam-tag-pill-min ${t === cameraTag ? 'active' : ''}" onclick="event.stopPropagation();pickTag('${t}')" data-tag="${t}">${camLabels[t]}</button>`).join('')}
      </div>

      <div class="cam-compass-float" id="cam-compass">
        <div class="compass-ring-sm">
          <div class="compass-n-sm" id="compass-n">N</div>
          <div class="compass-dir-sm" id="compass-direction">--</div>
          <div class="compass-deg-sm" id="compass-degrees">---&deg;</div>
        </div>
      </div>

      <div class="cam-upload-float"><span class="cam-upload-status"></span></div>

      <div class="cam-thumb-strip" id="cam-thumb-strip"></div>
      <canvas id="cam-live-canvas" style="display:none"></canvas>
      <input type="file" id="cam-lib-live" accept="image/*" multiple style="display:none">
    </div>`;

  document.getElementById('cam-lib-live').onchange = function() { handleLibrarySelectLive(this); };

  // Start camera stream
  try {
    liveStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 4032 },
        height: { ideal: 3024 }
      },
      audio: false
    });

    liveVideo = document.getElementById('cam-live-video');
    liveCanvas = document.getElementById('cam-live-canvas');
    liveVideo.srcObject = liveStream;

    // Wait for video to be ready to get native resolution
    liveVideo.onloadedmetadata = () => {
      liveCanvas.width = liveVideo.videoWidth;
      liveCanvas.height = liveVideo.videoHeight;
      console.log(`[Camera] Live feed: ${liveVideo.videoWidth}x${liveVideo.videoHeight}`);
    };

    // Check for torch support and setup zoom
    checkTorchSupport();
    setupPinchZoom();

  } catch (err) {
    console.warn('[Camera] getUserMedia failed:', err.message);
    // Fall back to file input mode
    liveStream = null;
    renderCameraHUD();
    triggerCamera();
  }
}

function checkTorchSupport() {
  if (!liveStream) return;
  const track = liveStream.getVideoTracks()[0];
  if (!track) return;
  try {
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps.torch) {
      torchSupported = true;
      const btn = document.getElementById('cam-flash-toggle');
      if (btn) btn.style.display = 'inline-block';
    }
  } catch (e) {
    console.log('[Camera] Torch check failed:', e);
  }
}

function toggleFlash() {
  if (!torchSupported || !liveStream) return;
  const modes = ['off', 'on', 'auto'];
  const idx = (modes.indexOf(flashMode) + 1) % modes.length;
  flashMode = modes[idx];

  const btn = document.getElementById('cam-flash-toggle');
  const labels = { off: '&#x26A1; Off', on: '&#x26A1; On', auto: '&#x26A1; Auto' };
  if (btn) btn.innerHTML = labels[flashMode];

  // Apply torch constraint for on/off (auto handled at capture time)
  if (flashMode !== 'auto') {
    const track = liveStream.getVideoTracks()[0];
    if (track) {
      track.applyConstraints({ advanced: [{ torch: flashMode === 'on' }] }).catch(() => {});
    }
  }
}

async function captureFrame() {
  if (!cameraActive || !liveVideo || !liveCanvas) return;
  if (liveVideo.readyState < 2) return; // not ready yet

  const ctx = liveCanvas.getContext('2d');

  // Ensure canvas matches native video resolution
  if (liveCanvas.width !== liveVideo.videoWidth || liveCanvas.height !== liveVideo.videoHeight) {
    liveCanvas.width = liveVideo.videoWidth;
    liveCanvas.height = liveVideo.videoHeight;
  }

  // If auto flash, briefly enable torch for capture
  let torchWasOff = false;
  if (flashMode === 'auto' && torchSupported && liveStream) {
    const track = liveStream.getVideoTracks()[0];
    if (track) {
      try {
        await track.applyConstraints({ advanced: [{ torch: true }] });
        torchWasOff = true;
        await new Promise(r => setTimeout(r, 80)); // brief pause for torch to activate
      } catch (e) {}
    }
  }

  // Draw full-resolution frame
  ctx.drawImage(liveVideo, 0, 0, liveCanvas.width, liveCanvas.height);

  // Turn off torch after capture if auto
  if (torchWasOff) {
    const track = liveStream.getVideoTracks()[0];
    if (track) track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
  }

  // White flash feedback
  const flash = document.getElementById('cam-flash');
  if (flash) {
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 50);
  }

  // Convert to JPEG blob
  try {
    liveCanvas.toBlob((blob) => {
      if (!blob) { console.error('[Camera] toBlob returned null'); return; }
      if (blob.size < 1000) { console.error('[Camera] Blob too small:', blob.size); return; }

      cameraSessionCount++;

      // Create thumbnail for strip
      try {
        const thumbUrl = createThumbnailFromCanvas(liveCanvas);
        liveThumbnails.push(thumbUrl);
        updateThumbStrip();
      } catch (e) { console.error('[Camera] Thumbnail failed:', e); }

      // Queue for upload
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      queueUpload(file, cameraTag);

      // Update UI
      updateLiveHUD();

    }, 'image/jpeg', 0.85);
  } catch (e) { console.error('[Camera] Capture failed:', e); }
}

function createThumbnailFromCanvas(srcCanvas) {
  const thumbCanvas = document.createElement('canvas');
  const size = 100;
  thumbCanvas.width = size;
  thumbCanvas.height = size;
  const ctx = thumbCanvas.getContext('2d');
  // Center crop to square
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const cropSize = Math.min(sw, sh);
  const sx = (sw - cropSize) / 2, sy = (sh - cropSize) / 2;
  ctx.drawImage(srcCanvas, sx, sy, cropSize, cropSize, 0, 0, size, size);
  return thumbCanvas.toDataURL('image/jpeg', 0.5);
}

function updateThumbStrip() {
  const strip = document.getElementById('cam-thumb-strip');
  if (!strip) return;
  // Show last 20 thumbnails
  const recent = liveThumbnails.slice(-20);
  strip.innerHTML = recent.map(url => `<img src="${url}" class="cam-thumb-img">`).join('');
  // Scroll to end
  strip.scrollLeft = strip.scrollWidth;
}

function updateLiveHUD() {
  const pending = uploadsInFlight + uploadQueue.length;
  const statusEl = document.querySelector('.cam-upload-status');
  if (statusEl) statusEl.innerHTML = pending > 0 ? `Uploading ${pending}...` : (uploadsDone > 0 ? 'Saved &#10003;' : '');

  const doneBtn = document.querySelector('.cam-done');
  if (doneBtn) doneBtn.textContent = `Done${cameraSessionCount ? ' (' + cameraSessionCount + ')' : ''}`;
}

function closeLiveCamera() {
  // Stop video stream
  if (liveStream) {
    liveStream.getTracks().forEach(track => track.stop());
    liveStream = null;
  }
  liveVideo = null;
  liveCanvas = null;
  torchSupported = false;
  flashMode = 'off';

  cameraActive = false;
  stopCompass();

  const modal = document.getElementById('photo-capture-modal');
  if (cameraSessionCount > 0) {
    const tab = activePhotoTab === 'inspection' ? 'Inspection' : 'Build';
    const pending = uploadsInFlight + uploadQueue.length;
    modal.innerHTML = `<div class="cam-summary"><div style="font-size:48px">&#9989;</div>
      <h3>${cameraSessionCount} photo${cameraSessionCount > 1 ? 's' : ''} saved to ${tab}</h3>
      <p class="cam-summary-sub">${pending > 0 ? pending + ' still uploading...' : 'All uploads complete'}</p></div>`;
    setTimeout(() => { modal.style.display = 'none'; loadPhotos(currentLeadId); }, 1200);
  } else {
    modal.style.display = 'none';
  }
}

function triggerLibraryLive() {
  if (!cameraActive) return;
  const el = document.getElementById('cam-lib-live');
  if (el) { el.value = ''; el.click(); }
}

function handleLibrarySelectLive(input) {
  if (!input.files?.length || !cameraActive) return;
  for (const file of input.files) {
    cameraSessionCount++;
    queueUpload(file, cameraTag);
  }
  updateLiveHUD();
}

// ============================================================
// FALLBACK: File-input based camera (original mode)
// ============================================================

function closeCameraMode() {
  cameraActive = false;
  stopCompass();
  const modal = document.getElementById('photo-capture-modal');
  if (cameraSessionCount > 0) {
    const tab = activePhotoTab === 'inspection' ? 'Inspection' : 'Build';
    const pending = uploadsInFlight + uploadQueue.length;
    modal.innerHTML = `<div class="cam-summary"><div style="font-size:48px">&#9989;</div>
      <h3>${cameraSessionCount} photo${cameraSessionCount > 1 ? 's' : ''} saved to ${tab}</h3>
      <p class="cam-summary-sub">${pending > 0 ? pending + ' still uploading...' : 'All uploads complete'}</p></div>`;
    setTimeout(() => { modal.style.display = 'none'; loadPhotos(currentLeadId); }, 1200);
  } else { modal.style.display = 'none'; }
}

function renderCameraHUD() {
  const modal = document.getElementById('photo-capture-modal');
  modal.style.display = 'flex';
  const tags = (activePhotoTab === 'inspection' ? INSPECTION_TAGS : BUILD_TAGS).filter(t => t !== 'all');
  const labels = activePhotoTab === 'inspection' ? INSPECTION_TAG_LABELS : BUILD_TAG_LABELS;
  const icons = activePhotoTab === 'inspection' ? INSPECTION_TAG_ICONS : BUILD_TAG_ICONS;
  const pending = uploadsInFlight + uploadQueue.length;
  const status = pending > 0 ? `Uploading ${pending}...` : (uploadsDone > 0 ? 'Saved &#10003;' : '');
  const recent = (currentLeadPhotos[activePhotoTab] || []).slice(-6);
  const thumbs = recent.map(p => `<img src="${p.thumbnail || p.url}" class="cam-recent-thumb">`).join('');

  modal.innerHTML = `<div class="cam-hud">
    <div class="cam-topbar">
      <button class="cam-close" onclick="closeCameraMode()">&times;</button>
      <div class="cam-tag-current" style="display:none">${labels[cameraTag]}</div>
      <div class="cam-status-area">
        <span class="cam-upload-status">${status}</span>
        <button class="cam-done" onclick="closeCameraMode()">Done${cameraSessionCount ? ' (' + cameraSessionCount + ')' : ''}</button>
      </div>
    </div>
    <div class="cam-tag-strip">
      ${tags.map(t => `<button class="cam-tag-pill ${t === cameraTag ? 'active' : ''}" onclick="event.stopPropagation();pickTag('${t}')" data-tag="${t}">${labels[t]}</button>`).join('')}
    </div>
    <div class="cam-body" onclick="triggerCamera()">
      <div class="cam-compass" id="cam-compass">
        <div class="compass-ring">
          <div class="compass-n" id="compass-n">N</div>
          <div class="compass-direction" id="compass-direction">--</div>
          <div class="compass-degrees" id="compass-degrees">---°</div>
        </div>
      </div>
      <div class="cam-tap-hint">${cameraSessionCount === 0 ? 'Tap anywhere or use the shutter button' : cameraSessionCount + ' photo' + (cameraSessionCount > 1 ? 's' : '') + ' taken'}</div>
      ${thumbs ? '<div class="cam-recent">' + thumbs + '</div>' : ''}
    </div>
    <div class="cam-bottombar">
      <div style="width:70px"></div>
      <button class="cam-shutter" onclick="event.stopPropagation();triggerCamera()"></button>
      <button class="cam-library-btn" onclick="event.stopPropagation();triggerLibrary()">&#128444;&#65039;</button>
    </div>
    <input type="file" id="cam-file" accept="image/*" capture="environment" style="display:none">
    <input type="file" id="cam-lib" accept="image/*" multiple style="display:none">
  </div>`;
  document.getElementById('cam-file').onchange = function() { handleCameraCapture(this); };
  document.getElementById('cam-lib').onchange = function() { handleLibrarySelect(this); };
}

function triggerCamera() { if (!cameraActive) return; const el = document.getElementById('cam-file'); if (el) { el.value = ''; el.click(); } }
function triggerLibrary() { if (!cameraActive) return; const el = document.getElementById('cam-lib'); if (el) { el.value = ''; el.click(); } }

function handleCameraCapture(input) {
  if (!input.files?.length || !cameraActive) return;
  cameraSessionCount++;
  queueUpload(input.files[0], cameraTag);
  renderCameraHUD();
  setTimeout(() => { if (cameraActive) triggerCamera(); }, 300);
}

function handleLibrarySelect(input) {
  if (!input.files?.length || !cameraActive) return;
  for (const file of input.files) { cameraSessionCount++; queueUpload(file, cameraTag); }
  renderCameraHUD();
}

// ============================================================
// Background upload queue -- 3 concurrent uploads, retry on fail
// ============================================================
function queueUpload(file, tag) { 
  uploadQueue.push({ file, tag, retries: 0, leadId: currentLeadId }); 
  processQueue(); 
}

async function processQueue() {
  if (uploadsInFlight >= 3 || !uploadQueue.length) return;
  const item = uploadQueue.shift();
  uploadsInFlight++;
  updateUploadStatus();
  const fd = new FormData();
  fd.append('photos', item.file); fd.append('repCode', repCode);
  fd.append('tag', item.tag); fd.append('category', activePhotoTab); fd.append('caption', '');
  try {
    const resp = await fetch(`/api/leads/${item.leadId}/photos`, { method: 'POST', body: fd });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.success) { currentLeadPhotos = data.photos; uploadsDone++; }
    else throw new Error('Upload response not success');
  } catch (e) { 
    console.error('[Camera] Upload failed (attempt ' + (item.retries + 1) + '):', e.message); 
    item.retries++;
    if (item.retries < 3) {
      // Retry with delay
      setTimeout(() => { uploadQueue.push(item); processQueue(); }, 1000 * item.retries);
    } else {
      console.error('[Camera] Upload permanently failed after 3 attempts:', item.file.name);
      // Store locally as fallback
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const localPhoto = {
            id: 'failed-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
            url: reader.result, thumbnail: reader.result,
            tag: item.tag, category: activePhotoTab,
            caption: '', repCode, jobId: item.leadId,
            source: 'local-fallback', uploadedBy: repCode,
            uploadedAt: new Date().toISOString(), uploadFailed: true
          };
          if (!currentLeadPhotos[activePhotoTab]) currentLeadPhotos[activePhotoTab] = [];
          currentLeadPhotos[activePhotoTab].push(localPhoto);
        };
        reader.readAsDataURL(item.file);
      } catch (fe) { console.error('[Camera] Local fallback also failed:', fe); }
    }
  }
  uploadsInFlight--;
  updateUploadStatus();
  processQueue();
}

function updateUploadStatus() {
  const pending = uploadsInFlight + uploadQueue.length;
  const el = document.querySelector('.cam-upload-status');
  if (el) el.innerHTML = pending > 0 ? `Uploading ${pending}...` : (uploadsDone > 0 ? 'Saved &#10003;' : '');
  const doneBtn = document.querySelector('.cam-done');
  if (doneBtn) doneBtn.textContent = `Done (${cameraSessionCount})`;

  // Update thumb strip for live mode
  if (liveStream) {
    updateLiveHUD();
    return;
  }

  // Fallback mode: update recent thumbs
  const recentEl = document.querySelector('.cam-recent');
  if (recentEl) {
    const recent = (currentLeadPhotos[activePhotoTab] || []).slice(-6);
    recentEl.innerHTML = recent.map(p => `<img src="${p.thumbnail || p.url}" class="cam-recent-thumb">`).join('');
  }
}

// ============================================================
// Tag picker (shared between live and fallback modes)
// ============================================================
function showTagPicker() { const s = document.getElementById('cam-tag-sheet'); if (s) s.classList.add('open'); }
function hideTagPicker() { const s = document.getElementById('cam-tag-sheet'); if (s) s.classList.remove('open'); }
function pickTag(tag) {
  cameraTag = tag;
  // Update pill buttons
  document.querySelectorAll('.cam-tag-pill-min').forEach(b => b.classList.toggle('active', b.dataset.tag === tag));
  // Fallback for old UI
  const el = document.querySelector('.cam-tag-current'); if (el) el.textContent = tag;
  document.querySelectorAll('.cam-tag-option').forEach(b => b.classList.toggle('active', b.textContent.trim().toLowerCase().includes(tag.replace('-', ' '))));
}

// --- Pinch to Zoom ---
function setupPinchZoom() {
  const video = document.getElementById('cam-live-video');
  if (!video || !liveStream) return;
  const track = liveStream.getVideoTracks()[0];
  if (!track) return;
  
  let currentZoom = 1;
  let startDist = 0;
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  const maxZoom = caps.zoom ? caps.zoom.max : 5;
  const minZoom = caps.zoom ? caps.zoom.min : 1;
  
  if (!caps.zoom) return; // Zoom not supported on this device

  video.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      startDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
    }
  }, { passive: false });

  video.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && startDist > 0) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      const scale = dist / startDist;
      currentZoom = Math.min(maxZoom, Math.max(minZoom, currentZoom * scale));
      startDist = dist;
      try { track.applyConstraints({ advanced: [{ zoom: currentZoom }] }); } catch (e) {}
    }
  }, { passive: false });

  video.addEventListener('touchend', () => { startDist = 0; });
}

// ============================================================
// Compass
// ============================================================
function getCardinalDirection(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function startCompass() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(response => {
      if (response === 'granted') {
        window.addEventListener('deviceorientation', handleCompass, true);
      }
    }).catch(e => console.log('Compass permission denied'));
  } else if ('DeviceOrientationEvent' in window) {
    window.addEventListener('deviceorientation', handleCompass, true);
  }
}

function stopCompass() {
  window.removeEventListener('deviceorientation', handleCompass, true);
  compassHeading = null;
}

function handleCompass(e) {
  let heading = null;
  if (e.webkitCompassHeading !== undefined) {
    heading = e.webkitCompassHeading;
  } else if (e.alpha !== null) {
    heading = (360 - e.alpha);
  }
  if (heading === null) return;

  compassHeading = Math.round(heading) % 360;

  const dirEl = document.getElementById('compass-direction');
  const degEl = document.getElementById('compass-degrees');
  const nEl = document.getElementById('compass-n');
  const ringEl = document.querySelector('.compass-ring');

  if (dirEl) dirEl.textContent = getCardinalDirection(compassHeading);
  if (degEl) degEl.textContent = compassHeading + '°';
  if (ringEl) ringEl.style.transform = `rotate(${-compassHeading}deg)`;
  if (nEl) nEl.style.transform = `rotate(${compassHeading}deg)`;
}
