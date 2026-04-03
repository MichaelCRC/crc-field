/* CRC Field Intel -- Photo Actions (long press: tag, caption, delete) */

function showPhotoActions(idx) {
  const photos = currentLeadPhotos[activePhotoTab] || [];
  if (activePhotoFilter !== 'all') {
    const filtered = photos.filter(p => p.tag === activePhotoFilter);
    if (filtered[idx]) idx = photos.indexOf(filtered[idx]);
  }
  const photo = photos[idx];
  if (!photo) return;
  const tags = (activePhotoTab === 'inspection' ? INSPECTION_TAGS : BUILD_TAGS).filter(t => t !== 'all');
  const labels = activePhotoTab === 'inspection' ? INSPECTION_TAG_LABELS : BUILD_TAG_LABELS;

  const modal = document.getElementById('photo-capture-modal');
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="action-sheet">
      <div class="action-preview"><img src="${photo.thumbnail || photo.url}"></div>
      <div class="action-section-label">Change Tag</div>
      <div class="action-tags">
        ${tags.map(t => `<button class="action-tag ${photo.tag === t ? 'active' : ''}" onclick="changePhotoTag('${photo.id}','${t}')">${labels[t]}</button>`).join('')}
      </div>
      <button class="action-item" onclick="promptCaption('${photo.id}','${(photo.caption || '').replace(/'/g, "\\'")}')">&#9998; ${photo.caption ? 'Edit' : 'Add'} Caption</button>
      <button class="action-item action-delete" onclick="deletePhotoConfirm('${photo.id}')">&#128465; Delete Photo</button>
      <button class="action-cancel" onclick="closeActionSheet()">Cancel</button>
    </div>`;
}

function closeActionSheet() { document.getElementById('photo-capture-modal').style.display = 'none'; }

async function changePhotoTag(photoId, newTag) {
  try {
    const data = await fetch(`/api/leads/${currentLeadId}/photos/${encodeURIComponent(photoId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: newTag }),
    }).then(r => r.json());
    if (data.success) currentLeadPhotos = data.photos;
  } catch (e) { console.error('Tag update failed:', e); }
  closeActionSheet();
  renderPhotoSection();
}

function promptCaption(photoId, currentCaption) {
  const caption = prompt('Photo caption:', currentCaption || '');
  if (caption === null) return;
  fetch(`/api/leads/${currentLeadId}/photos/${encodeURIComponent(photoId)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caption }),
  }).then(r => r.json()).then(data => {
    if (data.success) currentLeadPhotos = data.photos;
    closeActionSheet(); renderPhotoSection();
  });
}

function deletePhotoConfirm(photoId) {
  if (!confirm('Delete this photo?')) return;
  fetch(`/api/leads/${currentLeadId}/photos/${encodeURIComponent(photoId)}`, { method: 'DELETE' })
    .then(r => r.json()).then(data => {
      if (data.success) currentLeadPhotos = data.photos;
      closeActionSheet(); renderPhotoSection();
    });
}
