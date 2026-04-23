const express = require('express');
const router = express.Router();
const { getStormData, getStormsNearPoint, getReferenceStorms } = require('../lib/noaaStorms');
const { getLead } = require('../lib/store');

const MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const MAX_RADIUS_MI = 25;
const MAX_MONTHS = 24;

// ── Legacy list endpoint (unchanged response shape — Map overlay uses it) ──
router.get('/', async (req, res) => {
  if (req.query.source === 'reference') {
    return res.json({
      storms: applyFilters(getReferenceStorms(), req.query),
      source: 'reference',
      fetchedAt: new Date().toISOString(),
    });
  }

  try {
    const data = await getStormData();
    const payload = {
      storms: applyFilters(data.storms, req.query),
      source: data.source,
      fetchedAt: data.fetchedAt,
    };
    if (data.cacheAge) payload.cacheAge = data.cacheAge;
    res.json(payload);
  } catch (e) {
    console.error('[Storms] NOAA fetch failed:', e.message);
    res.status(503).json({
      error: 'Storm data temporarily unavailable',
      retryAfter: 60,
      source: 'NOAA',
      message: 'Storm history service is down. Try again shortly.',
    });
  }
});

router.get('/refresh', async (req, res) => {
  try {
    const data = await getStormData({ forceRefresh: true });
    res.json({ success: true, source: data.source, eventCount: data.storms.length, fetchedAt: data.fetchedAt });
  } catch (e) {
    console.error('[Storms] NOAA refresh failed:', e.message);
    res.status(503).json({
      error: 'Storm data temporarily unavailable',
      retryAfter: 60,
      source: 'NOAA',
      message: 'Storm history service is down. Try again shortly.',
    });
  }
});

// ── GET /api/storms/near?lat=X&lng=Y&radius=5&months=12 ────────────────────
router.get('/near', async (req, res) => {
  const parsed = parseNearParams(req.query);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const result = await getStormsNearPoint(parsed.opts);
    res.json(result);
  } catch (e) {
    handleStormError(res, e, '/api/storms/near');
  }
});

// ── GET /api/storms/for-address?address=... ────────────────────────────────
router.get('/for-address', async (req, res) => {
  const address = (req.query.address || '').trim();
  if (!address) return res.status(400).json({ error: 'address is required' });

  let geo;
  try {
    geo = await geocodeAddress(address);
  } catch (e) {
    console.error('[Storms] geocode failed:', e.message);
    return res.status(502).json({ error: 'Geocoding failed', detail: e.message });
  }
  if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) {
    return res.status(404).json({ error: 'Could not geocode address', address });
  }

  const opts = { lat: geo.lat, lng: geo.lng };
  if (req.query.radius) opts.radiusMiles = Math.min(MAX_RADIUS_MI, parseFloat(req.query.radius) || 5);
  if (req.query.months) opts.months = Math.min(MAX_MONTHS, parseInt(req.query.months, 10) || 12);

  try {
    const result = await getStormsNearPoint(opts);
    res.json({ ...result, address: geo.formattedAddress || address, geocoded: { lat: geo.lat, lng: geo.lng } });
  } catch (e) {
    handleStormError(res, e, '/api/storms/for-address');
  }
});

// ── GET /api/storms/for-lead/:leadId ───────────────────────────────────────
router.get('/for-lead/:leadId', async (req, res) => {
  const lead = getLead(req.params.leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const hasLeadCoords = lead.lat != null && lead.lng != null
    && Number.isFinite(Number(lead.lat)) && Number.isFinite(Number(lead.lng));
  let lat = hasLeadCoords ? Number(lead.lat) : NaN;
  let lng = hasLeadCoords ? Number(lead.lng) : NaN;
  let addressUsed = lead.address;

  if (!hasLeadCoords) {
    if (!lead.address) return res.status(400).json({ error: 'Lead has no coordinates or address' });
    try {
      const geo = await geocodeAddress(lead.address);
      if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) {
        return res.status(400).json({ error: 'Could not geocode lead address' });
      }
      lat = geo.lat; lng = geo.lng;
      addressUsed = geo.formattedAddress || lead.address;
    } catch (e) {
      return res.status(400).json({ error: 'Could not geocode lead address', detail: e.message });
    }
  }

  try {
    const result = await getStormsNearPoint({ lat, lng });
    res.json({ ...result, lead: { id: lead.id, address: addressUsed } });
  } catch (e) {
    handleStormError(res, e, '/api/storms/for-lead');
  }
});

// ── helpers ────────────────────────────────────────────────────────────────
function parseNearParams(q) {
  const lat = parseFloat(q.lat);
  const lng = parseFloat(q.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: 'lat must be a number between -90 and 90' };
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { error: 'lng must be a number between -180 and 180' };

  const opts = { lat, lng };
  if (q.radius != null) {
    const r = parseFloat(q.radius);
    if (!Number.isFinite(r) || r <= 0) return { error: 'radius must be a positive number' };
    if (r > MAX_RADIUS_MI) return { error: `radius cannot exceed ${MAX_RADIUS_MI} miles` };
    opts.radiusMiles = r;
  }
  if (q.months != null) {
    const m = parseInt(q.months, 10);
    if (!Number.isFinite(m) || m <= 0) return { error: 'months must be a positive integer' };
    if (m > MAX_MONTHS) return { error: `months cannot exceed ${MAX_MONTHS}` };
    opts.months = m;
  }
  if (q.limit != null) {
    const l = parseInt(q.limit, 10);
    if (Number.isFinite(l) && l > 0 && l <= 100) opts.limit = l;
  }
  return { opts };
}

function handleStormError(res, e, route) {
  console.error(`[Storms] ${route} failed:`, e.message);
  if (/lat and lng/i.test(e.message)) {
    return res.status(400).json({ error: e.message });
  }
  res.status(503).json({
    error: 'Storm data temporarily unavailable',
    retryAfter: 60,
    source: 'NOAA',
    message: 'Storm history service is down. Try again shortly.',
  });
}

// Direct server-side geocode via Google Maps API. routes/maps.js only exposes
// place_id-based lookup; we need a free-text address path for /for-address
// and /for-lead, so call Geocoding API directly here.
async function geocodeAddress(address) {
  if (!MAPS_API_KEY) throw new Error('GOOGLE_MAPS_API_KEY not configured');
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${MAPS_API_KEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Geocoding HTTP ${r.status}`);
  const data = await r.json();
  if (data.status !== 'OK' || !data.results?.length) {
    if (data.status === 'ZERO_RESULTS') return null;
    throw new Error(`Geocoding returned status ${data.status}`);
  }
  const top = data.results[0];
  const loc = top.geometry?.location || {};
  return { lat: loc.lat, lng: loc.lng, formattedAddress: top.formatted_address };
}

function applyFilters(storms, q) {
  let out = storms;
  if (q.minSize) out = out.filter(e => e.hailSize >= parseFloat(q.minSize));
  if (q.days) {
    const cutoff = Date.now() - parseInt(q.days) * 86400000;
    out = out.filter(e => new Date(e.date).getTime() >= cutoff);
  }
  return out;
}

module.exports = router;
