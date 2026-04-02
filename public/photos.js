/* CRC Field Intel -- Photo System (Two-Tab: Inspection + Build) */

let activePhotoTab = 'inspection';
let activePhotoFilter = 'all';
let currentLeadPhotos = { inspection: [], build: [] };
let currentLeadId = null;
let selectedPhotosForReport = new Set();
let photoViewerIndex = 0;
let photoViewerList = [];

const INSPECTION_TAGS = ['all', 'overview', 'roof', 'damage', 'soft-metal', 'interior', 'other'];
const BUILD_TAGS = ['all', 'before', 'during', 'after', 'materials', 'detail', 'completion'];
const INSPECTION_TAG_LABELS = { all: 'All', overview: 'Overview', roof: 'Roof', damage: 'Damage', 'soft-metal': 'Soft Metal', interior: 'Interior', other: 'Other' };
const BUILD_TAG_LABELS = { all: 'All', before: 'Before', during: 'During', after: 'After', materials: 'Materials', detail: 'Detail', completion: 'Completion' };

// Load photos for a lead and render the photo section
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
    ${getSyncIndicator()}
  `;

  renderPhotoGrid();
}

function getSyncIndicator() {
  // Read from lead data if available
  const el = document.getElementById('lead-detail');
  if (!el) return '';
  const total = currentLeadPhotos.inspection.length + currentLeadPhotos.build.length;
  return `<div class="sync-indicator" onclick="syncToHomeownerPortal()">Homeowner portal: Not synced</div>`;
}

function switchPhotoTab(tab) {
  activePhotoTab = tab;
  activePhotoFilter = 'all';
  renderPhotoSection();
}

function filterPhotos(tag) {
  activePhotoFilter = tag;
  renderPhotoGrid();
  // Update active filter button
  document.querySelectorAll('.photo-filter').forEach(b => {
    b.classList.toggle('active', b.textContent.trim().toLowerCase().replace(' ', '-') === tag || (tag === 'all' && b.textContent.trim() === 'All'));
  });
}

function renderPhotoGrid() {
  const grid = document.getElementById('photo-grid');
  if (!grid) return;

  let photos = currentLeadPhotos[activePhotoTab] || [];
  if (activePhotoFilter !== 'all') {
    photos = photos.filter(p => p.tag === activePhotoFilter);
  }

  if (!photos.length) {
    grid.innerHTML = '<div class="photo-empty">No photos yet. Tap the camera button to add photos.</div>';
    return;
  }

  grid.innerHTML = photos.map((p, i) => {
    const sourceBadge = p.source === 'hover' ? '<span class="source-badge hover">Hover</span>' :
                        p.source === 'companycam' ? '<span class="source-badge cc">CC</span>' :
                        '';
    const tagBadge = `<span class="tag-badge">${(p.tag || 'overview').replace('-', ' ')}</span>`;
    const repBadge = p.uploadedBy ? `<span class="rep-badge-small">${p.uploadedBy}</span>` : '';

    return `<div class="photo-thumb" onclick="openPhotoViewer(${i}, '${activePhotoTab}', '${activePhotoFilter}')">
      <img src="${p.thumbnail || p.url}" alt="${p.tag}">
      ${tagBadge}
      ${sourceBadge}
      ${repBadge}
    </div>`;
  }).join('');
}

// Photo capture flow
function showPhotoCapture() {
  const modal = document.getElementById('photo-capture-modal');
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="capture-card">
      <h3>Add Photo</h3>
      <p style="font-size:13px;color:var(--gray);margin-bottom:16px">
        Adding to: <strong>${activePhotoTab === 'inspection' ? 'Inspection' : 'Build'}</strong>
      </p>
      <button class="capture-option" onclick="capturePhoto('camera')">
        &#128247; Take Photo
      </button>
      <button class="capture-option" onclick="capturePhoto('library')">
        &#128444;&#65039; Choose from Library
      </button>
      <button class="capture-cancel" onclick="closeCaptureModal()">Cancel</button>
      <input type="file" id="photo-file-input" accept="image/*" style="display:none" onchange="handlePhotoSelected(this)">
      <input type="file" id="photo-camera-input" accept="image/*" capture="environment" style="display:none" onchange="handlePhotoSelected(this)">
      <input type="file" id="photo-multi-input" accept="image/*" multiple style="display:none" onchange="handleMultiPhotos(this)">
    </div>
  `;
}

function capturePhoto(mode) {
  if (mode === 'camera') {
    document.getElementById('photo-camera-input').click();
  } else {
    document.getElementById('photo-multi-input').click();
  }
}

