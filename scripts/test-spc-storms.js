#!/usr/bin/env node
/** SPC Storm Reports tests.
 *
 *  1. Direct SPC fetch for the 3/22/2026 Columbus hail event returns Ohio
 *     reports with sane lat/lng.
 *  2. dedupeEvents drops a preliminary record when an NCEI verified copy of
 *     the same incident is present (synthetic NCEI + SPC overlap).
 *  3. /api/storms/recent returns SPC-only events with status: preliminary.
 *  4. /api/storms/for-address resolves a Columbus address and returns the
 *     3/22/2026 hail events that are NOT in NCEI yet — the real validation.
 *
 *  Tests share an in-process Express to avoid any port collision with a
 *  running dev server.
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');

const spc = require(path.join(__dirname, '..', 'lib', 'spcStorms'));
const { _test, getReferenceStorms } = require(path.join(__dirname, '..', 'lib', 'noaaStorms'));
const stormsRouter = require(path.join(__dirname, '..', 'routes', 'storms'));

const app = express();
app.use('/api/storms', stormsRouter);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function httpGet(base, p) {
  const res = await fetch(`${base}${p}`);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

// ── 1. Direct SPC fetch for 3/22/2026 ─────────────────────────────────────
test('SPC fetch for 2026-03-22 returns Ohio hail reports', async () => {
  const r = await spc.fetchSPCReportsForDate('2026-03-22');
  assert(Array.isArray(r.hail), 'hail array missing');
  assert(r.hail.length > 0, `expected >0 OH hail reports, got ${r.hail.length}`);
  // Every event must be Ohio + have valid coords + status preliminary
  for (const e of r.hail) {
    assert(e.state === 'OH', `non-OH event leaked: ${JSON.stringify(e)}`);
    assert(e.status === 'preliminary', `wrong status: ${e.status}`);
    assert(e.source === 'NOAA SPC Preliminary', `wrong source: ${e.source}`);
    assert(Number.isFinite(e.lat) && e.lat > 38 && e.lat < 42, `bad lat: ${e.lat}`);
    assert(Number.isFinite(e.lng) && e.lng > -85 && e.lng < -80, `bad lng: ${e.lng}`);
    assert(e.eventType === 'hail' && e.magnitudeUnit === 'in', 'bad type/unit');
  }
  const franklinOrLicking = r.hail.filter(e =>
    /Franklin|Licking|Delaware|Muskingum|Guernsey/i.test(e.county));
  assert(franklinOrLicking.length > 0, 'expected at least one central-OH county hail report');
  return `${r.hail.length} OH hail, ${r.wind.length} OH wind, ${r.tornado.length} OH tornado`;
});

// ── 2. Dedupe synthetic NCEI + SPC overlap ────────────────────────────────
test('dedupeEvents drops preliminary when verified covers the same incident', () => {
  const verified = {
    id: 'NCEI-1', date: '2026-03-22', eventType: 'hail',
    magnitude: '1.50 in', magnitudeValue: 1.5, magnitudeUnit: 'in',
    lat: 40.10, lng: -82.99, location: 'Columbus', county: 'Franklin',
    distanceMiles: 1.2, narrative: '', source: 'NOAA NCEI Storm Events',
    status: 'verified',
  };
  // Same event reported by SPC ~0.5 mi away, slightly different magnitude.
  const preliminary = {
    id: 'SPC-1', date: '2026-03-22', eventType: 'hail',
    magnitude: '1.25 in', magnitudeValue: 1.25, magnitudeUnit: 'in',
    lat: 40.10, lng: -82.98, location: 'Columbus', county: 'Franklin',
    distanceMiles: 1.5, narrative: 'mPING', source: 'NOAA SPC Preliminary',
    status: 'preliminary',
  };
  // Genuinely separate prelim event ~50 mi away — must survive dedupe.
  const standalone = {
    id: 'SPC-2', date: '2026-03-22', eventType: 'hail',
    magnitude: '1.00 in', magnitudeValue: 1.0, magnitudeUnit: 'in',
    lat: 40.15, lng: -82.69, location: 'Johnstown', county: 'Licking',
    distanceMiles: 18, narrative: '', source: 'NOAA SPC Preliminary',
    status: 'preliminary',
  };
  const out = _test.dedupeEvents([preliminary, verified, standalone]);
  const ids = out.map(e => e.id).sort();
  assert(out.length === 2, `expected 2 events post-dedupe, got ${out.length}: ${ids.join(',')}`);
  assert(ids.includes('NCEI-1'), 'verified event must be kept');
  assert(ids.includes('SPC-2'), 'standalone preliminary must be kept');
  assert(!ids.includes('SPC-1'), 'overlapping preliminary must be dropped');
  return `kept ${ids.join(', ')}`;
});

// ── 3. /api/storms/recent returns SPC-only with status preliminary ───────
test('/api/storms/recent returns preliminary events near Columbus', async (base) => {
  // Use Johnstown OH coords (40.15, -82.69) — known SPC hail spot 3/22/2026.
  // Recent endpoint defaults to 7 days, but we extend to 30 to capture 3/22.
  const today = new Date();
  const eventDate = new Date('2026-03-22');
  const daysSince = Math.ceil((today - eventDate) / 86400000);
  const days = Math.min(30, Math.max(7, daysSince + 1));
  const r = await httpGet(base, `/api/storms/recent?lat=40.15&lng=-82.69&radius=10&days=${days}`);
  assert(r.status === 200, `expected 200, got ${r.status}: ${r.text}`);
  assert(r.json && Array.isArray(r.json.storms), 'expected storms array');
  assert(r.json.params.spcOnly === true, 'expected spcOnly: true');
  for (const e of r.json.storms) {
    assert(e.status === 'preliminary', `non-preliminary leaked into /recent: ${e.status}`);
    assert(/SPC/.test(e.source), `wrong source on /recent: ${e.source}`);
  }
  return `${r.json.storms.length} preliminary events in last ${days}d near Johnstown`;
});

// ── 4. /api/storms/for-address: Columbus shows 3/22/2026 hail ────────────
test('/api/storms/for-address returns 2026-03-22 hail near Columbus, status preliminary', async (base) => {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return 'SKIPPED — GOOGLE_MAPS_API_KEY not set in env';
  }
  // Pick a known central-OH address near the heaviest 3/22 reports
  // (Dresden/Saint Louisville/Johnstown corridor — Licking & Muskingum).
  const addr = '100 Public Square, Johnstown, OH 43031';
  const r = await httpGet(base, `/api/storms/for-address?address=${encodeURIComponent(addr)}&radius=10&months=12`);
  assert(r.status === 200, `expected 200, got ${r.status}: ${r.text.slice(0, 200)}`);
  assert(Array.isArray(r.json.storms), 'expected storms array');
  const march22 = r.json.storms.filter(s => s.date === '2026-03-22');
  assert(march22.length > 0, `expected ≥1 event on 2026-03-22, got 0 of ${r.json.storms.length} total`);
  const sample = march22[0];
  assert(sample.status === 'preliminary', `expected preliminary status, got ${sample.status}`);
  assert(/SPC/.test(sample.source), `expected SPC source, got ${sample.source}`);
  assert(sample.eventType === 'hail', `expected hail, got ${sample.eventType}`);
  return `${march22.length} 2026-03-22 events near Johnstown — sample: ${sample.magnitude} ${sample.location} (status=${sample.status})`;
});

// ── 5. Sanity: dedupe + sources + counts on /near ────────────────────────
test('/api/storms/near reports merged sources + status counts', async (base) => {
  const r = await httpGet(base, '/api/storms/near?lat=40.15&lng=-82.69&radius=15&months=12');
  assert(r.status === 200, `expected 200, got ${r.status}`);
  assert(Array.isArray(r.json.sources), 'sources array missing');
  assert(r.json.counts && typeof r.json.counts.preliminary === 'number', 'counts.preliminary missing');
  assert(r.json.counts.verified + r.json.counts.preliminary === r.json.totalMatched,
    'count math wrong');
  return `sources=${r.json.sources.join(',')} verified=${r.json.counts.verified} prelim=${r.json.counts.preliminary}`;
});

(async () => {
  const server = http.createServer(app).listen(0);
  await new Promise(r => server.on('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`[test] server on ${base}\n`);

  let pass = 0, fail = 0, skip = 0;
  for (const t of tests) {
    process.stdout.write(`  ${t.name} ... `);
    try {
      const info = await t.fn(base);
      if (info && info.startsWith('SKIPPED')) {
        console.log(`SKIP  (${info})`);
        skip++;
      } else {
        console.log(`PASS${info ? '  (' + info + ')' : ''}`);
        pass++;
      }
    } catch (err) {
      console.log(`FAIL\n    -> ${err.message}`);
      fail++;
    }
  }

  server.close();
  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  if (fail) process.exit(1);
})().catch(err => { console.error(err); process.exit(1); });
