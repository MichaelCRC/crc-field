/**
 * Local sandbox mode — enabled ONLY when FIELD_SANDBOX=1 (set in the local
 * .env, never in any deployed environment). Lets the field app run fully
 * offline for front-end build work: no Postgres, no portal calls. Login uses
 * the on-disk rep-codes.json; jobs live in memory and reset on restart
 * (creating/editing is fine — nothing persists, nothing touches real data).
 *
 * All sandbox logic lives here. The guards in lib/repCodes.js and
 * routes/field-jobs.js are one-line and no-op whenever the flag is off, so
 * this file is the only place to look when iterating on the sandbox.
 */
const fs = require('fs');
const path = require('path');

const enabled = process.env.FIELD_SANDBOX === '1';

// Offline login source: the legacy rep-codes backup file. Its shape already
// matches what validateRepCode expects ({ code, name, role, active }).
function repCodes() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'rep-codes.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const codes = Array.isArray(parsed) ? parsed : (parsed.codes || []);
    return codes.filter((c) => c.active !== false);
  } catch (e) {
    // Minimal fallback so login still works even if the file is missing.
    return [{ code: 'MCG', name: 'Michael McGovern', role: 'admin', active: true }];
  }
}

// Two seed jobs — one insurance (full insurance info), one retail — with the
// superset of fields the list + detail screens read. Add more here freely.
function seed() {
  return [
    {
      id: 'local-ins-001', field_local_id: 'local-ins-001',
      address: '123 Sandbox Dr, Columbus OH 43230',
      homeownerName: 'Jane Sample',
      homeowner: { firstName: 'Jane', lastName: 'Sample', phone: '614-555-0101', email: '', secondaryPhone: '', secondaryEmail: '', spouse: '', bestTime: '', preferredContact: '' },
      phone: '614-555-0101',
      pipeline: 'insurance', jobCategory: 'insurance',
      stage: 'new_lead', subStatus: null,
      carrier: 'State Farm', claimNumber: 'SF-TEST-001',
      adjusterName: '', adjusterPhone: '', adjusterEmail: '', adjusterDate: null,
      simplePhotos: SANDBOX_PHOTOS.slice(),
      jobNotes: [], uploadedDocs: [], authorizations: {}, selections: {},
      measurements: null, claimFilingReady: false,
      repCode: 'MCG', salesRepName: 'Michael McGovern',
      created_at: '2026-05-28T15:00:00.000Z', createdAt: '2026-05-28T15:00:00.000Z',
      lastActivity: '2026-05-28T15:00:00.000Z',
      openTasks: 0, overdueTasks: 0, noteCount: 0, photoCount: 0,
      estimateValue: null, streetViewUrl: '',
    },
    {
      id: 'local-ret-001', field_local_id: 'local-ret-001',
      address: '456 Retail Way, Powell OH 43065',
      homeownerName: 'Bob Retail',
      homeowner: { firstName: 'Bob', lastName: 'Retail', phone: '614-555-0202', email: '', secondaryPhone: '', secondaryEmail: '', spouse: '', bestTime: '', preferredContact: '' },
      phone: '614-555-0202',
      pipeline: 'retail', jobCategory: 'retail',
      stage: 'new_lead', subStatus: null,
      carrier: '', claimNumber: '',
      adjusterName: '', adjusterPhone: '', adjusterEmail: '', adjusterDate: null,
      simplePhotos: SANDBOX_PHOTOS.slice(),
      jobNotes: [], uploadedDocs: [], authorizations: {}, selections: {},
      measurements: null, claimFilingReady: false,
      repCode: 'MCG', salesRepName: 'Michael McGovern',
      created_at: '2026-05-29T15:00:00.000Z', createdAt: '2026-05-29T15:00:00.000Z',
      lastActivity: '2026-05-29T15:00:00.000Z',
      openTasks: 0, overdueTasks: 0, noteCount: 0, photoCount: 0,
      estimateValue: null, streetViewUrl: '',
    },
  ];
}

