const STATIC_CACHE = 'rent-static-v3';
const SAME_ORIGIN_ASSETS = new Set(['script', 'style', 'image', 'font']);

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => cache.addAll([
            './',
            './manifest.webmanifest',
        ])),
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(names
                .filter((name) => name.startsWith('rent-static-') && name !== STATIC_CACHE)
                .map((name) => caches.delete(name))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    if (request.destination === 'document') {
        event.respondWith(fetch(request).then((response) => {
            if (response.ok) {
                const copy = response.clone();
                void caches.open(STATIC_CACHE).then(cache => cache.put(request, copy));
            }
            return response;
        }).catch(async () => (await caches.match(request)) || (await caches.match('./')) || new Response('Offline', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })));
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
