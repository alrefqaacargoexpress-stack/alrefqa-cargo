/* Production shell only. Never cache API responses, credentials or authenticated server data. */
importScripts('/precache-manifest.js');
const CACHE = `alrefqa-copy-shell-${self.ALREFQA_BUILD_ID || 'v2'}`;
const SHELL = self.ALREFQA_PRECACHE || ['/', '/manifest.webmanifest', '/icons/logo.webp', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  // Clear only this application's outdated shell caches; never touch localStorage or user data.
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('alrefqa-copy-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/manus-oauth/') || url.pathname.startsWith('/__manus/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match('/')).then(response => response || new Response('Offline: open this app online once first.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))));
    return;
  }
  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(cached => cached || fetch(request)));
  }
});
