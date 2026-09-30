const CACHE_NAME = 'sachin-hub-v7';

// Core local assets to pre-cache on install
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg'
];

// Third-party CDNs to cache for complete offline aesthetics (Google Fonts & Font Awesome)
const CACHEABLE_ORIGINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com'
];

// Install: Pre-cache local assets & activate immediately
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const asset of CORE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn(`[SW] Precache non-critical skip for: ${asset}`, err);
        }
      }
    })
  );
});

// Activate: Immediately purge all outdated cache versions and claim active clients
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log(`[SW] Purging old cache: ${key}`);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Hybrid Strategy (Network-First for local code, Cache-First for CDNs, Network-Only for dynamic APIs)
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Bypass external dynamic APIs (IMDb search JSONP, YouTube trailers, screenshot generators, favicons)
  const isDynamicApi = url.hostname.includes('imdb.com') ||
                        url.hostname.includes('youtube.com') ||
                        url.hostname.includes('allorigins') ||
                        url.hostname.includes('wordpress.com') ||
                        url.hostname.includes('google.com/s2/favicons');

  if (isDynamicApi) {
    return; // Pass through directly to network
  }

  // 2. Cache-First for Third-Party Fonts & Icons CDN (Instant load & full offline support)
  const isCdnAsset = CACHEABLE_ORIGINS.some(origin => url.hostname.includes(origin));
  if (isCdnAsset) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return networkResponse;
        }).catch(() => {
          return new Response('', { status: 408, statusText: 'Offline' });
        });
      })
    );
    return;
  }

  // 3. Network-First with Cache Fallback for Local App Shell (Guarantees instant fresh updates when online, reliable offline fallback)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Navigation fallback to index.html if navigating
        if (request.mode === 'navigate') {
          return (await caches.match('./index.html')) || (await caches.match('./'));
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
    );
  }
});
