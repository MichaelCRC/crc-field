const express = require('express');
const router = express.Router();
const { getRepStats, getLeaderboard } = require('../lib/stats');

// Rep stats
router.get('/:repCode', async (req, res) => {
  const period = req.query.period || 'week';
  res.json(getRepStats(req.params.repCode.toUpperCase(), period));
});

// Leaderboard
router.get('/', async (req, res) => {
  const period = req.query.period || 'week';
  res.json(getLeaderboard(period));
});

module.exports = router;
