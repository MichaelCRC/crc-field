/* CRC Field Intel -- Continuous Camera Mode
   Zero-friction photo capture. Camera reopens automatically.
   Photos upload in background. No tagging screens. */

let cameraActive = false, cameraTag = 'overview';
let cameraSessionCount = 0, uploadQueue = [], uploadsInFlight = 0, uploadsDone = 0;

function openCameraMode() {
  cameraActive = true;
  cameraSessionCount = 0; uploadsDone = 0; uploadsInFlight = 0; uploadQueue = [];
  cameraTag = activePhotoTab === 'inspection' ? 'overview' : 'during';
  renderCameraHUD();
  triggerCamera();
}

function closeCameraMode() {
  cameraActive = false;
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
      <div class="cam-tag-current">${labels[cameraTag]}</div>
      <div class="cam-status-area">
        <span class="cam-upload-status">${status}</span>
        <button class="cam-done" onclick="closeCameraMode()">Done${cameraSessionCount ? ' (' + cameraSessionCount + ')' : ''}</button>
      </div>
    </div>
    <div class="cam-body" onclick="triggerCamera()">
      <div class="cam-tap-hint">${cameraSessionCount === 0 ? 'Tap anywhere or use the shutter button' : cameraSessionCount + ' photo' + (cameraSessionCount > 1 ? 's' : '') + ' taken'}</div>
      ${thumbs ? '<div class="cam-recent">' + thumbs + '</div>' : ''}
    </div>
    <div class="cam-bottombar">
      <button class="cam-tag-btn" onclick="event.stopPropagation();showTagPicker()">&#128247; ${labels[cameraTag]}</button>
      <button class="cam-shutter" onclick="event.stopPropagation();triggerCamera()"></button>
      <button class="cam-library-btn" onclick="event.stopPropagation();triggerLibrary()">&#128444;&#65039;</button>
    </div>
    <input type="file" id="cam-file" accept="image/*" capture="environment" style="display:none">
    <input type="file" id="cam-lib" accept="image/*" multiple style="display:none">
  </div>
  <div id="cam-tag-sheet" class="cam-tag-sheet" onclick="hideTagPicker()">
    <div class="cam-tag-sheet-inner" onclick="event.stopPropagation()">
      ${tags.map(t => `<button class="cam-tag-option ${t === cameraTag ? 'active' : ''}" onclick="pickTag('${t}')">${icons[t] || ''} ${labels[t]}</button>`).join('')}
    </div>
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

// Background upload queue -- 2 concurrent uploads max
function queueUpload(file, tag) { uploadQueue.push({ file, tag }); processQueue(); }

async function processQueue() {
  if (uploadsInFlight >= 2 || !uploadQueue.length) return;
  const item = uploadQueue.shift();
  uploadsInFlight++;
  updateUploadStatus();
  const fd = new FormData();
  fd.append('photos', item.file); fd.append('repCode', repCode);
  fd.append('tag', item.tag); fd.append('category', activePhotoTab); fd.append('caption', '');
  try {
    const data = await fetch(`/api/leads/${currentLeadId}/photos`, { method: 'POST', body: fd }).then(r => r.json());
    if (data.success) { currentLeadPhotos = data.photos; uploadsDone++; }
  } catch (e) { console.error('[Camera] Upload failed:', e.message); uploadQueue.push(item); }
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
  const recentEl = document.querySelector('.cam-recent');
  if (recentEl) {
    const recent = (currentLeadPhotos[activePhotoTab] || []).slice(-6);
    recentEl.innerHTML = recent.map(p => `<img src="${p.thumbnail || p.url}" class="cam-recent-thumb">`).join('');
  }
}

// Tag picker
function showTagPicker() { const s = document.getElementById('cam-tag-sheet'); if (s) s.classList.add('open'); }
function hideTagPicker() { const s = document.getElementById('cam-tag-sheet'); if (s) s.classList.remove('open'); }
function pickTag(tag) {
  cameraTag = tag; hideTagPicker();
  const labels = activePhotoTab === 'inspection' ? INSPECTION_TAG_LABELS : BUILD_TAG_LABELS;
  const el = document.querySelector('.cam-tag-current'); if (el) el.textContent = labels[tag] || tag;
  const btn = document.querySelector('.cam-tag-btn'); if (btn) btn.innerHTML = `&#128247; ${labels[tag] || tag}`;
  document.querySelectorAll('.cam-tag-option').forEach(b => b.classList.toggle('active', b.textContent.trim().toLowerCase().includes(tag.replace('-', ' '))));
}
