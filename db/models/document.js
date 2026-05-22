const { makeModel } = require('./_base');
const { query } = require('../client');

const base = makeModel({
  table: 'documents',
  pk: 'document_id',
  columns: [
    'document_id', 'job_id', 'doc_type', 'filename', 'storage_path',
    'uploaded_by', 'uploaded_at', 'generated_by_system', 'version',
    'created_at', 'updated_at',
  ],
});

async function listByJobId(jobId, docType = null) {
  if (docType) {
    const { rows } = await query(
      'SELECT * FROM documents WHERE job_id = $1 AND doc_type = $2 ORDER BY uploaded_at DESC',
      [jobId, docType]
    );
    return rows;
  }
  const { rows } = await query(
    'SELECT * FROM documents WHERE job_id = $1 ORDER BY uploaded_at DESC',
    [jobId]
  );
  return rows;
}

async function latestByType(jobId, docType) {
  const { rows } = await query(
    'SELECT * FROM documents WHERE job_id = $1 AND doc_type = $2 ORDER BY version DESC, uploaded_at DESC LIMIT 1',
    [jobId, docType]
  );
  return rows[0] || null;
}

module.exports = { ...base, listByJobId, latestByType };
