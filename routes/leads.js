const express = require('express');
const router = express.Router();
const { listLeads, getLead, updateLead } = require('../lib/store');
const { syncToPortal } = require('../lib/portalSync');
const { autoPost } = require('../lib/autoPost');
const { requireRep } = require('../lib/authGate');

// Portal is the system of record. Door-knock + quick-mark leads converge here
// (like the primary ADD LEAD path) instead of the dead Postgres leads table.
const PORTAL_URL = process.env.SUPPLEMENT_PORTAL_URL || 'https://crc-supplements-dev.onrender.com';
const HERMES_SECRET = process.env.HERMES_API_SECRET;

// Every lead route requires a valid, active rep (server-side kill switch).
router.use(requireRep);

// List leads
router.get('/', async (req, res) => {
  let leads = await listLeads();
  if (req.query.repCode) leads = leads.filter(l => l.repCode === req.query.repCode);
  if (req.query.status) leads = leads.filter(l => l.status === req.query.status);
  res.json(leads);
});

// CSV export -- must be above /:id to avoid route conflict
router.get('/export/csv', async (req, res) => {
  const leads = await listLeads();
  const header = 'Name,Address,City,State,Zip,Phone,Job Type,Status,Source,Rep,Date Added';
  const rows = leads.map(l => [
    l.homeowner, l.address, l.city, l.state, l.zip,
    l.phone, l.jobType, l.status, l.source, l.repCode,
    l.createdAt ? new Date(l.createdAt).toLocaleDateString() : ''
  ].map(v => `"${(v || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="crc-leads.csv"');
  res.send([header, ...rows].join('\n'));
});

// Single lead
router.get('/:id', async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});

// Create lead (door-knock / quick-mark) — converges on the portal (system of
// record), carrying repCode so the portal's JN push routes it to the rep's
// board (Holly default when unassigned). Mirrors the primary ADD LEAD path,
// replacing the old write to the dead Postgres leads table.
router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.address) return res.status(400).json({ error: 'Address required' });
  const nameParts = String(b.homeowner || b.homeownerName || '').trim().split(' ').filter(Boolean);
  const payload = {
    address: b.address,
    firstName: b.firstName || nameParts[0] || '',
    lastName: b.lastName || nameParts.slice(1).join(' ') || '',
    homeownerName: b.homeowner || b.homeownerName || '',
    phone: b.phone || '',
    email: b.email || '',
    repCode: req.repCode || String(b.repCode || '').toUpperCase(),
    jobCategory: b.jobCategory || 'insurance',
    pipeline: b.jobCategory === 'retail' ? 'retail' : 'insurance',
    stage: b.status || 'new_lead',
    source: b.source || 'Door Knock',
    lat: b.lat ?? null,
    lng: b.lng ?? null,
    notes: b.notes || '',
  };
  try {
    const r = await fetch(`${PORTAL_URL}/api/hermes/job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hermes-secret': HERMES_SECRET },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('[Leads] portal create failed:', r.status, data);
      return res.status(r.status).json({ error: 'Portal create failed', detail: data });
    }
    res.status(201).json({ success: true, id: data.jobId || data.id, job: data });
  } catch (e) {
    console.error('[Leads] door-knock portal create failed:', e.message);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// Update lead -- claim_filed triggers portal sync + orchestrator
router.patch('/:id', async (req, res) => {
  const updated = await updateLead(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Lead not found' });
  // On claim_filed for insurance: sync to portal + trigger orchestrator
  if (req.body.status === 'claim_filed' && !updated.portalJobId && updated.jobCategory !== 'retail') {
    syncToPortal(updated).then(async jobId => {
      if (!jobId) return;
      await updateLead(updated.id, { portalJobId: jobId });
      // Trigger orchestrator for full package build
      const url = process.env.SUPPLEMENT_PORTAL_URL;
      const secret = process.env.HERMES_API_SECRET;
      if (url && secret) {
        try {
          await fetch(`${url}/api/hermes/job/${jobId}/orchestrate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hermes-secret': secret },
          });
          console.log(`[Sync] Orchestrator triggered for ${jobId}`);
        } catch (e) { console.error('[Sync] Orchestrator trigger failed:', e.message); }
      }
    }).catch(() => {});
    autoPost('claim_filed', updated);
  }
  res.json(updated);
});

module.exports = router;
