const { makeModel } = require('./_base');
const { query } = require('../client');

const base = makeModel({
  table: 'jobs',
  pk: 'job_id',
  columns: [
    'job_id', 'customer_id', 'property_id', 'sales_rep_id',
    'status', 'job_type', 'carrier', 'claim_number',
    'adjuster_name', 'adjuster_email', 'date_of_loss',
    'approved_invoice_total', 'final_project_value', 'pipeline_value',
    'jn_job_id', 'field_local_id', 'hover_job_id', 'companycam_project_id',
    'metadata',
    'created_at', 'updated_at',
  ],
});

/**
 * Merge a patch into metadata at the top level. Shallow merge — explicit
 * keys override existing keys. Use this when handler code wants to set
 * a few legacy fields without rebuilding the whole jsonb blob.
 */
async function patchMetadata(jobId, patch) {
  const { rows } = await query(
    `UPDATE jobs
        SET metadata = metadata || $2::jsonb,
            updated_at = NOW()
      WHERE job_id = $1
      RETURNING *`,
    [jobId, JSON.stringify(patch || {})]
  );
  return rows[0] || null;
}

async function findByJnJobId(jnJobId) {
  const { rows } = await query('SELECT * FROM jobs WHERE jn_job_id = $1', [jnJobId]);
  return rows[0] || null;
}

async function findByFieldLocalId(fieldLocalId) {
  const { rows } = await query('SELECT * FROM jobs WHERE field_local_id = $1', [fieldLocalId]);
  return rows[0] || null;
}

async function findByCompanyCamProjectId(ccProjectId) {
  const { rows } = await query('SELECT * FROM jobs WHERE companycam_project_id = $1', [ccProjectId]);
  return rows[0] || null;
}

async function listByRep(salesRepId, { limit = 200, offset = 0 } = {}) {
  const { rows } = await query(
    'SELECT * FROM jobs WHERE sales_rep_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [salesRepId, limit, offset]
  );
  return rows;
}

module.exports = {
  ...base,
  findByJnJobId,
  findByFieldLocalId,
  findByCompanyCamProjectId,
  listByRep,
  patchMetadata,
};
