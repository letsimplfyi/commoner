// Commoner service worker: a versioned app-shell cache and a safe update path. Same design as Chaikadi's.
// CACHE and APP_VERSION (js/config.js) carry the same version; the deploy workflow stamps both on every
// release, so each deploy has its own cache and cached files can never be mixed across versions.
// Install is atomic: one missing file fails the whole install rather than half-caching a release.
const CACHE = 'commoner-shell-dev';
const SHELL = [
  './', './styles.css', './manifest.json',
  './js/config.js', './js/commons.js', './js/popular.js', './js/icons.js', './js/ui.js', './js/main.js', './js/theme.js', './js/update.js',
  './brand/tokens/tokens.css', './brand/css/base.css', './brand/css/components.css',
  './brand/fonts/atkinson-hyperlegible-mono-latin.woff2', './brand/fonts/atkinson-hyperlegible-next-latin-wght-normal.woff2',
  './brand/fonts/courier-prime-400-latin.woff2', './brand/fonts/courier-prime-700-latin.woff2', './brand/fonts/noto-serif-malayalam.woff2',
  './vendor/preact.module.js', './vendor/htm.module.js',
  './icons/favicon.svg', './icons/logo-mark.svg', './icons/logo-mark-inverse.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  // cache: 'reload' skips the browser's HTTP cache, so a fresh file is never mixed with older ones (Safari can do that).
  // skipWaiting: a broken page cannot ask for the update, so the new worker takes over at once; the page itself
  // then restarts into the new version at the next safe moment (js/update.js).
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(SHELL.map(path => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('commoner-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return; // Commons stays on the network
  if (event.request.mode === 'navigate') {
    // Short links: /c/Name -> /?c=Name (the relative asset paths only work from the root).
    if (url.pathname.startsWith('/c/')) { event.respondWith(Response.redirect(new URL(`/?${new URLSearchParams({ c: decodeURIComponent(url.pathname.slice(3)) })}`, self.location.origin).href, 302)); return; }
    // Cache "./" (not index.html): Pages redirects /index.html -> /, and a cached redirect cannot answer a navigation.
    event.respondWith(caches.open(CACHE).then(cache => cache.match('./')).then(cached => cached || fetch(event.request)));
    return;
  }
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request, { ignoreSearch: true })) || fetch(event.request, { cache: 'no-cache' })));
});
