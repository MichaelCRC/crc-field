/* CRC Field Intel -- Hover deep link helper
 *
 * Hover does not expose URL params for pre-filling a new project
 * (see HOVER_SPRINT_FINDINGS.md). Best we can do:
 *   1. Copy address+name to clipboard so rep can paste into Hover.
 *   2. Try custom scheme hover:// to open the iOS app.
 *   3. Fall back to https://hover.to if the scheme doesn't fire.
 *   4. Toast an App Store link if iOS blocks the attempt.
 */

var HOVER_SCHEME = 'hover://';
var HOVER_WEB = 'https://hover.to';
var HOVER_APPSTORE = 'https://apps.apple.com/us/app/hover-design-measure/id942568673';

function hoverHomeownerName(job) {
  if (!job) return '';
  var ho = job.homeowner;
  if (ho && typeof ho === 'object') {
    var f = ho.firstName || ho.first || '';
    var l = ho.lastName || ho.last || '';
    var full = (f + ' ' + l).trim();
    if (full) return full;
  }
  if (typeof ho === 'string' && ho.trim()) return ho.trim();
  return (job.homeownerName || job.name || '').trim();
}

function buildHoverClipboardText(job) {
  var parts = [];
  var addr = (job && job.address) || '';
  var name = hoverHomeownerName(job || {});
  if (addr) parts.push(addr);
  if (name) parts.push(name);
  return parts.join('\n');
}

// Exported so tests can verify URL shape without a DOM.
function hoverLaunchTargets() {
  return {
    scheme: HOVER_SCHEME,
    fallback: HOVER_WEB,
    appStore: HOVER_APPSTORE,
  };
}

function _hoverToast(msg, linkUrl, linkLabel) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:16px;right:16px;bottom:24px;z-index:99999;'
    + 'background:#1B2360;color:#fff;padding:12px 14px;border-radius:8px;'
    + 'font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.25);'
    + 'display:flex;align-items:center;justify-content:space-between;gap:12px';
  var span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  if (linkUrl) {
    var a = document.createElement('a');
    a.href = linkUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = linkLabel || 'Open';
    a.style.cssText = 'color:#00B5CC;text-decoration:underline;font-weight:700';
    el.appendChild(a);
  }
  document.body.appendChild(el);
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 6000);
}

function openHoverForJob(job) {
  var targets = hoverLaunchTargets();
  var paste = buildHoverClipboardText(job || {});

  if (paste && typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(paste).catch(function () { /* silent */ });
  }

  console.log('[hover-link] scheme=%s fallback=%s paste=%o', targets.scheme, targets.fallback, paste);

  var start = Date.now();
  var fired = false;

  function fallback() {
    if (fired) return;
    fired = true;
    if (!document.hidden && Date.now() - start < 2500) {
      console.log('[hover-link] scheme did not fire; opening web fallback');
      window.location.href = targets.fallback;
    }
  }

  function onVisibility() {
    if (document.hidden) {
      fired = true; // app took over; cancel fallback
      document.removeEventListener('visibilitychange', onVisibility);
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  try {
    window.location.href = targets.scheme;
  } catch (e) {
    console.warn('[hover-link] scheme threw', e);
    _hoverToast('Could not open Hover. Install it?', targets.appStore, 'App Store');
    return;
  }

  setTimeout(fallback, 1500);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hoverLaunchTargets: hoverLaunchTargets,
    buildHoverClipboardText: buildHoverClipboardText,
  };
}
