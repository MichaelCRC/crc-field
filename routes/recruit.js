const express = require('express');
const router = express.Router();
const { read, write } = require('../lib/store');

const FILE = 'applications.json';

// POST /api/applications
router.post('/api/applications', async (req, res) => {
  const apps = read(FILE, []);
  const app = {
    id: 'app-' + Date.now(),
    name: req.body.name || '',
    phone: req.body.phone || '',
    email: req.body.email || '',
    city: req.body.city || '',
    current_job: req.body.current_job || '',
    why_interested: req.body.why_interested || '',
    createdAt: new Date().toISOString()
  };
  apps.unshift(app);
  write(FILE, apps);
  res.status(201).json({ success: true, message: "Thanks! We'll be in touch within 24 hours.", id: app.id });
});

// GET /recruit — HTML page
router.get('/recruit', async (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join CRC — Sales Career Opportunity</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fa;
      color: #333;
    }
    .hero {
      background: linear-gradient(135deg, #001A4D 0%, #003380 100%);
      color: #fff;
      padding: 60px 24px 40px;
      text-align: center;
    }
    .hero h1 {
      font-size: 32px;
      margin-bottom: 12px;
    }
    .hero .accent { color: #00BCD4; }
    .hero p {
      font-size: 18px;
      opacity: 0.85;
      max-width: 500px;
      margin: 0 auto;
    }
    .container {
      max-width: 700px;
      margin: 0 auto;
      padding: 32px 20px;
    }
    .section {
      background: #fff;
      border-radius: 16px;
      padding: 28px 24px;
      margin-bottom: 24px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }
    .section h2 {
      color: #001A4D;
      font-size: 22px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .benefits {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .benefit {
      background: #f0fafb;
      border-radius: 12px;
      padding: 16px;
      text-align: center;
    }
    .benefit .icon { font-size: 28px; margin-bottom: 6px; }
    .benefit .title { font-weight: 600; color: #001A4D; font-size: 14px; }
    .benefit .desc { font-size: 12px; color: #666; margin-top: 4px; }
    ul { padding-left: 20px; }
    ul li { padding: 6px 0; font-size: 15px; }
    .highlight { color: #00BCD4; font-weight: 600; }
    .form-group {
      margin-bottom: 16px;
    }
    .form-group label {
      display: block;
      font-weight: 600;
      color: #001A4D;
      margin-bottom: 6px;
      font-size: 14px;
    }
    .form-group input, .form-group textarea {
      width: 100%;
      padding: 12px 14px;
      border: 2px solid #e0e0e0;
      border-radius: 10px;
      font-size: 16px;
      font-family: inherit;
      transition: border-color 0.2s;
    }
    .form-group input:focus, .form-group textarea:focus {
      outline: none;
      border-color: #00BCD4;
    }
    .form-group textarea { resize: vertical; min-height: 100px; }
    .submit-btn {
      display: block;
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #00BCD4, #0097A7);
      color: #fff;
      border: none;
      border-radius: 12px;
      font-size: 18px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 8px;
    }
    .submit-btn:hover { opacity: 0.9; }
    .success-msg {
      display: none;
      background: #e8f5e9;
      border: 2px solid #4caf50;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      color: #2e7d32;
      font-size: 18px;
      font-weight: 600;
    }
    .pdf-link {
      display: inline-block;
      background: #001A4D;
      color: #fff;
      padding: 12px 24px;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 600;
      margin-top: 12px;
    }
    .pdf-link:hover { background: #002b6e; }
    @media (max-width: 500px) {
      .benefits { grid-template-columns: 1fr; }
      .hero h1 { font-size: 26px; }
    }
  </style>
</head>
<body>
  <div class="hero">
    <h1>Build Your Career in <span class="accent">Roofing Sales</span></h1>
    <p>Join Columbus Roofing Company and earn $80K-$200K+ your first year. No experience needed.</p>
  </div>

  <div class="container">
    <div class="section">
      <h2>💰 Why CRC?</h2>
      <div class="benefits">
        <div class="benefit">
          <div class="icon">💵</div>
          <div class="title">$80K-$200K+ Year 1</div>
          <div class="desc">Commission-based uncapped earnings</div>
        </div>
        <div class="benefit">
          <div class="icon">📚</div>
          <div class="title">Full Training</div>
          <div class="desc">No experience required</div>
        </div>
        <div class="benefit">
          <div class="icon">🗓️</div>
          <div class="title">Flexible Schedule</div>
          <div class="desc">Be your own boss</div>
        </div>
        <div class="benefit">
          <div class="icon">📈</div>
          <div class="title">Growth Path</div>
          <div class="desc">Management opportunities</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>📋 What You'll Do</h2>
      <ul>
        <li>Knock doors in storm-affected neighborhoods</li>
        <li>Inspect roofs and document damage</li>
        <li>Help homeowners navigate insurance claims</li>
        <li>Close deals and manage projects</li>
        <li>Build a book of repeat customers and referrals</li>
      </ul>
    </div>

    <div class="section">
      <h2>✅ What We Look For</h2>
      <ul>
        <li>Self-motivated and coachable</li>
        <li>Reliable transportation</li>
        <li>Comfortable working outdoors</li>
        <li>Good communication skills</li>
        <li><span class="highlight">Sales experience is a plus but NOT required</span></li>
      </ul>
    </div>

    <div class="section">
      <h2>📄 Download Career Guide</h2>
      <p>Get the full details on what a career at CRC looks like.</p>
      <a href="/docs/CRC-Sales-Career-Guide.pdf" class="pdf-link">📥 Download Sales Career Guide (PDF)</a>
    </div>

    <div class="section">
      <h2>🚀 Apply Now</h2>
      <div id="successMsg" class="success-msg">
        ✅ Thanks! We'll be in touch within 24 hours.
      </div>
      <form id="recruitForm">
        <div class="form-group">
          <label>Full Name *</label>
          <input type="text" name="name" required placeholder="John Smith">
        </div>
        <div class="form-group">
          <label>Phone *</label>
          <input type="tel" name="phone" required placeholder="614-555-1234">
        </div>
        <div class="form-group">
          <label>Email *</label>
          <input type="email" name="email" required placeholder="john@email.com">
        </div>
        <div class="form-group">
          <label>City</label>
          <input type="text" name="city" placeholder="Columbus, OH">
        </div>
        <div class="form-group">
          <label>Current Job</label>
          <input type="text" name="current_job" placeholder="What do you do now?">
        </div>
        <div class="form-group">
          <label>Why are you interested in roofing sales?</label>
          <textarea name="why_interested" placeholder="Tell us a bit about yourself..."></textarea>
        </div>
        <button type="submit" class="submit-btn">Submit Application</button>
      </form>
    </div>
  </div>

  <script>
    document.getElementById('recruitForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      const form = e.target;
      const data = Object.fromEntries(new FormData(form));
      try {
        const res = await fetch('/api/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) {
          form.style.display = 'none';
          document.getElementById('successMsg').style.display = 'block';
        } else {
          alert('Error submitting. Please try again.');
        }
      } catch(err) {
        alert('Network error. Please try again.');
      }
    });
  </script>
</body>
</html>`;

  res.send(html);
});

module.exports = router;
