// Service worker para Sesiona: shell offline básico.
// Estrategia:
// - Navegación (document): network-first con fallback a cache.
// - JS/CSS same-origin: network-first con fallback a cache. Así un deploy se ve
//   en la siguiente carga (con cache-first los usuarios veían la versión
//   anterior hasta la segunda visita) y sin red se sirve la copia cacheada.
// - Resto de assets same-origin (iconos, manifest): cache-first con
//   actualización en segundo plano (stale-while-revalidate).
// - CDNs permitidos (Tesseract/html2pdf y sus recursos): cache-first en un
//   cache aparte. Son URLs versionadas e inmutables; tras el primer uso con
//   red, el OCR y el PDF funcionan también offline.
// - Solo se interceptan peticiones GET.

const CACHE_NAME = 'sesiona-v2';
const CDN_CACHE = 'sesiona-cdn-v1';

const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'unpkg.com',
  'tessdata.projectnaptha.com'
];

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/css/app.css',
  '/assets/css/advisor.css',
  '/assets/css/invoice.css',
  '/assets/css/calendar.css',
  '/assets/js/app.js',
  '/assets/js/advisor.js',
  '/assets/js/branding.js',
  '/assets/js/invoice.js',
  '/assets/js/photo-import.js',
  '/assets/vendor/html2pdf.bundle.min.js',
  '/assets/icons/icon.svg',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        return Promise.all(
          APP_SHELL.map(function (url) {
            return cache.add(url).catch(function () {
              // Ignorar recursos que no existan o fallen al precachear.
            });
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) { return key !== CACHE_NAME && key !== CDN_CACHE; })
            .map(function (key) { return caches.delete(key); })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function putInCache(cacheName, request, response) {
  if (!response) return response;
  // Guardar respuestas correctas u opacas (scripts no-cors de CDN).
  if (response.status === 200 || response.type === 'opaque') {
    const copy = response.clone();
    caches.open(cacheName).then(function (cache) {
      cache.put(request, copy).catch(function () {});
    });
  }
  return response;
}

self.addEventListener('fetch', function (event) {
  const request = event.request;

  // Solo interceptar peticiones GET.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // CDNs permitidos: cache-first (URLs versionadas → inmutables en la práctica).
  if (url.origin !== self.location.origin) {
    if (CDN_HOSTS.indexOf(url.hostname) === -1) return; // otros orígenes: no interceptar
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request).then(function (response) {
          return putInCache(CDN_CACHE, request, response);
        });
      })
    );
    return;
  }

  // Navegación de documentos: network-first con fallback a cache (shell offline).
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          return putInCache(CACHE_NAME, request, response);
        })
        .catch(function () {
          return caches.match(request).then(function (cached) {
            return cached || caches.match('/index.html') || caches.match('/');
          });
        })
    );
    return;
  }

  // JS y CSS propios: network-first con fallback a cache (deploys al día).
  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          return putInCache(CACHE_NAME, request, response);
        })
        .catch(function () {
          return caches.match(request);
        })
    );
    return;
  }

  // Resto de assets same-origin: cache-first con actualización en segundo plano.
  event.respondWith(
    caches.match(request).then(function (cached) {
      const fetchPromise = fetch(request)
        .then(function (response) {
          return putInCache(CACHE_NAME, request, response);
        })
        .catch(function () {
          return cached;
        });

      return cached || fetchPromise;
    })
  );
});
