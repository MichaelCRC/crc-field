const express = require('express');
const router = express.Router();
const { listRepCodes } = require('../lib/repCodes');

// GET /api/rep-card/:code — JSON data
router.get('/api/rep-card/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const reps = listRepCodes();
  const rep = reps.find(r => r.code === code && r.active);
  if (!rep) return res.status(404).json({ error: 'Rep not found' });
  res.json({
    name: rep.name,
    role: 'Roofing Consultant',
    phone: rep.phone || '',
    email: rep.email || '',
    photo_url: rep.photo_url || '',
    rep_code: rep.code,
    company: 'Columbus Roofing Company',
    license: 'HIC-L00838'
  });
});

// GET /rep-card/:code/vcard — download vCard
router.get('/rep-card/:code/vcard', (req, res) => {
  const code = req.params.code.toUpperCase();
  const reps = listRepCodes();
  const rep = reps.find(r => r.code === code && r.active);
  if (!rep) return res.status(404).send('Rep not found');

  const names = rep.name.split(' ');
  const lastName = names.length > 1 ? names.slice(1).join(' ') : '';
  const firstName = names[0] || '';

  const vcf = `BEGIN:VCARD
VERSION:3.0
FN:${rep.name}
N:${lastName};${firstName};;;
ORG:Columbus Roofing Company
TITLE:Roofing Consultant
TEL;TYPE=WORK,VOICE:${rep.phone || ''}
EMAIL;TYPE=WORK:${rep.email || ''}
ADR;TYPE=WORK:;;5131 Post Rd;Dublin;OH;43017;US
URL:https://columbusroofingco.com
NOTE:License: HIC-L00838
END:VCARD`;

  res.setHeader('Content-Type', 'text/vcard');
  res.setHeader('Content-Disposition', `attachment; filename="${rep.name.replace(/\s+/g, '_')}_CRC.vcf"`);
  res.send(vcf);
});

// GET /rep-card/:code — HTML page
router.get('/rep-card/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const reps = listRepCodes();
  const rep = reps.find(r => r.code === code && r.active);
  if (!rep) return res.status(404).send('Rep not found');

  const phone = rep.phone || '';
  const email = rep.email || '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${rep.name} — Columbus Roofing Company</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #001A4D 0%, #002266 50%, #001A4D 100%);
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
      background: linear-gradient(135deg, #001A4D, #003380);
      padding: 30px 24px 20px;
      text-align: center;
      position: relative;
    }
    .logo {
      width: 60px;
      height: 60px;
      background: #00BCD4;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-weight: 900;
      color: #001A4D;
      font-size: 18px;
    }
    .avatar {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: linear-gradient(135deg, #00BCD4, #0097A7);
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      color: #fff;
      font-weight: 700;
      border: 3px solid rgba(255,255,255,0.3);
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
      background: linear-gradient(135deg, #00BCD4, #0097A7);
      color: #fff;
    }
    .btn-secondary {
      background: #001A4D;
      color: #fff;
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
  </style>
</head>
<body>
  <div class="card">
    <div class="card-header">
      <div class="logo">CRC</div>
      <div class="avatar">${rep.name.split(' ').map(n => n[0]).join('')}</div>
      <div class="rep-name">${rep.name}</div>
      <div class="rep-title">Roofing Consultant</div>
      <div class="company-name">Columbus Roofing Company</div>
    </div>
    <div class="card-body">
      ${phone ? `<a href="tel:${phone}" class="info-row">
        <div class="info-icon">📞</div>
        <div><div class="info-label">Phone</div><div class="info-value">${phone}</div></div>
      </a>` : ''}
      ${email ? `<a href="mailto:${email}" class="info-row">
        <div class="info-icon">✉️</div>
        <div><div class="info-label">Email</div><div class="info-value">${email}</div></div>
      </a>` : ''}
      <div class="info-row">
        <div class="info-icon">📍</div>
        <div><div class="info-label">Office</div><div class="info-value">5131 Post Rd, Dublin, OH 43017</div></div>
      </div>
      <div class="info-row">
        <div class="info-icon">📋</div>
        <div><div class="info-label">License</div><div class="info-value">HIC-L00838</div></div>
      </div>
    </div>
    <div class="buttons">
      <a href="/rep-card/${code}/vcard" class="btn btn-primary">💾 Save Contact</a>
      <a href="${phone ? 'tel:' + phone : '#'}" class="btn btn-secondary">🏠 Schedule Inspection</a>
    </div>
    <div class="footer">
      <div class="footer-text">Columbus Roofing Company</div>
      <div class="license">License: HIC-L00838 | Columbus, OH</div>
    </div>
  </div>
</body>
</html>`;

  res.send(html);
});

module.exports = router;
