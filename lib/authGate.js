/**
 * Server-side auth gate for the field app.
 *
 * The rep-code "gate" in the SPA is client-side only — it controls UI entry,
 * not data access. These middlewares enforce the rep code SERVER-SIDE against
 * the live `active` flag (via repCodes cache), so a deactivated rep with a
 * stale localStorage code is locked out of the endpoints, not just the UI.
 *
 * Credential is read from a header first (x-field-rep / x-rep-code) so it
 * stays out of the URL/query string (which leaks to access logs); the query
 * param is accepted only as a backward-compat fallback.
 */

const { validateRepCode, isAdmin, isLeader } = require('./repCodes');

function repFromReq(req) {
  const fromHeader = req.headers['x-field-rep'] || req.headers['x-rep-code'];
  const fromQuery = req.query.repCode || req.query.rep || req.query.auth;
  return String(fromHeader || fromQuery || '').toUpperCase().trim();
}

// Any valid, ACTIVE rep. Attaches req.rep + req.repCode for handlers.
function requireRep(req, res, next) {
  const code = repFromReq(req);
  const rep = validateRepCode(code);
  if (!rep) return res.status(401).json({ error: 'Invalid or deactivated rep code' });
  req.rep = rep;
  req.repCode = code;
  next();
}

// Admin/ceo only.
function requireAdmin(req, res, next) {
  const code = repFromReq(req);
  if (!validateRepCode(code)) return res.status(401).json({ error: 'Invalid or deactivated rep code' });
  if (!isAdmin(code)) return res.status(403).json({ error: 'Admin access required' });
  req.repCode = code;
  next();
}

// Leadership (ceo/admin/operator/sales_manager). Used for company-wide views.
function requireLeader(req, res, next) {
  const code = repFromReq(req);
  if (!validateRepCode(code)) return res.status(401).json({ error: 'Invalid or deactivated rep code' });
  if (!isLeader(code)) return res.status(403).json({ error: 'Leadership access required' });
  req.repCode = code;
  next();
}

module.exports = { repFromReq, requireRep, requireAdmin, requireLeader };
