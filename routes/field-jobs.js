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

const _sandbox = require('../lib/sandbox');  // FIELD_SANDBOX=1: in-memory, no DB/portal. No-op in prod.
const { requireRep } = require('../lib/authGate');
const { isAdmin } = require('../lib/repCodes');

// Fallback host is the LIVE dev portal (system of record), never the retired
// -portal host. Hermes secret has no fallback — a missing secret fails portal
// auth rather than writing under a guessable default.
const PORTAL_URL = process.env.SUPPLEMENT_PORTAL_URL || 'https://crc-supplements-dev.onrender.com';
const HERMES_SECRET = process.env.HERMES_API_SECRET;
const FIELD_APP_KEY = process.env.FIELD_APP_KEY || 'crc-field-2026';

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

// GET /api/field/jobs  — My Jobs, sourced from the LIVE portal (system of record).
//
// The Postgres `jobs` table is a frozen migration snapshot (last synced ~May 24)
// and never receives app-created jobs, so it's no longer read here. Instead we
// read the live portal /api/jobs list, which the portal filters to the rep's
// own jobs. Access is gated server-side by requireRep (the real kill switch):
// a deactivated rep is rejected even with a cached client session. Reps are
// always scoped to their own repCode; only an admin asking for ?all=1 sees the
// whole company.
router.get('/', requireRep, async (req, res) => {
  if (_sandbox.enabled) return res.json(_sandbox.listJobs(req.repCode));
  try {
    const wantsAll = req.query.all === '1' || req.query.all === 'true';
    const adminAll = wantsAll && isAdmin(req.repCode);
    const targetRep = adminAll ? '' : req.repCode;   // non-admins always scoped to self

    const qs = targetRep ? ('?repCode=' + encodeURIComponent(targetRep)) : '';
    const { ok, status, data } = await portalFetch('/api/jobs' + qs, {
      headers: { 'x-field-app-key': FIELD_APP_KEY, 'x-field-rep': req.repCode }
    });
    if (!ok) return res.status(status).json({ error: 'Portal jobs fetch failed', detail: data });

    const list = Array.isArray(data) ? data : (Array.isArray(data.jobs) ? data.jobs : []);
    const now = new Date();
    const jobs = list.map(j => {
      const tasks = Array.isArray(j.tasks) ? j.tasks : [];
      const jobNotes = Array.isArray(j.jobNotes) ? j.jobNotes : [];
      const ho = j.homeowner || {};
      return {
        id: j.id,
        address: j.address || '',
        homeownerName: j.homeownerName || `${ho.firstName || ''} ${ho.lastName || ''}`.trim(),
        homeowner: { firstName: ho.firstName || '', lastName: ho.lastName || '', phone: ho.phone || '' },
        phone: ho.phone || j.phone || '',
        pipeline: j.jobCategory || j.pipeline || 'insurance',
        stage: j.stage || 'new_lead',
        subStatus: j.subStatus || null,
        carrier: j.carrier || '',
        claimNumber: j.claimNumber || '',
        adjusterDate: j.adjusterDate || (j.adjuster && j.adjuster.date) || null,
        repCode: j.repCode || '',
        lastActivity: j.lastActivity || j.updated_at || j.created_at,
        createdAt: j.created_at || j.createdAt,
        openTasks: tasks.filter(t => !t.completed).length,
        overdueTasks: tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now).length,
        noteCount: jobNotes.length,
        photoCount: (j.photos && j.photos.photoCount) || (Array.isArray(j.simplePhotos) ? j.simplePhotos.length : 0),
        estimateValue: j.estimateValue || null,
        streetViewUrl: j.streetViewUrl || null,
      };
    });

    jobs.sort((a, b) => {
      if (b.overdueTasks !== a.overdueTasks) return b.overdueTasks - a.overdueTasks;
      return new Date(b.lastActivity) - new Date(a.lastActivity);
    });

    res.json(jobs);
  } catch (e) {
    console.error('[FieldJobs] GET / portal-read error:', e?.message || e);
    res.status(500).json({ error: 'Failed to load jobs', detail: e?.message });
  }
});

