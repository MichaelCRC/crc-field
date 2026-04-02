const express = require('express');
const router = express.Router();
const { listLeads, getLead, createLead, updateLead } = require('../lib/store');
const { syncToPortal } = require('../lib/portalSync');

// List leads (optionally filter by repCode)
router.get('/', (req, res) => {
  let leads = listLeads();
  if (req.query.repCode) leads = leads.filter(l => l.repCode === req.query.repCode);
  if (req.query.status) leads = leads.filter(l => l.status === req.query.status);
  res.json(leads);
});

// Single lead
router.get('/:id', (req, res) => {
  const lead = getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});

// Create lead
router.post('/', async (req, res) => {
  if (!req.body.address) return res.status(400).json({ error: 'Address required' });
  const lead = createLead(req.body);
  // Async sync to portal (don't block the response)
  syncToPortal(lead).then(jobId => {
    if (jobId) updateLead(lead.id, { portalJobId: jobId });
  }).catch(() => {});
  res.status(201).json(lead);
});

// Update lead
router.patch('/:id', (req, res) => {
  const updated = updateLead(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Lead not found' });
  res.json(updated);
});

// CSV export
router.get('/export/csv', (req, res) => {
  const leads = listLeads();
  const header = 'Name,Address,City,State,Zip,Phone,Job Type,Status,Source,Rep,Date Added';
  const rows = leads.map(l => [
    l.homeowner, l.address, l.city, l.state, l.zip,
    l.phone, l.jobType, l.status, l.source, l.repCode,
    l.createdAt ? new Date(l.createdAt).toLocaleDateString() : ''
  ].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="crc-leads.csv"');
  res.send([header, ...rows].join('\n'));
});

module.exports = router;
