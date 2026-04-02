const CACHE_NAME = 'crc-field-v3';
const SHELL = ['/', '/style.css', '/app.js', '/views.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return;
  // Network first for app shell, fall back to cache
  e.respondWith(fetch(e.request).then(resp => {
    if (resp.ok) { const clone = resp.clone(); caches.open(CACHE_NAME).then(c => c.put(e.request, clone)); }
    return resp;
  }).catch(() => caches.match(e.request).then(cached => cached || caches.match('/'))));
});
