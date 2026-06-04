/* CRC Field — Portal SSE client.
 *
 * Subscribes to /api/events/stream on the Portal and re-emits each
 * incoming server event as a DOM CustomEvent on window, prefixed
 * crc: so page modules can listen without coupling to EventSource.
 *
 * Usage:
 *   connectEventStream('MCG');
 *   window.addEventListener('crc:job.updated', (e) => { ... });
 *   window.addEventListener('crc:sse.status', (e) => { ... });   // 'connected' | 'reconnecting' | 'failed'
 *
 * Fallback: the existing poll-based refresh stays in place as a safety
 * net. app.js drops poll cadence to 60s when connected, 30s otherwise.
 */
(function () {
  const PORTAL = 'https://crc-supplements-dev.onrender.com';
  const APP_KEY = 'crc-field-2026';
  const EVENTS = [
    'job.created', 'job.updated', 'job.deleted', 'job.transferred',
    'activity.added', 'note.added', 'task.updated', 'photo.added', 'stage.changed',
  ];

  let es = null;
  let reconnectTimer = null;
  let backoffMs = 2000;
  const MAX_BACKOFF = 30000;
  let currentRep = null;
  let status = 'idle';

  function setStatus(next) {
    status = next;
    try {
      window.dispatchEvent(new CustomEvent('crc:sse.status', { detail: { status: next } }));
    } catch {}
  }

  function connect(repCode) {
    if (!repCode) return;
    currentRep = String(repCode).toUpperCase();
    disconnect();
    setStatus('reconnecting');

    const url = PORTAL + '/api/events/stream?key=' + encodeURIComponent(APP_KEY) + '&rep=' + encodeURIComponent(currentRep);

    try {
      es = new EventSource(url);
    } catch (e) {
      console.warn('[SSE] EventSource unsupported:', e);
      setStatus('failed');
      return;
    }

    es.addEventListener('connected', (ev) => {
      backoffMs = 2000;
      setStatus('connected');
      try { console.log('[SSE] connected', JSON.parse(ev.data)); } catch {}
    });

    EVENTS.forEach((name) => {
      es.addEventListener(name, (ev) => {
        let payload = {};
        try { payload = JSON.parse(ev.data); } catch {}
        window.dispatchEvent(new CustomEvent('crc:' + name, { detail: payload }));
      });
    });

    es.onerror = () => {
      setStatus('reconnecting');
      try { es.close(); } catch {}
      es = null;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(currentRep), backoffMs);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
      if (backoffMs >= MAX_BACKOFF) setStatus('failed');
    };
  }

  function disconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (es) {
      try { es.close(); } catch {}
      es = null;
    }
  }

  function forceReconnect() {
    backoffMs = 2000;
    if (currentRep) connect(currentRep);
  }

  window.connectEventStream = connect;
  window.disconnectEventStream = disconnect;
  window.forceReconnectEventStream = forceReconnect;
  window.getSSEStatus = () => status;
})();
