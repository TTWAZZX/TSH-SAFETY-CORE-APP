const SW_VERSION = '20260503-mobile-shell';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') {
    event.ports?.[0]?.postMessage(SW_VERSION);
  }
});

self.addEventListener('fetch', () => {
  // Intentionally network-only. This app uses authenticated, frequently changing data,
  // so the service worker exists for installability without introducing stale caches.
});
