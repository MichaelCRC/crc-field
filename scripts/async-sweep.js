#!/usr/bin/env node
/**
 * Field-app async sweep (Step 5 companion of the portal Step 3.5 sweep).
 *
 * lib/store.js's lead-touching functions became async when leads moved to
 * Postgres. This script:
 *   1. Inserts `await ` before every callsite of an async-now method.
 *   2. Marks Express route handlers async.
 *   3. Marks standalone function declarations async when they contain
 *      `await`.
 *
 * Idempotent. Mechanical only — does not refactor route logic.
 *
 * Run from crc-field/:
 *   node scripts/async-sweep.js [--dry]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

const ASYNC_METHODS = ['listLeads', 'getLead', 'createLead', 'updateLead'];

const callRe = new RegExp(
  `(?<!await\\s)(?<!\\w\\.)\\b(${ASYNC_METHODS.join('|')})\\s*\\(`,
  'g'
);

const SKIP = new Set([
  'lib/store.js',
  'scripts/async-sweep.js',
]);
const SKIP_PREFIX = ['scripts/geocode-builds', 'scripts/analyze'];

function findCandidateFiles() {
  const out = [];
  const dirs = ['routes', 'lib', 'scripts'];
  for (const d of dirs) {
    const full = path.join(ROOT, d);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      if (!f.endsWith('.js')) continue;
      const rel = path.join(d, f);
      if (SKIP.has(rel)) continue;
      if (SKIP_PREFIX.some((p) => rel.startsWith(p))) continue;
      out.push(rel);
    }
  }
  // server.js too
  if (fs.existsSync(path.join(ROOT, 'server.js'))) out.unshift('server.js');
  return out;
}

function addAwaits(src) {
  let count = 0;
  const out = src.replace(callRe, (m, methodName, offset) => {
    const lineStart = src.lastIndexOf('\n', offset) + 1;
    const lineEnd = src.indexOf('\n', offset);
    const line = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return m;
    if (/=\s*require/.test(line)) return m;
    if (new RegExp(`function\\s+${methodName}\\s*\\(`).test(line)) return m;
    if (new RegExp(`async\\s+function\\s+${methodName}\\s*\\(`).test(line)) return m;
    count += 1;
    return 'await ' + m;
  });
  return { out, count };
}

function makeRouteHandlersAsync(src) {
  let count = 0;
  src = src.replace(
    /(\brouter\.(get|post|put|patch|delete|use|all|head|options)\s*\([^,]*,\s*)(\()/g,
    (m, lead, _verb, paren) => { count += 1; return lead + 'async ' + paren; }
  );
  src = src.replace(
    /(\brouter\.(get|post|put|patch|delete|use|all|head|options)\s*\([^,]*,\s*)(function\s*\()/g,
    (m, lead, _verb, fn) => { count += 1; return lead + 'async ' + fn; }
  );
  src = src.replace(
    /(\bapp\.(get|post|put|patch|delete|use|all)\s*\([^,]*,\s*)(\()/g,
    (m, lead, _verb, paren) => { count += 1; return lead + 'async ' + paren; }
  );
  src = src.replace(
    /(\bapp\.(get|post|put|patch|delete|use|all)\s*\([^,]*,\s*)(function\s*\()/g,
    (m, lead, _verb, fn) => { count += 1; return lead + 'async ' + fn; }
  );
  src = src.replace(/async\s+async\s+/g, 'async ');
  return { out: src, count };
}

function makeStandaloneFunctionsAsync(src) {
  let count = 0;
  const candidates = [];
  const patterns = [
    { re: /\bfunction\s+(\w+)\s*\([^)]*\)\s*\{/g },
    { re: /\bfunction\s*\([^)]*\)\s*\{/g },
    { re: /(?:^|[=,(])\s*(?:\(([^)]*)\)|(\w+))\s*=>\s*\{/g },
  ];
  for (const { re } of patterns) {
    let m;
    while ((m = re.exec(src))) {
      const openBraceIdx = src.indexOf('{', m.index + m[0].length - 1);
      if (openBraceIdx < 0) continue;
      let depth = 0, close = -1;
      for (let i = openBraceIdx; i < src.length; i += 1) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') { depth -= 1; if (depth === 0) { close = i; break; } }
      }
      if (close < 0) continue;
      const body = src.slice(openBraceIdx + 1, close);
      if (!/\bawait\b/.test(body)) continue;
      const startLine = src.lastIndexOf('\n', m.index) + 1;
      const declLine = src.slice(startLine, m.index + m[0].length);
      if (/\basync\b/.test(declLine)) continue;
      candidates.push({ matchStart: m.index, matchText: m[0] });
    }
  }
  candidates.sort((a, b) => b.matchStart - a.matchStart);

  let out = src;
  for (const c of candidates) {
    const m = c.matchText;
    let replacement = null;
    if (/^\s*function/.test(m) || /^function/.test(m)) {
      const leading = m.match(/^\s*/)[0];
      replacement = leading + 'async ' + m.trimStart();
    } else if (/=>\s*\{$/.test(m)) {
      // Insert `async ` BEFORE the params, not inside the leading dispatch
      // paren. ONLY consume `[=,(]` leads, never `^`, so we don't insert
      // inside a `.method(arg => {})` chain.
      const leadMatch = m.match(/^([=,(]?)(\s*)/);
      if (!leadMatch) continue;
      const lead = leadMatch[1];
      const ws = leadMatch[2];
      const rest = m.slice(lead.length + ws.length);
      if (/^async\b/.test(rest)) continue;
      replacement = lead + ws + 'async ' + rest;
    } else {
      continue;
    }
    if (replacement && replacement !== m) {
      out = out.slice(0, c.matchStart) + replacement + out.slice(c.matchStart + m.length);
      count += 1;
    }
  }
  return { out, count };
}

function processFile(rel) {
  const full = path.join(ROOT, rel);
  const before = fs.readFileSync(full, 'utf8');
  const { out: a1, count: awaits } = addAwaits(before);
  const { out: a2, count: routeAsyncs } = makeRouteHandlersAsync(a1);
  const { out: a3, count: fnAsyncs } = makeStandaloneFunctionsAsync(a2);
  const final = a3.replace(/\bawait\s+await\s+/g, 'await ');
  const changed = final !== before;
  return { rel, before, final, changed, awaits, routeAsyncs, fnAsyncs };
}

const files = findCandidateFiles();
const results = files.map(processFile);
const touched = results.filter((r) => r.changed);

if (DRY) {
  console.log(`DRY RUN — ${touched.length} files would change`);
} else {
  for (const r of touched) fs.writeFileSync(path.join(ROOT, r.rel), r.final);
  console.log(`Wrote ${touched.length} files`);
}
const totals = touched.reduce(
  (acc, r) => ({ awaits: acc.awaits + r.awaits, routeAsyncs: acc.routeAsyncs + r.routeAsyncs, fnAsyncs: acc.fnAsyncs + r.fnAsyncs }),
  { awaits: 0, routeAsyncs: 0, fnAsyncs: 0 }
);
console.log(`Transforms: ${totals.awaits} await inserts, ${totals.routeAsyncs} route handlers → async, ${totals.fnAsyncs} standalone fns → async`);
for (const r of touched) {
  console.log(`  ${r.rel.padEnd(40)}  +${r.awaits}a  +${r.routeAsyncs}r  +${r.fnAsyncs}f`);
}
