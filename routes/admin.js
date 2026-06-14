const express = require('express');
const router = express.Router();
const { getDataCore, listLeads, listZones, createZone, read, write } = require('../lib/store');
const { listRepCodes, refreshRepCodes } = require('../lib/repCodes');
const { defaultChat } = require('../lib/autoPost');
const { analyze, formatReport } = require('../lib/systemIntelligence');
// Shared gate: reads x-field-rep (the app-wide header) as well as the legacy
// x-rep-code / ?repCode= the admin client sends, and validates active+admin.
const { requireAdmin } = require('../lib/authGate');

// Rep-code writes are proxied to the portal roster (the PG-backed system of
// record). The old flat-file write to rep-codes.json was a no-op — the field
// auth cache reads Postgres, so flat-file edits vanished on the next 5-min
// refresh. PORTAL_URL fallback is the live dev host (never the retired
// -portal); FIELD_APP_KEY authenticates the field app to the portal gate.
const PORTAL_URL = process.env.SUPPLEMENT_PORTAL_URL || 'https://crc-supplements-dev.onrender.com';
const FIELD_APP_KEY = process.env.FIELD_APP_KEY || 'crc-field-2026';

async function rosterFetch(path, { method = 'GET', body } = {}, repCode) {
  const res = await fetch(`${PORTAL_URL}${path}`, {
    method,
    redirect: 'manual',  // a 302→/login means the portal rejected our auth
    headers: {
      'Content-Type': 'application/json',
      'x-field-app-key': FIELD_APP_KEY,
      'x-field-rep': repCode || '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status >= 300 && res.status < 400) {
    return { ok: false, status: 502, data: { error: 'Portal rejected field-app auth' } };
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : {};
  return { ok: res.ok, status: res.status, data };
}

// Map a portal roster user (safeUser shape) onto the legacy rep-code shape the
// field admin client already renders, keeping user_id/email/phone available.
function rosterToLegacy(u) {
  return {
    user_id: u.user_id,
    code: u.rep_code,
    name: u.name,
    role: u.role,
    email: u.email || '',
    phone: u.phone || '',
    active: u.is_active !== undefined ? !!u.is_active : !!u.active,
  };
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
// GET — full roster (active + inactive) from the portal so admins can both
// deactivate and reactivate. Falls back to the active-only auth cache if the
// portal is unreachable, so the screen still renders.
router.get('/rep-codes', requireAdmin, async (req, res) => {
  const { ok, data } = await rosterFetch('/api/roster/reps?filter=all', {}, req.repCode);
  if (ok && Array.isArray(data.reps)) return res.json(data.reps.map(rosterToLegacy));
  console.warn('[admin] roster list failed, falling back to auth cache');
  return res.json(listRepCodes());
});

// POST — create a rep in the portal roster (PG). The portal requires email +
// phone (for login + welcome email), so the field add-rep form collects them.
router.post('/rep-codes', requireAdmin, async (req, res) => {
  const { code, name, email, phone, role } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: 'Code and name required' });
  if (!email || !phone) return res.status(400).json({ error: 'Email and phone required to create a rep' });
  const { ok, status, data } = await rosterFetch('/api/roster/reps', {
    method: 'POST',
    body: { rep_code: code.toUpperCase(), name, email, phone, role: role || 'rep' },
  }, req.repCode);
  if (!ok) return res.status(status).json(data && data.error ? data : { error: 'Portal create failed', detail: data });
  refreshRepCodes().catch(() => {});  // reflect the new rep in the auth cache now
  return res.status(201).json({ success: true, code: code.toUpperCase(), user: data.user, emailWarning: data.emailWarning });
});

// PATCH — toggle active (deactivate/reactivate) and/or edit name/role/rep_code,
// all against the portal roster. Resolves code→user_id from the full roster so
// inactive reps (absent from the active-only auth cache) can be reactivated.
router.patch('/rep-codes/:code', requireAdmin, async (req, res) => {
  const upper = req.params.code.toUpperCase();
  const list = await rosterFetch('/api/roster/reps?filter=all', {}, req.repCode);
  if (!list.ok || !Array.isArray(list.data.reps)) {
    return res.status(list.status || 502).json({ error: 'Could not load roster to resolve rep' });
  }
  const target = list.data.reps.find(u => u.rep_code === upper);
  if (!target) return res.status(404).json({ error: 'Code not found' });
  const userId = target.user_id;

  // Active toggle uses the dedicated endpoints (they stamp terminated_at/by).
  if (req.body.active !== undefined) {
    const path = req.body.active
      ? `/api/roster/reps/${userId}/reactivate`
      : `/api/roster/reps/${userId}/deactivate`;
    const r = await rosterFetch(path, { method: 'POST', body: {} }, req.repCode);
    if (!r.ok) return res.status(r.status).json(r.data && r.data.error ? r.data : { error: 'Portal toggle failed' });
  }

  // Field edits (name/role/rep_code) go through PATCH.
  const patch = {};
  if (req.body.name) patch.name = req.body.name;
  if (req.body.role) patch.role = req.body.role;
  if (req.body.newCode) patch.rep_code = String(req.body.newCode).toUpperCase();
  if (Object.keys(patch).length) {
    const r = await rosterFetch(`/api/roster/reps/${userId}`, { method: 'PATCH', body: patch }, req.repCode);
    if (!r.ok) return res.status(r.status).json(r.data && r.data.error ? r.data : { error: 'Portal update failed' });
  }

  refreshRepCodes().catch(() => {});  // reflect the change in the auth cache now
  return res.json({ success: true, code: upper });
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

// Zones — gated like every other admin route (was the one open pair).
router.get('/zones', requireAdmin, async (req, res) => res.json(listZones()));
router.post('/zones', requireAdmin, async (req, res) => { res.status(201).json(createZone(req.body)); });

module.exports = router;
