/**
 * Avisos del navegador de mensajes nuevos (T-S13-08), sin Web Push: los muestra la pestaña abierta, aunque esté en
 * segundo plano. Exigen un contexto seguro (HTTPS o localhost). Con service worker se usa `showNotification`, que es
 * lo único que admite Chrome en Android; sin él, `new Notification()`.
 */
import { chatPath } from './conversationApi'
import type { LinkageSide, UnreadConversation } from './conversationApi'

export const NOTIFICATIONS_WORKER = '/notifications-sw.js'
export const OPEN_CONVERSATION_MESSAGE = 'open-conversation'

/** Solo rutas de conversación: el mensaje del service worker nunca debe poder mandar a otro lugar. */
export const isChatPath = (url: unknown): url is string =>
  typeof url === 'string' && /^\/(institution\/)?linkage-requests\/\d+\/chat$/.test(url)

export type NotificationSupport = 'unsupported' | NotificationPermission

export function notificationSupport(): NotificationSupport {
  if (typeof window === 'undefined' || !('Notification' in window) || !window.isSecureContext) return 'unsupported'
  return window.Notification.permission
}

/** Registro del service worker de avisos; sin soporte o si falla, los avisos usan `new Notification()`. */
export async function notificationsWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register(NOTIFICATIONS_WORKER)
  } catch {
    return null
  }
}

/** Aviso interno de que el permiso cambió desde la invitación: el notificador empieza a escuchar sin recargar. */
export const NOTIFICATIONS_PERMISSION_EVENT = 'linkage-notifications-permission'

/** Pide el permiso; debe llamarse desde un clic, como exigen los navegadores. */
export async function requestNotifications(): Promise<NotificationSupport> {
  if (notificationSupport() === 'unsupported') return 'unsupported'
  const permission = await window.Notification.requestPermission()
  if (permission === 'granted') await notificationsWorker()
  window.dispatchEvent(new Event(NOTIFICATIONS_PERMISSION_EVENT))
  return permission
}

export interface ConversationNotice {
  title: string
  body: string
  tag: string
  url: string
}

/** Muestra un aviso; su clic lleva a `url` (por el service worker o, sin él, con `onOpen`). */
export async function showConversationNotice(notice: ConversationNotice, onOpen: (url: string) => void): Promise<void> {
  if (notificationSupport() !== 'granted') return
  // `renotify`: un mensaje nuevo en la misma conversación reemplaza el aviso anterior y vuelve a sonar.
  const options = { body: notice.body, tag: notice.tag, renotify: true, icon: '/brand/logo.png', data: { url: notice.url } } as NotificationOptions
  const worker = await notificationsWorker()
  if (worker) {
    await worker.showNotification(notice.title, options)
    return
  }
  const notification = new window.Notification(notice.title, options)
  notification.onclick = () => {
    window.focus()
    onOpen(notice.url)
    notification.close()
  }
}
/** Texto del aviso: la otra organización y la oportunidad. Nunca el texto del mensaje ni datos del alumno. */
export function conversationNotice(side: LinkageSide, item: UnreadConversation) {
  return {
    title: item.unread_count === 1 ? `Mensaje nuevo de ${item.counterpart_name}` : `${item.unread_count} mensajes nuevos de ${item.counterpart_name}`,
    body: `Oportunidad: ${item.opportunity_title}`,
    tag: `linkage-${side}-${item.id}`,
    url: chatPath(side, item.id),
  }
}