// Rewrite relative portal photo URLs to absolute so img tags in the field app
// resolve against the portal origin instead of crc-field.onrender.com (where
// /api/jobs/.../photo-file/... doesn't exist -> 404 -> "Photo unavailable").
// Only rewrites paths that start with "/api/" -- CompanyCam CDN URLs,
// base64 markup dataURLs, and anything already absolute pass through untouched.
function _absolutizePhotoUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('/api/')) return PORTAL_URL + url;
  return url;
}
function _rewritePhotoArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(function(p) {
    if (!p || typeof p !== 'object') return p;
    return Object.assign({}, p, {
      url: _absolutizePhotoUrl(p.url),
      thumbnail: _absolutizePhotoUrl(p.thumbnail),
      originalUrl: _absolutizePhotoUrl(p.originalUrl),
    });
  });
}

// GET /api/field/jobs/:id — full job detail
router.get('/:id', async (req, res) => {
  if (_sandbox.enabled) {
    const j = _sandbox.getJob(req.params.id);
    return j ? res.json(j) : res.status(404).json({ error: 'Job not found (sandbox)' });
  }
  try {
    const { status, ok, data } = await portalFetch(`/api/jobs/${req.params.id}`);
    if (!ok) return res.status(status).json(data);
    // Absolutize photo URLs across every bucket the field app aggregates from.
    if (data && typeof data === 'object') {
      if (data.simplePhotos) data.simplePhotos = _rewritePhotoArray(data.simplePhotos);
      if (data.fieldPhotos)  data.fieldPhotos  = _rewritePhotoArray(data.fieldPhotos);
      if (data.markupPhotos) data.markupPhotos = _rewritePhotoArray(data.markupPhotos);
      if (data.photos && Array.isArray(data.photos.rawPhotos)) {
        data.photos = Object.assign({}, data.photos, { rawPhotos: _rewritePhotoArray(data.photos.rawPhotos) });
      }
    }
    res.json(data);
  } catch (e) {
    console.error('[FieldJobs] GET /:id error:', e.message);
    res.status(500).json({ error: 'Failed to load job' });
  }
});

