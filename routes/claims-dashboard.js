const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Try multiple paths: local dev path, then bundled data path
const JN_PATHS = [
  path.resolve(__dirname, '../../content-engine/jn-data/jobs-2026-ytd.json'),
  path.resolve(__dirname, '../data/jobs-2026-ytd.json')
];

// Status groupings
const CLAIM_STATUSES = ['Claim Filed', 'Adj. Meeting Scheduled', 'Adjuster Contacted', 'Supplementing', 'Re-Inspected'];
const APPROVED_STATUSES = ['Job Approved', 'Job Scheduled', 'Color Selection', 'Estimating', 'Estimate Sent - Follow Up', 'Estimate Presented', 'Job Close Out', 'Job Completed/COC', 'Paid & Closed'];
const PENDING_STATUSES = ['Claim Filed', 'Adj. Meeting Scheduled', 'Adjuster Contacted', 'Supplementing', 'Waiting on Scope', 'Re-Inspected'];
const INSPECTION_STATUSES = ['Inspection'];
const ACTIVE_STATUSES = ['Claim Filed', 'Adj. Meeting Scheduled', 'Adjuster Contacted', 'Supplementing', 'Waiting on Scope', 'Re-Inspected', 'Job Approved', 'Job Scheduled', 'Color Selection', 'Estimating', 'Estimate Sent - Follow Up', 'Estimate Presented', 'Inspection', 'Consultation', 'Active Hold', 'Follow Up', 'Appt. Scheduled', 'At Risk'];

function loadJobs() {
  for (const p of JN_PATHS) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      return JSON.parse(raw);
    } catch (e) { /* try next */ }
  }
  console.error('Failed to load JN data from any path');
  return [];
}

function buildDashboard() {
  const jobs = loadJobs();
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Pipeline by status
  const pipeline = {};
  jobs.forEach(j => {
    pipeline[j.status_name] = (pipeline[j.status_name] || 0) + 1;
  });

  // Monthly breakdown
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthly = {};
  months.forEach(m => { monthly[m] = { count: 0, value: 0 }; });

  jobs.forEach(j => {
    const d = new Date(j.date_created * 1000);
    const mi = d.getMonth();
    if (d.getFullYear() === now.getFullYear()) {
      monthly[months[mi]].count++;
      monthly[months[mi]].value += (j.amount_to_be_paid || 0);
    }
  });

  // Weekly (last 7 days)
  const weeklyJobs = jobs.filter(j => new Date(j.date_created * 1000) >= sevenDaysAgo);
  const weekly = {
    count: weeklyJobs.length,
    value: weeklyJobs.reduce((s, j) => s + (j.amount_to_be_paid || 0), 0),
    claims_filed: weeklyJobs.filter(j => CLAIM_STATUSES.includes(j.status_name)).length,
    approved: weeklyJobs.filter(j => APPROVED_STATUSES.includes(j.status_name)).length
  };

  // By rep
  const repMap = {};
  jobs.forEach(j => {
    const name = j.sales_rep_name || 'Unassigned';
    if (name === 'null' || name === '') return;
    if (!repMap[name]) {
      repMap[name] = { rep_name: name, claims_filed: 0, inspections: 0, approved: 0, pending: 0, total_value: 0, total_jobs: 0, ytd: 0, mtd: 0, weekly: 0 };
    }
    const r = repMap[name];
    r.total_jobs++;
    r.total_value += (j.amount_to_be_paid || 0);

    if (CLAIM_STATUSES.includes(j.status_name)) r.claims_filed++;
    if (INSPECTION_STATUSES.includes(j.status_name)) r.inspections++;
    if (APPROVED_STATUSES.includes(j.status_name)) r.approved++;
    if (PENDING_STATUSES.includes(j.status_name)) r.pending++;

    const created = new Date(j.date_created * 1000);
    if (created >= startOfYear) r.ytd++;
    if (created >= startOfMonth) r.mtd++;
    if (created >= sevenDaysAgo) r.weekly++;
  });

  const by_rep = Object.values(repMap).sort((a, b) => b.total_jobs - a.total_jobs);

  // Company totals
  const validJobs = jobs.filter(j => j.sales_rep_name && j.sales_rep_name !== 'null' && j.sales_rep_name !== '');
  const company_totals = {
    total_claims: validJobs.filter(j => CLAIM_STATUSES.includes(j.status_name)).length,
    total_value: validJobs.reduce((s, j) => s + (j.amount_to_be_paid || 0), 0),
    total_approved: validJobs.filter(j => APPROVED_STATUSES.includes(j.status_name)).length,
    total_pending: validJobs.filter(j => PENDING_STATUSES.includes(j.status_name)).length,
    total_jobs: validJobs.length,
    total_active: validJobs.filter(j => ACTIVE_STATUSES.includes(j.status_name)).length
  };

  return { by_rep, company_totals, monthly, weekly, pipeline, generated_at: now.toISOString() };
}

// API endpoint
router.get('/', (req, res) => {
  res.json(buildDashboard());
});

module.exports = router;
