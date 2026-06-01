const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { read, write } = require('../lib/store');
const { listRepCodes, validateRepCode, isAdmin } = require('../lib/repCodes');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const CARDS_FILE = 'rep-cards.json';
const CODES_FILE = 'rep-codes.json';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper: get card data for a code
function getCard(code) {
  const cards = read(CARDS_FILE, {});
  return cards[code] || null;
}

// Helper: get merged card + rep-code data
function getMergedCard(code) {
  const rep = validateRepCode(code);
  if (!rep) return null;
  const card = getCard(code) || {};
  return {
    code: code,
    name: card.name || rep.name || '',
    title: card.title || rep.title || '',
    role: rep.role || '',
    department: rep.department || '',
    phone: card.phone || '',
    email: card.email || '',
    bio: card.bio || rep.bio || '',
    photo: card.photo || '',
    linkedin: card.linkedin || '',
    instagram: card.instagram || '',
    years_experience: rep.years_experience || null,
    specialties: rep.specialties || [],
    style: rep.style || null,
    company: 'Columbus Roofing Company',
    license: 'HIC-L00838',
    active: rep.active,
    updatedAt: card.updatedAt || ''
  };
}

// ─── API ROUTES ───────────────────────────────────────────────────────

// GET /api/rep-card/:code — return merged card data
router.get('/api/rep-card/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const merged = getMergedCard(code);
  if (!merged) return res.status(404).json({ error: 'Rep not found' });
  res.json(merged);
});

// PATCH /api/rep-cards/:code — update card fields
router.patch('/api/rep-cards/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const auth = (req.query.auth || '').toUpperCase();

  if (!auth) return res.status(401).json({ error: 'Auth required' });

  const authRep = validateRepCode(auth);
  if (!authRep) return res.status(401).json({ error: 'Invalid auth code' });

  // Rep can only edit their own card unless admin
  if (auth !== code && !isAdmin(auth)) {
    return res.status(403).json({ error: 'You can only edit your own card' });
  }

  // Validate target rep exists
  const targetRep = validateRepCode(code);
  if (!targetRep) return res.status(404).json({ error: 'Rep not found' });

  const cards = read(CARDS_FILE, {});
  const existing = cards[code] || {};

  const allowed = ['name', 'title', 'phone', 'email', 'bio', 'linkedin', 'instagram'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      existing[key] = req.body[key];
    }
  }
  existing.updatedAt = new Date().toISOString();
  cards[code] = existing;
  write(CARDS_FILE, cards);

  res.json({ ok: true, card: getMergedCard(code) });
});

// POST /api/rep-cards/:code/photo — upload photo to Cloudinary
router.post('/api/rep-cards/:code/photo', upload.single('photo'), async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const auth = (req.query.auth || '').toUpperCase();

    if (!auth) return res.status(401).json({ error: 'Auth required' });
    const authRep = validateRepCode(auth);
    if (!authRep) return res.status(401).json({ error: 'Invalid auth code' });
    if (auth !== code && !isAdmin(auth)) {
      return res.status(403).json({ error: 'You can only edit your own card' });
    }

    const targetRep = validateRepCode(code);
    if (!targetRep) return res.status(404).json({ error: 'Rep not found' });

    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `crc-field/rep-cards/${code}`,
          public_id: `avatar_${Date.now()}`,
          transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
        },
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    // Save URL to rep-cards.json
    const cards = read(CARDS_FILE, {});
    if (!cards[code]) cards[code] = {};
    cards[code].photo = result.secure_url;
    cards[code].updatedAt = new Date().toISOString();
    write(CARDS_FILE, cards);

    res.json({ ok: true, photo: result.secure_url });
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// GET /api/rep-codes — return all rep codes (for admin panel)
router.get('/api/rep-codes', async (req, res) => {
  const codes = listRepCodes();
  res.json(codes.map(c => ({
    code: c.code,
    name: c.name,
    role: c.role,
    title: c.title || '',
    department: c.department || '',
    showOnLeaderboard: !!c.sells_volume,
    canFileClaims: c.canFileClaims,  // see DD-006 in DOCTRINE_DEBT.md
    active: c.active
  })));
});

