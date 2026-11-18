/*
 * T-S13-08: service worker mínimo de los avisos de mensajes nuevos. Solo muestra notificaciones (Chrome en Android no
 * permite `new Notification()`) y atiende su clic: enfoca la pestaña de la plataforma y le pide abrir la conversación,
 * o abre una nueva. No tiene manejador de `fetch`: no cachea nada ni cambia cómo carga la aplicación.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

const CHAT_PATH = /^\/(institution\/)?linkage-requests\/\d+\/chat$/

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data && event.notification.data.url
  if (typeof url !== 'string' || !CHAT_PATH.test(url)) return
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = windows.find((item) => new URL(item.url).origin === self.location.origin)
    if (client) {
      await client.focus()
      client.postMessage({ type: 'open-conversation', url })
      return
    }
    await self.clients.openWindow(url)
  })())
})
