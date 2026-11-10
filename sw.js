// Guarda la app en caché para que abra sin internet.
// Al cambiar archivos de la app, sube la versión: el teléfono la detecta, descarga todo de nuevo
// (sin usar copias viejas) y la app se recarga sola o muestra un aviso.
const CACHE = 'hoja-v14';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'db.js',
  'backup.js',
  'progress.js',
  'reader.js',
  'ideas.js',
  'theme.js',
  'nav.js',
  'growth.js',
  'graph.js',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js',
];

self.addEventListener('install', e => {
  // cache: 'reload' evita que el navegador reutilice archivos viejos de su caché HTTP
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Siempre lo guardado de esta versión (rápido, sin internet y sin mezclar versiones).
// Lo que no esté guardado (p. ej. fuentes) se descarga y se guarda.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin
    || url.hostname === 'cdn.jsdelivr.net'
    || url.hostname === 'fonts.googleapis.com'
    || url.hostname === 'fonts.gstatic.com';
  if (!cacheable) return;

  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: url.origin === location.origin });
    if (hit) return hit;
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }));
});
