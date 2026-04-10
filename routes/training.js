const express = require('express');
const router = express.Router();
const { read, write } = require('../lib/store');
const { validateRepCode, isAdmin } = require('../lib/repCodes');

const FILE = 'training-progress.json';

function getProgress() {
  return read(FILE, {});
}

function saveProgress(data) {
  write(FILE, data);
}

// GET /api/training/progress — admin: get all reps' progress
router.get('/progress', (req, res) => {
  const auth = req.query.auth || req.headers['x-rep-code'] || '';
  if (!auth || !isAdmin(auth.toUpperCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  res.json(getProgress());
});

// GET /api/training/progress/:repCode — get rep's progress
router.get('/progress/:repCode', (req, res) => {
  const code = req.params.repCode.toUpperCase();
  const rep = validateRepCode(code);
  if (!rep) return res.status(404).json({ error: 'Unknown rep code' });

  const all = getProgress();
  if (!all[code]) {
    all[code] = {
      modules: {},
      onboardingDay: 1,
      startDate: new Date().toISOString().split('T')[0]
    };
    saveProgress(all);
  }
  res.json(all[code]);
});

// POST /api/training/progress/:repCode — save progress update
router.post('/progress/:repCode', (req, res) => {
  const code = req.params.repCode.toUpperCase();
  const rep = validateRepCode(code);
  if (!rep) return res.status(404).json({ error: 'Unknown rep code' });

  const all = getProgress();
  if (!all[code]) {
    all[code] = {
      modules: {},
      onboardingDay: 1,
      startDate: new Date().toISOString().split('T')[0]
    };
  }

  const { moduleId, resourceId, completed, quizScore, onboardingDay } = req.body;

  // Update onboarding day if provided
  if (onboardingDay !== undefined) {
    all[code].onboardingDay = onboardingDay;
    saveProgress(all);
    return res.json(all[code]);
  }

  if (!moduleId) return res.status(400).json({ error: 'moduleId required' });

  // Ensure module entry exists
  if (!all[code].modules[moduleId]) {
    all[code].modules[moduleId] = {
      resources: {},
      quizScore: null,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      completedAt: null
    };
  }

  const mod = all[code].modules[moduleId];

  // Quiz score update
  if (quizScore !== undefined) {
    mod.quizScore = quizScore;
    mod.resources['quiz'] = true;
  }

  // Resource completion update
  if (resourceId !== undefined && completed !== undefined) {
    mod.resources[resourceId] = !!completed;
  }

  // Recalculate module status
  const completedCount = Object.values(mod.resources).filter(Boolean).length;
  if (completedCount === 0) {
    mod.status = 'not_started';
    mod.startedAt = null;
  } else {
    mod.status = 'in_progress';
    if (!mod.startedAt) mod.startedAt = new Date().toISOString();
  }

  // Check if all resources for this module are done (we'll let the client decide "complete")
  if (req.body.markComplete) {
    mod.status = 'complete';
    mod.completedAt = new Date().toISOString();
  }

  saveProgress(all);
  res.json(all[code]);
});

module.exports = router;
