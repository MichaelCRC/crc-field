const { makeModel } = require('./_base');
const { query, tx } = require('../client');

const base = makeModel({
  table: 'photos',
  pk: 'photo_id',
  columns: [
    'photo_id', 'job_id', 'source', 'source_url',
    'companycam_photo_id', 'cloudinary_public_id',
    'taken_at', 'uploaded_at', 'caption', 'haag_tag', 'markup_data',
    'is_cover_photo', 'selected_for_adjuster', 'analyzed', 'analysis_tags',
    'created_at', 'updated_at',
  ],
});

async function listByJobId(jobId) {
  const { rows } = await query(
    'SELECT * FROM photos WHERE job_id = $1 ORDER BY uploaded_at DESC',
    [jobId]
  );
  return rows;
}

async function findCoverByJobId(jobId) {
  const { rows } = await query(
    'SELECT * FROM photos WHERE job_id = $1 AND is_cover_photo = TRUE',
    [jobId]
  );
  return rows[0] || null;
}

async function setCover(photoId) {
  return tx(async (client) => {
    const { rows: target } = await client.query(
      'SELECT job_id FROM photos WHERE photo_id = $1',
      [photoId]
    );
    if (target.length === 0) return null;
    const jobId = target[0].job_id;
    await client.query(
      'UPDATE photos SET is_cover_photo = FALSE WHERE job_id = $1 AND photo_id <> $2',
      [jobId, photoId]
    );
    const { rows } = await client.query(
      'UPDATE photos SET is_cover_photo = TRUE WHERE photo_id = $1 RETURNING *',
      [photoId]
    );
    return rows[0] || null;
  });
}

module.exports = { ...base, listByJobId, findCoverByJobId, setCover };
