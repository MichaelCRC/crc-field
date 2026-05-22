/**
 * Legacy-shape assembler.
 *
 * The rest of the portal (routes, UI rendering, PDF generators, validators)
 * reads jobs as a single object with nested arrays for scopeVersions, photos,
 * activity, etc. Postgres stores those as separate tables. This module
 * reconstitutes the legacy shape from the canonical Postgres rows at read
 * time. No data lives only in the assembled shape — the source of truth is
 * always the table rows.
 *
 * The shape this returns intentionally matches what handlers/jobManager.js
 * used to read from data/jobs.json so the rest of the portal does not need
 * to change.
 */

// Reverse of the legacy→doctrine stage map in jobManager. Used only when
// metadata.stage is missing (older rows pre-migration); writers always set
// metadata.stage in lockstep with jobs.status going forward.
const DOCTRINE_TO_LEGACY_STAGE = {
  lead: 'new_lead',
  appointment: 'appointment_set',
  inspected: 'inspected',
  estimate_sent: 'estimate_sent',
  sold: 'perfect_packet',
  claim_filed: 'claim_filed',
  adjuster: 'crc_scope_built',
  scope_received: 'scope_received',
  supplement: 'supplementing',
  approved: 'ready_to_collect',
  materials_ordered: 'materials_ordered',
  scheduled: 'scheduled',
  in_progress: 'in_progress',
  complete: 'complete',
  invoiced: 'invoiced',
  closed: 'closed',
};

const customerModel    = require('./models/customer');
const propertyModel    = require('./models/property');
const userModel        = require('./models/user');
const scopeModel       = require('./models/scope_version');
const fieldObsModel    = require('./models/field_observation');
const measurementModel = require('./models/measurement_set');
const photoModel       = require('./models/photo');
const docModel         = require('./models/document');
const activityModel    = require('./models/activity_event');

/**
 * Map a scope_version row → legacy scopeVersion shape.
 *   { id, version, label, type, notes, createdAt, createdBy, archived,
 *     status, lockedForAdjuster, approvedAt, approvedBy, _inputHash, scope }
 */
function _scopeVersionToLegacy(v) {
  if (!v) return null;
  const md = v.line_items === null ? [] : v.line_items;
  const totals = v.totals || {};
  const scope = {
    lineItems: Array.isArray(md) ? md : [],
    summary: totals.summary || totals,
    scopeTotal: typeof totals.scopeTotal === 'number'
      ? totals.scopeTotal
      : (Array.isArray(md) ? Math.round(md.reduce((s, i) => s + (Number(i.rcv) || 0), 0) * 100) / 100 : 0),
  };
  return {
    id: v.scope_version_id,
    version: v.version_number,
    label: v.metadata?.label || `V${v.version_number}`,
    type: v.metadata?.type || 'full',
    notes: v.metadata?.notes || '',
    createdAt: v.created_at,
    createdBy: v.metadata?.createdBy || v.created_by,
    archived: !!v.metadata?.archived,
    status: v.is_approved ? 'approved' : (v.metadata?.status || undefined),
    approvedAt: v.approved_at || undefined,
    approvedBy: v.metadata?.approvedBy || undefined,
    lockedForAdjuster: !!v.metadata?.lockedForAdjuster,
    _inputHash: v.metadata?._inputHash || undefined,
    scope,
  };
}

/**
 * Map an activity_event row → legacy activity entry.
 */
function _activityToLegacy(e) {
  if (!e) return null;
  const p = e.payload || {};
  return {
    type: e.event_type,
    message: p.message || '',
    timestamp: e.created_at,
    author: p.author || 'System',
    ...(p.actor   ? { actor: p.actor } : {}),
    ...(p.source  ? { source: p.source } : {}),
    ...(p.repId   ? { repId: p.repId, repName: p.repName } : {}),
    ...(p.operatorId ? { operatorId: p.operatorId, operatorName: p.operatorName } : {}),
  };
}

