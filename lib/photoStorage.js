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

/**
 * Upload a photo to Cloudinary under the job's category folder.
 * category = 'inspection' or 'build'
 * tag = sub-category like 'overview', 'roof', 'damage', 'before', 'after', etc.
 */
async function uploadPhoto(fileBuffer, jobId, repCode, tag, category, caption) {
  const cat = category || 'inspection';
  const folder = `crc-field/${jobId}/${cat}`;

  if (configured) {
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          folder,
          tags: [repCode, jobId, tag || 'overview', cat],
          transformation: [{ quality: 'auto', fetch_format: 'auto', width: 1600, crop: 'limit' }],
        }, (err, r) => err ? reject(err) : resolve(r));
        stream.end(fileBuffer);
      });
      return {
        id: result.public_id,
        url: result.secure_url,
        thumbnail: result.secure_url.replace('/upload/', '/upload/w_300,c_fill/'),
        width: result.width, height: result.height,
        tag: tag || 'overview',
        category: cat,
        caption: caption || '',
        repCode, jobId,
        source: 'manual',
        uploadedBy: repCode,
        uploadedAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error('[Photos] Cloudinary upload failed, using base64 fallback:', e.message);
    }
  }

  // Base64 fallback (also used when Cloudinary fails)
  const b64 = fileBuffer.toString('base64');
  const dataUrl = `data:image/jpeg;base64,${b64}`;
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    url: dataUrl, thumbnail: dataUrl,
    width: 0, height: 0,
    tag: tag || 'overview',
    category: cat,
    caption: caption || '',
    repCode, jobId,
    source: 'manual',
    uploadedBy: repCode,
    uploadedAt: new Date().toISOString(),
  };
}

/**
 * Upload a photo from a URL (for Hover/CompanyCam imports).
 */
async function uploadFromUrl(imageUrl, jobId, tag, category, sourceName) {
  const cat = category || 'inspection';
  const folder = `crc-field/${jobId}/${cat}`;

  if (configured) {
    try {
      const result = await cloudinary.uploader.upload(imageUrl, {
        folder,
        tags: [jobId, tag || 'overview', cat, sourceName || 'import'],
        transformation: [{ quality: 'auto', fetch_format: 'auto', width: 1600, crop: 'limit' }],
      });
      return {
        id: result.public_id,
        url: result.secure_url,
        thumbnail: result.secure_url.replace('/upload/', '/upload/w_300,c_fill/'),
        width: result.width, height: result.height,
        tag: tag || 'overview',
        category: cat,
        caption: '',
        repCode: '', jobId,
        source: sourceName || 'import',
        uploadedBy: sourceName || 'import',
        uploadedAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error(`[Photos] URL upload failed for ${sourceName}:`, e.message);
      return null;
    }
  }

  // Fallback: just store the URL directly
  return {
    id: `${sourceName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    url: imageUrl, thumbnail: imageUrl,
    width: 0, height: 0,
    tag: tag || 'overview',
    category: cat,
    caption: '',
    repCode: '', jobId,
    source: sourceName || 'import',
    uploadedBy: sourceName || 'import',
    uploadedAt: new Date().toISOString(),
  };
}

async function deletePhoto(publicId) {
  if (!configured || !publicId || publicId.startsWith('local-')) return false;
  try {
    await cloudinary.uploader.destroy(publicId);
    return true;
  } catch (e) { console.error('[Photos] Delete failed:', e.message); return false; }
}

/**
 * Migrate flat photos array to { inspection: [], build: [] } structure.
 * Called when reading a lead's photos to ensure backward compatibility.
 */
function migratePhotos(lead) {
  if (!lead) return { inspection: [], build: [] };
  const photos = lead.photos;
  // Already in new format
  if (photos && photos.inspection && Array.isArray(photos.inspection)) {
    return photos;
  }
  // Flat array -- migrate all to inspection
  if (Array.isArray(photos)) {
    return {
      inspection: photos.map(p => ({
        ...p,
        category: p.category || 'inspection',
        source: p.source === 'cloudinary' ? 'manual' : (p.source || 'manual'),
        uploadedBy: p.uploadedBy || p.repCode || '',
        caption: p.caption || '',
      })),
      build: [],
    };
  }
  return { inspection: [], build: [] };
}

function isConfigured() { return configured; }

module.exports = { uploadPhoto, uploadFromUrl, deletePhoto, migratePhotos, isConfigured };
