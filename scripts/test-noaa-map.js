#!/usr/bin/env node
/** Field App — NOAA map view tests.
 *  Pre-seeds a synthetic storm cache so filtering logic is testable offline,
 *  then spins the storms router on a random port to exercise each endpoint.
 *  Google Geocoding is stubbed via a fetch wrapper so tests run without a
 *  network round-trip or a real API key. */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_PATH = path.join(DATA_DIR, 'storm-cache.json');
const LEADS_PATH = path.join(DATA_DIR, 'leads.json');

// Snapshot real files so we can restore them after the run.
const originalCache = fs.existsSync(CACHE_PATH) ? fs.readFileSync(CACHE_PATH, 'utf-8') : null;
const originalLeads = fs.existsSync(LEADS_PATH) ? fs.readFileSync(LEADS_PATH, 'utf-8') : null;

function restoreFiles() {
  if (originalCache === null) { try { fs.unlinkSync(CACHE_PATH); } catch {} }
  else fs.writeFileSync(CACHE_PATH, originalCache);
  if (originalLeads === null) { try { fs.unlinkSync(LEADS_PATH); } catch {} }
  else fs.writeFileSync(LEADS_PATH, originalLeads);
}

// ── Synthetic storms ──────────────────────────────────────────────────────
// Reference point: Columbus OH (downtown). We place events at known offsets
// so distance + threshold filtering is deterministic.
const COLUMBUS = { lat: 39.9612, lng: -82.9988 };

// ~1 degree lat = ~69 mi. ~1 degree lng at Columbus latitude ~= ~53 mi.
// We use those to place events at known distances from the ref point.
function offset(base, dLatMiles, dLngMiles) {
  return {
    lat: base.lat + dLatMiles / 69,
    lng: base.lng + dLngMiles / 53,
  };
}

function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
}

const FAKE_STORMS = [
  // 1. Hail 1.25in, 2mi N, 30 days ago — should pass all default filters.
  { noaaEventId: 'E1', date: daysAgo(30), eventType: 'hail', magnitudeValue: 1.25, magnitudeUnit: 'in', hailSize: 1.25, location: 'Columbus', county: 'Franklin', state: 'OH', ...offset(COLUMBUS, 2, 0), narrative: 'Golf ball size hail.', source: 'NOAA NCEI Storm Events' },
  // 2. Hail 0.75in, 4mi E, 90 days — passes.
  { noaaEventId: 'E2', date: daysAgo(90), eventType: 'hail', magnitudeValue: 0.75, magnitudeUnit: 'in', hailSize: 0.75, location: 'Whitehall', county: 'Franklin', state: 'OH', ...offset(COLUMBUS, 0, 4), narrative: '', source: 'NOAA NCEI Storm Events' },
  // 3. Thunderstorm wind 65mph, 3mi S, 60 days — passes.
  { noaaEventId: 'E3', date: daysAgo(60), eventType: 'thunderstorm_wind', magnitudeValue: 65, magnitudeUnit: 'mph', hailSize: 0, location: 'Grove City', county: 'Franklin', state: 'OH', ...offset(COLUMBUS, -3, 0), narrative: '', source: 'NOAA NCEI Storm Events' },
  // 4. High wind 58mph (exactly threshold), 1mi W, 180 days — passes.
  { noaaEventId: 'E4', date: daysAgo(180), eventType: 'high_wind', magnitudeValue: 58, magnitudeUnit: 'mph', hailSize: 0, location: 'Upper Arlington', county: 'Franklin', state: 'OH', ...offset(COLUMBUS, 0, -1), narrative: '', source: 'NOAA NCEI Storm Events' },
  // 5. Hail 0.5in — below threshold, should be filtered out.
  { noaaEventId: 'E5', date: daysAgo(10), eventType: 'hail', magnitudeValue: 0.5, magnitudeUnit: 'in', hailSize: 0.5, location: 'Worthington', county: 'Franklin', state: 'OH', ...offset(COLUMBUS, 1, 1), narrative: '', source: 'NOAA NCEI Storm Events' },
  // 6. Thunderstorm wind 50mph — below 58mph threshold, filtered out.
  { noaaEventId: 'E6', date: daysAgo(20), eventType: 'thunderstorm_wind', magnitudeValue: 50, magnitudeUnit: 'mph', hailSize: 0, location: 'Dublin', county: 'Franklin', state: 'OH', ...offset(COLUMBUS, 2, -2), narrative: '', source: 'NOAA NCEI Storm Events' },
  // 7. Hail 2.0in — outside 5mi radius (10mi N), filtered out.
  { noaaEventId: 'E7', date: daysAgo(45), eventType: 'hail', magnitudeValue: 2.0, magnitudeUnit: 'in', hailSize: 2.0, location: 'Delaware', county: 'Delaware', state: 'OH', ...offset(COLUMBUS, 10, 0), narrative: '', source: 'NOAA NCEI Storm Events' },
  // 8. Hail 1.5in — too old (14 months), filtered out.
  { noaaEventId: 'E8', date: daysAgo(420), eventType: 'hail', magnitudeValue: 1.5, magnitudeUnit: 'in', hailSize: 1.5, location: 'Bexley', county: 'Franklin', state: 'OH', ...offset(COLUMBUS, 1, 2), narrative: '', source: 'NOAA NCEI Storm Events' },
  // 9. Hail event missing coords — skipped.
  { noaaEventId: 'E9', date: daysAgo(15), eventType: 'hail', magnitudeValue: 1.0, magnitudeUnit: 'in', hailSize: 1.0, location: 'Unknown', county: '', state: 'OH', lat: null, lng: null, narrative: '', source: 'NOAA NCEI Storm Events' },
  // 10. Hail 1.0in, 4.5mi N, 5 days ago — passes, most recent hail.
  { noaaEventId: 'E10', date: daysAgo(5), eventType: 'hail', magnitudeValue: 1.0, magnitudeUnit: 'in', hailSize: 1.0, location: 'Worthington', county: 'Franklin', state: 'OH', ...offset(COLUMBUS, 4.5, 0), narrative: 'Quarter size hail reported.', source: 'NOAA NCEI Storm Events' },
];

