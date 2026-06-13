// Service worker para Sesiona: shell offline básico.
// Estrategia:
// - Navegación (document): network-first con fallback a cache.
// - Assets same-origin (CSS/JS/iconos/manifest): cache-first con actualización en segundo plano (stale-while-revalidate).
// - Peticiones cross-origin (CDNs como Tesseract/html2pdf): se dejan pasar a la red sin interceptar.
// - Solo se interceptan peticiones GET.

const CACHE_NAME = 'sesiona-v1';

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
            .filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;

  // Solo interceptar peticiones GET.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Dejar pasar peticiones cross-origin sin interceptar (p.ej. CDNs de Tesseract/html2pdf).
  if (url.origin !== self.location.origin) return;

  // Navegación de documentos: network-first con fallback a cache (shell offline).
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy).catch(function () {});
          });
          return response;
        })
        .catch(function () {
          return caches.match(request).then(function (cached) {
            return cached || caches.match('/index.html') || caches.match('/');
          });
        })
    );
    return;
  }

  // Assets same-origin: cache-first con actualización en segundo plano (stale-while-revalidate).
  event.respondWith(
    caches.match(request).then(function (cached) {
      const fetchPromise = fetch(request)
        .then(function (response) {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(request, copy).catch(function () {});
            });
          }
          return response;
        })
        .catch(function () {
          return cached;
        });

      return cached || fetchPromise;
    })
  );
});
