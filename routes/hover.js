const express = require('express');
const router = express.Router();
const { listLeads, getLead, updateLead } = require('../lib/store');
const { uploadFromUrl, migratePhotos } = require('../lib/photoStorage');

// Map Hover image categories to our inspection sub-tags
const HOVER_TAG_MAP = {
  'exterior/ground': 'overview',
  'exterior': 'overview',
  'ground': 'overview',
  'roof': 'roof',
  'damage': 'damage',
  'interior': 'interior',
  'default': 'overview',
};

function mapHoverTag(hoverCategory) {
  if (!hoverCategory) return 'overview';
  const lower = hoverCategory.toLowerCase();
  return HOVER_TAG_MAP[lower] || HOVER_TAG_MAP['default'];
}

// Receive Hover data push from Hermes/portal
router.post('/sync', async (req, res) => {
  const { hoverId, address, measurements, photos, repCode } = req.body;
  if (!address) return res.status(400).json({ error: 'Address required' });

  const leads = await listLeads();
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = leads.find(l => norm(l.address).includes(norm(address).substring(0, 15)));
  if (!match) return res.json({ success: false, matched: false, message: 'No matching lead found' });

  const updates = {};
  if (measurements) {
    updates.measurements = {
      ...measurements, hoverId,
      source: 'hover', syncedAt: new Date().toISOString(),
    };
  }
  if (hoverId) updates.hoverId = hoverId;

  // Store Hover photos in the new two-tab structure
  if (photos?.length) {
    const currentPhotos = migratePhotos(match);
    const hoverPhotos = [];

    for (const p of photos) {
      // Re-upload to Cloudinary if we have a URL
      if (p.url) {
        const tag = mapHoverTag(p.category || p.tag);
        const uploaded = await uploadFromUrl(p.url, match.id, tag, 'inspection', 'hover');
        if (uploaded) hoverPhotos.push(uploaded);
      } else {
        // Store directly
        hoverPhotos.push({
          id: `hover-${p.id || Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          url: p.url || p.thumbnail,
          thumbnail: p.thumbnail || p.url,
          tag: mapHoverTag(p.category || p.tag),
          category: 'inspection',
          caption: '',
          source: 'hover',
          uploadedBy: 'hover',
          uploadedAt: new Date().toISOString(),
        });
      }
    }

    currentPhotos.inspection = [...currentPhotos.inspection, ...hoverPhotos];
    updates.photos = currentPhotos;
  }

  await updateLead(match.id, updates);
  res.json({ success: true, matched: true, leadId: match.id });
});

// Pull Hover photos for a specific lead
router.post('/pull-photos/:leadId', async (req, res) => {
  const lead = await getLead(req.params.leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (!lead.hoverId) return res.json({ success: false, message: 'No Hover ID on this job' });

  // Try to pull from Hover API
  const token = process.env.HOVER_ACCESS_TOKEN;
  if (!token) {
    return res.json({ success: false, message: 'Hover API not configured -- photos sync via webhook' });
  }

  try {
    const resp = await fetch(`https://api.hover.to/api/v2/jobs/${lead.hoverId}/images`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`Hover API ${resp.status}`);
    const data = await resp.json();
    const images = data.images || data.results || [];

    const currentPhotos = migratePhotos(lead);
    const newPhotos = [];

    for (const img of images) {
      const url = img.url || img.image_url || img.original_url;
      if (!url) continue;
      const tag = mapHoverTag(img.category || img.type);
      const uploaded = await uploadFromUrl(url, lead.id, tag, 'inspection', 'hover');
      if (uploaded) newPhotos.push(uploaded);
    }

    currentPhotos.inspection = [...currentPhotos.inspection, ...newPhotos];
    await updateLead(lead.id, { photos: currentPhotos });

    res.json({ success: true, pulled: newPhotos.length });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// Order Hover measurement from field app
router.post('/order/:leadId', async (req, res) => {
  const lead = await getLead(req.params.leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const portalUrl = process.env.SUPPLEMENT_PORTAL_URL;
  const secret = process.env.HERMES_API_SECRET;
  if (!portalUrl || !secret) return res.status(500).json({ error: 'Portal not configured' });

  try {
    const parts = (lead.homeowner || '').split(' ');
    const resp = await fetch(`${portalUrl}/api/hermes/job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hermes-secret': secret },
      body: JSON.stringify({
        address: lead.address, homeownerName: lead.homeowner,
        firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '',
        jobCategory: lead.jobCategory || 'insurance',
        source: 'crc-field-hover-order',
      }),
    });
    const data = await resp.json();
    if (data.success) {
      await updateLead(lead.id, {
        portalJobId: data.jobId,
        hoverOrdered: true,
        hoverOrderedAt: new Date().toISOString(),
      });
      fetch(`${portalUrl}/api/jobs/${data.jobId}/measurements`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
      return res.json({ success: true, portalJobId: data.jobId, message: 'Hover ordered -- measurements will appear when complete' });
    }
    res.json({ success: false, error: data.error || 'Portal sync failed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
