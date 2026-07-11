const STATIC_CACHE = 'rent-static-v1';
const SAME_ORIGIN_ASSETS = new Set(['script', 'style', 'image', 'font']);

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    if (request.destination === 'document') {
        event.respondWith(fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, copy));
            return response;
        }).catch(() => caches.match(request)));
        return;
    }

    if (SAME_ORIGIN_ASSETS.has(request.destination)) {
        event.respondWith(caches.match(request).then(cached => cached || fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, copy));
            return response;
        })));
    }
});
