#!/usr/bin/env node
/** Field App -- Hover deep-link URL tests.
 *  Verifies public/hover-link.js produces the documented URL shape and
 *  clipboard payload for a representative job. No pre-fill is supported
 *  by Hover (see HOVER_SPRINT_FINDINGS.md), so the test pins the
 *  launch-only behavior: scheme + web fallback + App Store link. */
const path = require('path');

const { hoverLaunchTargets, buildHoverClipboardText } =
  require(path.join(__dirname, '..', 'public', 'hover-link.js'));

const tests = [];
const results = [];

function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { assert(a === b, (msg || 'eq') + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }

test('launch targets are the documented launch-only triplet', () => {
  const t = hoverLaunchTargets();
  eq(t.scheme, 'hover://', 'scheme');
  eq(t.fallback, 'https://hover.to', 'fallback');
  eq(
    t.appStore,
    'https://apps.apple.com/us/app/hover-design-measure/id942568673',
    'appStore'
  );
});

test('fallback URL has no query params (Hover does not accept pre-fill)', () => {
  const t = hoverLaunchTargets();
  assert(!t.fallback.includes('?'), 'fallback should be bare hover.to (no query)');
  assert(!t.fallback.includes('app.hover.to'), 'must not reference dead app.hover.to host');
});

test('clipboard text has address + homeowner object { firstName, lastName }', () => {
  const job = {
    address: '123 Main St, Columbus OH 43215',
    homeowner: { firstName: 'Jane', lastName: 'Smith' },
  };
  eq(buildHoverClipboardText(job), '123 Main St, Columbus OH 43215\nJane Smith');
});

test('clipboard text handles homeowner string fallback', () => {
  const job = { address: '1 Roof Ln', homeowner: 'Bob Jones' };
  eq(buildHoverClipboardText(job), '1 Roof Ln\nBob Jones');
});

test('clipboard text handles homeownerName legacy field', () => {
  const job = { address: '2 Shingle Ct', homeownerName: 'Carol Davis' };
  eq(buildHoverClipboardText(job), '2 Shingle Ct\nCarol Davis');
});

test('clipboard text skips blanks cleanly', () => {
  eq(buildHoverClipboardText({ address: '', homeowner: '' }), '');
  eq(buildHoverClipboardText({ address: 'only addr' }), 'only addr');
  eq(buildHoverClipboardText({ homeowner: 'only name' }), 'only name');
});

test('clipboard text tolerates null job', () => {
  eq(buildHoverClipboardText(null), '');
  eq(buildHoverClipboardText(undefined), '');
});

(async () => {
  for (const t of tests) {
    try { await t.fn(); results.push({ name: t.name, ok: true }); }
    catch (e) { results.push({ name: t.name, ok: false, err: e.message }); }
  }
  const pass = results.filter(r => r.ok).length;
  const fail = results.length - pass;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '\n       ' + r.err}`);
  }
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(fail ? 1 : 0);
})();
