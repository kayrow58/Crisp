// Push notification handling, imported into the generated service worker (vite.config.ts → workbox.importScripts).
self.addEventListener('push', (event) => {
  let data = { title: 'Crisp', body: 'Time to log something!', url: '/' }
  try {
    data = { ...data, ...event.data.json() }
  } catch (e) {
    /* plain text or empty */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
      tag: 'crisp-streak',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus()
      return self.clients.openWindow(url)
    }),
  )
})
