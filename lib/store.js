/**
 * Field-app store — Postgres-backed for leads, file-backed for everything
 * else that's field-app-only and not in the schema doctrine.
 *
 * Step 5 of the Postgres migration replaced the leads.json read/write path
 * with the leads model. Public function names are unchanged but every
 * lead-touching function is now async. Callers must await.
 *
 * Out of scope for this step (still flat-file):
 *   zones.json         — direct-mail storm zones, field-app-only
 *   crc-data-core.json — DEPRECATED. upsertDataCore is now a no-op; the
 *                        file remains on disk as backup until the
 *                        eventual cleanup pass.
 *   read/write helpers — still used for the above and for brain-chats,
 *                        chat, applications, training-assets, etc.
 *
 * Doctrine references:
 *   - CRC_SCHEMA_DOCTRINE.md §2.10 Lead — leads are pre-CRM rows that
 *     carry a denormalized customer_name/customer_phone/property_address
 *     copy. Promotion to a job triggers customer/property/job creation.
 *   - The legacy lead.id (Date.now() string) maps to leads.field_local_id
 *     bridge column.
 */

const fs = require('fs');
const path = require('path');

const leadModel = require('../db/models/lead');
const userModel = require('../db/models/user');
const { query } = require('../db/client');

const DATA_DIR = path.join(__dirname, '..', 'data');

