/* CRC Field Intel -- Photo System (Two-Tab: Inspection + Build) */

let activePhotoTab = 'inspection';
let activePhotoFilter = 'all';
let currentLeadPhotos = { inspection: [], build: [] };
let currentLeadId = null;

const INSPECTION_TAGS = ['all', 'overview', 'roof', 'damage', 'soft-metal', 'interior', 'other'];
const BUILD_TAGS = ['all', 'before', 'during', 'after', 'materials', 'detail', 'completion'];
const INSPECTION_TAG_LABELS = { all: 'All', overview: 'Overview', roof: 'Roof', damage: 'Damage', 'soft-metal': 'Soft Metal', interior: 'Interior', other: 'Other' };
const BUILD_TAG_LABELS = { all: 'All', before: 'Before', during: 'During', after: 'After', materials: 'Materials', detail: 'Detail', completion: 'Completion' };
const INSPECTION_TAG_ICONS = { overview: '&#128205;', roof: '&#127968;', damage: '&#9888;&#65039;', 'soft-metal': '&#128297;', interior: '&#127970;', other: '&#128206;' };
const BUILD_TAG_ICONS = { before: '&#9664;', during: '&#9654;', after: '&#9989;', materials: '&#128230;', detail: '&#128269;', completion: '&#127937;' };

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
    <button class="btn-camera" onclick="openCameraMode()">&#128247;</button>
    <div id="homeowner-share-status" style="font-size:12px;color:var(--gray);padding:8px 0;text-align:center"></div>
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
    // Resolve the real index within the unfiltered tab array (needed for markup save)
    const allTabPhotos = currentLeadPhotos[activePhotoTab] || [];
    const realIndex = activePhotoFilter === 'all' ? i : allTabPhotos.indexOf(p);
    const photoUrl = (p.url || '').replace(/'/g, "\\'");
    const markupIndicator = p.hasMarkup ? '<span style="position:absolute;top:2px;right:2px;background:rgba(0,181,204,0.85);color:#fff;font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;z-index:3">Markup</span>' : '';
    return `<div class="photo-thumb" onclick="openPhotoViewer(${i}, '${activePhotoTab}', '${activePhotoFilter}')" oncontextmenu="event.preventDefault();showPhotoActions(${realIndex})" ontouchstart="startLongPress(event,${realIndex})" ontouchend="cancelLongPress()" ontouchmove="cancelLongPress()">
      <img src="${p.thumbnail || p.url}" alt="${p.tag}" loading="lazy">
      <span class="tag-badge">${(p.tag || 'overview').replace('-', ' ')}</span>
      ${sourceBadge}
      ${p.uploadedBy ? `<span class="rep-badge-small">${p.uploadedBy}</span>` : ''}
      ${markupIndicator}
      <button style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;border:none;width:22px;height:22px;border-radius:4px;font-size:13px;cursor:pointer;padding:0;line-height:1;display:flex;align-items:center;justify-content:center;z-index:4" onclick="event.stopPropagation();openFieldPhotoMarkup('${photoUrl}','${currentLeadId}',${realIndex},'${activePhotoTab}')">&#9998;</button>
    </div>`;
  }).join('');
}

// Long press for photo actions
let longPressTimer = null;
function startLongPress(e, idx) { longPressTimer = setTimeout(() => { e.preventDefault(); showPhotoActions(idx); }, 500); }
function cancelLongPress() { clearTimeout(longPressTimer); }
