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
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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

// PATCH /api/field/jobs/:id — update stage, pipeline, status, drawings
router.patch('/:id', async (req, res) => {
  try {
    const allowed = [
      'stage', 'pipeline', 'subStatus', 'carrier', 'claimNumber', 'estimateValue',
      // CRC Measure drawing layer (satellite + strokes + composite image)
      'roofDiagramClean', 'roofDiagramMarkup', 'roofDiagramStrokes',
      // Field notes whiteboard (separate freehand canvas below the measure diagram)
      'fieldNotesWhiteboard',
      // Claim-filing workflow flag
      'claimFilingReady',
    ];
    const update = {};
    for (const k of allowed) { if (req.body[k] !== undefined) update[k] = req.body[k]; }
    if (!Object.keys(update).length) return res.status(400).json({ error: 'No valid fields to update' });
    const { status, ok, data } = await portalFetch(`/api/jobs/${req.params.id}/fields`, {
      method: 'PATCH',
      body: JSON.stringify(update)
    });
    if (!ok) return res.status(status).json(data);
    res.json({ success: true });
  } catch (e) {
    console.error('[FieldJobs] PATCH /:id error:', e.message);
    res.status(500).json({ error: 'Failed to update job' });
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

// POST /api/field/jobs/:id/photos — upload photo to portal simple-photos
router.post('/:id/photos', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo file' });
    // Forward as multipart to portal
    const FormData = (await import('form-data')).default || require('form-data');
    const fd = new FormData();
    fd.append('photo', req.file.buffer, {
      filename: req.file.originalname || 'photo.jpg',
      contentType: req.file.mimetype || 'image/jpeg',
    });
    if (req.body.label) fd.append('label', req.body.label);
    const response = await fetch(`${PORTAL_URL}/api/jobs/${req.params.id}/simple-photos`, {
      method: 'POST',
      headers: { ...portalHeaders, ...fd.getHeaders() },
      body: fd,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (e) {
    console.error('[FieldJobs] Photo upload error:', e.message);
    res.status(500).json({ error: 'Photo upload failed: ' + e.message });
  }
});

// GET /api/field/jobs/:id/next-steps-pdf — proxy to portal
router.get('/:id/next-steps-pdf', async (req, res) => {
  try {
    const response = await fetch(`${PORTAL_URL}/api/jobs/${req.params.id}/next-steps-pdf`, {
      headers: portalHeaders
    });
    if (!response.ok) return res.status(response.status).json({ error: 'Failed to generate PDF' });
    const buf = await response.arrayBuffer();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', response.headers.get('Content-Disposition') || 'inline');
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch next steps PDF' });
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

// POST /api/field/jobs/:id/photos/markup — proxy photo markup to portal
router.post('/:id/photos/markup', async (req, res) => {
  try {
    const { originalIndex, markupData, strokes } = req.body;
    const { status, ok, data } = await portalFetch(`/api/jobs/${req.params.id}/photos/markup`, {
      method: 'POST',
      body: JSON.stringify({ originalIndex, markupData, strokes })
    });
    if (!ok) return res.status(status).json(data);
    res.json({ success: true, ...data });
  } catch (e) {
    console.error('[FieldJobs] POST photos markup error:', e.message);
    res.status(500).json({ error: 'Failed to save photo markup to portal' });
  }
});

// POST /api/field/jobs/:id/sign — capture authorization agreement signature
// Forwards all fields (incl. authVariant, acknowledgedItems) to the portal so
// the new Property Inspection Authorization PDF can render correctly.
router.post('/:id/sign', async (req, res) => {
  try {
    const { signatureDataUrl, signerName } = req.body || {};
    if (!signatureDataUrl || !signerName) {
      return res.status(400).json({ error: 'signatureDataUrl and signerName are required' });
    }
    const { status, ok, data } = await portalFetch(`/api/jobs/${req.params.id}/authorization-agreement/sign`, {
      method: 'POST',
      body: JSON.stringify(req.body)
    });
    if (!ok) return res.status(status).json(data);
    res.json({ success: true, ...data });
  } catch (e) {
    console.error('[FieldJobs] POST sign error:', e.message);
    res.status(500).json({ error: 'Failed to submit signature' });
  }
});

// PATCH /api/field/jobs/:id/fieldnotes — save field observations to portal
router.patch('/:id/fieldnotes', async (req, res) => {
  try {
    const { status, ok, data } = await portalFetch(`/api/jobs/${req.params.id}/fields`, {
      method: 'PATCH',
      body: JSON.stringify({ fieldNotes: req.body })
    });
    if (!ok) return res.status(status).json(data);
    res.json({ success: true });
  } catch (e) {
    console.error('[FieldJobs] PATCH fieldnotes error:', e.message);
    res.status(500).json({ error: 'Failed to save field notes' });
  }
});

// POST /api/field/checkins — submit daily check-in to portal
router.post('/checkins', async (req, res) => {
  try {
    const { status, ok, data } = await portalFetch('/api/checkins', {
      method: 'POST',
      body: JSON.stringify(req.body)
    });
    if (!ok) return res.status(status).json(data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to submit check-in' });
  }
});

// GET /api/field/checkins/status — who has checked in today
router.get('/checkins/status', async (req, res) => {
  try {
    const { status, ok, data } = await portalFetch('/api/checkins/status');
    if (!ok) return res.status(status).json(data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get check-in status' });
  }
});

module.exports = router;
