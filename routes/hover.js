const express = require('express');
const router = express.Router();
const { listLeads, getLead, updateLead } = require('../lib/store');

// Receive Hover data push from Hermes/portal
router.post('/sync', async (req, res) => {
  const { hoverId, address, measurements, photos, repCode } = req.body;
  if (!address) return res.status(400).json({ error: 'Address required' });
  // Find matching lead by address
  const leads = listLeads();
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = leads.find(l => norm(l.address).includes(norm(address).substring(0, 15)));
  if (!match) return res.json({ success: false, matched: false, message: 'No matching lead found' });
  const updates = {};
  if (measurements) updates.measurements = { ...measurements, hoverId, source: 'hover', syncedAt: new Date().toISOString() };
  if (hoverId) updates.hoverId = hoverId;
  // Store Hover photo URLs on the lead
  if (photos?.length) {
    const existing = match.photos || [];
    const hoverPhotos = photos.map(p => ({
      id: `hover-${p.id || Date.now()}`, url: p.url, thumbnail: p.thumbnail || p.url,
      tag: p.tag || 'hover', source: 'hover', uploadedAt: new Date().toISOString(),
    }));
    updates.photos = [...existing, ...hoverPhotos];
  }
  updateLead(match.id, updates);
  res.json({ success: true, matched: true, leadId: match.id });
});

// Order Hover measurement from field app
router.post('/order/:leadId', async (req, res) => {
  const lead = getLead(req.params.leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  // Push to supplement portal to trigger Hover
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
      updateLead(lead.id, { portalJobId: data.jobId, hoverOrdered: true, hoverOrderedAt: new Date().toISOString() });
      // Now trigger measurement pull on portal
      fetch(`${portalUrl}/api/jobs/${data.jobId}/measurements`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
      return res.json({ success: true, portalJobId: data.jobId, message: 'Hover ordered -- measurements will appear when complete' });
    }
    res.json({ success: false, error: data.error || 'Portal sync failed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
