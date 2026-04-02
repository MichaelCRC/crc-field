const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const { getLead, updateLead } = require('../lib/store');
const { uploadPhoto, deletePhoto, isConfigured } = require('../lib/photoStorage');

// Upload photo(s) to a lead
router.post('/:id/photos', upload.array('photos', 20), async (req, res) => {
  const lead = getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (!req.files?.length) return res.status(400).json({ error: 'No files' });
  const tag = req.body.tag || 'overview';
  const repCode = req.body.repCode || lead.repCode || '';
  const results = [];
  for (const file of req.files) {
    try {
      const photo = await uploadPhoto(file.buffer, req.params.id, repCode, tag);
      results.push(photo);
    } catch (e) { console.error('[Photos] Upload failed:', e.message); }
  }
  const photos = [...(lead.photos || []), ...results];
  updateLead(req.params.id, { photos });
  res.json({ success: true, uploaded: results.length, photos });
});

// Get photos for a lead
router.get('/:id/photos', (req, res) => {
  const lead = getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json({ photos: lead.photos || [], configured: isConfigured() });
});

// Delete a photo
router.delete('/:id/photos/:photoId', async (req, res) => {
  const lead = getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const photoId = decodeURIComponent(req.params.photoId);
  await deletePhoto(photoId);
  const photos = (lead.photos || []).filter(p => p.id !== photoId);
  updateLead(req.params.id, { photos });
  res.json({ success: true, remaining: photos.length });
});

module.exports = router;
