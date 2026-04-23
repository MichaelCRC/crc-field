/** NOAA Storm Events service — pulls Ohio hail + severe wind events from
 *  the NCEI bulk CSV. National CSV, we filter to OH at parse time.
 *  Endpoint: https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/
 *  (annual gzipped CSVs, updated monthly). Free, no API key.
 *
 *  NOTE on "~60 day publication lag": NCEI publishes Storm Events Database
 *  with roughly a 60-day lag from event date to indexed availability. We
 *  surface this notice in responses so reps don't chase data that doesn't
 *  exist yet. */
const { createGunzip } = require('zlib');
const { Readable } = require('stream');
const { read, write } = require('./store');

const NCEI_BASE = 'https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/';
const CACHE_FILE = 'storm-cache.json';
const CACHE_TTL_MS = 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 30_000;
const CACHE_SCHEMA = 2; // bump when event shape changes -- old caches get ignored

// Event type → NOAA CSV EVENT_TYPE strings we accept.
const EVENT_TYPES = {
  hail: ['Hail'],
  thunderstorm_wind: ['Thunderstorm Wind'],
  high_wind: ['High Wind'],
};

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
    if (disk && disk.fetchedAt && disk.schema === CACHE_SCHEMA) {
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
  memCache = { schema: CACHE_SCHEMA, storms, fetchedAt };
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
    events.push(...parseOhioEvents(csv));
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

function parseOhioEvents(csv) {
  const lines = csv.split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const idx = (n) => header.indexOf(n);
  const cols = {
    state: idx('STATE'), type: idx('EVENT_TYPE'), county: idx('CZ_NAME'),
    ym: idx('BEGIN_YEARMONTH'), d: idx('BEGIN_DAY'),
    mag: idx('MAGNITUDE'), magType: idx('MAGNITUDE_TYPE'),
    loc: idx('BEGIN_LOCATION'),
    lat: idx('BEGIN_LAT'), lng: idx('BEGIN_LON'), eid: idx('EVENT_ID'),
    narrative: idx('EVENT_NARRATIVE'),
  };
  const acceptable = new Set(Object.values(EVENT_TYPES).flat().map(s => s.toLowerCase()));
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCSVLine(lines[i]);
    if (c.length < 10) continue;
    if ((c[cols.state] || '').toUpperCase() !== 'OHIO') continue;
    const rawType = (c[cols.type] || '').trim();
    if (!acceptable.has(rawType.toLowerCase())) continue;
    const eventType = normalizeEventType(rawType);
    const ym = c[cols.ym] || '';
    const date = `${ym.substring(0, 4)}-${ym.substring(4, 6)}-${String(c[cols.d] || '').padStart(2, '0')}`;
    const magRaw = parseFloat(c[cols.mag]);
    const magnitudeValue = Number.isFinite(magRaw) ? magRaw : 0;
    const magnitudeUnit = eventType === 'hail' ? 'in' : 'mph';
    const lat = parseFloat(c[cols.lat]);
    const lng = parseFloat(c[cols.lng]);
    out.push({
      noaaEventId: c[cols.eid] || '',
      date,
      eventType,
      magnitudeValue,
      magnitudeUnit,
      // Keep hailSize for back-compat with existing storm overlay UI.
      hailSize: eventType === 'hail' ? magnitudeValue : 0,
      location: (c[cols.loc] || c[cols.county] || '').trim(),
      county: toTitle((c[cols.county] || '').toUpperCase()),
      state: 'OH',
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      narrative: (c[cols.narrative] || '').trim(),
      source: 'NOAA NCEI Storm Events',
    });
  }
  return out;
}

function normalizeEventType(raw) {
  const r = raw.toLowerCase().trim();
  if (r === 'hail') return 'hail';
  if (r === 'thunderstorm wind') return 'thunderstorm_wind';
  if (r === 'high wind') return 'high_wind';
  return r.replace(/\s+/g, '_');
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

// ── Haversine (great-circle distance) ─────────────────────────────────────
const EARTH_RADIUS_MI = 3958.7613;
function haversineMiles(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(a));
}

/** Core filter used by all point/address/lead endpoints.
 *  Returns a uniform response shape — keep this stable, UI depends on it.
 *
 *  Caller handles whether to hit live NCEI vs. cached snapshot — this just
 *  sources events via getStormData() which itself uses the 24h disk cache. */
async function getStormsNearPoint({
  lat, lng,
  radiusMiles = 5,
  months = 12,
  eventTypes = ['hail', 'thunderstorm_wind', 'high_wind'],
  minHailInches = 0.75,
  minWindMph = 58,
  limit = 20,
} = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('lat and lng are required numbers');
  }

  const data = await getStormData();
  const typeSet = new Set(eventTypes);
  const cutoffMs = Date.now() - months * 30 * 86400000;

  const enriched = [];
  for (const ev of data.storms) {
    if (!typeSet.has(ev.eventType)) continue;
    // Magnitude thresholds per event type.
    if (ev.eventType === 'hail' && ev.magnitudeValue < minHailInches) continue;
    if ((ev.eventType === 'thunderstorm_wind' || ev.eventType === 'high_wind')
        && ev.magnitudeValue < minWindMph) continue;
    // Must have coords to do distance math.
    if (!Number.isFinite(ev.lat) || !Number.isFinite(ev.lng)) continue;
    const distanceMiles = haversineMiles(lat, lng, ev.lat, ev.lng);
    if (distanceMiles > radiusMiles) continue;
    // Date window.
    const ts = new Date(ev.date).getTime();
    if (!Number.isFinite(ts) || ts < cutoffMs) continue;

    enriched.push({
      id: ev.noaaEventId || `${ev.date}-${ev.lat}-${ev.lng}`,
      date: ev.date,
      eventType: ev.eventType,
      magnitude: formatMagnitude(ev),
      magnitudeValue: ev.magnitudeValue,
      magnitudeUnit: ev.magnitudeUnit,
      lat: ev.lat,
      lng: ev.lng,
      location: ev.location && ev.county
        ? `${ev.location}, ${ev.county} Co.`
        : (ev.location || ev.county || 'Unknown'),
      county: ev.county,
      distanceMiles: Math.round(distanceMiles * 10) / 10,
      narrative: ev.narrative || '',
      source: ev.source || 'NOAA NCEI Storm Events',
    });
  }

  enriched.sort((a, b) => (a.date < b.date ? 1 : -1));
  const returned = enriched.slice(0, limit);

  const cacheAgeSeconds = data.fetchedAt
    ? Math.floor((Date.now() - new Date(data.fetchedAt).getTime()) / 1000)
    : null;

  return {
    storms: returned,
    fetchedAt: data.fetchedAt,
    source: data.source,
    cacheAgeSeconds,
    totalMatched: enriched.length,
    returned: returned.length,
    params: {
      lat, lng, radiusMiles, months,
      eventTypes: [...typeSet],
      minHailInches, minWindMph,
    },
    notice: 'NCEI publishes events with ~60 day lag. Events from the past 60 days may not appear.',
  };
}

function formatMagnitude(ev) {
  if (!ev.magnitudeValue) return '';
  if (ev.magnitudeUnit === 'in') return `${ev.magnitudeValue} in`;
  return `${Math.round(ev.magnitudeValue)} mph`;
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
  getStormsNearPoint,
  getReferenceStorms,
  haversineMiles,
  CACHE_TTL_MS,
  _test: { setForceFailure: _setForceFailure, clearCache: _clearCache },
};
