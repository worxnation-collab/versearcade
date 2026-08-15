// Verse Arcade service worker.
//
// Deliberately does NOT cache page/app responses — the app auto-deploys on
// every merge, and a caching SW is the classic way to serve users stale
// builds. Its jobs are narrow: (1) make the app installable to the home
// screen, and (2) receive Web Push notifications and route taps back into
// the app.

self.addEventListener('install', () => {
  // Take over as soon as we're installed — no waiting for old tabs to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// A verse dropped, a buddy challenged you, a streak's about to break — the
// payload tells us what to say. We fall back to a friendly default so a bare
// push still shows something.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Verse Arcade'
  const options = {
    body: data.body || "Today's verse is live — keep your streak going.",
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'verse-arcade',
    renotify: true,
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Tapping a notification should focus an open tab if we have one, otherwise
// open the app at the target url.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target).catch(() => {})
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    }),
  )
})
