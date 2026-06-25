// 4W Workspace Service Worker v1.0
const CACHE_NAME = '4w-workspace-v1';
const CDN_CACHE = '4w-cdn-v1';

// App shell files (local)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

// CDN libraries to cache on first load
const CDN_LIBS = [
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4/dist/index.global.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js'
];

// Install: cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && k !== CDN_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - App files: Cache First
// - CDN libs: Cache First, fallback network then cache
// - Everything else: Network First
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // CDN libraries
  if (CDN_LIBS.some(lib => url.includes(new URL(lib).hostname) || url === lib)) {
    event.respondWith(
      caches.open(CDN_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // App shell
  if (url.includes(self.location.origin)) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }

  // Default: network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Handle notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('./');
    })
  );
});

// Scheduled notification check
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATIONS') {
    // Store events in SW cache for background notification scheduling
    const eventsData = event.data.events;
    scheduleNotifications(eventsData);
  }
});

function scheduleNotifications(events) {
  // SW can't use setTimeout reliably; notifications are triggered from the main thread
  // This is just a message acknowledgment
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'SW_READY', eventsCount: events ? events.length : 0 });
    });
  });
}
