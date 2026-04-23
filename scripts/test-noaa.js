#!/usr/bin/env node
/** Field App — NOAA storm data reliability tests.
 *  Spins a minimal Express on a random port, hits /api/storms,
 *  verifies live / cached / 503 / no-stale-fallback. */
const express = require('express');
const http = require('http');
const path = require('path');

const { _test } = require(path.join(__dirname, '..', 'lib', 'noaaStorms'));
const stormsRouter = require(path.join(__dirname, '..', 'routes', 'storms'));

const app = express();
app.use('/api/storms', stormsRouter);

const tests = [];
const results = [];

function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function httpGet(base, path) {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

test('live NOAA fetch for Columbus OH returns 200 with source=live', async (base) => {
  _test.clearCache();
  _test.setForceFailure(false);
  const r = await httpGet(base, '/api/storms');
  assert(r.status === 200, `expected 200, got ${r.status}`);
  assert(r.json && Array.isArray(r.json.storms), 'expected storms array');
  assert(r.json.source === 'live', `expected source=live, got ${r.json.source}`);
  assert(r.json.storms.length > 0, 'expected at least one live Ohio hail event');
  assert(r.json.fetchedAt, 'expected fetchedAt timestamp');
  const e = r.json.storms[0];
  assert(e.date && typeof e.hailSize === 'number' && e.county && e.state === 'OH',
    'event shape missing required fields');
  assert(e.source && e.source.toLowerCase().includes('noaa'), 'event source should reference NOAA');
  return `live events: ${r.json.storms.length}, sample: ${e.date} ${e.hailSize}" ${e.location}, ${e.county}`;
});

test('second call within 24h returns source=cached', async (base) => {
  const r = await httpGet(base, '/api/storms');
  assert(r.status === 200, `expected 200, got ${r.status}`);
  assert(r.json.source === 'cached', `expected source=cached, got ${r.json.source}`);
  assert(r.json.cacheAge, 'expected cacheAge field on cached response');
  return `cached; cacheAge=${r.json.cacheAge}, events=${r.json.storms.length}`;
});

test('NOAA failure returns 503 with structured error (no stale data)', async (base) => {
  _test.clearCache();
  _test.setForceFailure(true);
  const r = await httpGet(base, '/api/storms');
  assert(r.status === 503, `expected 503, got ${r.status}`);
  assert(r.json, 'expected JSON body');
  assert(r.json.error === 'Storm data temporarily unavailable', `wrong error text: ${r.json.error}`);
  assert(r.json.retryAfter === 60, `wrong retryAfter: ${r.json.retryAfter}`);
  assert(r.json.source === 'NOAA', `wrong source: ${r.json.source}`);
  assert(typeof r.json.message === 'string' && r.json.message.length > 0, 'expected human message');
  assert(!Array.isArray(r.json.storms), '503 body must not carry a storms array');
  assert(!Array.isArray(r.json.events), '503 body must not carry a legacy events array');
  return 'clean 503 with no stale payload';
});

test('reference list only returned when explicitly requested', async (base) => {
  const r = await httpGet(base, '/api/storms?source=reference');
  assert(r.status === 200, `expected 200, got ${r.status}`);
  assert(r.json.source === 'reference', `expected source=reference, got ${r.json.source}`);
  assert(Array.isArray(r.json.storms) && r.json.storms.length > 0, 'reference list should be non-empty');
  _test.setForceFailure(false);
  return `reference events: ${r.json.storms.length}`;
});

(async () => {
  const server = http.createServer(app).listen(0);
  await new Promise(r => server.on('listening', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  console.log(`[test] server on ${base}\n`);

  let pass = 0, fail = 0;
  for (const t of tests) {
    process.stdout.write(`  ${t.name} ... `);
    try {
      const info = await t.fn(base);
      console.log(`PASS${info ? '  (' + info + ')' : ''}`);
      results.push({ name: t.name, ok: true, info });
      pass++;
    } catch (err) {
      console.log(`FAIL\n    -> ${err.message}`);
      results.push({ name: t.name, ok: false, error: err.message });
      fail++;
    }
  }

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})().catch(err => { console.error(err); process.exit(1); });