// Inline SVG placeholders so the report builder has photos to select offline.
function _ph(n, color) {
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='" + color + "'/><text x='50%' y='50%' fill='white' font-size='30' font-family='sans-serif' text-anchor='middle' dominant-baseline='middle'>Roof " + n + "</text></svg>";
  const uri = 'data:image/svg+xml,' + encodeURIComponent(svg);
  return { id: 'ph' + n, url: uri, thumbnail: uri, caption: '', label: '' };
}
const SANDBOX_PHOTOS = [_ph(1, '%231B2360'), _ph(2, '%2300B5CC'), _ph(3, '%23475569')];

let _jobs = enabled ? seed() : [];
let _seq = 0;

function _idx(id) { return _jobs.findIndex((j) => j.id === id || j.field_local_id === id); }

function listJobs(/* repCode */) {
  // Sandbox always returns the full set (login is typically the admin rep).
  return _jobs;
}

function getJob(id) {
  const i = _idx(id);
  return i >= 0 ? _jobs[i] : null;
}

function patchJob(id, fields) {
  const i = _idx(id);
  if (i < 0) return null;
  const j = _jobs[i];
  if (fields && fields.homeowner && typeof fields.homeowner === 'object') {
    j.homeowner = { ...(j.homeowner || {}), ...fields.homeowner };
  }
  for (const k of Object.keys(fields || {})) {
    if (k !== 'homeowner') j[k] = fields[k];
  }
  if (fields && fields.pipeline) j.jobCategory = fields.pipeline; // keep in sync
  j.lastActivity = '2026-05-30T15:00:00.000Z';
  return j;
}

function createJob(body) {
  _seq += 1;
  const b = body || {};
  const id = 'local-new-' + _seq;
  const job = {
    id, field_local_id: id,
    address: b.address || '',
    homeownerName: b.homeowner || b.homeownerName || '',
    homeowner: { firstName: (b.homeowner || '').split(' ')[0] || '', lastName: (b.homeowner || '').split(' ').slice(1).join(' ') || '', phone: b.phone || '', email: b.email || '' },
    phone: b.phone || '',
    pipeline: b.jobCategory || b.pipeline || 'insurance',
    jobCategory: b.jobCategory || 'insurance',
    stage: 'new_lead', subStatus: null,
    carrier: b.carrier || '', claimNumber: '',
    adjusterName: '', adjusterPhone: '', adjusterEmail: '', adjusterDate: null,
    jobNotes: [], uploadedDocs: [], authorizations: {}, selections: {},
    measurements: null, claimFilingReady: false,
    repCode: b.repCode || 'MCG', salesRepName: 'Michael McGovern',
    created_at: '2026-05-31T15:00:00.000Z', createdAt: '2026-05-31T15:00:00.000Z',
    lastActivity: '2026-05-31T15:00:00.000Z',
    openTasks: 0, overdueTasks: 0, noteCount: 0, photoCount: 0,
    estimateValue: null, streetViewUrl: b.streetViewUrl || '',
  };
  _jobs.unshift(job);
  return job;
}

// Sandbox photo "upload": store the captured image in-memory on the job so it
// shows up in the grid + report builder. Resets on restart like everything else.
function addPhoto(id, photo) {
  const j = getJob(id);
  if (!j) return null;
  if (!Array.isArray(j.simplePhotos)) j.simplePhotos = [];
  j.simplePhotos.push(photo);
  j.photoCount = j.simplePhotos.length;
  return photo;
}

function addNote(id, note) {
  const j = getJob(id);
  if (!j) return null;
  if (!Array.isArray(j.jobNotes)) j.jobNotes = [];
  j.jobNotes.unshift(note);
  j.noteCount = j.jobNotes.length;
  return j;
}

module.exports = { enabled, repCodes, listJobs, getJob, patchJob, createJob, addNote, addPhoto };
