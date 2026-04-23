/** NOAA Storm Events service — pulls Ohio hail + severe wind events from
 *  the NCEI bulk CSV. National CSV, we filter to OH at parse time.
 *  Endpoint: https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/
 *  (annual gzipped CSVs, updated monthly). Free, no API key.
 *
 *  NOTE on "~60 day publication lag": NCEI publishes Storm Events Database
 *  with a 60-180 day lag from event date to indexed availability. For the
 *  fresh window we layer NOAA SPC preliminary reports (see lib/spcStorms.js)
 *  on top so reps can see yesterday's storms without waiting a quarter for
 *  NCEI to catch up. NCEI events carry status "verified"; SPC events carry
 *  status "preliminary". Dedupe favors NCEI when both describe the same
 *  event. */
const { createGunzip } = require('zlib');
const { Readable } = require('stream');
const { read, write } = require('./store');
const { getSPCStormsInRange } = require('./spcStorms');

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
      status: 'verified',
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

// Default SPC supplementation window. We don't fetch SPC beyond this many days
// back on-demand (older dates rarely add value once NCEI catches up, and it
// would mean 90+ HTTP fetches on a cold cache). Cached-older SPC events still
// appear if a prior call warmed them.
const SPC_FETCH_DAYS = 90;

/** Core filter used by all point/address/lead endpoints.
 *  Returns a uniform response shape — keep this stable, UI depends on it.
 *
 *  Merges NCEI (verified) + SPC (preliminary) events inside the requested
 *  window. Dedupe: events within 2 miles on the same ±1 day with same type
 *  are considered the same incident; the NCEI record wins because it has a
 *  vetted magnitude and event ID.
 *
 *  - `spcDays` caps how far back we fetch SPC on this call (default 90).
 *  - Set `spcOnly: true` to bypass NCEI entirely (used by /api/storms/recent).
 */
async function getStormsNearPoint({
  lat, lng,
  radiusMiles = 5,
  months = 12,
  eventTypes = ['hail', 'thunderstorm_wind', 'high_wind'],
  minHailInches = 0.75,
  minWindMph = 58,
  limit = 20,
  spcDays = SPC_FETCH_DAYS,
  spcOnly = false,
} = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('lat and lng are required numbers');
  }

  const typeSet = new Set(eventTypes);
  const cutoffMs = Date.now() - months * 30 * 86400000;

  // ── NCEI (verified) ──
  let nceiFetchedAt = null;
  let nceiSource = null;
  const nceiEnriched = [];
  if (!spcOnly) {
    const data = await getStormData();
    nceiFetchedAt = data.fetchedAt;
    nceiSource = data.source;
    for (const ev of data.storms) {
      const e = filterAndEnrich(ev, { lat, lng, radiusMiles, typeSet, cutoffMs, minHailInches, minWindMph });
      if (e) nceiEnriched.push(e);
    }
  }

  // ── SPC (preliminary) ──
  // Always pull the last `spcDays` window — this is what keeps the rep current.
  const spcStart = new Date(Math.max(Date.now() - spcDays * 86400000, cutoffMs));
  const spcEnd = new Date();
  const spcStartStr = isoDate(spcStart);
  const spcEndStr = isoDate(spcEnd);
  let spcFetchedAt = null;
  const spcEnriched = [];
  try {
    const spcEvents = await getSPCStormsInRange({ startDate: spcStartStr, endDate: spcEndStr });
    spcFetchedAt = new Date().toISOString();
    for (const ev of spcEvents) {
      const e = filterAndEnrich(ev, { lat, lng, radiusMiles, typeSet, cutoffMs, minHailInches, minWindMph });
      if (e) spcEnriched.push(e);
    }
  } catch (e) {
    // SPC failure is non-fatal for the merged endpoint — the UI still gets
    // NCEI. /api/storms/recent (spcOnly) bubbles the error up instead.
    if (spcOnly) throw e;
    console.warn('[Storms] SPC supplement failed, serving NCEI only:', e.message);
  }

  // ── Merge + dedupe (NCEI wins) ──
  const merged = dedupeEvents([...nceiEnriched, ...spcEnriched]);
  merged.sort((a, b) => (a.date < b.date ? 1 : -1));
  const returned = merged.slice(0, limit);

  const cacheAgeSeconds = nceiFetchedAt
    ? Math.floor((Date.now() - new Date(nceiFetchedAt).getTime()) / 1000)
    : null;

  // Build source descriptor reflecting what actually contributed.
  const sources = [];
  if (nceiEnriched.length || (!spcOnly && nceiFetchedAt)) sources.push('NCEI');
  if (spcEnriched.length || spcFetchedAt) sources.push('SPC');

  return {
    storms: returned,
    fetchedAt: nceiFetchedAt || spcFetchedAt,
    source: spcOnly ? 'spc' : (nceiSource || 'merged'),
    sources,
    cacheAgeSeconds,
    totalMatched: merged.length,
    returned: returned.length,
    counts: {
      verified: merged.filter(e => e.status === 'verified').length,
      preliminary: merged.filter(e => e.status === 'preliminary').length,
    },
    params: {
      lat, lng, radiusMiles, months,
      eventTypes: [...typeSet],
      minHailInches, minWindMph,
      spcDays: spcOnly ? spcDays : spcDays,
      spcOnly,
    },
    notice: spcOnly
      ? 'SPC preliminary reports land within hours. Magnitudes and locations may be refined later.'
      : 'NCEI publishes with ~60-180 day lag. Recent events shown as "preliminary" from SPC until NCEI verifies them.',
  };
}

function isoDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function filterAndEnrich(ev, { lat, lng, radiusMiles, typeSet, cutoffMs, minHailInches, minWindMph }) {
  if (!typeSet.has(ev.eventType)) return null;
  if (ev.eventType === 'hail' && ev.magnitudeValue < minHailInches) return null;
  if ((ev.eventType === 'thunderstorm_wind' || ev.eventType === 'high_wind')
      && ev.magnitudeValue < minWindMph) return null;
  if (!Number.isFinite(ev.lat) || !Number.isFinite(ev.lng)) return null;
  const distanceMiles = haversineMiles(lat, lng, ev.lat, ev.lng);
  if (distanceMiles > radiusMiles) return null;
  const ts = new Date(ev.date).getTime();
  if (!Number.isFinite(ts) || ts < cutoffMs) return null;

  return {
    id: ev.id || ev.noaaEventId || `${ev.date}-${ev.lat}-${ev.lng}`,
    date: ev.date,
    eventType: ev.eventType,
    magnitude: ev.magnitude || formatMagnitude(ev),
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
    status: ev.status || (String(ev.source || '').includes('SPC') ? 'preliminary' : 'verified'),
  };
}

/** Drop duplicate incidents across NCEI + SPC.
 *  Match = same eventType, date within ±1 day, coords within ~2 miles.
 *  When duplicates exist, the NCEI/verified record wins. */
function dedupeEvents(events) {
  const DUP_RADIUS_MI = 2.0;
  const kept = [];
  // Sort verified first so they're held in `kept` before prelim duplicates arrive.
  const sorted = [...events].sort((a, b) => {
    if (a.status === 'verified' && b.status !== 'verified') return -1;
    if (b.status === 'verified' && a.status !== 'verified') return 1;
    return 0;
  });
  for (const ev of sorted) {
    const t = new Date(ev.date).getTime();
    const dup = kept.find(k => {
      if (k.eventType !== ev.eventType) return false;
      const dt = Math.abs(new Date(k.date).getTime() - t);
      if (dt > 86400000) return false;
      return haversineMiles(k.lat, k.lng, ev.lat, ev.lng) <= DUP_RADIUS_MI;
    });
    if (!dup) kept.push(ev);
    // if dup exists and incumbent is verified, silently drop this one (prelim loses)
    // if dup exists and incumbent is preliminary, ev is also preliminary (verified
    //   would have been inserted first) — drop it too to avoid noise.
  }
  return kept;
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
  _test: { setForceFailure: _setForceFailure, clearCache: _clearCache, dedupeEvents },
};
