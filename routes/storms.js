const express = require('express');
const router = express.Router();
const { getStormData, getReferenceStorms } = require('../lib/noaaStorms');

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
