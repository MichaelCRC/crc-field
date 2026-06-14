/**
 * Builds Map overlay — pins for every ABC delivery / manual build address.
 * Each pin can be tagged with a shingle color so reps can filter the map
 * and take a homeowner on a drive-by tour of, say, every Charcoal roof.
 *
 * Data lives at data/builds-db.json and is mutable; geocoding is lazy and
 * cached forever on first success.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { requireRep } = require('../lib/authGate');

const DB_FILE = path.join(__dirname, '..', 'data', 'builds-db.json');
const CSV_FILE = path.join(__dirname, '..', 'data', 'abc-deliveries.csv');

function readDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { pins: [], lastImport: null }; }
}
function writeDb(db) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ── CSV parser ────────────────────────────────────────────────────────
// Simple RFC-4180 compliant line-by-line splitter so we can handle quoted
// fields with commas (e.g. addresses, totals) without adding a dependency.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function cleanAddress(raw) {
  return String(raw || '').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
}

// ── POST /api/builds-map/import-csv ──────────────────────────────────
router.post('/import-csv', async (req, res) => {
  if (!fs.existsSync(CSV_FILE)) {
    return res.status(404).json({ error: 'CSV not found at ' + CSV_FILE });
  }
  const text = fs.readFileSync(CSV_FILE, 'utf8');
  const rows = parseCsv(text);
  if (!rows.length) return res.json({ imported: 0, skipped: 0, total: 0 });
  const header = rows[0].map(h => h.trim());
  const col = name => header.indexOf(name);

  const db = readDb();
  const seen = new Set(db.pins.map(p => p.id));
  let imported = 0, skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length || r.every(x => !x)) continue;
    const orderNumber = (r[col('Order Number')] || '').trim();
    const address = cleanAddress(r[col('Delivery Address')] || '');
    if (!orderNumber || !address) { skipped++; continue; }

    const id = 'abc-' + orderNumber;
    if (seen.has(id)) { skipped++; continue; }

    db.pins.push({
      id,
      source: 'abc',
      address,
      name: (r[col('Name')] || '').trim(),
      orderNumber,
      total: (r[col('Total')] || '').trim(),
      deliveryDate: (r[col('Delivery Date')] || '').trim(),
      shingleColor: null,
      notes: '',
      lat: null,
      lng: null,
      geocodedAt: null
    });
    seen.add(id);
    imported++;
  }

  db.lastImport = new Date().toISOString();
  writeDb(db);
  res.json({ imported, skipped, total: db.pins.length });
});

// ── GET /api/builds-map/pins?color=Charcoal|unset ────────────────────
router.get('/pins', async (req, res) => {
  const db = readDb();
  let pins = db.pins;
  const color = (req.query.color || '').trim();
  if (color) {
    if (color.toLowerCase() === 'unset') pins = pins.filter(p => !p.shingleColor);
    else {
      const needle = color.toLowerCase();
      pins = pins.filter(p => p.shingleColor && String(p.shingleColor).toLowerCase() === needle);
    }
  }
  res.json({ pins, lastImport: db.lastImport });
});

// ── PATCH /api/builds-map/pins/:id ───────────────────────────────────
router.patch('/pins/:id', requireRep, async (req, res) => {
  const db = readDb();
  const idx = db.pins.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Pin not found' });
  const allowed = ['shingleColor', 'notes'];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) db.pins[idx][k] = req.body[k];
  }
  writeDb(db);
  res.json(db.pins[idx]);
});

// ── POST /api/builds-map/pins (manual add) ───────────────────────────
router.post('/pins', requireRep, async (req, res) => {
  const { address, name, shingleColor, notes } = req.body || {};
  if (!address || !String(address).trim()) return res.status(400).json({ error: 'address required' });
  const db = readDb();
  const pin = {
    id: 'manual-' + Date.now(),
    source: 'manual',
    address: cleanAddress(address),
    name: (name || '').trim(),
    orderNumber: '',
    total: '',
    deliveryDate: '',
    shingleColor: shingleColor || null,
    notes: notes || '',
    lat: null,
    lng: null,
    geocodedAt: null
  };
  db.pins.push(pin);
  writeDb(db);
  res.json(pin);
});

function needsGeocode(p) {
  if (p.lat && p.lng) return false;
  if (p.geocodeFailed) return false;
  return true;
}

async function geocodeBatch(pins, apiKey) {
  let geocoded = 0, failed = 0;
  for (const pin of pins) {
    try {
      const url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(pin.address) + '&key=' + apiKey;
      const r = await fetch(url);
      const data = await r.json();
      if (data.status === 'OK' && data.results?.length) {
        const loc = data.results[0].geometry.location;
        pin.lat = loc.lat;
        pin.lng = loc.lng;
        pin.geocodedAt = new Date().toISOString();
        pin.geocodeAttempts = 0;
        geocoded++;
      } else {
        pin.geocodeAttempts = (pin.geocodeAttempts || 0) + 1;
        if (pin.geocodeAttempts >= 3) pin.geocodeFailed = true;
        failed++;
      }
    } catch {
      pin.geocodeAttempts = (pin.geocodeAttempts || 0) + 1;
      if (pin.geocodeAttempts >= 3) pin.geocodeFailed = true;
      failed++;
    }
  }
  return { geocoded, failed };
}

// ── POST /api/builds-map/geocode ─────────────────────────────────────
// Geocodes up to 10 ungeocoded pins per call. Cache-first; pins already
// geocoded or marked geocodeFailed are skipped.
router.post('/geocode', requireRep, async (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY not set' });

  const db = readDb();
  const todo = db.pins.filter(needsGeocode).slice(0, 10);
  const { geocoded, failed } = await geocodeBatch(todo, apiKey);

  writeDb(db);
  const remaining = db.pins.filter(needsGeocode).length;
  res.json({ geocoded, failed, remaining });
});

// ── POST /api/builds-map/geocode-all ─────────────────────────────────
// Batches through ALL ungeocoded pins (10 per API call, 1s between batches).
// Keeps going until nothing is left or all remaining are marked failed.
router.post('/geocode-all', requireRep, async (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY not set' });

  const db = readDb();
  const total = db.pins.filter(needsGeocode).length;
  let geocodedTotal = 0, failedTotal = 0;

  while (true) {
    const batch = db.pins.filter(needsGeocode).slice(0, 10);
    if (!batch.length) break;
    const { geocoded, failed } = await geocodeBatch(batch, apiKey);
    geocodedTotal += geocoded;
    failedTotal += failed;
    writeDb(db);
    if (db.pins.filter(needsGeocode).length === 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  const remaining = db.pins.filter(needsGeocode).length;
  res.json({ total, geocoded: geocodedTotal, failed: failedTotal, remaining });
});

// Shared helper for the server-startup auto-geocoder.
async function runAutoGeocode(log) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) { log && log('no API key; skip'); return; }
  const db = readDb();
  const total = db.pins.filter(needsGeocode).length;
  if (!total) return;
  log && log('starting: ' + total + ' pins need geocoding');
  let done = 0;
  while (true) {
    const latest = readDb();
    const batch = latest.pins.filter(needsGeocode).slice(0, 10);
    if (!batch.length) break;
    const { geocoded, failed } = await geocodeBatch(batch, apiKey);
    writeDb(latest);
    done += geocoded + failed;
    log && log(done + '/' + total + ' processed (' + geocoded + ' ok, ' + failed + ' fail)');
    if (latest.pins.filter(needsGeocode).length === 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  log && log('done');
}

module.exports = router;
module.exports.runAutoGeocode = runAutoGeocode;
