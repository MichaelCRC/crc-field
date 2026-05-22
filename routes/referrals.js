const express = require('express');
const router = express.Router();
const { read, write } = require('../lib/store');

const FILE = 'referrals.json';

function loadReferrals() { return read(FILE, []); }
function saveReferrals(data) { write(FILE, data); }

// GET /api/referrals/stats — must be before /:id
router.get('/stats', async (req, res) => {
  const referrals = loadReferrals();
  const statsByRep = {};
  referrals.forEach(r => {
    const code = r.rep_code || 'UNKNOWN';
    if (!statsByRep[code]) {
      statsByRep[code] = { rep_code: code, total: 0, new: 0, contacted: 0, sold: 0, paid: 0, gift_sent: 0 };
    }
    statsByRep[code].total++;
    statsByRep[code][r.status] = (statsByRep[code][r.status] || 0) + 1;
  });
  res.json({ stats: Object.values(statsByRep), total_referrals: referrals.length });
});

// GET /api/referrals — list all (optional ?rep=CODE)
router.get('/', async (req, res) => {
  let referrals = loadReferrals();
  if (req.query.rep) {
    referrals = referrals.filter(r => r.rep_code === req.query.rep.toUpperCase());
  }
  res.json(referrals);
});

// GET /api/referrals/:id
router.get('/:id', async (req, res) => {
  const referrals = loadReferrals();
  const referral = referrals.find(r => r.id === req.params.id);
  if (!referral) return res.status(404).json({ error: 'Referral not found' });
  res.json(referral);
});

// POST /api/referrals — create
router.post('/', async (req, res) => {
  const referrals = loadReferrals();
  const referral = {
    id: 'ref-' + Date.now(),
    rep_code: (req.body.rep_code || '').toUpperCase(),
    referrer_name: req.body.referrer_name || '',
    referrer_phone: req.body.referrer_phone || '',
    referrer_email: req.body.referrer_email || '',
    referred_name: req.body.referred_name || '',
    referred_phone: req.body.referred_phone || '',
    referred_address: req.body.referred_address || '',
    notes: req.body.notes || '',
    status: 'new',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  referrals.unshift(referral);
  saveReferrals(referrals);
  res.status(201).json(referral);
});

// PATCH /api/referrals/:id — update status
router.patch('/:id', async (req, res) => {
  const referrals = loadReferrals();
  const idx = referrals.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Referral not found' });

  const validStatuses = ['new', 'contacted', 'sold', 'paid', 'gift_sent'];
  if (req.body.status && !validStatuses.includes(req.body.status)) {
    return res.status(400).json({ error: 'Invalid status. Must be: ' + validStatuses.join(', ') });
  }

  Object.assign(referrals[idx], req.body, { updatedAt: new Date().toISOString() });
  saveReferrals(referrals);
  res.json(referrals[idx]);
});

module.exports = router;
