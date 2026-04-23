/* CRC Field Intel -- Photo Viewer, Reports, Sync */

let selectedPhotosForReport = new Set();
let photoViewerIndex = 0;
let photoViewerList = [];

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
    <img src="${p.url}" alt="Inspection photo" style="max-width:95%;max-height:85vh;object-fit:contain">
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
  let touchStartX = 0;
  modal.ontouchstart = (e) => { touchStartX = e.touches[0].clientX; };
  modal.ontouchend = (e) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? viewerNext() : viewerPrev(); }
  };
}

function viewerPrev() { if (photoViewerIndex > 0) { photoViewerIndex--; renderPhotoViewer(); } }
function viewerNext() { if (photoViewerIndex < photoViewerList.length - 1) { photoViewerIndex++; renderPhotoViewer(); } }

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
        ${photos.map((p, i) => `<div class="report-thumb" onclick="toggleReportPhoto(${i})">
          <img src="${p.thumbnail || p.url}" alt="Photo thumbnail">
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
          </div>` : ''}
      </div>
      <div id="report-selected-count" style="font-size:13px;color:var(--teal);font-weight:600;margin-top:12px">0 photos selected</div>
      <button class="btn-upload" onclick="generateReport('${type}')" id="btn-generate-report">Generate Report</button>
      <button class="capture-cancel" onclick="closeCaptureModal()">Cancel</button>
    </div>`;
}

function toggleReportPhoto(index) {
  if (selectedPhotosForReport.has(index)) selectedPhotosForReport.delete(index);
  else selectedPhotosForReport.add(index);
  document.querySelectorAll('.report-thumb').forEach((t, i) => t.classList.toggle('selected', selectedPhotosForReport.has(i)));
  const el = document.getElementById('report-selected-count');
  if (el) el.textContent = `${selectedPhotosForReport.size} photos selected`;
}

function selectReportType(btn) {
  document.querySelectorAll('.report-card .tag-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function generateReport(type) {
  if (selectedPhotosForReport.size === 0) return alert('Select at least one photo');
  const btn = document.getElementById('btn-generate-report');
  btn.disabled = true; btn.textContent = 'Generating...';

  const photos = currentLeadPhotos[type] || [];
  const selectedPhotos = [...selectedPhotosForReport].map(i => photos[i]).filter(Boolean);
  const reportType = document.querySelector('.report-card .tag-chip.active')?.dataset.type || 'insurance';

  try {
    const data = await fetch(`/api/leads/${currentLeadId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, reportType, photoIds: selectedPhotos.map(p => p.id), photos: selectedPhotos, repCode }),
    }).then(r => r.json());

    if (data.success && data.reportUrl) {
      document.getElementById('photo-capture-modal').innerHTML = `
        <div class="report-card" style="text-align:center">
          <div style="font-size:48px;margin-bottom:12px">&#9989;</div>
          <h3>Report Ready!</h3>
          <p style="font-size:13px;color:var(--gray);margin:8px 0 16px">${data.reportName || 'Report generated'}</p>
          <a href="${data.reportUrl}" target="_blank" class="btn-upload" style="display:block;text-decoration:none;text-align:center">Download PDF</a>
          <button class="btn-upload" style="background:var(--navy);margin-top:8px" onclick="shareReport('${data.reportUrl}')">Share</button>
          <button class="capture-cancel" onclick="closeCaptureModal()">Done</button>
        </div>`;
    } else {
      btn.disabled = false; btn.textContent = 'Generate Report';
      alert(data.error || 'Report generation failed');
    }
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Generate Report';
    alert('Error: ' + e.message);
  }
}

function shareReport(url) {
  if (navigator.share) navigator.share({ title: 'CRC Report', url }).catch(() => {});
  else navigator.clipboard.writeText(url).then(() => alert('Link copied!')).catch(() => window.open(url));
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
  } catch (e) { alert('Sync failed: ' + e.message); }
}
