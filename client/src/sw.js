// App service worker — generated into dist/sw.js by vite-plugin-pwa
// (injectManifest strategy). Carries BOTH the PWA precache/runtime caching
// AND the push-notification handlers, so the PWA and push share one worker
// (two workers can't coexist at the same scope).
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// ── PWA: precache the build + SPA navigation fallback ─────
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// Supabase REST: network-first so profile/ID data works offline once loaded.
registerRoute(
  ({ url }) => /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\/.*/i.test(url.href),
  new NetworkFirst({
    cacheName: 'supabase-rest',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 14 }),
      { cacheableResponse: { statuses: [0, 200] } },
    ],
  })
);

// Supabase storage images (avatars, post images): cache-first.
registerRoute(
  ({ url }) => /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/.*/i.test(url.href),
  new CacheFirst({
    cacheName: 'supabase-storage',
    plugins: [
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      { cacheableResponse: { statuses: [0, 200] } },
    ],
  })
);

// ── push notifications ─────────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* non-JSON payload — ignore */
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'CODEBYTERS';
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: data.icon || '/assets/codebyterts-logo.gif',
    badge: data.badge || '/assets/codebyterts-logo.gif',
    data: { url: data.url || '/app/feed' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/app/feed';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
