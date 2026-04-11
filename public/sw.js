const CACHE_NAME = 'crc-field-v4';
const AUDIO_CACHE = 'crc-audio-v1';
const SHELL = ['/', '/style.css', '/app.js', '/views.js', '/manifest.json', '/training.html'];

// Max audio entries to cache (prevents runaway storage on small devices)
const AUDIO_MAX = 30;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME && k !== AUDIO_CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;

  // --- Cloudinary media: cache-first (audio/video/image from crc-university) ---
  if (url.includes('res.cloudinary.com') && url.includes('crc-university')) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        try {
          const resp = await fetch(e.request, { mode: 'cors' });
          if (resp.ok) {
            // Enforce max entry limit
            const keys = await cache.keys();
            if (keys.length >= AUDIO_MAX) {
              await cache.delete(keys[0]);
            }
            cache.put(e.request, resp.clone());
          }
          return resp;
        } catch (err) {
          return cached || new Response('Offline — audio not cached yet', { status: 503 });
        }
      })
    );
    return;
  }

  // --- API calls: always network, never cache ---
  if (url.includes('/api/')) return;

  // --- App shell + pages: network-first, fall back to cache ---
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return resp;
    }).catch(() =>
      caches.match(e.request).then(cached => cached || caches.match('/'))
    )
  );
});

// Listen for messages from the page to pre-cache specific audio URLs
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CACHE_AUDIO' && e.data.url) {
    caches.open(AUDIO_CACHE).then(async cache => {
      const already = await cache.match(e.data.url);
      if (!already) {
        fetch(e.data.url, { mode: 'cors' }).then(resp => {
          if (resp.ok) cache.put(e.data.url, resp);
        }).catch(() => {});
      }
      // Reply with current cached URL list so page can update indicators
      cache.keys().then(keys => {
        e.source.postMessage({ type: 'CACHED_URLS', urls: keys.map(k => k.url) });
      });
    });
  }
  if (e.data && e.data.type === 'GET_CACHED_URLS') {
    caches.open(AUDIO_CACHE).then(cache => {
      cache.keys().then(keys => {
        e.source.postMessage({ type: 'CACHED_URLS', urls: keys.map(k => k.url) });
      });
    });
  }
});
