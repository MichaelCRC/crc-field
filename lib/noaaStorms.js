/** NOAA Storm Events service — pulls Ohio hail events from NCEI bulk CSV.
 *  Mirrors the proven pattern in crc-webhook/portal/services/noaaStorms.js.
 *  Endpoint: https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/
 *  (annual gzipped CSVs, updated monthly). Free, no API key. */
const { createGunzip } = require('zlib');
const { Readable } = require('stream');
const { read, write } = require('./store');

const NCEI_BASE = 'https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/';
const CACHE_FILE = 'storm-cache.json';
const CACHE_TTL_MS = 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 30_000;

const CENTRAL_OH_COUNTIES = [
  'FRANKLIN', 'DELAWARE', 'LICKING', 'FAIRFIELD', 'PICKAWAY',
  'MADISON', 'UNION', 'MORROW', 'KNOX', 'PERRY',
];

let memCache = null;
let memFetchedAt = 0;
let forceFailure = false;

function _setForceFailure(v) { forceFailure = !!v; }
function _clearCache() { memCache = null; memFetchedAt = 0; try { write(CACHE_FILE, null); } catch {} }

/** Returns { source: 'live'|'cached', storms, fetchedAt, cacheAge? }.
 *  Throws on NOAA failure — caller decides how to respond. */
async function getStormData({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    if (memCache && Date.now() - memFetchedAt < CACHE_TTL_MS) {
      return { source: 'cached', storms: memCache.storms, fetchedAt: memCache.fetchedAt, cacheAge: humanizeAge(memFetchedAt) };
    }
    const disk = read(CACHE_FILE, null);
    if (disk && disk.fetchedAt) {
      const age = Date.now() - new Date(disk.fetchedAt).getTime();
      if (age < CACHE_TTL_MS && Array.isArray(disk.storms)) {
        memCache = disk;
        memFetchedAt = new Date(disk.fetchedAt).getTime();
        return { source: 'cached', storms: disk.storms, fetchedAt: disk.fetchedAt, cacheAge: humanizeAge(memFetchedAt) };
      }
    }
  }

  const storms = await fetchFromNCEI();
  const fetchedAt = new Date().toISOString();
  memCache = { storms, fetchedAt };
  memFetchedAt = Date.now();
  write(CACHE_FILE, memCache);
  return { source: 'live', storms, fetchedAt };
}

async function fetchFromNCEI() {
  if (forceFailure) throw new Error('NOAA fetch forced failure (test mode)');

  const index = await fetchText(NCEI_BASE);
  const currentYear = new Date().getFullYear();
  const events = [];
  let pulledAny = false;

  for (const year of [currentYear, currentYear - 1]) {
    const match = index.match(new RegExp(`StormEvents_details-ftp_v1\\.0_d${year}_c\\d+\\.csv\\.gz`));
    if (!match) continue;
    const url = NCEI_BASE + match[0];
    const buf = await fetchBuffer(url);
    const csv = await gunzip(buf);
    events.push(...parseOhioHail(csv));
    pulledAny = true;
  }

  if (!pulledAny) throw new Error('NOAA returned no usable annual CSV files');
  events.sort((a, b) => (a.date < b.date ? 1 : -1));
  return events;
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`NOAA ${url} returned HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

async function fetchBuffer(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`NOAA ${url} returned HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}

function gunzip(buf) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    Readable.from(buf).pipe(createGunzip())
      .on('data', c => chunks.push(c))
      .on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      .on('error', reject);
  });
}

function parseOhioHail(csv) {
  const lines = csv.split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const idx = (n) => header.indexOf(n);
  const cols = {
    state: idx('STATE'), type: idx('EVENT_TYPE'), county: idx('CZ_NAME'),
    ym: idx('BEGIN_YEARMONTH'), d: idx('BEGIN_DAY'),
    mag: idx('MAGNITUDE'), loc: idx('BEGIN_LOCATION'),
    lat: idx('BEGIN_LAT'), lng: idx('BEGIN_LON'), eid: idx('EVENT_ID'),
  };
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCSVLine(lines[i]);
    if (c.length < 20) continue;
    if ((c[cols.state] || '').toUpperCase() !== 'OHIO') continue;
    if ((c[cols.type] || '').trim() !== 'Hail') continue;
    const county = (c[cols.county] || '').toUpperCase();
    if (!CENTRAL_OH_COUNTIES.includes(county)) continue;
    const ym = c[cols.ym] || '';
    const date = `${ym.substring(0, 4)}-${ym.substring(4, 6)}-${String(c[cols.d] || '').padStart(2, '0')}`;
    const hailSize = parseFloat(c[cols.mag]) || 0;
    out.push({
      date,
      location: (c[cols.loc] || c[cols.county] || '').trim(),
      county: toTitle(county),
      state: 'OH',
      hailSize,
      lat: parseFloat(c[cols.lat]) || null,
      lng: parseFloat(c[cols.lng]) || null,
      source: 'NOAA Storm Events',
      noaaEventId: c[cols.eid] || '',
    });
  }
  return out;
}

function parseCSVLine(line) {
  const out = []; let cur = ''; let q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function toTitle(s) { return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }

function humanizeAge(fromMs) {
  const h = Math.floor((Date.now() - fromMs) / 3600000);
  if (h < 1) {
    const m = Math.max(1, Math.floor((Date.now() - fromMs) / 60000));
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  return `${h} hour${h === 1 ? '' : 's'}`;
}

/** Reference-only curated list. Never returned unless explicitly requested. */
function getReferenceStorms() {
  return [
    { date: '2026-03-14', location: 'Westerville', county: 'Franklin', state: 'OH', hailSize: 1.75, lat: 40.126, lng: -82.929, source: 'IHM verified' },
    { date: '2026-03-14', location: 'Gahanna',     county: 'Franklin', state: 'OH', hailSize: 1.50, lat: 40.019, lng: -82.879, source: 'IHM verified' },
    { date: '2026-03-14', location: 'New Albany',  county: 'Franklin', state: 'OH', hailSize: 1.25, lat: 40.081, lng: -82.808, source: 'IHM verified' },
    { date: '2026-03-22', location: 'Dublin',      county: 'Franklin', state: 'OH', hailSize: 1.50, lat: 40.099, lng: -83.114, source: 'IHM verified' },
    { date: '2026-03-22', location: 'Hilliard',    county: 'Franklin', state: 'OH', hailSize: 1.25, lat: 40.033, lng: -83.158, source: 'IHM verified' },
    { date: '2026-03-22', location: 'Powell',      county: 'Delaware', state: 'OH', hailSize: 1.00, lat: 40.158, lng: -83.075, source: 'IHM verified' },
    { date: '2025-06-15', location: 'Reynoldsburg', county: 'Franklin', state: 'OH', hailSize: 1.00, lat: 39.955, lng: -82.812, source: 'NWS' },
    { date: '2025-08-22', location: 'Grove City',  county: 'Franklin', state: 'OH', hailSize: 0.88, lat: 39.881, lng: -83.093, source: 'NWS' },
    { date: '2025-05-08', location: 'Pickerington', county: 'Fairfield', state: 'OH', hailSize: 1.25, lat: 39.884, lng: -82.754, source: 'NWS' },
    { date: '2025-04-10', location: 'Delaware',    county: 'Delaware', state: 'OH', hailSize: 1.75, lat: 40.299, lng: -83.068, source: 'NWS' },
  ];
}

module.exports = {
  getStormData,
  getReferenceStorms,
  CACHE_TTL_MS,
  _test: { setForceFailure: _setForceFailure, clearCache: _clearCache },
};
