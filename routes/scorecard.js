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

const { listRepCodes, refreshRepCodes, repCacheStatus } = require('../lib/repCodes');
const { read } = require('../lib/store');

const METRICS = ['talk_tos', 'inspections_ran', 'sales_appts', 'claims_filed', 'approvals'];
const GOALS = { talk_tos: 20 }; // only Talk Tos has a target for now
const _sb = {}; // sandbox in-memory: `${rep}|${date}` -> row

function nyDate(d) { return new Date(d || Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); }
function repOf(req) { return String(req.query.rep || req.headers['x-field-rep'] || '').toUpperCase(); }
function zeroRow(rep, date) {
  return { rep_code: rep, activity_date: date, talk_tos: 0, inspections_ran: 0, sales_appts: 0, claims_filed: 0, approvals: 0, collected: 0 };
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

// POST /api/scorecard/collect {amount, date} — rep enters money collected; adds
// to today's collected (on top of the CSV baseline). Trued-up weekly vs the CSV.
router.post('/collect', async (req, res) => {
  const rep = repOf(req);
  if (!rep) return res.status(400).json({ error: 'rep required' });
  const amount = Math.round((parseFloat(req.body && req.body.amount) || 0) * 100) / 100;
  const date = (req.body && req.body.date) || nyDate();
  if (!amount) return res.status(400).json({ error: 'amount required' });
  try {
    if (_sandbox.enabled || !query) {
      const k = rep + '|' + date;
      const row = _sb[k] || (_sb[k] = zeroRow(rep, date));
      row.collected = Math.max(0, Math.round(((row.collected || 0) + amount) * 100) / 100);
      return res.json({ scorecard: row });
    }
    const { rows } = await query(
      `INSERT INTO daily_activity (rep_code, activity_date, collected)
       VALUES ($1, $2, GREATEST(0, $3))
       ON CONFLICT (rep_code, activity_date)
       DO UPDATE SET collected = GREATEST(0, daily_activity.collected + $3), updated_at = NOW()
       RETURNING *`,
      [rep, date, amount]
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

// GET /api/scorecard/dashboard?period=today|week|month — per-rep KPI rollup for
// the CEO/team dashboard: the 5 self-logged activity metrics summed over the
// period, plus YTD Collected $ (finance baseline, period-independent).
router.get('/dashboard', async (req, res) => {
  const period = ['today', 'week', 'month', 'all'].includes(req.query.period) ? req.query.period : 'today';
  // Warm the rep cache on cold boot, or the board comes back empty.
  if (!repCacheStatus().loaded) { try { await refreshRepCodes(); } catch {} }
  const to = nyDate();
  let from = to;
  if (period === 'week') { const d = new Date(); d.setDate(d.getDate() - 6); from = nyDate(d); }
  else if (period === 'month') { const d = new Date(); from = nyDate(new Date(d.getFullYear(), d.getMonth(), 1)); }
  else if (period === 'all') { from = '2000-01-01'; }

  try {
    const agg = {};
    const bump = (r) => {
      const a = agg[r.rep_code] || (agg[r.rep_code] = { talk_tos: 0, inspections_ran: 0, sales_appts: 0, claims_filed: 0, approvals: 0 });
      METRICS.forEach(m => { a[m] += (+r[m] || 0); });
    };
    if (_sandbox.enabled || !query) {
      Object.values(_sb).filter(r => r.activity_date >= from && r.activity_date <= to).forEach(bump);
    } else {
      const { rows } = await query(
        `SELECT rep_code,
                SUM(talk_tos) talk_tos, SUM(inspections_ran) inspections_ran,
                SUM(sales_appts) sales_appts, SUM(claims_filed) claims_filed, SUM(approvals) approvals
         FROM daily_activity WHERE activity_date BETWEEN $1 AND $2 GROUP BY rep_code`,
        [from, to]
      );
      rows.forEach(bump);
    }

    // Who logged TODAY (compliance) — always today, independent of the period.
    const loggedToday = new Set();
    if (_sandbox.enabled || !query) {
      Object.values(_sb).filter(r => r.activity_date === to && METRICS.some(m => (r[m] || 0) > 0)).forEach(r => loggedToday.add(r.rep_code));
    } else {
      const { rows } = await query(
        `SELECT rep_code FROM daily_activity
         WHERE activity_date = $1 AND (talk_tos + inspections_ran + sales_appts + claims_filed + approvals) > 0`, [to]);
      rows.forEach(r => loggedToday.add(r.rep_code));
    }

    const baseline = (read('rep-collected.json', { reps: {} }).reps) || {};
    // Money entered this year / this month — adds on top of the CSV baseline.
    const enteredYtd = {}, enteredMtd = {};
    const now = new Date();
    const yearStart = nyDate(new Date(now.getFullYear(), 0, 1));
    const monthStart = nyDate(new Date(now.getFullYear(), now.getMonth(), 1));
    if (_sandbox.enabled || !query) {
      Object.values(_sb).forEach(r => {
        if (r.activity_date >= yearStart) enteredYtd[r.rep_code] = (enteredYtd[r.rep_code] || 0) + (+r.collected || 0);
        if (r.activity_date >= monthStart) enteredMtd[r.rep_code] = (enteredMtd[r.rep_code] || 0) + (+r.collected || 0);
      });
    } else {
      const { rows } = await query(
        `SELECT rep_code,
                COALESCE(SUM(collected) FILTER (WHERE activity_date >= $1), 0) ytd,
                COALESCE(SUM(collected) FILTER (WHERE activity_date >= $2), 0) mtd
         FROM daily_activity WHERE activity_date >= $1 GROUP BY rep_code`, [yearStart, monthStart]);
      rows.forEach(r => { enteredYtd[r.rep_code] = +r.ytd || 0; enteredMtd[r.rep_code] = +r.mtd || 0; });
    }
    // Only sales reps (role 'rep') are EXPECTED to log daily — leaders/operators
    // (MCG, LANE) appear on the board but aren't held to the daily-log check.
    // "On the board" = active producing reps. Field source: PG cache uses
    // sells_volume; the flat-file/sandbox source uses showOnLeaderboard — accept
    // either so it works in both environments.
    const reps = (listRepCodes() || []).filter(c => c.active && (c.sells_volume || c.showOnLeaderboard)).map(c => {
      const a = agg[c.code] || {};
      const b = baseline[c.code] || {};
      const expected = c.role === 'rep';
      const rev_ytd = Math.round(((b.ytd || 0) + (enteredYtd[c.code] || 0)) * 100) / 100;
      const rev_mtd = Math.round(((b.mtd || 0) + (enteredMtd[c.code] || 0)) * 100) / 100;
      return {
        code: c.code, name: c.name, expected, loggedToday: loggedToday.has(c.code),
        talk_tos: a.talk_tos || 0, inspections_ran: a.inspections_ran || 0,
        sales_appts: a.sales_appts || 0, claims_filed: a.claims_filed || 0, approvals: a.approvals || 0,
        collected: rev_ytd, rev_ytd, rev_mtd, jobs: b.jobs || 0,
      };
    });
    reps.sort((x, y) => (y.talk_tos - x.talk_tos) || (y.collected - x.collected));
    const notLoggedToday = reps.filter(r => r.expected && !r.loggedToday).map(r => ({ code: r.code, name: r.name }));
    res.json({
      period, from, to, goals: GOALS, reps, not_logged_today: notLoggedToday,
      totals: {
        talk_tos: reps.reduce((s, r) => s + r.talk_tos, 0),
        inspections_ran: reps.reduce((s, r) => s + r.inspections_ran, 0),
        sales_appts: reps.reduce((s, r) => s + r.sales_appts, 0),
        claims_filed: reps.reduce((s, r) => s + r.claims_filed, 0),
        approvals: reps.reduce((s, r) => s + r.approvals, 0),
        collected: reps.reduce((s, r) => s + r.collected, 0),
        rev_ytd: Math.round(reps.reduce((s, r) => s + r.rev_ytd, 0) * 100) / 100,
        rev_mtd: Math.round(reps.reduce((s, r) => s + r.rev_mtd, 0) * 100) / 100,
        jobs: reps.reduce((s, r) => s + r.jobs, 0),
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
