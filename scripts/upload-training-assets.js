#!/usr/bin/env node
/**
 * CRC University -- Upload training assets to Cloudinary.
 * 
 * Usage:
 *   node scripts/upload-training-assets.js ~/Downloads/crc-university-exports/
 * 
 * Scans the folder for audio (mp3/wav/m4a), PDFs, and images (png/jpg).
 * Extracts module number from filename (e.g., "mod-0-deep-dive.mp3" -> module 0).
 * Uploads each to Cloudinary under folder crc-university/.
 * Outputs a JSON manifest at data/training-assets.json mapping module+resource to Cloudinary URLs.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUD || !API_KEY || !API_SECRET) {
  console.error('Missing CLOUDINARY env vars in .env');
  process.exit(1);
}

const UPLOAD_DIR = process.argv[2] || path.join(require('os').homedir(), 'Downloads', 'crc-university-exports');
const MANIFEST_PATH = path.join(__dirname, '..', 'data', 'training-assets.json');

// File type mapping
const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.ogg', '.webm'];
const PDF_EXT = ['.pdf'];
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const VIDEO_EXT = ['.mp4', '.webm', '.mov'];

function getResourceType(ext) {
  if (AUDIO_EXT.includes(ext)) return 'video'; // Cloudinary uses 'video' for audio
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (PDF_EXT.includes(ext)) return 'raw';
  return 'raw';
}

function getMediaType(ext) {
  if (AUDIO_EXT.includes(ext)) return 'audio';
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (PDF_EXT.includes(ext)) return 'pdf';
  if (IMAGE_EXT.includes(ext)) return 'image';
  return 'document';
}

// Parse module number and resource type from filename
function parseFilename(filename) {
  const lower = filename.toLowerCase();
  
  // Extract module number: mod-0, mod-1, mod-2, mod-3, mod-4-5, mod-6-7, mod-8-9, mod-10-12, mod-h
  let moduleId = null;
  const modMatch = lower.match(/mod(?:ule)?[- _]?(h|\d+(?:-\d+)?)/);
  if (modMatch) {
    moduleId = 'mod-' + modMatch[1];
  }
  
  // Guess resource type from keywords in filename
  let resourceId = 'unknown';
  const keywords = {
    'deep-dive': ['deep-dive', 'deepdive', 'deep_dive', 'full'],
    'brief': ['brief', 'trailer'],
    'debate': ['debate'],
    'video': ['video'],
    'slides': ['slide', 'deck', 'presentation'],
    'briefing-doc': ['briefing', 'brief-doc', 'briefing-doc'],
    'study-guide': ['study-guide', 'study_guide', 'studyguide'],
    'flashcards': ['flashcard', 'flash-card'],
    'terminology': ['terminology', 'handbook', 'glossary'],
    'quiz': ['quiz', 'assessment', 'test'],
    'mind-map': ['mind-map', 'mindmap', 'mind_map'],
    'infographic': ['infographic', 'info-graphic'],
    'process-overview': ['process-overview', 'process_overview'],
    'ops-manual': ['operations', 'ops-manual', 'ops_manual'],
    'negotiation': ['negotiation', 'framework'],
    'data-table': ['data-table', 'data_table'],
  };
  
  for (const [id, kws] of Object.entries(keywords)) {
    if (kws.some(kw => lower.includes(kw))) {
      resourceId = id;
      break;
    }
  }
  
  return { moduleId, resourceId };
}

// Upload to Cloudinary using the upload API
function uploadToCloudinary(filePath, publicId, resourceType) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'crc-university';
    const params = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
    const signature = crypto.createHash('sha1').update(params + API_SECRET).digest('hex');
    
    const fileData = fs.readFileSync(filePath);
    const boundary = '----FormBoundary' + crypto.randomBytes(8).toString('hex');
    
    const fields = {
      api_key: API_KEY,
      timestamp: timestamp.toString(),
      signature: signature,
      folder: folder,
      public_id: publicId,
    };
    
    let body = '';
    for (const [key, val] of Object.entries(fields)) {
      body += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`;
    }
    
    const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const fileFooter = `\r\n--${boundary}--\r\n`;
    
    const bodyBuffer = Buffer.concat([
      Buffer.from(body + fileHeader, 'utf-8'),
      fileData,
      Buffer.from(fileFooter, 'utf-8'),
    ]);
    
    const options = {
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${CLOUD}/${resourceType}/upload`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length,
      },
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.error) reject(new Error(result.error.message));
          else resolve(result);
        } catch (e) { reject(e); }
      });
    });
    
    req.on('error', reject);
    req.write(bodyBuffer);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    console.log(`Export folder not found: ${UPLOAD_DIR}`);
    console.log('Download NotebookLM exports there first, then re-run.');
    process.exit(0);
  }
  
  const files = fs.readdirSync(UPLOAD_DIR).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return [...AUDIO_EXT, ...PDF_EXT, ...IMAGE_EXT, ...VIDEO_EXT].includes(ext);
  });
  
  if (files.length === 0) {
    console.log('No uploadable files found in', UPLOAD_DIR);
    process.exit(0);
  }
  
  console.log(`Found ${files.length} files to upload\n`);
  
  // Load existing manifest or start fresh
  let manifest = {};
  if (fs.existsSync(MANIFEST_PATH)) {
    try { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')); } catch {}
  }
  
  let uploaded = 0;
  let errors = 0;
  
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const { moduleId, resourceId } = parseFilename(file);
    const resourceType = getResourceType(ext);
    const mediaType = getMediaType(ext);
    const filePath = path.join(UPLOAD_DIR, file);
    const fileSize = fs.statSync(filePath).size;
    
    if (!moduleId) {
      console.log(`  ? Skipping "${file}" -- cannot determine module number`);
      continue;
    }
    
    const publicId = `${moduleId}-${resourceId}`;
    console.log(`  Uploading: ${file} (${(fileSize/1024).toFixed(0)}KB) -> ${publicId} [${resourceType}]`);
    
    try {
      const result = await uploadToCloudinary(filePath, publicId, resourceType);
      
      // Update manifest
      if (!manifest[moduleId]) manifest[moduleId] = {};
      manifest[moduleId][resourceId] = {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        mediaType: mediaType,
        bytes: result.bytes,
        duration: result.duration || null, // for audio/video
        pages: result.pages || null, // for PDFs
        uploadedAt: new Date().toISOString(),
        originalFile: file,
      };
      
      console.log(`    OK: ${result.secure_url}`);
      uploaded++;
    } catch (err) {
      console.log(`    ERROR: ${err.message}`);
      errors++;
    }
  }
  
  // Save manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Uploaded: ${uploaded}  |  Errors: ${errors}  |  Skipped: ${files.length - uploaded - errors}`);
  console.log(`Manifest: ${MANIFEST_PATH}`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
