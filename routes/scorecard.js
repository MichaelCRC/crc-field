/**
 * Daily rep scorecard — the capture side of the KPI dashboard.
 *
 * Reps tap counters in the field app; this persists one row per rep per day in
 * the canonical Postgres `daily_activity` table (shared with the portal).
 * Collected $ is NOT here — that's finance-sourced (JobNimbus). Outcome metrics
 * (claims/approvals) are self-logged for now; we auto-derive them from job data
 * once the pipeline fills.
 */
const express = require('express');
const router = express.Router();
const _sandbox = require('../lib/sandbox');
let query = null;
try { ({ query } = require('../db/client')); } catch { /* sandbox: no PG */ }

const METRICS = ['talk_tos', 'inspections_ran', 'sales_appts', 'claims_filed', 'approvals'];
const GOALS = { talk_tos: 20 }; // only Talk Tos has a target for now
const _sb = {}; // sandbox in-memory: `${rep}|${date}` -> row

function nyDate(d) { return new Date(d || Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); }
function repOf(req) { return String(req.query.rep || req.headers['x-field-rep'] || '').toUpperCase(); }
function zeroRow(rep, date) {
  return { rep_code: rep, activity_date: date, talk_tos: 0, inspections_ran: 0, sales_appts: 0, claims_filed: 0, approvals: 0 };
}

// GET /api/scorecard?rep=MCG&date=YYYY-MM-DD — a rep's scorecard for the day
router.get('/', async (req, res) => {
  const rep = repOf(req);
  if (!rep) return res.status(400).json({ error: 'rep required' });
  const date = req.query.date || nyDate();
  try {
    if (_sandbox.enabled || !query) return res.json({ scorecard: _sb[rep + '|' + date] || zeroRow(rep, date), goals: GOALS });
    const { rows } = await query('SELECT * FROM daily_activity WHERE rep_code = $1 AND activity_date = $2', [rep, date]);
    res.json({ scorecard: rows[0] || zeroRow(rep, date), goals: GOALS });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/scorecard/increment {metric, delta, date} — bump one counter
router.post('/increment', async (req, res) => {
  const rep = repOf(req);
  if (!rep) return res.status(400).json({ error: 'rep required' });
  const { metric, delta = 1 } = req.body || {};
  const date = (req.body && req.body.date) || nyDate();
  if (!METRICS.includes(metric)) return res.status(400).json({ error: 'unknown metric' });
  const d = parseInt(delta, 10) || 0;
  try {
    if (_sandbox.enabled || !query) {
      const k = rep + '|' + date;
      const row = _sb[k] || (_sb[k] = zeroRow(rep, date));
      row[metric] = Math.max(0, (row[metric] || 0) + d);
      return res.json({ scorecard: row });
    }
    // metric is whitelisted above, safe to interpolate as a column name.
    const { rows } = await query(
      `INSERT INTO daily_activity (rep_code, activity_date, ${metric})
       VALUES ($1, $2, GREATEST(0, $3))
       ON CONFLICT (rep_code, activity_date)
       DO UPDATE SET ${metric} = GREATEST(0, daily_activity.${metric} + $3), updated_at = NOW()
       RETURNING *`,
      [rep, date, d]
    );
    res.json({ scorecard: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/scorecard/all?date=YYYY-MM-DD — every rep's row for a day (dashboard)
router.get('/all', async (req, res) => {
  const date = req.query.date || nyDate();
  try {
    if (_sandbox.enabled || !query) return res.json({ date, reps: Object.values(_sb).filter(r => r.activity_date === date) });
    const { rows } = await query('SELECT * FROM daily_activity WHERE activity_date = $1 ORDER BY rep_code', [date]);
    res.json({ date, reps: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
