/** SPC Storm Reports service — NOAA preliminary hail/wind/tornado reports.
 *  These land within hours of the storm (vs. NCEI's ~60-day publication lag),
 *  so they're what a rep uses to answer "where did it hail yesterday".
 *
 *  Source: https://www.spc.noaa.gov/climo/reports/YYMMDD_rpts_{hail,wind,torn}.csv
 *  Each file is tiny (one day of US reports). Columns:
 *    hail:    Time, Size(hundredths of in),  Location, County, State, Lat, Lon, Comments
 *    wind:    Time, Speed(mph or UNK),       Location, County, State, Lat, Lon, Comments
 *    tornado: Time, F_Scale(UNK or EF0-EF5), Location, County, State, Lat, Lon, Comments
 *
 *  Cache rules (per day file):
 *    - Older than 30 days: cache indefinitely (report list doesn't change)
 *    - Within last 30 days: cache 1 hour (reports can be amended)
 *    - Today:               cache 15 minutes (active ingestion)
 *
 *  Events normalized to the same shape as lib/noaaStorms.js so the UI doesn't
 *  care which source they came from. Tagged with source: "NOAA SPC" and
 *  status: "preliminary" so callers can distinguish.
 */
const { read, write } = require('./store');

const SPC_BASE = 'https://www.spc.noaa.gov/climo/reports/';
const CACHE_FILE = 'spc-cache.json';
const FETCH_TIMEOUT_MS = 20_000;
const CACHE_SCHEMA = 1;
const OH_ONLY = true; // mirror lib/noaaStorms.js — we only surface Ohio reports

// TTL tiers — see header comment.
const TTL_TODAY_MS = 15 * 60 * 1000;
const TTL_FRESH_MS = 60 * 60 * 1000;
const TTL_OLD_MS = Infinity;

// In-memory cache keyed by "yymmdd"; { fetchedAt, events }
const memCache = new Map();
let diskLoaded = false;
let forceFailure = false;

function _setForceFailure(v) { forceFailure = !!v; }
function _clearCache() {
  memCache.clear();
  diskLoaded = false;
  try { write(CACHE_FILE, null); } catch {}
}

function loadDiskCache() {
  if (diskLoaded) return;
  diskLoaded = true;
  const disk = read(CACHE_FILE, null);
  if (!disk || disk.schema !== CACHE_SCHEMA || typeof disk.days !== 'object') return;
  for (const [k, v] of Object.entries(disk.days)) {
    if (v && typeof v === 'object' && Array.isArray(v.events)) memCache.set(k, v);
  }
}

function persistDiskCache() {
  const days = {};
  for (const [k, v] of memCache.entries()) days[k] = v;
  write(CACHE_FILE, { schema: CACHE_SCHEMA, days });
}

// ── Date helpers ──────────────────────────────────────────────────────────
function toYYMMDD(dateStr) {
  // dateStr: "2026-03-22" → "260322"
  const [y, m, d] = dateStr.split('-');
  return `${y.slice(2)}${m}${d}`;
}

