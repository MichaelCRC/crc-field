/* CRC Field Intel -- Photo System (Two-Tab: Inspection + Build) */

let activePhotoTab = 'inspection';
let activePhotoFilter = 'all';
let currentLeadPhotos = { inspection: [], build: [] };
let currentLeadId = null;

const INSPECTION_TAGS = ['all', 'overview', 'roof', 'damage', 'soft-metal', 'interior', 'other'];
const BUILD_TAGS = ['all', 'before', 'during', 'after', 'materials', 'detail', 'completion'];
const INSPECTION_TAG_LABELS = { all: 'All', overview: 'Overview', roof: 'Roof', damage: 'Damage', 'soft-metal': 'Soft Metal', interior: 'Interior', other: 'Other' };
const BUILD_TAG_LABELS = { all: 'All', before: 'Before', during: 'During', after: 'After', materials: 'Materials', detail: 'Detail', completion: 'Completion' };

async function loadPhotos(leadId) {
  currentLeadId = leadId;
  try {
    const data = await fetch(`/api/leads/${leadId}/photos`).then(r => r.json());
    currentLeadPhotos = data.photos || { inspection: [], build: [] };
  } catch {
    currentLeadPhotos = { inspection: [], build: [] };
  }
  renderPhotoSection();
}

function renderPhotoSection() {
  const el = document.getElementById('photo-section');
  if (!el) return;
  const iCount = currentLeadPhotos.inspection.length;
  const bCount = currentLeadPhotos.build.length;
  const tags = activePhotoTab === 'inspection' ? INSPECTION_TAGS : BUILD_TAGS;
  const labels = activePhotoTab === 'inspection' ? INSPECTION_TAG_LABELS : BUILD_TAG_LABELS;

  el.innerHTML = `
    <div class="photo-tabs">
      <button class="photo-tab ${activePhotoTab === 'inspection' ? 'active' : ''}" onclick="switchPhotoTab('inspection')">
        &#128247; Inspection <span class="photo-count">${iCount}</span>
      </button>
      <button class="photo-tab ${activePhotoTab === 'build' ? 'active' : ''}" onclick="switchPhotoTab('build')">
        &#128296; Build <span class="photo-count">${bCount}</span>
      </button>
    </div>
    <div class="photo-filter-row">
      ${tags.map(t => `<button class="photo-filter ${activePhotoFilter === t ? 'active' : ''}" onclick="filterPhotos('${t}')">${labels[t]}</button>`).join('')}
    </div>
    <div id="photo-grid" class="photo-grid"></div>
    ${activePhotoTab === 'inspection' && iCount > 0 ? '<button class="btn-report" onclick="startReport(\'inspection\')">&#128196; Generate Inspection Report</button>' : ''}
    ${activePhotoTab === 'build' && bCount > 0 ? '<button class="btn-report" onclick="startReport(\'build\')">&#128196; Generate Build Report</button>' : ''}
    <button class="btn-camera" onclick="showPhotoCapture()">&#128247;</button>
    <div class="sync-indicator" onclick="syncToHomeownerPortal()">Homeowner portal: Not synced</div>
  `;
  renderPhotoGrid();
}

function switchPhotoTab(tab) { activePhotoTab = tab; activePhotoFilter = 'all'; renderPhotoSection(); }

function filterPhotos(tag) {
  activePhotoFilter = tag;
  renderPhotoGrid();
  document.querySelectorAll('.photo-filter').forEach(b => {
    b.classList.toggle('active', b.textContent.trim().toLowerCase().replace(' ', '-') === tag || (tag === 'all' && b.textContent.trim() === 'All'));
  });
}