// PATCH /api/rep-codes/:code — update rep code fields (admin only)
router.patch('/api/rep-codes/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const auth = (req.query.auth || '').toUpperCase();

  if (!auth || !isAdmin(auth)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const data = read(CODES_FILE, { codes: [] });
  const idx = data.codes.findIndex(c => c.code === code);
  if (idx === -1) return res.status(404).json({ error: 'Rep code not found' });

  const allowed = ['name', 'role', 'title', 'department', 'showOnLeaderboard', 'canFileClaims', 'active'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      data.codes[idx][key] = req.body[key];
    }
  }
  write(CODES_FILE, data);

  res.json({ ok: true, repCode: data.codes[idx] });
});

// ─── VCARD DOWNLOAD ───────────────────────────────────────────────────

router.get('/rep-card/:code/vcard', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const merged = getMergedCard(code);
  if (!merged) return res.status(404).send('Rep not found');

  const names = merged.name.split(' ');
  const lastName = names.length > 1 ? names.slice(1).join(' ') : '';
  const firstName = names[0] || '';

  const vcf = `BEGIN:VCARD
VERSION:3.0
FN:${merged.name}
N:${lastName};${firstName};;;
ORG:Columbus Roofing Company
TITLE:${merged.title}
TEL;TYPE=WORK,VOICE:${merged.phone}
EMAIL;TYPE=WORK:${merged.email}
ADR;TYPE=WORK:;;5131 Post Rd;Dublin;OH;43017;US
URL:https://columbusroofingco.com
NOTE:License: HIC-L00838
END:VCARD`;

  res.setHeader('Content-Type', 'text/vcard');
  res.setHeader('Content-Disposition', `attachment; filename="${merged.name.replace(/\s+/g, '_')}_CRC.vcf"`);
  res.send(vcf);
});

// ─── HTML REP CARD PAGE ──────────────────────────────────────────────

