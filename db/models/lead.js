const { makeModel } = require('./_base');
const { query } = require('../client');

const base = makeModel({
  table: 'leads',
  pk: 'lead_id',
  columns: [
    'lead_id', 'field_local_id', 'portal_job_id',
    'customer_name', 'customer_phone', 'property_address',
    'rep_id', 'storm_id', 'status', 'promoted_at',
    'metadata',
    'created_at', 'updated_at',
  ],
});

async function patchMetadata(leadId, patch) {
  const { rows } = await query(
    `UPDATE leads
        SET metadata = metadata || $2::jsonb,
            updated_at = NOW()
      WHERE lead_id = $1
      RETURNING *`,
    [leadId, JSON.stringify(patch || {})]
  );
  return rows[0] || null;
}

async function findByFieldLocalId(fieldLocalId) {
  const { rows } = await query('SELECT * FROM leads WHERE field_local_id = $1', [fieldLocalId]);
  return rows[0] || null;
}

async function listByRep(repId, { limit = 200, offset = 0 } = {}) {
  const { rows } = await query(
    'SELECT * FROM leads WHERE rep_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [repId, limit, offset]
  );
  return rows;
}

/**
 * Mark a lead as promoted to a portal job. Sets status, portal_job_id, promoted_at.
 */
async function promote(leadId, portalJobId) {
  const { rows } = await query(
    `UPDATE leads
       SET status = 'promoted', portal_job_id = $2, promoted_at = NOW()
     WHERE lead_id = $1
     RETURNING *`,
    [leadId, portalJobId]
  );
  return rows[0] || null;
}

module.exports = { ...base, findByFieldLocalId, listByRep, promote, patchMetadata };