function closeCaptureModal() {
  document.getElementById('photo-capture-modal').style.display = 'none';
}

function handlePhotoSelected(input) {
  if (!input.files?.length) return;
  showTaggingScreen([input.files[0]]);
}

function handleMultiPhotos(input) {
  if (!input.files?.length) return;
  showTaggingScreen(Array.from(input.files));
}

function showTaggingScreen(files) {
  const modal = document.getElementById('photo-capture-modal');
  const tags = activePhotoTab === 'inspection' ? INSPECTION_TAGS.filter(t => t !== 'all') : BUILD_TAGS.filter(t => t !== 'all');
  const labels = activePhotoTab === 'inspection' ? INSPECTION_TAG_LABELS : BUILD_TAG_LABELS;
  const defaultTag = activePhotoTab === 'inspection' ? 'overview' : 'during';

  // Preview first image
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
      </div>
    `;
    // Store files for upload
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

  // Show progress
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

    const resp = await fetch(`/api/leads/${currentLeadId}/photos`, { method: 'POST', body: fd });
    fill.style.width = '90%';

    const data = await resp.json();
    if (data.success) {
      fill.style.width = '100%';
      text.textContent = `${data.uploaded} photo${data.uploaded > 1 ? 's' : ''} uploaded!`;
      currentLeadPhotos = data.photos;
      setTimeout(() => {
        closeCaptureModal();
        renderPhotoSection();
      }, 600);
    } else {
      text.textContent = 'Upload failed. Try again.';
    }
  } catch (e) {
    text.textContent = 'Upload error: ' + e.message;
  }

  window._pendingPhotoFiles = null;
}

// Full screen photo viewer with swipe
function openPhotoViewer(index, tab, filter) {
  let photos = currentLeadPhotos[tab] || [];
  if (filter && filter !== 'all') photos = photos.filter(p => p.tag === filter);
  photoViewerList = photos;
  photoViewerIndex = index;
  renderPhotoViewer();
}

function renderPhotoViewer() {
  const p = photoViewerList[photoViewerIndex];
  if (!p) return;

  const modal = document.getElementById('photo-modal');
  modal.style.display = 'flex';
  modal.innerHTML = `
    <img src="${p.url}" style="max-width:95%;max-height:85vh;object-fit:contain">
    <div class="viewer-info">
      <span class="tag-badge">${(p.tag || '').replace('-', ' ')}</span>
      ${p.source !== 'manual' ? `<span class="source-badge ${p.source}">${p.source}</span>` : ''}
      ${p.caption ? `<div style="margin-top:4px;font-size:12px">${p.caption}</div>` : ''}
      <div style="font-size:11px;opacity:0.6;margin-top:4px">${photoViewerIndex + 1} / ${photoViewerList.length}</div>
    </div>
    <button onclick="document.getElementById('photo-modal').style.display='none'" style="position:absolute;top:16px;right:16px;background:none;border:none;color:white;font-size:32px;cursor:pointer">&times;</button>
    ${photoViewerIndex > 0 ? '<button class="viewer-nav left" onclick="viewerPrev()">&#8249;</button>' : ''}
    ${photoViewerIndex < photoViewerList.length - 1 ? '<button class="viewer-nav right" onclick="viewerNext()">&#8250;</button>' : ''}
  `;

  // Swipe support
  let touchStartX = 0;
  modal.ontouchstart = (e) => { touchStartX = e.touches[0].clientX; };
  modal.ontouchend = (e) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) viewerNext();
      else viewerPrev();
    }
  };
}

function viewerPrev() {
  if (photoViewerIndex > 0) { photoViewerIndex--; renderPhotoViewer(); }
}
function viewerNext() {
  if (photoViewerIndex < photoViewerList.length - 1) { photoViewerIndex++; renderPhotoViewer(); }
}

// Report generation
function startReport(type) {
  selectedPhotosForReport = new Set();
  const photos = currentLeadPhotos[type] || [];
  if (!photos.length) return alert('No photos to include in report');

  const modal = document.getElementById('photo-capture-modal');
  modal.style.display = 'flex';

  const title = type === 'inspection' ? 'Inspection Report' : 'Build Completion Report';
  modal.innerHTML = `
    <div class="report-card">
      <h3>${title}</h3>
      <p style="font-size:13px;color:var(--gray);margin-bottom:12px">Select photos for the report</p>
      <div class="report-grid">
        ${photos.map((p, i) => `<div class="report-thumb ${selectedPhotosForReport.has(i) ? 'selected' : ''}" onclick="toggleReportPhoto(${i}, '${type}')">
          <img src="${p.thumbnail || p.url}">
          <div class="report-check">&#10003;</div>
          <span class="tag-badge">${(p.tag || '').replace('-', ' ')}</span>
        </div>`).join('')}
      </div>
      <div style="margin-top:12px">
        <div style="font-size:12px;font-weight:600;color:var(--gray);margin-bottom:8px">REPORT TYPE</div>
        ${type === 'inspection' ? `
          <div class="tag-selector">
            <button class="tag-chip active" data-type="insurance" onclick="selectReportType(this)">Insurance Report</button>
            <button class="tag-chip" data-type="client" onclick="selectReportType(this)">Client Overview</button>
          </div>
        ` : ''}
      </div>
      <div id="report-selected-count" style="font-size:13px;color:var(--teal);font-weight:600;margin-top:12px">
        ${selectedPhotosForReport.size} photos selected
      </div>
      <button class="btn-upload" onclick="generateReport('${type}')" id="btn-generate-report">Generate Report</button>
      <button class="capture-cancel" onclick="closeCaptureModal()">Cancel</button>
    </div>
  `;
}

function toggleReportPhoto(index, type) {
  if (selectedPhotosForReport.has(index)) {
    selectedPhotosForReport.delete(index);
  } else {
    selectedPhotosForReport.add(index);
  }
  // Update UI
  const thumbs = document.querySelectorAll('.report-thumb');
  thumbs.forEach((t, i) => t.classList.toggle('selected', selectedPhotosForReport.has(i)));
  const countEl = document.getElementById('report-selected-count');
  if (countEl) countEl.textContent = `${selectedPhotosForReport.size} photos selected`;
}

function selectReportType(btn) {
  document.querySelectorAll('.report-card .tag-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function generateReport(type) {
  if (selectedPhotosForReport.size === 0) return alert('Select at least one photo');

  const btn = document.getElementById('btn-generate-report');
  btn.disabled = true;
  btn.textContent = 'Generating...';

  const photos = currentLeadPhotos[type] || [];
  const selectedPhotos = [...selectedPhotosForReport].map(i => photos[i]).filter(Boolean);
  const reportType = document.querySelector('.report-card .tag-chip.active')?.dataset.type || 'insurance';

  try {
    const resp = await fetch(`/api/leads/${currentLeadId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        reportType,
        photoIds: selectedPhotos.map(p => p.id),
        photos: selectedPhotos,
        repCode,
      }),
    });
    const data = await resp.json();

    if (data.success && data.reportUrl) {
      const modal = document.getElementById('photo-capture-modal');
      modal.innerHTML = `
        <div class="report-card" style="text-align:center">
          <div style="font-size:48px;margin-bottom:12px">&#9989;</div>
          <h3>Report Ready!</h3>
          <p style="font-size:13px;color:var(--gray);margin:8px 0 16px">${data.reportName || 'Report generated successfully'}</p>
          <a href="${data.reportUrl}" target="_blank" class="btn-upload" style="display:block;text-decoration:none;text-align:center">Download PDF</a>
          <button class="btn-upload" style="background:var(--navy);margin-top:8px" onclick="shareReport('${data.reportUrl}')">Share</button>
          <button class="capture-cancel" onclick="closeCaptureModal()">Done</button>
        </div>
      `;
    } else {
      btn.disabled = false;
      btn.textContent = 'Generate Report';
      alert(data.error || 'Report generation failed');
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Generate Report';
    alert('Error: ' + e.message);
  }
}

function shareReport(url) {
  if (navigator.share) {
    navigator.share({ title: 'CRC Report', url }).catch(() => {});
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(url).then(() => alert('Link copied!')).catch(() => window.open(url));
  }
}

// Homeowner portal sync
async function syncToHomeownerPortal() {
  if (!currentLeadId) return;
  const total = currentLeadPhotos.inspection.length + currentLeadPhotos.build.length;
  if (!total) return alert('No photos to sync');

  try {
    const data = await fetch(`/api/leads/${currentLeadId}/sync-homeowner-portal`, { method: 'POST' }).then(r => r.json());
    if (data.success) {
      const el = document.querySelector('.sync-indicator');
      if (el) el.textContent = `Homeowner portal: Synced ${data.synced} photos`;
    }
  } catch (e) {
    alert('Sync failed: ' + e.message);
  }
}
