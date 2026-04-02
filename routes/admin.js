const express = require('express');
const router = express.Router();
const { getDataCore, listLeads, listZones, createZone, read } = require('../lib/store');
const { isAdmin, listRepCodes } = require('../lib/repCodes');

function requireAdmin(req, res, next) {
  const code = (req.headers['x-rep-code'] || req.query.repCode || '').toUpperCase();
  if (!isAdmin(code)) return res.status(403).json({ error: 'Admin access required' });
  next();
}

// Data core
router.get('/data-core', requireAdmin, (req, res) => res.json(getDataCore()));

// Named lists
router.get('/lists/:name', requireAdmin, (req, res) => {
  const core = getDataCore();
  const list = core.lists?.[req.params.name];
  if (!list) return res.status(404).json({ error: 'List not found' });
  res.json(list);
});

// Rep performance
router.get('/reps', requireAdmin, (req, res) => {
  const leads = listLeads();
  const codes = listRepCodes();
  const weekAgo = Date.now() - 7 * 86400000;
  const stats = codes.filter(c => c.active).map(rep => {
    const repLeads = leads.filter(l => l.repCode === rep.code);
    const thisWeek = repLeads.filter(l => new Date(l.createdAt).getTime() > weekAgo);
    const knocked = repLeads.filter(l => l.source === 'Door Knock');
    const appts = repLeads.filter(l => l.status === 'appointment');
    const won = repLeads.filter(l => l.status === 'won');
    return {
      code: rep.code, name: rep.name, role: rep.role,
      totalLeads: repLeads.length,
      thisWeek: thisWeek.length,
      doorsKnocked: knocked.length,
      appointments: appts.length,
      won: won.length,
      conversionRate: repLeads.length > 0 ? Math.round((won.length / repLeads.length) * 100) : 0,
    };
  });
  res.json(stats);
});

// Full export CSV
router.get('/export', requireAdmin, (req, res) => {
  const core = getDataCore();
  const contacts = core.contacts || [];
  const header = 'ID,Type,First Name,Last Name,Phone,Email,Source,Rep,Created';
  const rows = contacts.map(c => [
    c.id, c.type, c.firstName, c.lastName, c.phone, c.email, c.source, c.repCode, c.createdAt
  ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="crc-data-core.csv"');
  res.send([header, ...rows].join('\n'));
});

// Rep code management
router.get('/rep-codes', requireAdmin, (req, res) => res.json(listRepCodes()));
router.post('/rep-codes', requireAdmin, (req, res) => {
  const { code, name, role } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Code and name required' });
  const { write } = require('../lib/store');
  const codes = listRepCodes();
  const upper = code.toUpperCase();
  if (codes.find(c => c.code === upper)) return res.status(400).json({ error: 'Code already exists' });
  codes.push({ code: upper, name, role: role || 'rep', active: true, createdAt: new Date().toISOString() });
  write('rep-codes.json', { codes });
  res.status(201).json({ success: true, code: upper });
});
router.patch('/rep-codes/:code', requireAdmin, (req, res) => {
  const { write } = require('../lib/store');
  const codes = listRepCodes();
  const idx = codes.findIndex(c => c.code === req.params.code.toUpperCase());
  if (idx === -1) return res.status(404).json({ error: 'Code not found' });
  if (req.body.active !== undefined) codes[idx].active = req.body.active;
  if (req.body.name) codes[idx].name = req.body.name;
  if (req.body.role) codes[idx].role = req.body.role;
  write('rep-codes.json', { codes });
  res.json({ success: true, code: codes[idx] });
});

// Zones
router.get('/zones', (req, res) => res.json(listZones()));
router.post('/zones', (req, res) => { res.status(201).json(createZone(req.body)); });

module.exports = router;
