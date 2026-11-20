import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { conversationNotice, isChatPath, notificationSupport, NOTIFICATIONS_PERMISSION_EVENT, OPEN_CONVERSATION_MESSAGE, showConversationNotice } from './browserNotifications'
import { useUnreadSummarySubscription } from './unreadSummaryContext'

/**
 * Avisos del navegador y título de la pestaña (T-S13-08), alimentados por la consulta única del resumen. La primera
 * respuesta de cada cuenta es la línea base: lo que ya estaba sin leer no se avisa. Después se avisa cada conversación
 * cuyo último mensaje sin leer es más reciente que el conocido, salvo la que la persona tiene abierta y a la vista.
 */
export function LinkageNotifier() {
  // Con el permiso concedido, el notificador mantiene activa la consulta en todas las pantallas.
  const [permission, setPermission] = useState(notificationSupport)
  useEffect(() => {
    const update = () => setPermission(notificationSupport())
    window.addEventListener(NOTIFICATIONS_PERMISSION_EVENT, update)
    window.addEventListener('focus', update)
    return () => {
      window.removeEventListener(NOTIFICATIONS_PERMISSION_EVENT, update)
      window.removeEventListener('focus', update)
    }
  }, [])
  const state = useUnreadSummarySubscription(permission === 'granted')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // La ruta actual se lee al llegar el resumen, sin que cada navegación vuelva a evaluar los avisos.
  const where = useRef(pathname)
  useEffect(() => { where.current = pathname }, [pathname])
  const known = useRef<Map<number, number> | null>(null)
  const account = state?.account

  // Al cambiar de cuenta (o al cerrar sesión) se reinicia la línea base.
  useEffect(() => {
    known.current = null
    return () => { known.current = null }
  }, [account])

  // El clic de un aviso mostrado por el service worker llega como mensaje: se abre el chat con el router.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data
      if (typeof data === 'object' && data !== null && 'type' in data && data.type === OPEN_CONVERSATION_MESSAGE &&
          'url' in data && isChatPath(data.url)) navigate(data.url)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])

  const summary = state?.summary
  const side = state?.side
  useEffect(() => {
    if (!summary || !side) return
    const previous = known.current
    known.current = new Map(summary.items.map((item) => [item.id, item.last_message_id]))
    if (previous === null) return
    for (const item of summary.items) {
      if (item.last_message_id <= (previous.get(item.id) ?? 0)) continue
      const notice = conversationNotice(side, item)
      // T-S14-17: con la pestaña a la vista avisa la Snackbar de la barra de mensajes; el del navegador es para cuando
      // la pestaña está oculta.
      if (!document.hidden) continue
      void showConversationNotice(notice, (url) => navigate(url)).catch(() => { /* Sin aviso; queda el contador. */ })
    }
  }, [summary, side, navigate])

  // Contador en el título de la pestaña, como una bandeja de correo; al salir vuelve el título base.
  const count = summary?.conversations ?? 0
  useEffect(() => {
    if (count === 0) return
    const base = document.title
    document.title = `(${count > 99 ? '99+' : count}) ${base}`
    return () => { document.title = base }
  }, [count])

  return null
}
