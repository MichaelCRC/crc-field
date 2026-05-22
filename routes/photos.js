const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const { getLead, updateLead } = require('../lib/store');
const { uploadPhoto, deletePhoto, migratePhotos, isConfigured } = require('../lib/photoStorage');

// Upload photo(s) to a lead with category and tag
router.post('/:id/photos', upload.array('photos', 20), async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (!req.files?.length) return res.status(400).json({ error: 'No files' });

  const tag = req.body.tag || 'overview';
  const category = req.body.category || 'inspection';
  const caption = req.body.caption || '';
  const repCode = req.body.repCode || lead.repCode || '';

  const results = [];
  for (const file of req.files) {
    try {
      const photo = await uploadPhoto(file.buffer, req.params.id, repCode, tag, category, caption);
      results.push(photo);
    } catch (e) { console.error('[Photos] Upload failed:', e.message); }
  }

  // Migrate existing photos then add new ones
  const photos = migratePhotos(lead);
  if (category === 'build') {
    photos.build = [...photos.build, ...results];
  } else {
    photos.inspection = [...photos.inspection, ...results];
  }

  await updateLead(req.params.id, { photos });

  // Auto-sync new photos to portal job (fire-and-forget — never blocks response)
  const updatedLead = await getLead(req.params.id);
  if (updatedLead?.portalJobId && process.env.SUPPLEMENT_PORTAL_URL && results.length > 0) {
    const allPhotos = [...(photos.inspection || []), ...(photos.build || [])];
    fetch(`${process.env.SUPPLEMENT_PORTAL_URL}/api/jobs/${updatedLead.portalJobId}/fields`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldPhotos: allPhotos }),
    }).catch(e => console.warn('[Photos] Portal auto-sync failed:', e.message));
  }

  res.json({ success: true, uploaded: results.length, photos });
});

// Get photos for a lead (returns { inspection: [], build: [] })
router.get('/:id/photos', async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const photos = migratePhotos(lead);
  res.json({ photos, configured: isConfigured() });
});

// Delete a photo
router.delete('/:id/photos/:photoId', async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const photoId = decodeURIComponent(req.params.photoId);
  await deletePhoto(photoId);

  const photos = migratePhotos(lead);
  photos.inspection = photos.inspection.filter(p => p.id !== photoId);
  photos.build = photos.build.filter(p => p.id !== photoId);
  await updateLead(req.params.id, { photos });
  res.json({ success: true, photos });
});

// Update a photo's tag or caption
router.patch('/:id/photos/:photoId', async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const photoId = decodeURIComponent(req.params.photoId);
  const { tag, caption } = req.body;

  const photos = migratePhotos(lead);
  const update = (arr) => arr.map(p => {
    if (p.id !== photoId) return p;
    return { ...p, tag: tag || p.tag, caption: caption !== undefined ? caption : p.caption };
  });
  photos.inspection = update(photos.inspection);
  photos.build = update(photos.build);
  await updateLead(req.params.id, { photos });
  res.json({ success: true, photos });
});

// Homeowner portal sync endpoint
router.post('/:id/sync-homeowner-portal', async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const photos = migratePhotos(lead);
  const inspCount = photos.inspection.length;
  const buildCount = photos.build.length;

  // Store sync status on lead
  const syncStatus = {
    enabled: true,
    homeownerPortalJobId: lead.portalJobId || null,
    inspectionPhotosSynced: inspCount,
    buildPhotosSynced: buildCount,
    lastSync: new Date().toISOString(),
  };

  await updateLead(req.params.id, { homeownerPortalSync: syncStatus });

  // If portal job exists, push photos
  if (lead.portalJobId && process.env.SUPPLEMENT_PORTAL_URL) {
    try {
      const allPhotos = [...photos.inspection, ...photos.build];
      await fetch(`${process.env.SUPPLEMENT_PORTAL_URL}/api/jobs/${lead.portalJobId}/fields`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldPhotos: allPhotos }),
      });
    } catch (e) {
      console.error('[Sync] Homeowner portal photo sync failed:', e.message);
    }
  }

  res.json({
    success: true,
    synced: inspCount + buildCount,
    syncStatus,
  });
});

module.exports = router;
