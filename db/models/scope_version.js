const { makeModel } = require('./_base');
const { query, tx } = require('../client');

const base = makeModel({
  table: 'scope_versions',
  pk: 'scope_version_id',
  columns: [
    'scope_version_id', 'job_id', 'version_number', 'created_by',
    'source_chat_transcript_id', 'is_active', 'is_approved', 'approved_at',
    'line_items', 'totals', 'metadata', 'created_at', 'updated_at',
  ],
});

/**
 * Shallow-merge a patch into scope_versions.metadata.
 */
async function patchMetadata(scopeVersionId, patch) {
  const { rows } = await query(
    `UPDATE scope_versions
        SET metadata = metadata || $2::jsonb,
            updated_at = NOW()
      WHERE scope_version_id = $1
      RETURNING *`,
    [scopeVersionId, JSON.stringify(patch || {})]
  );
  return rows[0] || null;
}

async function listByJobId(jobId) {
  const { rows } = await query(
    'SELECT * FROM scope_versions WHERE job_id = $1 ORDER BY version_number ASC',
    [jobId]
  );
  return rows;
}

async function findActiveByJobId(jobId) {
  const { rows } = await query(
    'SELECT * FROM scope_versions WHERE job_id = $1 AND is_active = TRUE',
    [jobId]
  );
  return rows[0] || null;
}

/**
 * Set a specific version as active. Atomically clears other active flags on
 * the same job, then sets this one. Enforced at DB level by the partial unique
 * index idx_scope_versions_active_per_job.
 */
async function setActive(scopeVersionId) {
  return tx(async (client) => {
    const { rows: target } = await client.query(
      'SELECT job_id FROM scope_versions WHERE scope_version_id = $1',
      [scopeVersionId]
    );
    if (target.length === 0) return null;
    const jobId = target[0].job_id;
    await client.query(
      'UPDATE scope_versions SET is_active = FALSE WHERE job_id = $1 AND scope_version_id <> $2',
      [jobId, scopeVersionId]
    );
    const { rows } = await client.query(
      'UPDATE scope_versions SET is_active = TRUE WHERE scope_version_id = $1 RETURNING *',
      [scopeVersionId]
    );
    return rows[0] || null;
  });
}

async function nextVersionNumber(jobId) {
  const { rows } = await query(
    'SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM scope_versions WHERE job_id = $1',
    [jobId]
  );
  return rows[0].next;
}

module.exports = {
  ...base,
  listByJobId,
  findActiveByJobId,
  setActive,
  nextVersionNumber,
  patchMetadata,
};
