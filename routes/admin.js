const express = require('express');
const router = express.Router();
const { getDataCore, listLeads, listZones, createZone, read, write } = require('../lib/store');
const { isAdmin, listRepCodes } = require('../lib/repCodes');
const { defaultChat } = require('../lib/autoPost');
const { analyze, formatReport } = require('../lib/systemIntelligence');

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
router.get('/reps', requireAdmin, async (req, res) => {
  const leads = await listLeads();
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

// --- Chat Thread Management ---
function getChat() { return read('chat.json', defaultChat()); }
function saveChat(chat) { write('chat.json', chat); }

// List all threads with member info
router.get('/chat/threads', requireAdmin, (req, res) => {
  const chat = getChat();
  const threads = Object.entries(chat.threads).map(([id, t]) => ({
    id, name: t.name || id, type: t.type || 'group',
    adminOnly: t.adminOnly || false,
    members: t.members || [],
    messageCount: (t.messages || []).length,
  }));
  res.json(threads);
});

// Update thread (rename, change type, update members)
router.patch('/chat/threads/:threadId', requireAdmin, (req, res) => {
  const chat = getChat();
  const thread = chat.threads[req.params.threadId];
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  if (req.body.name) thread.name = req.body.name;
  if (req.body.type) thread.type = req.body.type;
  if (req.body.adminOnly !== undefined) thread.adminOnly = req.body.adminOnly;
  if (req.body.members) thread.members = req.body.members;
  saveChat(chat);
  res.json({ success: true, thread: { id: req.params.threadId, name: thread.name, members: thread.members } });
});

// Create new thread
router.post('/chat/threads', requireAdmin, (req, res) => {
  const { name, type, members, adminOnly } = req.body;
  if (!name) return res.status(400).json({ error: 'Thread name required' });
  const chat = getChat();
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
  if (chat.threads[id]) return res.status(400).json({ error: 'Thread already exists' });
  chat.threads[id] = {
    id, name, type: type || 'group', adminOnly: adminOnly || false,
    members: members || [], messages: [],
    createdBy: (req.query.repCode || '').toUpperCase(),
    createdAt: new Date().toISOString(),
  };
  saveChat(chat);
  res.status(201).json({ success: true, threadId: id });
});

// Add member to thread
router.post('/chat/threads/:threadId/members', requireAdmin, (req, res) => {
  const { repCode: memberCode } = req.body;
  if (!memberCode) return res.status(400).json({ error: 'repCode required' });
  const chat = getChat();
  const thread = chat.threads[req.params.threadId];
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  if (!thread.members) thread.members = [];
  const code = memberCode.toUpperCase();
  if (!thread.members.includes(code)) thread.members.push(code);
  saveChat(chat);
  res.json({ success: true, members: thread.members });
});

// Remove member from thread
router.delete('/chat/threads/:threadId/members/:code', requireAdmin, (req, res) => {
  const chat = getChat();
  const thread = chat.threads[req.params.threadId];
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  if (!thread.members) thread.members = [];
  thread.members = thread.members.filter(m => m !== req.params.code.toUpperCase());
  saveChat(chat);
  res.json({ success: true, members: thread.members });
});

// System Intelligence
router.get('/intelligence', requireAdmin, (req, res) => {
  const existing = read('intelligence-report.json', null);
  if (existing) return res.json(existing);
  res.json({ generatedAt: null, message: 'No report yet. POST to generate.' });
});
router.post('/intelligence', requireAdmin, (req, res) => {
  try {
    const report = analyze();
    res.json({ success: true, report, formatted: formatReport(report) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Zones
router.get('/zones', async (req, res) => res.json(listZones()));
router.post('/zones', async (req, res) => { res.status(201).json(createZone(req.body)); });

module.exports = router;
