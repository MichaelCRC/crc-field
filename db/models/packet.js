const { makeModel } = require('./_base');
const { query } = require('../client');

const base = makeModel({
  table: 'packets',
  pk: 'packet_id',
  columns: [
    'packet_id', 'job_id', 'packet_type', 'validation_status',
    'validation_checks', 'generated_at',
    'approved_by', 'sent_at', 'sent_by', 'document_id',
    'created_at', 'updated_at',
  ],
});

async function listByJobId(jobId, packetType = null) {
  if (packetType) {
    const { rows } = await query(
      'SELECT * FROM packets WHERE job_id = $1 AND packet_type = $2 ORDER BY generated_at DESC',
      [jobId, packetType]
    );
    return rows;
  }
  const { rows } = await query(
    'SELECT * FROM packets WHERE job_id = $1 ORDER BY generated_at DESC',
    [jobId]
  );
  return rows;
}

async function markSent(packetId, sentByUserId) {
  const { rows } = await query(
    `UPDATE packets SET sent_at = NOW(), sent_by = $2 WHERE packet_id = $1 RETURNING *`,
    [packetId, sentByUserId]
  );
  return rows[0] || null;
}

async function markApproved(packetId, approvedByUserId) {
  const { rows } = await query(
    `UPDATE packets SET approved_by = $2 WHERE packet_id = $1 RETURNING *`,
    [packetId, approvedByUserId]
  );
  return rows[0] || null;
}

module.exports = { ...base, listByJobId, markSent, markApproved };
