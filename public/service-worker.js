const CACHE_NAME = 'setlist-stage-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch('/stage', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to precache the Stage View app shell.');
    const html = await response.clone().text();
    await cache.put('/stage', response);
    const assetPaths = [...new Set(html.match(/(?:src|href)="(\/assets\/[^"]+)"/g) || [])]
      .map((attribute) => attribute.slice(attribute.indexOf('"') + 1, -1));
    await Promise.all(assetPaths.map(async (assetPath) => {
      const assetResponse = await fetch(assetPath, { cache: 'no-store' });
      if (assetResponse.ok) await cache.put(assetPath, assetResponse);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('setlist-stage-shell-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws') return;

  if (request.mode === 'navigate' && url.pathname === '/stage') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/stage', response.clone());
        }
        return response;
      } catch {
        return (await caches.match('/stage')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })());
  }
});