// ── File helpers (kept for non-doctrine files only) ─────────────────────
function read(file, fallback) {
  const fp = path.join(DATA_DIR, file);
  try { if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch {}
  return fallback;
}
function write(file, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// ── Status mapping ──────────────────────────────────────────────────────
// Legacy status strings ↔ doctrine lead_status enum. The legacy app uses
// 'claim_filed' to signal promotion-ready; doctrine uses 'promoted'.
const LEGACY_TO_DOCTRINE_LEAD_STATUS = {
  new: 'new',
  contacted: 'contacted',
  appointment_set: 'appointment_set',
  appointment: 'appointment_set',
  claim_filed: 'promoted',
  promoted: 'promoted',
  dead: 'dead',
  rejected: 'dead',
};
const DOCTRINE_TO_LEGACY_LEAD_STATUS = {
  new: 'new',
  contacted: 'contacted',
  appointment_set: 'appointment_set',
  promoted: 'claim_filed',  // legacy callers branch on this string
  dead: 'dead',
};

// ── Rep lookup ──────────────────────────────────────────────────────────
// rep_id is NOT NULL on leads. Resolve from rep_code (case-insensitive);
// fall back to the CEO seat (Michael) if rep_code is missing or unknown.
// Cache for the duration of the process to avoid hammering the DB on
// every lead create.
const _repCache = new Map();
let _ceoUserId = null;
async function _ceoSeat() {
  if (_ceoUserId) return _ceoUserId;
  const u = await userModel.findByEmail('michael@columbusroofingco.com');
  if (!u) throw new Error('[store] CEO seat not found in users table — cannot resolve fallback rep_id');
  _ceoUserId = u.user_id;
  return _ceoUserId;
}
async function _resolveRepId(repCode) {
  const code = (repCode || '').toUpperCase().trim();
  if (!code) return _ceoSeat();
  if (_repCache.has(code)) return _repCache.get(code);
  const u = await userModel.findByRepCode(code);
  const id = u ? u.user_id : await _ceoSeat();
  _repCache.set(code, id);
  return id;
}

// ── Legacy-shape projector ──────────────────────────────────────────────
function _toLegacy(row, repCode) {
  if (!row) return null;
  const md = row.metadata || {};
  return {
    id: row.field_local_id,
    lead_id: row.lead_id,
    address: md.address || row.property_address || '',
    city: md.city || '',
    state: md.state || 'OH',
    zip: md.zip || '',
    lat: typeof md.lat === 'number' ? md.lat : null,
    lng: typeof md.lng === 'number' ? md.lng : null,
    county: md.county || '',
    homeowner: row.customer_name || '',
    phone: row.customer_phone || '',
    email: md.email || '',
    jobType: md.jobType || 'Roof',
    jobTypes: md.jobTypes || [md.jobType || 'Roof'],
    jobCategory: md.jobCategory || 'insurance',
    source: md.source || 'Door Knock',
    notes: md.notes || '',
    status: DOCTRINE_TO_LEGACY_LEAD_STATUS[row.status] || row.status,
    repCode: md.repCode || repCode || '',
    photos: md.photos || [],
    measurements: md.measurements || null,
    hoverId: md.hoverId || null,
    ownerName: md.ownerName || '',
    mailingAddress: md.mailingAddress || '',
    yearBuilt: md.yearBuilt || null,
    assessedValue: md.assessedValue || null,
    propertyClass: md.propertyClass || 'residential',
    absenteeOwner: !!md.absenteeOwner,
    streetViewUrl: md.streetViewUrl || '',
    portalJobId: row.portal_job_id,
    homeownerPortalSync: md.homeownerPortalSync || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Leads (Postgres-backed, async) ──────────────────────────────────────

async function listLeads() {
  const rows = await leadModel.list({ limit: 1000, orderBy: 'created_at', orderDir: 'DESC' });
  return rows.map((r) => _toLegacy(r));
}

async function getLead(id) {
  if (!id) return null;
  // Field-app callers pass the legacy Date.now()-string id (field_local_id),
  // never the UUID. Look up by bridge field.
  const row = await leadModel.findByFieldLocalId(String(id));
  return _toLegacy(row);
}

async function createLead(data) {
  const repCode = (data.repCode || '').toUpperCase().trim();
  const repId = await _resolveRepId(repCode);

  const fieldLocalId = data.id ? String(data.id) : Date.now().toString();
  const status = LEGACY_TO_DOCTRINE_LEAD_STATUS[data.status || 'new'] || 'new';

  // Build the metadata blob with every non-first-class legacy field.
  const metadata = {
    address: data.address || '',
    city: data.city || '',
    state: data.state || 'OH',
    zip: data.zip || '',
    lat: typeof data.lat === 'number' ? data.lat : null,
    lng: typeof data.lng === 'number' ? data.lng : null,
    county: data.county || '',
    email: data.email || '',
    jobType: data.jobType || 'Roof',
    jobTypes: data.jobTypes || [data.jobType || 'Roof'],
    jobCategory: data.jobCategory || 'insurance',
    source: data.source || 'Door Knock',
    notes: data.notes || '',
    repCode,
    photos: data.photos || [],
    measurements: data.measurements || null,
    hoverId: data.hoverId || null,
    ownerName: data.ownerName || '',
    mailingAddress: data.mailingAddress || '',
    yearBuilt: data.yearBuilt || null,
    assessedValue: data.assessedValue || null,
    propertyClass: data.propertyClass || 'residential',
    absenteeOwner: !!data.absenteeOwner,
    streetViewUrl: data.streetViewUrl || '',
  };

  const inserted = await query(
    `INSERT INTO leads (field_local_id, portal_job_id, customer_name, customer_phone,
                        property_address, rep_id, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING *`,
    [
      fieldLocalId,
      data.portalJobId || null,
      data.homeowner || '',
      data.phone || '',
      data.address || '',
      repId,
      status,
      JSON.stringify(metadata),
    ]
  );
  return _toLegacy(inserted.rows[0], repCode);
}

async function updateLead(id, updates) {
  const row = await leadModel.findByFieldLocalId(String(id));
  if (!row) return null;

  // Partition updates into first-class columns vs metadata.
  const FIRST_CLASS_COLUMNS = new Set([
    'portal_job_id', 'customer_name', 'customer_phone', 'property_address',
    'rep_id', 'status', 'storm_id', 'promoted_at',
  ]);
  const ALIASES = {
    portalJobId: 'portal_job_id',
    homeowner: 'customer_name',
    phone: 'customer_phone',
    address: 'property_address',   // also stays in metadata for parity
  };

  const colPatch = {};
  const mdPatch = {};

  for (const [k, v] of Object.entries(updates)) {
    if (k === 'status') {
      colPatch.status = LEGACY_TO_DOCTRINE_LEAD_STATUS[v] || v;
      if (colPatch.status === 'promoted' && !row.promoted_at) {
        colPatch.promoted_at = new Date().toISOString();
      }
      continue;
    }
    if (k === 'repCode') {
      colPatch.rep_id = await _resolveRepId(v);
      mdPatch.repCode = (v || '').toUpperCase().trim();
      continue;
    }
    const alias = ALIASES[k];
    if (alias) {
      colPatch[alias] = v;
      // Also keep address in metadata so the projector sees changes either way.
      if (k === 'address') mdPatch.address = v;
      continue;
    }
    if (FIRST_CLASS_COLUMNS.has(k)) { colPatch[k] = v; continue; }
    // updatedAt is auto-managed by the trigger; ignore.
    if (k === 'updatedAt') continue;
    mdPatch[k] = v;
  }

  if (Object.keys(colPatch).length) {
    await leadModel.update(row.lead_id, colPatch);
  }
  if (Object.keys(mdPatch).length) {
    await leadModel.patchMetadata(row.lead_id, mdPatch);
  }

  const after = await leadModel.get(row.lead_id);
  return _toLegacy(after);
}

// ── Zones (still file-backed; field-app-only, not in doctrine) ──────────
function listZones() { return read('zones.json', { zones: [] }).zones; }
function createZone(data) {
  const file = read('zones.json', { zones: [] });
  const zone = { id: 'zone-' + Date.now(), ...data, createdAt: new Date().toISOString() };
  file.zones.push(zone);
  write('zones.json', file);
  return zone;
}

// ── Data Core — DEPRECATED, no-op at runtime ────────────────────────────
// Previously every lead create wrote to crc-data-core.json. That file is
// not in the schema doctrine and the audit confirmed no UI reads it. We
// stop writing it now. The on-disk file stays for backup.
function upsertDataCore(_lead) { /* no-op */ }
function getDataCore() { return read('crc-data-core.json', { contacts: [], properties: [], lists: {}, metadata: {} }); }

module.exports = {
  listLeads, getLead, createLead, updateLead,
  listZones, createZone,
  getDataCore, upsertDataCore,
  read, write,
};
