const { makeModel } = require('./_base');
const { query } = require('../client');

const base = makeModel({
  table: 'field_observations',
  pk: 'field_observation_id',
  columns: [
    'field_observation_id', 'job_id',
    'roof_pitch', 'stories', 'facets',
    'existing_shingle_type', 'existing_underlayment',
    'valleys', 'flashing_condition',
    'skylights', 'chimneys', 'vents',
    'gutter_condition', 'siding_damage', 'siding_area_sf', 'notes',
    'created_at', 'updated_at',
  ],
});

async function findByJobId(jobId) {
  const { rows } = await query('SELECT * FROM field_observations WHERE job_id = $1', [jobId]);
  return rows[0] || null;
}

/**
 * Upsert by job_id since field_observations is 1:1 with jobs.
 */
async function upsertForJob(jobId, patch) {
  const existing = await findByJobId(jobId);
  if (existing) {
    return base.update(existing.field_observation_id, patch);
  }
  return base.create({ ...patch, job_id: jobId });
}

module.exports = { ...base, findByJobId, upsertForJob };
