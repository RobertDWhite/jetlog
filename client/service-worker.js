// Network-first service worker: always tries the network so online behavior is
// identical to having no worker; only serves from cache when the network fails
// (offline). API requests bypass the worker entirely.
const CACHE = 'jetlog-shell-v1';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    // Never intercept API traffic.
    if (url.pathname.includes('/api/')) return;

    event.respondWith(
        fetch(req)
            .then((res) => {
                if (res && res.status === 200 && url.origin === self.location.origin) {
                    const copy = res.clone();
                    caches.open(CACHE).then((c) => c.put(req, copy));
                }
                return res;
            })
            .catch(() =>
                caches.match(req).then(
                    (cached) =>
                        cached ||
                        (req.mode === 'navigation' ? caches.match('index.html') : undefined)
                )
            )
    );
});