function fromYYMMDD(yymmdd) {
  // "260322" → "2026-03-22"  (assumes 20YY)
  return `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

function daysBetween(startDate, endDate) {
  const out = [];
  const s = new Date(startDate + 'T00:00:00Z').getTime();
  const e = new Date(endDate + 'T00:00:00Z').getTime();
  for (let t = s; t <= e; t += 86400000) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

function todayISO() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ttlForDate(dateStr) {
  const today = todayISO();
  if (dateStr === today) return TTL_TODAY_MS;
  const ageMs = Date.now() - new Date(dateStr + 'T00:00:00Z').getTime();
  if (ageMs < 30 * 86400000) return TTL_FRESH_MS;
  return TTL_OLD_MS;
}

// ── CSV parsing ───────────────────────────────────────────────────────────
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

function toTitle(s) { return (s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }

function parseSPCFile(csv, kind, dateStr) {
  // kind: 'hail' | 'wind' | 'tornado'
  if (!csv || typeof csv !== 'string') return [];
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  // First line is the header; each row: Time, MAGCOL, Location, County, State, Lat, Lon, Comments
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCSVLine(lines[i]);
    if (c.length < 8) continue;
    // Skip a stray repeated header line (SPC is usually clean but defensively check).
    if (c[0] === 'Time') continue;
    const time = (c[0] || '').trim();
    const magRaw = (c[1] || '').trim();
    const location = (c[2] || '').trim();
    const county = (c[3] || '').trim();
    const state = (c[4] || '').trim().toUpperCase();
    const lat = parseFloat(c[5]);
    const lng = parseFloat(c[6]);
    const comments = (c[7] || '').trim();
    if (OH_ONLY && state !== 'OH') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    let eventType, magnitudeValue, magnitudeUnit, magnitude;
    if (kind === 'hail') {
      eventType = 'hail';
      // Size column is hundredths of inch (100 = 1.00 in)
      const hundredths = parseFloat(magRaw);
      magnitudeValue = Number.isFinite(hundredths) ? hundredths / 100 : 0;
      magnitudeUnit = 'in';
      magnitude = `${magnitudeValue.toFixed(2)} in`;
    } else if (kind === 'wind') {
      eventType = 'thunderstorm_wind';
      // Speed is mph, or "UNK". UNK → 0 magnitudeValue (will be threshold-filtered).
      const mph = parseFloat(magRaw);
      magnitudeValue = Number.isFinite(mph) ? mph : 0;
      magnitudeUnit = 'mph';
      magnitude = Number.isFinite(mph) ? `${Math.round(mph)} mph` : 'Wind report';
    } else { // tornado
      eventType = 'tornado';
      // F_Scale typically "UNK" or "EF0".."EF5"; map EFx to 0-5 magnitude
      const ef = /EF(\d)/i.exec(magRaw);
      magnitudeValue = ef ? parseInt(ef[1], 10) : 0;
      magnitudeUnit = 'ef';
      magnitude = ef ? `EF${ef[1]}` : 'Tornado report';
    }

    out.push({
      id: `SPC_${toYYMMDD(dateStr)}_${kind}_${i}`,
      date: dateStr,
      eventType,
      magnitude,
      magnitudeValue,
      magnitudeUnit,
      // hailSize kept for legacy map-overlay UI that reads that field.
      hailSize: eventType === 'hail' ? magnitudeValue : 0,
      lat,
      lng,
      location: toTitle(location) || toTitle(county) || 'Unknown',
      county: toTitle(county),
      state: 'OH',
      narrative: comments,
      source: 'NOAA SPC Preliminary',
      status: 'preliminary',
      reportTime: time,
    });
  }
  return out;
}

// ── Fetching ──────────────────────────────────────────────────────────────
async function fetchSPCText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (r.status === 404) return ''; // day with no reports file
    if (!r.ok) throw new Error(`SPC ${url} returned HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

/** Fetch + parse all three SPC files for one date.
 *  Returns { hail, wind, tornado, all } where `all` is the combined array. */
async function fetchSPCReportsForDate(dateStr) {
  if (forceFailure) throw new Error('SPC fetch forced failure (test mode)');
  const yymmdd = toYYMMDD(dateStr);
  const [hailCsv, windCsv, tornCsv] = await Promise.all([
    fetchSPCText(`${SPC_BASE}${yymmdd}_rpts_hail.csv`),
    fetchSPCText(`${SPC_BASE}${yymmdd}_rpts_wind.csv`),
    fetchSPCText(`${SPC_BASE}${yymmdd}_rpts_torn.csv`),
  ]);
  const hail = parseSPCFile(hailCsv, 'hail', dateStr);
  const wind = parseSPCFile(windCsv, 'wind', dateStr);
  const tornado = parseSPCFile(tornCsv, 'tornado', dateStr);
  return { hail, wind, tornado, all: [...hail, ...wind, ...tornado] };
}

/** Get SPC events for one date, with cache.
 *  If `allowFetch` is false and not cached, returns []. */
async function getSPCEventsForDate(dateStr, { allowFetch = true } = {}) {
  loadDiskCache();
  const key = toYYMMDD(dateStr);
  const cached = memCache.get(key);
  const ttl = ttlForDate(dateStr);
  if (cached && (Date.now() - cached.fetchedAt) < ttl) {
    return cached.events;
  }
  if (!allowFetch) return cached ? cached.events : [];
  try {
    const { all } = await fetchSPCReportsForDate(dateStr);
    const entry = { fetchedAt: Date.now(), events: all };
    memCache.set(key, entry);
    persistDiskCache();
    return all;
  } catch (e) {
    // On a transient SPC failure, prefer stale cache to empty.
    if (cached) return cached.events;
    throw e;
  }
}

/** Fetch SPC events across a date range, with bounded concurrency.
 *  Returns a deduped, sorted-by-date-desc array of events. */
async function getSPCStormsInRange({ startDate, endDate, allowFetch = true, concurrency = 4 } = {}) {
  const days = daysBetween(startDate, endDate);
  const out = [];
  // Bounded concurrency: walk days in chunks
  for (let i = 0; i < days.length; i += concurrency) {
    const batch = days.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async d => {
      try { return await getSPCEventsForDate(d, { allowFetch }); }
      catch (e) { console.warn(`[SPC] day ${d} fetch failed: ${e.message}`); return []; }
    }));
    for (const arr of results) out.push(...arr);
  }
  // Dedupe within SPC results (same kind, same day, same coord+mag occasionally
  // appears twice across mPING + NWS amendments).
  const seen = new Set();
  const deduped = [];
  for (const e of out) {
    const k = `${e.date}|${e.eventType}|${e.lat.toFixed(2)}|${e.lng.toFixed(2)}|${e.magnitudeValue}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(e);
  }
  deduped.sort((a, b) => (a.date < b.date ? 1 : -1));
  return deduped;
}

module.exports = {
  fetchSPCReportsForDate,
  getSPCEventsForDate,
  getSPCStormsInRange,
  _test: { setForceFailure: _setForceFailure, clearCache: _clearCache },
  _internal: { parseSPCFile, toYYMMDD, fromYYMMDD, daysBetween, ttlForDate },
};
