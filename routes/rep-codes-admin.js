/**
 * Rep-codes admin — on-demand cache refresh endpoint.
 *
 * Portal POSTs here after Add Rep / deactivate / reactivate so the
 * field app sees the change immediately rather than waiting for the
 * 5-min cache poll in lib/repCodes.js. Secured by HERMES_API_SECRET
 * shared-secret header — same pattern the portal uses for its
 * /api/hermes/jobs proxy.
 *
 * Mounted at root in server.js so the path /api/rep-codes/refresh is
 * served directly (the existing /api/rep-codes endpoints live in
 * routes/admin.js + routes/rep-card.js; this is a separate file to
 * avoid touching either of those).
 */

const express = require('express');
const router = express.Router();
const { refreshRepCodes, repCacheStatus } = require('../lib/repCodes');

router.post('/api/rep-codes/refresh', async (req, res) => {
  const expected = process.env.HERMES_API_SECRET;
  if (!expected) {
    return res.status(500).json({ error: 'HERMES_API_SECRET not configured' });
  }
  const got = req.headers['x-hermes-secret'];
  if (!got || got !== expected) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    await refreshRepCodes();
    return res.json({ ok: true, status: repCacheStatus() });
  } catch (err) {
    console.error('[rep-codes-admin] refresh failed:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