/**
 * Map a photo row → legacy photo entry (CompanyCam-style projected from
 * the new normalized table).
 */
function _photoToLegacy(p) {
  if (!p) return null;
  return {
    id: p.photo_id,
    url: p.source_url,
    source: p.source,
    companyCamId: p.companycam_photo_id || undefined,
    cloudinaryPublicId: p.cloudinary_public_id || undefined,
    takenAt: p.taken_at,
    uploadedAt: p.uploaded_at,
    caption: p.caption || '',
    haagTag: p.haag_tag || undefined,
    markupData: p.markup_data || undefined,
    isCover: !!p.is_cover_photo,
    selectedForAdjuster: !!p.selected_for_adjuster,
    analyzed: !!p.analyzed,
    analysisTags: p.analysis_tags || undefined,
  };
}

/**
 * Given a jobs row, fetch and assemble the full legacy shape.
 * Returns null if `row` is null.
 *
 * Performance: 7 queries per job (customer, property, rep, scope_versions,
 * field_observations, measurement_set, photos+activity in parallel). For
 * list calls this is N+1. listJobs() in jobManager batches by doing a single
 * top-level scan, then assembling each row. Future optimization can JOIN.
 */
async function assembleJob(row) {
  if (!row) return null;

  const [customer, property, rep, scopeVersions, fieldObs, measurements, photos, activity, documents] = await Promise.all([
    customerModel.get(row.customer_id),
    propertyModel.get(row.property_id),
    userModel.get(row.sales_rep_id),
    scopeModel.listByJobId(row.job_id),
    fieldObsModel.findByJobId(row.job_id),
    measurementModel.findByJobId(row.job_id),
    photoModel.listByJobId(row.job_id),
    activityModel.listByJobId(row.job_id, { limit: 100 }),
    docModel.listByJobId(row.job_id),
  ]);

  const md = row.metadata || {};
  const activeVersion = scopeVersions.find((v) => v.is_active) || null;
  const activeLegacy = activeVersion ? _scopeVersionToLegacy(activeVersion) : null;

  const cover = photos.find((p) => p.is_cover_photo) || null;

  return {
    // ── identity (doctrine + legacy) ──────────────────────────────────
    id: row.job_id,
    job_id: row.job_id,
    customer_id: row.customer_id,
    property_id: row.property_id,
    sales_rep_id: row.sales_rep_id,
    contactId: row.customer_id,
    propertyId: row.property_id,

    // ── timestamps ────────────────────────────────────────────────────
    created_at: row.created_at,
    updated_at: row.updated_at,
    lastActivity: md.lastActivity || row.updated_at,
    scopeBuiltAt: md.scopeBuiltAt || undefined,

    // ── doctrine first-class ──────────────────────────────────────────
    status: md.legacySupplementStatus || 'intake',  // legacy "status" surface for backwards compat
    stage: md.stage || DOCTRINE_TO_LEGACY_STAGE[row.status] || row.status,  // legacy stage name
    job_type: row.job_type,
    jobType: md.jobType || row.job_type,            // legacy jobType (roof_only / siding_only_vinyl / ...)
    pipeline: row.job_type,                          // alias
    jobCategory: row.job_type,                       // alias
    carrier: row.carrier || '',
    claimNumber: row.claim_number || '',
    dateOfLoss: row.date_of_loss || '',
    adjuster: {
      name: row.adjuster_name || '',
      email: row.adjuster_email || '',
      phone: md.adjusterPhone || '',
    },
    adjusterName: row.adjuster_name || '',
    adjusterEmail: row.adjuster_email || '',
    adjusterPhone: md.adjusterPhone || '',
    finalProjectValue: row.final_project_value ? Number(row.final_project_value) : 0,
    approvedInvoiceTotal: row.approved_invoice_total ? Number(row.approved_invoice_total) : undefined,
    pipelineValue: Number(row.pipeline_value || 0),

    // ── customer / property surface ───────────────────────────────────
    address: property ? property.street_address : (md.address || ''),
    city:    property ? property.city : (md.city || ''),
    state:   property ? property.state : (md.state || ''),
    zip:     property ? property.zip : (md.zip || ''),
    homeowner: customer ? {
      firstName: customer.first_name,
      lastName: customer.last_name,
      phone: customer.primary_phone,
      email: customer.primary_email || '',
    } : { firstName: '', lastName: '', phone: '', email: '' },
    homeownerName: customer ? `${customer.first_name} ${customer.last_name}`.trim() : (md.homeownerName || ''),

    // ── rep surface ───────────────────────────────────────────────────
    repCode: rep ? (rep.rep_code || '') : (md.repCode || ''),
    salesRepName: rep ? rep.name : (md.salesRepName || ''),

    // ── bridge fields (doctrine) ──────────────────────────────────────
    jnJobId: row.jn_job_id || null,
    jnContactId: customer ? customer.jn_contact_id : null,
    field_local_id: row.field_local_id || null,
    hover_job_id: row.hover_job_id || null,
    companyCamProjectId: row.companycam_project_id || null,

    // ── scope (assembled from scope_versions) ─────────────────────────
    scope: activeLegacy ? activeLegacy.scope : null,
    scopeVersions: scopeVersions.map(_scopeVersionToLegacy),
    activeScope: activeVersion ? activeVersion.scope_version_id : null,

    // ── nested entities ───────────────────────────────────────────────
    fieldNotes: fieldObs || null,
    measurements: measurements || null,
    photos: md.photosLegacy || {
      source: null, projectUrl: null, analyzed: false,
      categories: {}, photoCount: photos.length,
    },
    photoRecords: photos.map(_photoToLegacy),
    simplePhotos: md.simplePhotos || [],
    coverPhotoUrl: cover ? cover.source_url : (md.coverPhotoUrl || null),
    photoMode: md.photoMode || 'haag',
    documents: md.documentsLegacy || {
      hoverReport: null, stormReport: null, scopeReport: null, claimsReport: null,
    },
    uploadedDocs: md.uploadedDocs || documents.map((d) => ({
      id: d.document_id,
      category: d.doc_type,
      filename: d.filename,
      path: d.storage_path,
      version: d.version,
      uploadedAt: d.uploaded_at,
    })),
    activity: activity.map(_activityToLegacy),

    // ── metadata passthrough (everything not promoted yet) ────────────
    notes: md.notes || '',
    damageType: md.damageType || 'Hail + Wind',
    policyType: md.policyType || 'RCV',
    deductible: typeof md.deductible === 'number' ? md.deductible : 0,
    subStatus: md.subStatus || null,
    estimateValue: md.estimateValue || null,
    estimateRange: md.estimateRange || null,
    pipelineHistory: md.pipelineHistory || [],
    stageHistory: md.stageHistory || [],
    perfectPacketChecklist: md.perfectPacketChecklist || {},
    scopeValidationLog: md.scopeValidationLog || [],
    carrierScope: md.carrierScope || null,
    supplementApproved: md.supplementApproved || 0,
    targetClaimValue: md.targetClaimValue || 0,          // deprecated
    externalLinks: md.externalLinks || [],               // deprecated
    preExistingLoss: md.preExistingLoss || '',           // deprecated
    jnSyncStatus: md.jnSyncStatus || null,
    jnSyncError: md.jnSyncError || null,
    structures: md.structures || [],
    jobNotes: md.jobNotes || [],
    tasks: md.tasks || [],
    carrierPattern: md.carrierPattern || {},
    stormData: md.stormData || null,
    retailStatus: md.retailStatus || null,
    retailJobTypes: md.retailJobTypes || null,
    retailNotes: md.retailNotes || null,
    repairType: md.repairType || null,
    repairEstimates: md.repairEstimates || [],
  };
}

module.exports = {
  assembleJob,
  _scopeVersionToLegacy,
  _activityToLegacy,
  _photoToLegacy,
};
