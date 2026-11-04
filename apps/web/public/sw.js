/*
 * Aldetes service worker — caches ONLY the app shell (HTML, hashed JS/CSS, icons) so the app opens
 * from the home screen and shows an honest offline state. It never touches the API, the realtime
 * socket, uploads or voice/video: those always go to the network.
 * A new build is a new SW (?v=<build>); it waits until the app says it's a safe moment (not in a call).
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `aldetes-shell-${VERSION}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('aldetes-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

const NEVER = /^\/(api|socket\.io|cdn)(\/|$)/;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || NEVER.test(url.pathname)) return;

  // Page loads: network first (always the newest HTML when online), cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }
  // Hashed build assets never change: cache first.
  if (url.pathname.includes('/assets/') || SHELL.some((s) => url.pathname.endsWith(s.slice(1)))) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
