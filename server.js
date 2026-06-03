require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/leads', require('./routes/leads'));
app.use('/api/leads', require('./routes/photos'));
app.use('/api/leads', require('./routes/reports'));
app.use('/api/storms', require('./routes/storms'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/maps', require('./routes/maps'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/scorecard', require('./routes/scorecard'));
app.use('/api/hover', require('./routes/hover'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/brain', require('./routes/brain'));
app.use('/api/claims-dashboard', require('./routes/claims-dashboard'));
app.use('/api/referrals', require('./routes/referrals'));
app.use('/api/training', require('./routes/training'));
// Rep-codes on-demand cache refresh (portal pings after Add Rep / deactivate).
app.use('/', require('./routes/rep-codes-admin'));
app.use('/api/field/jobs', require('./routes/field-jobs'));
app.use('/api/field', require('./routes/field-jobs'));
app.use('/api/builds', require('./routes/builds'));
app.use('/api/builds-map', require('./routes/builds-map'));
app.use('/', require('./routes/rep-card'));
app.use('/', require('./routes/recruit'));

// Rep codes
const { validateRepCode } = require('./lib/repCodes');
app.get('/api/rep-codes/validate', async (req, res) => {
  const code = (req.query.code || '').toUpperCase();
  const rep = validateRepCode(code);
  if (!rep) return res.json({ valid: false });
  res.json({ valid: true, name: rep.name, role: rep.role });
});

// Reverse geocode
app.get('/api/maps/reverse-geocode', async (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.json({ address: '' });
  try {
    const { lat, lng } = req.query;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
    const data = await fetch(url).then(r => r.json());
    res.json({ address: data.results?.[0]?.formatted_address || '' });
  } catch (e) { res.json({ address: '', error: e.message }); }
});

// Stub: markup.js calls /api/jobs/:id to pre-load existing strokes.
// Field app has no /api/jobs route, so return empty object to keep the canvas opening.
app.get('/api/jobs/:id', async (req, res) => res.json({}));

// POST /api/leads/:id/photos/markup — save photo markup locally to lead store
app.post('/api/leads/:id/photos/markup', async (req, res) => {
  try {
    const { getLead, updateLead } = require('./lib/store');
    const { migratePhotos } = require('./lib/photoStorage');
    const lead = await getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { photoIndex, markupData, strokes, category } = req.body;
    const photos = migratePhotos(lead);
    const cat = category || 'inspection';
    const arr = photos[cat];

    if (!arr || arr[photoIndex] === undefined) {
      return res.status(404).json({ error: 'Photo not found at index ' + photoIndex + ' in ' + cat });
    }

    arr[photoIndex] = { ...arr[photoIndex], markupUrl: markupData, hasMarkup: true };
    photos[cat] = arr;
    await updateLead(req.params.id, { photos });
    res.json({ success: true });
  } catch (e) {
    console.error('[LeadMarkup] Error:', e.message);
    res.status(500).json({ error: 'Failed to save markup: ' + e.message });
  }
});

// Health
app.get('/health', async (req, res) => res.json({ status: 'ok', service: 'crc-field-intel' }));

// Claims dashboard page
app.get('/claims-dashboard', async (req, res) => res.sendFile(path.join(__dirname, 'public', 'claims-dashboard.html')));

// Team roster page
app.get('/roster', async (req, res) => res.sendFile(path.join(__dirname, 'public', 'roster.html')));

// Training portal
app.get('/training', async (req, res) => res.sendFile(path.join(__dirname, 'public', 'training.html')));

// SPA fallback
app.get('/{*path}', async (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`CRC Field Intel on port ${PORT}`));

// Import ABC CSV on startup if builds-db.json is empty or missing.
setTimeout(async () => {
  try {
    const fs = require('fs');
    const dbPath = path.join(__dirname, 'data/builds-db.json');
    let db = { pins: [] };
    if (fs.existsSync(dbPath)) { try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch {} }
    if (!db.pins || db.pins.length === 0) {
      const r = await fetch(`http://localhost:${PORT}/api/builds-map/import-csv`, { method: 'POST' });
      const data = await r.json();
      console.log('[BuildsMap] Initial CSV import:', data);
    }
  } catch (e) { console.log('[BuildsMap] Startup import skipped:', e.message); }
}, 3000);

// Auto-geocode any ungeocoded pins in the background, 10s after boot.
setTimeout(() => {
  try {
    const buildsMap = require('./routes/builds-map');
    if (typeof buildsMap.runAutoGeocode !== 'function') return;
    buildsMap.runAutoGeocode(msg => console.log('[BuildsMap] Geocoding: ' + msg))
      .catch(e => console.log('[BuildsMap] Auto-geocode error:', e.message));
  } catch (e) { console.log('[BuildsMap] Auto-geocode skipped:', e.message); }
}, 10000);