// Seed disk cache so getStormData returns our synthetic events.
function seedCache() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify({
    schema: 2,
    storms: FAKE_STORMS,
    fetchedAt: new Date().toISOString(),
  }, null, 2));
}

function seedLead() {
  const leads = [{
    id: 'test-lead-1',
    address: '123 Test St, Columbus, OH',
    lat: COLUMBUS.lat,
    lng: COLUMBUS.lng,
    city: 'Columbus', state: 'OH', zip: '43215',
    homeowner: 'Test Owner', phone: '', email: '',
    status: 'new', repCode: 'TEST',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }, {
    id: 'test-lead-no-coords',
    address: '',  // no address AND no coords — should 400
    lat: null, lng: null,
    status: 'new', repCode: 'TEST',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }];
  fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2));
}

// ── Google Geocoding stub ─────────────────────────────────────────────────
// Intercept Google Maps API calls and return a canned response. NCEI calls
// never fire because the seeded cache is fresh.
const realFetch = global.fetch;
global.fetch = async function (url, opts) {
  if (typeof url === 'string' && url.includes('maps.googleapis.com/maps/api/geocode')) {
    // Very permissive stub — any address resolves to Columbus.
    return new Response(JSON.stringify({
      status: 'OK',
      results: [{
        formatted_address: '5131 Post Rd, Dublin, OH 43017, USA',
        geometry: { location: { lat: COLUMBUS.lat, lng: COLUMBUS.lng } },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, opts);
};

// Make sure the storms module picks up a Google key (any non-empty string
// will do since fetch is stubbed).
process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'test-key';

// Load modules AFTER stubs are in place.
const { getStormsNearPoint, _test } = require(path.join(__dirname, '..', 'lib', 'noaaStorms'));
const stormsRouter = require(path.join(__dirname, '..', 'routes', 'storms'));

const app = express();
app.use('/api/storms', stormsRouter);

// ── Test harness ──────────────────────────────────────────────────────────
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function httpGet(base, p) {
  const res = await realFetch(`${base}${p}`);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

// ── Tests ─────────────────────────────────────────────────────────────────
test('getStormsNearPoint filters by radius, date, magnitude, and sorts newest first', async () => {
  _test.clearCache();
  seedCache();
  const r = await getStormsNearPoint({ lat: COLUMBUS.lat, lng: COLUMBUS.lng });
  // Expected passes: E1, E2, E3, E4, E10. Rejected: E5 (mag), E6 (mag),
  // E7 (distance), E8 (date), E9 (no coords).
  assert(r.storms.length === 5, `expected 5 storms, got ${r.storms.length}: ${r.storms.map(s=>s.id).join(',')}`);
  // All within 5 miles.
  assert(r.storms.every(s => s.distanceMiles <= 5), 'all storms must be within 5 miles');
  // All meet magnitude thresholds.
  for (const s of r.storms) {
    if (s.eventType === 'hail') assert(s.magnitudeValue >= 0.75, `hail below 0.75: ${s.magnitudeValue}`);
    else assert(s.magnitudeValue >= 58, `wind below 58 mph: ${s.magnitudeValue}`);
  }
  // Sorted newest first (E10 is 5 days ago — should be first).
  assert(r.storms[0].id === 'E10', `expected E10 first, got ${r.storms[0].id}`);
  assert(r.totalMatched === 5, `totalMatched should be 5, got ${r.totalMatched}`);
  assert(r.notice && r.notice.includes('60 day lag'), 'expected 60-day notice');
  return `5 storms, newest ${r.storms[0].date}, params applied`;
});

test('GET /api/storms/near returns filtered results for Columbus point', async (base) => {
  _test.clearCache();
  seedCache();
  const r = await httpGet(base, `/api/storms/near?lat=${COLUMBUS.lat}&lng=${COLUMBUS.lng}&radius=5&months=12`);
  assert(r.status === 200, `expected 200, got ${r.status}`);
  assert(Array.isArray(r.json.storms), 'expected storms array');
  assert(r.json.storms.length === 5, `expected 5 storms, got ${r.json.storms.length}`);
  assert(r.json.params.radiusMiles === 5, 'radius echoed in params');
  assert(r.json.cacheAgeSeconds != null, 'cacheAgeSeconds present');
  return `200, 5 storms, cacheAge=${r.json.cacheAgeSeconds}s`;
});

test('GET /api/storms/near with tighter radius (1mi) returns fewer storms', async (base) => {
  const r = await httpGet(base, `/api/storms/near?lat=${COLUMBUS.lat}&lng=${COLUMBUS.lng}&radius=1`);
  assert(r.status === 200, `expected 200, got ${r.status}`);
  // Only E4 (1mi W) should be within 1 mile. E1 is 2mi N so no. Actually E4 is
  // placed at exactly 1mi W so distance ≤ 1.
  assert(r.json.storms.length <= 2, `expected ≤2 storms in 1mi, got ${r.json.storms.length}`);
  return `1mi radius → ${r.json.storms.length} storms`;
});

test('GET /api/storms/near validates lat/lng/radius/months', async (base) => {
  // Missing lat
  let r = await httpGet(base, '/api/storms/near?lng=-82');
  assert(r.status === 400, `missing lat should 400, got ${r.status}`);
  // Bad lat range
  r = await httpGet(base, '/api/storms/near?lat=999&lng=-82');
  assert(r.status === 400, `out-of-range lat should 400, got ${r.status}`);
  // Radius too big
  r = await httpGet(base, `/api/storms/near?lat=${COLUMBUS.lat}&lng=${COLUMBUS.lng}&radius=50`);
  assert(r.status === 400, `radius>25 should 400, got ${r.status}`);
  // Months too big
  r = await httpGet(base, `/api/storms/near?lat=${COLUMBUS.lat}&lng=${COLUMBUS.lng}&months=36`);
  assert(r.status === 400, `months>24 should 400, got ${r.status}`);
  return 'all 4 validation cases 400';
});

test('GET /api/storms/near over ocean returns empty array, not error', async (base) => {
  const r = await httpGet(base, '/api/storms/near?lat=0&lng=-150');
  assert(r.status === 200, `ocean query should 200, got ${r.status}`);
  assert(Array.isArray(r.json.storms) && r.json.storms.length === 0, 'storms should be empty');
  assert(r.json.totalMatched === 0, 'totalMatched should be 0');
  return 'empty result is a valid answer';
});

test('GET /api/storms/near cache hit — second call is fast and returns same data', async (base) => {
  const r1 = await httpGet(base, `/api/storms/near?lat=${COLUMBUS.lat}&lng=${COLUMBUS.lng}`);
  const t0 = Date.now();
  const r2 = await httpGet(base, `/api/storms/near?lat=${COLUMBUS.lat}&lng=${COLUMBUS.lng}`);
  const dt = Date.now() - t0;
  assert(r2.status === 200, `expected 200, got ${r2.status}`);
  assert(r2.json.storms.length === r1.json.storms.length, 'same number of storms between calls');
  assert(dt < 500, `second call should be fast (< 500ms), took ${dt}ms`);
  return `repeat call took ${dt}ms`;
});

test('GET /api/storms/for-lead/:id uses lead lat/lng', async (base) => {
  seedLead();
  const r = await httpGet(base, '/api/storms/for-lead/test-lead-1');
  assert(r.status === 200, `expected 200, got ${r.status}`);
  assert(r.json.storms.length === 5, `expected 5 storms, got ${r.json.storms.length}`);
  assert(r.json.lead && r.json.lead.id === 'test-lead-1', 'lead id echoed');
  return `lead → 5 storms`;
});

test('GET /api/storms/for-lead/:id returns 400 when lead has no coords or address', async (base) => {
  const r = await httpGet(base, '/api/storms/for-lead/test-lead-no-coords');
  assert(r.status === 400, `expected 400, got ${r.status}`);
  return `missing coords + address → 400`;
});

test('GET /api/storms/for-lead/:id returns 404 when lead is unknown', async (base) => {
  const r = await httpGet(base, '/api/storms/for-lead/does-not-exist');
  assert(r.status === 404, `expected 404, got ${r.status}`);
  return `unknown lead → 404`;
});

test('GET /api/storms/for-address geocodes and returns storms', async (base) => {
  const r = await httpGet(base, '/api/storms/for-address?address=5131%20Post%20Rd%2C%20Dublin%20OH');
  assert(r.status === 200, `expected 200, got ${r.status}`);
  assert(r.json.geocoded && Number.isFinite(r.json.geocoded.lat), 'geocoded lat/lng returned');
  assert(r.json.storms.length === 5, `expected 5 storms, got ${r.json.storms.length}`);
  assert(r.json.address && r.json.address.includes('Post Rd'), 'formatted address echoed');
  return `for-address → ${r.json.storms.length} storms at ${r.json.geocoded.lat.toFixed(3)},${r.json.geocoded.lng.toFixed(3)}`;
});

test('GET /api/storms/for-address returns 400 when address is missing', async (base) => {
  const r = await httpGet(base, '/api/storms/for-address');
  assert(r.status === 400, `expected 400, got ${r.status}`);
  return `missing address → 400`;
});

// ── Runner ────────────────────────────────────────────────────────────────
(async () => {
  const server = http.createServer(app).listen(0);
  await new Promise(r => server.on('listening', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  console.log(`[test-noaa-map] server on ${base}\n`);

  let pass = 0, fail = 0;
  for (const t of tests) {
    process.stdout.write(`  ${t.name} ... `);
    try {
      const info = await t.fn(base);
      console.log(`PASS${info ? '  (' + info + ')' : ''}`);
      pass++;
    } catch (err) {
      console.log(`FAIL\n    -> ${err.message}`);
      fail++;
    }
  }

  server.close();
  restoreFiles();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})().catch(err => { console.error(err); restoreFiles(); process.exit(1); });