router.get('/rep-card/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const auth = (req.query.auth || '').toUpperCase();
  // 2026-06-01: ?team=1 is the new team-detail flag (roster.html uses it).
  // ?internal=true is the legacy alias that still gates work-style traits.
  // Both expand the page from business-card mode (default — what customers
  // see when a rep shares their QR / link) to team-detail mode (Stats +
  // Work Style + extended About fields). The default keeps the shared URL
  // clean for customer use.
  const isTeamView = req.query.team === '1' || req.query.internal === 'true';
  const isInternal = isTeamView;
  const merged = getMergedCard(code);
  if (!merged) return res.status(404).send('Rep not found');

  const canEdit = auth && (auth === code || isAdmin(auth));
  const initials = merged.name.split(' ').map(n => n[0]).join('');

  const avatarHtml = merged.photo
    ? `<img src="${merged.photo}" alt="${merged.name}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,0.3);">`
    : `<div class="avatar">${initials}</div>`;

  const phoneRow = merged.phone ? `<a href="tel:${merged.phone}" class="info-row">
        <div class="info-icon">📞</div>
        <div><div class="info-label">Phone</div><div class="info-value">${merged.phone}</div></div>
      </a>` : '';

  const emailRow = merged.email ? `<a href="mailto:${merged.email}" class="info-row">
        <div class="info-icon">✉️</div>
        <div><div class="info-label">Email</div><div class="info-value">${merged.email}</div></div>
      </a>` : '';

  const bioRow = merged.bio ? `<div class="info-row">
        <div class="info-icon">📝</div>
        <div><div class="info-label">About</div><div class="info-value" style="font-size:13px;font-weight:400;line-height:1.4;">${merged.bio}</div></div>
      </div>` : '';

  let socialHtml = '';
  if (merged.linkedin) {
    socialHtml += `<a href="${merged.linkedin}" target="_blank" class="social-link" title="LinkedIn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#0077B5"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
    </a>`;
  }
  if (merged.instagram) {
    socialHtml += `<a href="${merged.instagram}" target="_blank" class="social-link" title="Instagram">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#E4405F"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z"/></svg>
    </a>`;
  }

  const socialSection = socialHtml ? `<div class="social-links">${socialHtml}</div>` : '';

  // ── ABOUT SECTION ──
  let aboutHtml = '';
  if (merged.bio || merged.years_experience || (merged.specialties && merged.specialties.length)) {
    let aboutContent = '';
    if (merged.years_experience) {
      aboutContent += `<div class="about-years"><strong>${merged.years_experience}</strong> years in the industry</div>`;
    }
    if (merged.specialties && merged.specialties.length) {
      aboutContent += `<div class="specialties">${merged.specialties.map(s => `<span class="specialty-badge">${s}</span>`).join('')}</div>`;
    }
    aboutHtml = `<div class="baseball-section">
      <div class="section-title">About</div>
      ${aboutContent}
    </div>`;
  }

  // ── STYLE SECTION (internal only) ──
  let styleHtml = '';
  if (isInternal && merged.style && merged.style.traits && merged.style.traits.length) {
    styleHtml = `<div class="baseball-section">
      <div class="section-title">Work Style</div>
      <div class="style-label">${merged.style.label}</div>
      <div class="style-traits">${merged.style.traits.map(t => `<span class="style-badge">${t}</span>`).join('')}</div>
    </div>`;
  }

  // ── STATS SECTION (team-detail mode only) ──
  // Business-card mode (default) hides stats entirely — customers
  // shouldn't see internal numbers. Team view (?team=1) renders the
  // section + runs the loading script below.
  const statsHtml = isTeamView ? `<div class="baseball-section" id="stats-section" style="display:none;">
    <div class="section-title">Stats</div>
    <div class="stats-row" id="stats-row"></div>
  </div>` : '';

  const editButtonHtml = canEdit ? `<button onclick="toggleEdit()" class="btn btn-edit" id="editBtn">✏️ Edit Card</button>` : '';

  const editFormHtml = canEdit ? `
    <div id="editForm" style="display:none;padding:24px;border-top:2px solid #00BCD4;">
      <h3 style="color:#001A4D;margin-bottom:16px;font-size:18px;">Edit Your Card</h3>
      <div class="form-group">
        <label>Photo</label>
        <input type="file" id="photoInput" accept="image/*" onchange="uploadPhoto()">
        <div id="photoStatus" style="font-size:12px;color:#666;margin-top:4px;"></div>
      </div>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="editName" value="${(merged.name || '').replace(/"/g, '&quot;')}">
      </div>
      <div class="form-group">
        <label>Title</label>
        <input type="text" id="editTitle" value="${(merged.title || '').replace(/"/g, '&quot;')}">
      </div>
      <div class="form-group">
        <label>Phone</label>
        <input type="text" id="editPhone" value="${(merged.phone || '').replace(/"/g, '&quot;')}">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="editEmail" value="${(merged.email || '').replace(/"/g, '&quot;')}">
      </div>
      <div class="form-group">
        <label>Bio</label>
        <textarea id="editBio" rows="3">${(merged.bio || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
      </div>
      <div class="form-group">
        <label>LinkedIn URL</label>
        <input type="url" id="editLinkedin" value="${(merged.linkedin || '').replace(/"/g, '&quot;')}">
      </div>
      <div class="form-group">
        <label>Instagram URL</label>
        <input type="url" id="editInstagram" value="${(merged.instagram || '').replace(/"/g, '&quot;')}">
      </div>
      <button onclick="saveCard()" class="btn btn-primary" style="margin-top:8px;">💾 Save Changes</button>
      <div id="saveStatus" style="font-size:13px;margin-top:8px;"></div>
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${merged.name} — Columbus Roofing Company</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #F5F7FA;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      max-width: 420px;
      width: 100%;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .card-header {
      background: #001A4D;
      padding: 30px 24px 20px;
      text-align: center;
      position: relative;
    }
    .logo {
      width: 70px;
      height: 70px;
      margin: 0 auto 16px;
    }
    .logo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .avatar {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: #00B5CC;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      color: #fff;
      font-weight: 700;
      border: 3px solid rgba(255,255,255,0.3);
    }
    .avatar-photo {
      margin: 0 auto 16px;
    }
    .rep-name {
      color: #fff;
      font-size: 26px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .rep-title {
      color: #00BCD4;
      font-size: 15px;
      font-weight: 500;
      margin-bottom: 2px;
    }
    .company-name {
      color: rgba(255,255,255,0.7);
      font-size: 13px;
    }
    .card-body {
      padding: 24px;
    }
    .info-row {
      display: flex;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
      text-decoration: none;
      color: #333;
    }
    .info-row:last-child { border-bottom: none; }
    .info-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: #E8F8F9;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 14px;
      flex-shrink: 0;
      font-size: 18px;
    }
    .info-label {
      font-size: 11px;
      color: #999;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-value {
      font-size: 15px;
      color: #001A4D;
      font-weight: 500;
    }
    a.info-row:hover .info-value { color: #00BCD4; }
    .social-links {
      display: flex;
      justify-content: center;
      gap: 16px;
      padding: 12px 0;
    }
    .social-link {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: #f0f0f0;
      transition: background 0.2s;
    }
    .social-link:hover { background: #E8F8F9; }
    .buttons {
      padding: 0 24px 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn {
      display: block;
      padding: 14px;
      border-radius: 12px;
      text-align: center;
      font-size: 16px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: none;
      width: 100%;
    }
    .btn-primary {
      background: #00B5CC;
      color: #fff;
    }
    .btn-secondary {
      background: #001A4D;
      color: #fff;
    }
    .btn-edit {
      background: #f0f0f0;
      color: #001A4D;
      font-size: 14px;
      padding: 10px;
    }
    .btn:hover { opacity: 0.9; transform: translateY(-1px); }
    .footer {
      text-align: center;
      padding: 16px 24px;
      background: #f8f9fa;
      border-top: 1px solid #eee;
    }
    .footer-text {
      font-size: 11px;
      color: #999;
    }
    .license {
      font-size: 12px;
      color: #666;
      margin-top: 4px;
    }
    .form-group {
      margin-bottom: 12px;
    }
    .form-group label {
      display: block;
      font-size: 12px;
      color: #666;
      margin-bottom: 4px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      transition: border-color 0.2s;
    }
    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #00BCD4;
    }
    .baseball-section {
      padding: 16px 24px;
      border-top: 1px solid #f0f0f0;
    }
    .section-title {
      font-size: 11px;
      color: #999;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .about-years {
      font-size: 14px;
      color: #001A4D;
      margin-bottom: 10px;
    }
    .about-years strong {
      color: #00BCD4;
      font-size: 18px;
    }
    .specialties {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .specialty-badge {
      display: inline-block;
      background: #E8F8F9;
      color: #0097A7;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
    }
    .style-label {
      font-size: 16px;
      font-weight: 700;
      color: #001A4D;
      margin-bottom: 8px;
    }
    .style-traits {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .style-badge {
      display: inline-block;
      background: #001A4D;
      color: #00BCD4;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    .stats-row {
      display: flex;
      gap: 8px;
    }
    .stat-box {
      flex: 1;
      background: #001A4D;
      border-radius: 8px;
      padding: 10px 8px;
      text-align: center;
    }
    .stat-box .stat-num {
      font-size: 20px;
      font-weight: 800;
      color: #00BCD4;
    }
    .stat-box .stat-label {
      font-size: 9px;
      color: rgba(255,255,255,0.6);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }
    /* Standard field-app bottom nav (2026-06-01). Replaces the prior
       back-to-app bar so this page feels continuous with the SPA.
       Tabs link to /#<view> hash routes consumed by applyHashRoute()
       in app.js. Canonical brand colors per May 2026 lock. */
    body { padding-bottom: calc(72px + env(safe-area-inset-bottom)); }
    .fc-bottom-nav {
      position: fixed; left: 0; right: 0; bottom: 0;
      display: flex; z-index: 200;
      background: #0A1530;
      padding-bottom: env(safe-area-inset-bottom);
      height: calc(60px + env(safe-area-inset-bottom));
      border-top: 1px solid rgba(7,191,238,0.2);
    }
    .fc-bottom-nav .nav-item {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 4px;
      text-decoration: none; color: rgba(255,255,255,0.6);
      font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .fc-bottom-nav .nav-item:hover { color: #07BFEE; }
    .fc-bottom-nav .nav-icon { font-size: 20px; line-height: 1; }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-header">
      <div class="logo"><img src="/assets/CRC_Icon.svg" alt="CRC"></div>
      <div class="avatar-photo">${avatarHtml}</div>
      <div class="rep-name">${merged.name}</div>
      <div class="rep-title">${merged.title}</div>
      <div class="company-name">Columbus Roofing Company</div>
    </div>
    <div class="card-body">
      ${phoneRow}
      ${emailRow}
      ${bioRow}
      <div class="info-row">
        <div class="info-icon">📍</div>
        <div><div class="info-label">Office</div><div class="info-value">5131 Post Rd, Dublin, OH 43017</div></div>
      </div>
      <div class="info-row">
        <div class="info-icon">📋</div>
        <div><div class="info-label">License</div><div class="info-value">HIC-L00838</div></div>
      </div>
      ${socialSection}
    </div>
    ${aboutHtml}
    ${styleHtml}
    ${statsHtml}
    <div class="buttons">
      <a href="/rep-card/${code}/vcard" class="btn btn-primary">Save to Contacts</a>
      <button onclick="shareCard()" class="btn btn-secondary">Share My Card</button>
      ${editButtonHtml}
    </div>
    ${editFormHtml}
    <div class="footer">
      <div style="font-size:13px;color:#001A4D;font-weight:600">Columbus Roofing Company</div>
      <div style="font-size:11px;color:#999;margin-top:2px;font-style:italic">The Everyday Standard.</div>
      <div class="license">columbusroofingco.com</div>
    </div>
  </div>
  <script>
    // Load stats from claims dashboard. Only runs when statsHtml rendered
    // the #stats-section node (team-detail mode). Business-card mode
    // doesn't render the section, so the early bail below is the gate.
    (async function() {
      const section = document.getElementById('stats-section');
      if (!section) return;
      try {
        const res = await fetch('/api/claims-dashboard');
        const d = await res.json();
        const repData = d.by_rep.find(r => r.rep_name === '${merged.name.replace(/'/g, "\\'")}');
        if (repData) {
          const row = document.getElementById('stats-row');
          let boxes = '';
          if (repData.mtd !== undefined) boxes += '<div class="stat-box"><div class="stat-num">' + repData.mtd + '</div><div class="stat-label">This Month</div></div>';
          if (repData.total_jobs !== undefined) boxes += '<div class="stat-box"><div class="stat-num">' + repData.total_jobs + '</div><div class="stat-label">Total Jobs</div></div>';
          if (repData.approved !== undefined && repData.claims_filed > 0) {
            const rate = Math.round((repData.approved / repData.claims_filed) * 100);
            boxes += '<div class="stat-box"><div class="stat-num">' + rate + '%</div><div class="stat-label">Close Rate</div></div>';
          }
          if (repData.total_value) boxes += '<div class="stat-box"><div class="stat-num">$' + (repData.total_value / 1000).toFixed(0) + 'k</div><div class="stat-label">Value</div></div>';
          if (boxes) {
            row.innerHTML = boxes;
            section.style.display = 'block';
          }
        }
      } catch(e) { /* silently fail if no dashboard data */ }
    })();
    function shareCard() {
      const url = window.location.href.split('?')[0];
      const text = "Hi, I'm ${merged.name.replace(/'/g, "\\'")} from Columbus Roofing Company.\\nHere's my contact card:\\n" + url;
      if (navigator.share) {
        navigator.share({ title: '${merged.name.replace(/'/g, "\\'")} - CRC', text: text, url: url }).catch(() => {});
      } else {
        navigator.clipboard.writeText(url).then(() => alert('Link copied to clipboard')).catch(() => alert(url));
      }
    }
  </script>
  ${canEdit ? `<script>
    const CODE = '${code}';
    const AUTH = '${auth}';

    function toggleEdit() {
      const form = document.getElementById('editForm');
      const btn = document.getElementById('editBtn');
      if (form.style.display === 'none') {
        form.style.display = 'block';
        btn.textContent = '✕ Cancel';
      } else {
        form.style.display = 'none';
        btn.textContent = '✏️ Edit Card';
      }
    }

    async function saveCard() {
      const status = document.getElementById('saveStatus');
      status.textContent = 'Saving...';
      status.style.color = '#666';
      try {
        const resp = await fetch('/api/rep-cards/' + CODE + '?auth=' + AUTH, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: document.getElementById('editName').value,
            title: document.getElementById('editTitle').value,
            phone: document.getElementById('editPhone').value,
            email: document.getElementById('editEmail').value,
            bio: document.getElementById('editBio').value,
            linkedin: document.getElementById('editLinkedin').value,
            instagram: document.getElementById('editInstagram').value
          })
        });
        const data = await resp.json();
        if (data.ok) {
          status.textContent = 'Saved! Reloading...';
          status.style.color = '#0097A7';
          setTimeout(() => location.reload(), 800);
        } else {
          status.textContent = 'Error: ' + (data.error || 'Unknown');
          status.style.color = '#c00';
        }
      } catch (err) {
        status.textContent = 'Network error';
        status.style.color = '#c00';
      }
    }

    async function uploadPhoto() {
      const input = document.getElementById('photoInput');
      const status = document.getElementById('photoStatus');
      if (!input.files || !input.files[0]) return;
      status.textContent = 'Uploading...';
      const formData = new FormData();
      formData.append('photo', input.files[0]);
      try {
        const resp = await fetch('/api/rep-cards/' + CODE + '/photo?auth=' + AUTH, {
          method: 'POST',
          body: formData
        });
        const data = await resp.json();
        if (data.ok) {
          status.textContent = 'Photo uploaded! Reloading...';
          status.style.color = '#0097A7';
          setTimeout(() => location.reload(), 800);
        } else {
          status.textContent = 'Error: ' + (data.error || 'Unknown');
          status.style.color = '#c00';
        }
      } catch (err) {
        status.textContent = 'Upload failed';
        status.style.color = '#c00';
      }
    }
  </script>` : ''}
  <nav class="fc-bottom-nav">
    <a class="nav-item" href="/#leads"><span class="nav-icon">&#127968;</span><span>Home</span></a>
    <a class="nav-item" href="/#jobs"><span class="nav-icon">&#128197;</span><span>My Jobs</span></a>
    <a class="nav-item" href="/#map"><span class="nav-icon">&#128205;</span><span>Map</span></a>
    <a class="nav-item" href="/#feed"><span class="nav-icon">&#128240;</span><span>Feed</span></a>
    <a class="nav-item" href="/#more"><span class="nav-icon">&#9776;</span><span>More</span></a>
  </nav>
</body>
</html>`;

  res.send(html);
});

module.exports = router;
