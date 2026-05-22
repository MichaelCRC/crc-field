const express = require('express');
const router = express.Router();
const { listLeads, getLead, createLead, updateLead } = require('../lib/store');
const { syncToPortal } = require('../lib/portalSync');
const { autoPost } = require('../lib/autoPost');

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

// Create lead -- retail syncs immediately, insurance waits for claim_filed
router.post('/', async (req, res) => {
  if (!req.body.address) return res.status(400).json({ error: 'Address required' });
  const lead = await createLead(req.body);
  // Only sync retail leads to portal immediately
  if (lead.jobCategory === 'retail') {
    syncToPortal(lead).then(async jobId => {
      if (jobId) await updateLead(lead.id, { portalJobId: jobId });
    }).catch(() => {});
  }
  res.status(201).json(lead);
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
