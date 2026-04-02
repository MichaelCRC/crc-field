/** Photo storage -- Cloudinary if configured, base64 fallback */
const fs = require('fs');
const path = require('path');

let cloudinary = null;
const configured = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY);
if (configured) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('[Photos] Cloudinary configured');
} else {
  console.log('[Photos] No Cloudinary -- using base64 fallback');
}

async function uploadPhoto(fileBuffer, jobId, repCode, tag) {
  if (configured) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder: `crc-field/${jobId}`,
        tags: [repCode, jobId, tag || 'overview'],
        transformation: [{ quality: 'auto', fetch_format: 'auto', width: 1600, crop: 'limit' }],
      }, (err, result) => {
        if (err) return reject(err);
        resolve({
          id: result.public_id,
          url: result.secure_url,
          thumbnail: result.secure_url.replace('/upload/', '/upload/w_300,c_fill/'),
          width: result.width, height: result.height,
          tag: tag || 'overview', repCode, jobId,
          source: 'cloudinary', uploadedAt: new Date().toISOString(),
        });
      });
      stream.end(fileBuffer);
    });
  }
  // Base64 fallback
  const b64 = fileBuffer.toString('base64');
  const mime = 'image/jpeg';
  const dataUrl = `data:${mime};base64,${b64}`;
  return {
    id: `local-${Date.now()}`,
    url: dataUrl, thumbnail: dataUrl,
    width: 0, height: 0,
    tag: tag || 'overview', repCode, jobId,
    source: 'base64', uploadedAt: new Date().toISOString(),
  };
}

async function getJobPhotos(jobId) {
  if (!configured) return [];
  try {
    const result = await cloudinary.search
      .expression(`folder:crc-field/${jobId}`)
      .sort_by('created_at', 'desc')
      .max_results(100)
      .execute();
    return (result.resources || []).map(r => ({
      id: r.public_id, url: r.secure_url,
      thumbnail: r.secure_url.replace('/upload/', '/upload/w_300,c_fill/'),
      width: r.width, height: r.height,
      tags: r.tags || [], uploadedAt: r.created_at,
    }));
  } catch (e) { console.error('[Photos] Cloudinary search failed:', e.message); return []; }
}

async function deletePhoto(publicId) {
  if (!configured || !publicId || publicId.startsWith('local-')) return false;
  try {
    await cloudinary.uploader.destroy(publicId);
    return true;
  } catch (e) { console.error('[Photos] Delete failed:', e.message); return false; }
}

function isConfigured() { return configured; }

module.exports = { uploadPhoto, getJobPhotos, deletePhoto, isConfigured };
