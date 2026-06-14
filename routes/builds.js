/**
 * CRC Builds Map Layer
 *
 * Serves geocoded completed job locations for the map layer.
 * Data sourced from JobNimbus — all completed/installed jobs.
 *
 * GET /api/builds               — all geocoded builds
 * GET /api/builds?rep=MCG       — filter by rep name (partial match)
 * GET /api/builds?type=Insurance — filter by job type
 * GET /api/builds?year=2025     — filter by year
 * GET /api/builds/summary       — counts by rep, year, type
 * POST /api/builds/refresh      — re-run geocoder for any new completed JN jobs
 */

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../lib/authGate');
const fs = require('fs');
const path = require('path');

const BUILDS_FILE = path.join(__dirname, '../data/crc-builds.json');
const JN_PATHS = [
  path.join(__dirname, '../../content-engine/jn-data/jobs-2026-ytd.json'),
  path.join(__dirname, '../data/jobs-2026-ytd.json'),
];

const COMPLETED_STATUSES = new Set([
  'Job Completed/COC', 'Paid & Closed', 'Job Close Out',
  'Job Approved', 'Job Scheduled', 'Color Selection', 'Installed',
]);

function readBuilds() {
  try {
    if (fs.existsSync(BUILDS_FILE)) return JSON.parse(fs.readFileSync(BUILDS_FILE, 'utf8'));
  } catch {}
  return [];
}

// GET /api/builds
router.get('/', async (req, res) => {
  try {
    let builds = readBuilds();
    if (req.query.rep) {
      const r = req.query.rep.toLowerCase();
      builds = builds.filter(b => (b.rep || '').toLowerCase().includes(r));
    }
    if (req.query.type) {
      const t = req.query.type.toLowerCase();
      builds = builds.filter(b => (b.type || '').toLowerCase().includes(t));
    }
    if (req.query.year) {
      builds = builds.filter(b => String(b.year) === String(req.query.year));
    }
    // Return slim version for map performance
    const slim = builds.map(b => ({
      id: b.jnid,
      lat: b.lat,
      lng: b.lng,
      address: b.address_line1 || b.address,
      city: b.city,
      status: b.status,
      rep: b.rep,
      type: b.type,
      year: b.year,
      value: b.value,
    }));
    res.json(slim);
  } catch (e) {
    console.error('[Builds] Error:', e.message);
    res.status(500).json({ error: 'Failed to load builds' });
  }
});

// GET /api/builds/summary
router.get('/summary', async (req, res) => {
  try {
    const builds = readBuilds();
    const byRep = {};
    const byYear = {};
    const byType = {};
    let totalValue = 0;
    for (const b of builds) {
      byRep[b.rep || 'Unknown'] = (byRep[b.rep || 'Unknown'] || 0) + 1;
      byYear[b.year || 'Unknown'] = (byYear[b.year || 'Unknown'] || 0) + 1;
      byType[b.type || 'Insurance'] = (byType[b.type || 'Insurance'] || 0) + 1;
      totalValue += b.value || 0;
    }
    res.json({ total: builds.length, totalValue, byRep, byYear, byType });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load summary' });
  }
});

// POST /api/builds/refresh — geocode any new completed JN jobs
router.post('/refresh', requireAdmin, async (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY not set' });

  try {
    // Load JN data
    let jnJobs = [];
    for (const p of JN_PATHS) {
      if (fs.existsSync(p)) {
        jnJobs = JSON.parse(fs.readFileSync(p, 'utf8'));
        break;
      }
    }

    const completed = jnJobs.filter(j =>
      COMPLETED_STATUSES.has(j.status_name) &&
      j.address_line1?.trim().length > 5
    );

    const existing = readBuilds();
    const existingIds = new Set(existing.map(b => b.jnid));
    const toGeocode = completed.filter(j => !existingIds.has(j.jnid));

    if (!toGeocode.length) {
      return res.json({ success: true, message: 'All builds already geocoded', newCount: 0, total: existing.length });
    }

    // Geocode new ones
    const results = [...existing];
    let newCount = 0;

    for (const job of toGeocode) {
      const fullAddress = [job.address_line1, job.city, job.state_text, job.zip].filter(Boolean).join(', ');
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${apiKey}`;
        const r = await fetch(url);
        const data = await r.json();
        if (data.status === 'OK' && data.results?.length) {
          const loc = data.results[0].geometry.location;
          results.push({
            jnid: job.jnid,
            address: fullAddress,
            address_line1: job.address_line1,
            city: job.city || '',
            state: job.state_text || 'OH',
            zip: job.zip || '',
            lat: loc.lat,
            lng: loc.lng,
            status: job.status_name,
            rep: job.sales_rep_name || '',
            type: job.record_type_name || 'Insurance',
            value: job.amount_to_be_paid || 0,
            year: job.date_created ? new Date(job.date_created * 1000).getFullYear() : new Date().getFullYear(),
          });
          newCount++;
        }
        await new Promise(r => setTimeout(r, 60)); // rate limit
      } catch {}
    }

    fs.writeFileSync(BUILDS_FILE, JSON.stringify(results, null, 2));
    console.log(`[Builds] Refresh: ${newCount} new builds geocoded`);
    res.json({ success: true, newCount, total: results.length });
  } catch (e) {
    console.error('[Builds] Refresh error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
