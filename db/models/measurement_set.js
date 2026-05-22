const { makeModel } = require('./_base');
const { query } = require('../client');

const base = makeModel({
  table: 'measurement_sets',
  pk: 'measurement_set_id',
  columns: [
    'measurement_set_id', 'job_id', 'source', 'source_report_id',
    'total_squares', 'total_area_sf',
    'ridge_lf', 'hip_lf', 'valley_lf', 'eave_lf', 'rake_lf', 'step_flashing_lf',
    'pitch_breakdown', 'siding_total_sf', 'siding_elevations',
    'created_at', 'updated_at',
  ],
});

async function findByJobId(jobId) {
  const { rows } = await query('SELECT * FROM measurement_sets WHERE job_id = $1', [jobId]);
  return rows[0] || null;
}

async function upsertForJob(jobId, patch) {
  const existing = await findByJobId(jobId);
  if (existing) {
    return base.update(existing.measurement_set_id, patch);
  }
  return base.create({ ...patch, job_id: jobId });
}

module.exports = { ...base, findByJobId, upsertForJob };