// POST /api/field/jobs — create job in portal via hermes bridge
router.post('/', async (req, res) => {
  if (_sandbox.enabled) {
    if (!req.body || !req.body.address) return res.status(400).json({ error: 'Address required' });
    const job = _sandbox.createJob(req.body);
    return res.json({ success: true, jobId: job.id, job });
  }
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
  if (_sandbox.enabled) {
    const j = _sandbox.patchJob(req.params.id, req.body || {});
    return j ? res.json({ success: true, job: j }) : res.status(404).json({ error: 'Job not found (sandbox)' });
  }
  try {
    const allowed = [
      'stage', 'pipeline', 'subStatus', 'carrier', 'claimNumber', 'estimateValue',
      'adjusterName', 'adjusterPhone', 'adjusterEmail', 'adjusterDate',
      // Homeowner enrichment (v3.1 section 5 line 10) — whole homeowner object;
      // the portal routes its sub-fields to canonical customers columns.
      'homeowner',
      // CRC Measure drawing layer (satellite + strokes + composite image)
      'roofDiagramClean', 'roofDiagramMarkup', 'roofDiagramStrokes',
      // Field notes whiteboard (separate freehand canvas below the measure diagram)
      'fieldNotesWhiteboard',
      // Field observations (from camera quick-fill)
      'fieldNotes',
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
  if (_sandbox.enabled) {
    const { text, repName } = req.body || {};
    if (!text) return res.status(400).json({ error: 'Note text required' });
    _sandbox.addNote(req.params.id, { id: 'n' + Date.now(), text, author: repName || 'Me', createdAt: '2026-05-30T15:00:00.000Z' });
    return res.json({ success: true });
  }
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
  if (_sandbox.enabled) {
    if (!req.file) return res.status(400).json({ error: 'No photo file' });
    const dataUri = 'data:' + (req.file.mimetype || 'image/jpeg') + ';base64,' + req.file.buffer.toString('base64');
    const photo = { id: 'up' + req.file.size + '-' + req.file.buffer.length, url: dataUri, thumbnail: dataUri, caption: req.body.label || '', label: req.body.label || '' };
    _sandbox.addPhoto(req.params.id, photo);
    return res.json({ success: true, photo });
  }
  try {
    // Diagnostic: capture what reached this handler after multer ran. If
    // hasFile is false while Content-Type is multipart, the field name or
    // boundary is the issue. If Content-Type is wrong entirely, the client
    // is sending the wrong body.
    console.log('[photo-upload-incoming]', {
      contentType: req.headers['content-type'],
      hasFile: !!req.file,
      fileMimeType: req.file?.mimetype,
      fileSize: req.file?.size,
      fileOriginalName: req.file?.originalname,
    });
    if (!req.file) return res.status(400).json({ error: 'No photo file' });
    // Forward as multipart to portal using WHATWG FormData + Blob. The
    // form-data npm package (Node stream-based) does NOT serialize reliably
    // through Node's native fetch (undici): undici consumes the stream but
    // the boundary in fd.getHeaders() frequently doesn't match what actually
    // ends up in the request body, so portal multer finds no 'photo' field
    // and returns 400 "No file". Native FormData works natively with fetch,
    // auto-sets Content-Type with the correct boundary. Portal expects
    // field name 'photo' (confirmed at portal/server.js:1347).
    const form = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'image/jpeg' });
    form.append('photo', blob, req.file.originalname || 'photo.jpg');
    if (req.body.label) form.append('label', req.body.label);
    const response = await fetch(`${PORTAL_URL}/api/jobs/${req.params.id}/simple-photos`, {
      method: 'POST',
      // Only include hermes auth -- do NOT spread portalHeaders (it contains
      // Content-Type: application/json which would clobber the multipart
      // boundary header that fetch adds automatically for FormData bodies).
      headers: { 'x-hermes-secret': HERMES_SECRET },
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.log('[photo-upload-portal-rejected]', {
        portalStatus: response.status,
        portalBody: data,
      });
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (e) {
    console.error('[FieldJobs] Photo upload error:', e.message);
    res.status(500).json({ error: 'Photo upload failed: ' + e.message });
  }
});

// In sandbox, report generation has no portal to call — return a fake success
// so the builder's success screen renders and the full flow is demoable.
function _sandboxReport(res) {
  return res.json({ success: true, url: '/sandbox/report-preview.pdf', sandbox: true });
}

// POST /api/field/jobs/:id/photo-inspection-report — proxy PDF build
router.post('/:id/photo-inspection-report', async (req, res) => {
  if (_sandbox.enabled) return _sandboxReport(res);
  try {
    const { status, ok, data } = await portalFetch(`/api/jobs/${req.params.id}/photo-inspection-report`, {
      method: 'POST',
      body: JSON.stringify(req.body)
    });
    if (!ok) return res.status(status).json(data);
    res.json(data);
  } catch (e) {
    console.error('[FieldJobs] photo-report error:', e.message);
    res.status(500).json({ error: 'Failed to build Photo Inspection Report' });
  }
});

// POST /api/field/jobs/:id/claim-filing-package — proxy PDF build
router.post('/:id/claim-filing-package', async (req, res) => {
  if (_sandbox.enabled) return _sandboxReport(res);
  try {
    const { status, ok, data } = await portalFetch(`/api/jobs/${req.params.id}/claim-filing-package`, {
      method: 'POST',
      body: JSON.stringify(req.body)
    });
    if (!ok) return res.status(status).json(data);
    res.json(data);
  } catch (e) {
    console.error('[FieldJobs] claim-filing error:', e.message);
    res.status(500).json({ error: 'Failed to build Claim Filing Package' });
  }
});

// POST /api/field/jobs/:id/insurance-report — proxy PDF build (v3.1 Create Report)
router.post('/:id/insurance-report', async (req, res) => {
  if (_sandbox.enabled) return _sandboxReport(res);
  try {
    const { status, ok, data } = await portalFetch(`/api/jobs/${req.params.id}/insurance-report`, {
      method: 'POST',
      body: JSON.stringify(req.body)
    });
    if (!ok) return res.status(status).json(data);
    res.json(data);
  } catch (e) {
    console.error('[FieldJobs] insurance-report error:', e.message);
    res.status(500).json({ error: 'Failed to build Insurance Report' });
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

// DELETE /api/field/jobs/:id/photos/:photoId — proxy delete to portal
router.delete('/:id/photos/:photoId', async (req, res) => {
  try {
    const response = await fetch(`${PORTAL_URL}/api/jobs/${req.params.id}/simple-photos/${encodeURIComponent(req.params.photoId)}`, {
      method: 'DELETE', headers: portalHeaders
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json(data);
    res.json({ success: true });
  } catch (e) {
    console.error('[FieldJobs] DELETE photo error:', e.message);
    res.status(500).json({ error: 'Failed to delete photo' });
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