function renderPhotoGrid() {
  const grid = document.getElementById('photo-grid');
  if (!grid) return;
  let photos = currentLeadPhotos[activePhotoTab] || [];
  if (activePhotoFilter !== 'all') photos = photos.filter(p => p.tag === activePhotoFilter);

  if (!photos.length) {
    grid.innerHTML = '<div class="photo-empty">No photos yet. Tap the camera button to add photos.</div>';
    return;
  }
  grid.innerHTML = photos.map((p, i) => {
    const sourceBadge = p.source === 'hover' ? '<span class="source-badge hover">Hover</span>' :
                        p.source === 'companycam' ? '<span class="source-badge cc">CC</span>' : '';
    return `<div class="photo-thumb" onclick="openPhotoViewer(${i}, '${activePhotoTab}', '${activePhotoFilter}')">
      <img src="${p.thumbnail || p.url}" alt="${p.tag}">
      <span class="tag-badge">${(p.tag || 'overview').replace('-', ' ')}</span>
      ${sourceBadge}
      ${p.uploadedBy ? `<span class="rep-badge-small">${p.uploadedBy}</span>` : ''}
    </div>`;
  }).join('');
}

// Photo capture flow
let continuousPhotos = []; // Batch of photos in continuous mode

function showPhotoCapture() {
  continuousPhotos = [];
  const modal = document.getElementById('photo-capture-modal');
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="capture-card">
      <h3>Add Photos</h3>
      <p style="font-size:13px;color:var(--gray);margin-bottom:16px">Adding to: <strong>${activePhotoTab === 'inspection' ? 'Inspection' : 'Build'}</strong></p>
      <button class="capture-option" onclick="startContinuousCapture()" style="background:var(--teal);color:#fff;font-weight:700">&#128247; Continuous Capture</button>
      <p style="font-size:11px;color:var(--gray);margin:-8px 0 12px;text-align:center">Take multiple photos — camera reopens after each shot</p>
      <button class="capture-option" onclick="capturePhoto('camera')">&#128247; Single Photo</button>
      <button class="capture-option" onclick="capturePhoto('library')">&#128444;&#65039; Choose from Library</button>
      <button class="capture-cancel" onclick="closeCaptureModal()">Cancel</button>
      <input type="file" id="photo-camera-input" accept="image/*" capture="environment" style="display:none" onchange="handlePhotoSelected(this)">
      <input type="file" id="photo-continuous-input" accept="image/*" capture="environment" style="display:none" onchange="handleContinuousPhoto(this)">
      <input type="file" id="photo-multi-input" accept="image/*" multiple style="display:none" onchange="handleMultiPhotos(this)">
    </div>`;
}

function startContinuousCapture() {
  continuousPhotos = [];
  document.getElementById('photo-continuous-input').click();
}

function handleContinuousPhoto(input) {
  if (!input.files?.length) {
    // User cancelled camera — show what we've captured so far
    if (continuousPhotos.length > 0) {
      showTaggingScreen(continuousPhotos);
    }
    return;
  }
  
  // Add photo to batch
  continuousPhotos.push(input.files[0]);
  
  // Show running count overlay
  const modal = document.getElementById('photo-capture-modal');
  modal.innerHTML = `
    <div class="capture-card" style="text-align:center">
      <div style="font-size:48px;margin-bottom:12px">&#128247;</div>
      <h3 style="color:var(--teal)">${continuousPhotos.length} photo${continuousPhotos.length > 1 ? 's' : ''} captured</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:16px 0;max-height:120px;overflow-y:auto">
        ${continuousPhotos.map((f, i) => {
          const url = URL.createObjectURL(f);
          return `<img src="${url}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:2px solid var(--teal)">`;
        }).join('')}
      </div>
      <button class="capture-option" onclick="continuousNext()" style="background:var(--teal);color:#fff;font-weight:700">&#128247; Take Another</button>
      <button class="capture-option" onclick="finishContinuous()" style="background:var(--navy);color:#fff;font-weight:700">&#10003; Done — Tag & Upload (${continuousPhotos.length})</button>
      <button class="capture-cancel" onclick="closeCaptureModal()">Cancel All</button>
      <input type="file" id="photo-continuous-input" accept="image/*" capture="environment" style="display:none" onchange="handleContinuousPhoto(this)">
    </div>`;
}

function continuousNext() {
  document.getElementById('photo-continuous-input').click();
}

function finishContinuous() {
  if (continuousPhotos.length > 0) {
    showTaggingScreen(continuousPhotos);
  }
}

function capturePhoto(mode) {
  if (mode === 'camera') document.getElementById('photo-camera-input').click();
  else document.getElementById('photo-multi-input').click();
}

function closeCaptureModal() { 
  continuousPhotos = [];
  document.getElementById('photo-capture-modal').style.display = 'none'; 
}
function handlePhotoSelected(input) { if (input.files?.length) showTaggingScreen([input.files[0]]); }
function handleMultiPhotos(input) { if (input.files?.length) showTaggingScreen(Array.from(input.files)); }

function showTaggingScreen(files) {
  const modal = document.getElementById('photo-capture-modal');
  const tags = activePhotoTab === 'inspection' ? INSPECTION_TAGS.filter(t => t !== 'all') : BUILD_TAGS.filter(t => t !== 'all');
  const labels = activePhotoTab === 'inspection' ? INSPECTION_TAG_LABELS : BUILD_TAG_LABELS;
  const defaultTag = activePhotoTab === 'inspection' ? 'overview' : 'during';

  const reader = new FileReader();
  reader.onload = (e) => {
    modal.innerHTML = `
      <div class="tagging-card">
        <div class="tagging-preview">
          <img src="${e.target.result}" alt="Preview">
          ${files.length > 1 ? `<div class="multi-badge">${files.length} photos selected</div>` : ''}
        </div>
        <div class="tagging-body">
          <div style="font-size:12px;font-weight:600;color:var(--gray);text-transform:uppercase;margin-bottom:8px">Tag</div>
          <div class="tag-selector" id="tag-selector">
            ${tags.map(t => `<button class="tag-chip ${t === defaultTag ? 'active' : ''}" data-tag="${t}" onclick="selectPhotoTag(this)">${labels[t]}</button>`).join('')}
          </div>
          <input type="text" id="photo-caption" placeholder="Add a note about this photo (optional)" class="caption-input">
          <button class="btn-upload" onclick="uploadTaggedPhotos()">Upload Photo${files.length > 1 ? 's' : ''}</button>
          <div id="upload-progress" class="upload-progress" style="display:none">
            <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
            <div class="progress-text" id="progress-text">Uploading...</div>
          </div>
        </div>
      </div>`;
    window._pendingPhotoFiles = files;
  };
  reader.readAsDataURL(files[0]);
}

function selectPhotoTag(btn) {
  document.querySelectorAll('#tag-selector .tag-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function uploadTaggedPhotos() {
  const files = window._pendingPhotoFiles;
  if (!files?.length || !currentLeadId) return;
  const tag = document.querySelector('#tag-selector .tag-chip.active')?.dataset.tag || 'overview';
  const caption = document.getElementById('photo-caption')?.value || '';

  document.getElementById('upload-progress').style.display = 'block';
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');

  const fd = new FormData();
  for (const f of files) fd.append('photos', f);
  fd.append('repCode', repCode);
  fd.append('tag', tag);
  fd.append('category', activePhotoTab);
  fd.append('caption', caption);

  try {
    text.textContent = `Uploading ${files.length} photo${files.length > 1 ? 's' : ''}...`;
    fill.style.width = '30%';
    const data = await fetch(`/api/leads/${currentLeadId}/photos`, { method: 'POST', body: fd }).then(r => r.json());
    fill.style.width = '100%';
    if (data.success) {
      text.textContent = `${data.uploaded} photo${data.uploaded > 1 ? 's' : ''} uploaded!`;
      currentLeadPhotos = data.photos;
      setTimeout(() => { closeCaptureModal(); renderPhotoSection(); }, 600);
    } else { text.textContent = 'Upload failed. Try again.'; }
  } catch (e) { text.textContent = 'Upload error: ' + e.message; }
  window._pendingPhotoFiles = null;
}
