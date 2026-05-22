/**
 * Rep codes — Postgres-backed in-memory cache with a sync interface.
 *
 * The auth surface in the field app is built around three synchronous
 * functions (validateRepCode, listRepCodes, isAdmin). Hot path for every
 * request, including the static-asset edge cases that can't easily await.
 *
 * Step 5 moves the source of truth from data/rep-codes.json to the
 * Postgres users table. Cache refresh runs at module load and every
 * REFRESH_MS afterwards. Functions read from the cache; never the DB
 * directly. If the cache hasn't loaded yet, the sync calls return safe
 * empty/false values — boot-time calls are rare and the cache primes
 * within milliseconds.
 *
 * The legacy data/rep-codes.json file stays on disk as backup until the
 * cleanup pass after Step 6. It is no longer read or written at runtime.
 */

const { query } = require('../db/client');

const REFRESH_MS = 5 * 60 * 1000;  // 5 minutes

// Cache shape mirrors the legacy lib/repCodes.js list-of-objects shape so
// callers see exactly what they used to.
let _cache = [];
let _loadedAt = 0;
let _loading = null;

function _rowToLegacy(u) {
  return {
    user_id: u.user_id,
    code: u.rep_code,
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone || '',
    active: !!u.active,
    field_app_access: !!u.field_app_access,
    portal_access: !!u.portal_access,
  };
}

async function _load() {
  const { rows } = await query(
    'SELECT user_id, email, name, role, rep_code, phone, field_app_access, portal_access, active FROM users WHERE active = TRUE AND rep_code IS NOT NULL ORDER BY rep_code'
  );
  _cache = rows.map(_rowToLegacy);
  _loadedAt = Date.now();
}

async function refreshRepCodes() {
  if (_loading) return _loading;
  _loading = _load().finally(() => { _loading = null; });
  return _loading;
}

// Kick off the first load on module load; don't block require().
refreshRepCodes().catch((e) => {
  console.error('[repCodes] initial load failed:', e.message);
});

// Periodic refresh.
setInterval(() => {
  refreshRepCodes().catch((e) => {
    console.error('[repCodes] refresh failed:', e.message);
  });
}, REFRESH_MS).unref();

// ── Sync surface (unchanged from legacy contract) ───────────────────────

function listRepCodes() {
  return _cache;
}

function validateRepCode(code) {
  if (!code) return null;
  const c = String(code).toUpperCase();
  return _cache.find((r) => r.code === c && r.active) || null;
}

function isAdmin(code) {
  const rep = validateRepCode(code);
  return !!(rep && (rep.role === 'admin' || rep.role === 'ceo'));
}

// Diagnostic — handy for /api/system or admin routes
function repCacheStatus() {
  return { loaded: _loadedAt > 0, loadedAt: _loadedAt, count: _cache.length };
}

module.exports = { listRepCodes, validateRepCode, isAdmin, refreshRepCodes, repCacheStatus };
