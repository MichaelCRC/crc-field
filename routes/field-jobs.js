/**
 * Field Jobs — Server-side proxy to the CRC Supplement Portal.
 * All portal API calls go through here so the hermes secret stays server-side.
 *
 * Routes:
 *   GET  /api/field/jobs              — list jobs for a repCode
 *   GET  /api/field/jobs/:id          — single job
 *   POST /api/field/jobs              — create job in portal
 *   POST /api/field/jobs/:id/notes    — add note
 *   POST /api/field/jobs/:id/tasks    — add task
 *   PATCH /api/field/jobs/:id/tasks/:taskId  — complete/update task
 */

const express = require('express');
const router = express.Router();

const PORTAL_URL = process.env.SUPPLEMENT_PORTAL_URL || 'https://crc-supplements-portal.onrender.com';
const HERMES_SECRET = process.env.HERMES_API_SECRET || 'crc-hermes-2026';

// Shared headers for portal calls
const portalHeaders = {
  'Content-Type': 'application/json',
  'x-hermes-secret': HERMES_SECRET
};

async function portalFetch(path, opts = {}) {
  const res = await fetch(`${PORTAL_URL}${path}`, {
    ...opts,
    headers: { ...portalHeaders, ...(opts.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

// GET /api/field/jobs?repCode=MCG[&pipeline=insurance|retail|repair][&stage=new_lead]
router.get('/', async (req, res) => {
  try {
    const params = new URLSearchParams();
    if (req.query.repCode) params.set('repCode', req.query.repCode);
    const { status, ok, data } = await portalFetch(`/api/jobs?${params}`);
    if (!ok) return res.status(status).json(data);

    // Transform to lightweight cards for the field app
    // Sort: overdue tasks first, then by lastActivity desc
    const jobs = (Array.isArray(data) ? data : []).map(job => ({
      id: job.id,
      address: job.address,
      homeownerName: job.homeownerName || `${job.homeowner?.firstName || ''} ${job.homeowner?.lastName || ''}`.trim(),
      phone: job.homeowner?.phone || '',
      pipeline: job.pipeline || job.jobCategory || 'insurance',
      stage: job.stage || 'new_lead',
      subStatus: job.subStatus || null,
      carrier: job.carrier || '',
      claimNumber: job.claimNumber || '',
      adjusterDate: job.adjusterDate || null,
      repCode: job.repCode || '',
      lastActivity: job.lastActivity || job.updated_at || job.created_at,
      createdAt: job.created_at,
      openTasks: (job.tasks || []).filter(t => !t.completed).length,
      overdueTasks: (job.tasks || []).filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date()).length,
      noteCount: (job.jobNotes || []).length,
      photoCount: job.simplePhotos?.length || job.photos?.photoCount || 0,
      estimateValue: job.estimateValue || null,
      streetViewUrl: job.streetViewUrl || null
    }));

    // Sort: overdue tasks bubble up, then most recent activity
    jobs.sort((a, b) => {
      if (b.overdueTasks !== a.overdueTasks) return b.overdueTasks - a.overdueTasks;
      return new Date(b.lastActivity) - new Date(a.lastActivity);
    });

    res.json(jobs);
  } catch (e) {
    console.error('[FieldJobs] GET / error:', e.message);
    res.status(500).json({ error: 'Failed to load jobs from portal' });
  }
});

// GET /api/field/jobs/:id — full job detail
router.get('/:id', async (req, res) => {
  try {
    const { status, ok, data } = await portalFetch(`/api/jobs/${req.params.id}`);
    if (!ok) return res.status(status).json(data);
    res.json(data);
  } catch (e) {
    console.error('[FieldJobs] GET /:id error:', e.message);
    res.status(500).json({ error: 'Failed to load job' });
  }
});

// POST /api/field/jobs — create job in portal via hermes bridge
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (!body.address) return res.status(400).json({ error: 'Address required' });

    // Map field app payload to portal hermes format
    const payload = {
      address: body.address,
      homeownerName: body.homeowner || body.homeownerName || '',
      firstName: (body.homeowner || '').split(' ')[0] || '',
      lastName: (body.homeowner || '').split(' ').slice(1).join(' ') || '',
      phone: body.phone || '',
      email: body.email || '',
      carrier: body.jobCategory === 'retail' ? 'Retail' : (body.carrier || ''),
      claimNumber: body.claimNumber || '',
      notes: body.notes || '',
      repCode: body.repCode || '',
      pipeline: body.jobCategory === 'retail' ? 'retail' : (body.pipeline || 'insurance'),
      jobCategory: body.jobCategory || 'insurance',
      jobType: body.jobType || body.jobTypes?.join(', ') || 'roof_only',
      source: body.source || 'Field App',
      lat: body.lat || null,
      lng: body.lng || null,
      streetViewUrl: body.streetViewUrl || ''
    };

    const { status, ok, data } = await portalFetch('/api/hermes/job', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (!ok) return res.status(status).json(data);
    res.json({ success: true, jobId: data.jobId || data.id, job: data });
  } catch (e) {
    console.error('[FieldJobs] POST / error:', e.message);
    res.status(500).json({ error: 'Failed to create job in portal' });
  }
});

// POST /api/field/jobs/:id/notes
router.post('/:id/notes', async (req, res) => {
  try {
    const { text, repCode, repName } = req.body;
    if (!text) return res.status(400).json({ error: 'Note text required' });
    const { status, ok, data } = await portalFetch(`/api/jobs/${req.params.id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ text, repCode, repName })
    });
    if (!ok) return res.status(status).json(data);
    res.json(data);
  } catch (e) {
    console.error('[FieldJobs] POST notes error:', e.message);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// POST /api/field/jobs/:id/tasks
router.post('/:id/tasks', async (req, res) => {
  try {
    const { text, repCode, dueDate, assignedTo } = req.body;
    if (!text) return res.status(400).json({ error: 'Task text required' });
    const { status, ok, data } = await portalFetch(`/api/jobs/${req.params.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ text, repCode, dueDate, assignedTo })
    });
    if (!ok) return res.status(status).json(data);
    res.json(data);
  } catch (e) {
    console.error('[FieldJobs] POST tasks error:', e.message);
    res.status(500).json({ error: 'Failed to add task' });
  }
});

// PATCH /api/field/jobs/:id/tasks/:taskId
router.patch('/:id/tasks/:taskId', async (req, res) => {
  try {
    const { status, ok, data } = await portalFetch(`/api/jobs/${req.params.id}/tasks/${req.params.taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(req.body)
    });
    if (!ok) return res.status(status).json(data);
    res.json(data);
  } catch (e) {
    console.error('[FieldJobs] PATCH task error:', e.message);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

module.exports = router;
