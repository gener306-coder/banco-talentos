import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { getUnreadConversations, LINKAGE_READ_EVENT } from './conversationApi'
import type { LinkageSide } from './conversationApi'

/** Actualización del aviso del menú con la pestaña visible (HU-S13-04 CA-03). */
export const UNREAD_POLL_INTERVAL_MS = 60_000

/**
 * Conversaciones de la organización con mensajes sin leer (HU-S13-04 CA-03). Se consulta al navegar, al volver a la
 * pestaña o a la ventana, cuando una conversación se marca como leída y cada 60 s con la pestaña visible. Un error
 * deja el último valor: el siguiente intento lo corrige.
 */
export function useUnreadConversations(side: LinkageSide): number {
  const [count, setCount] = useState(0)
  const { pathname, search } = useLocation()

  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    const refresh = () => {
      getUnreadConversations(side, controller.signal).then(setCount).catch(() => { /* El siguiente intento lo reintenta. */ })
    }
    const start = () => { if (timer === undefined && !document.hidden) timer = window.setInterval(refresh, UNREAD_POLL_INTERVAL_MS) }
    const stop = () => { window.clearInterval(timer); timer = undefined }
    const onVisibility = () => {
      if (document.hidden) { stop(); return }
      refresh()
      start()
    }

    refresh()
    start()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', refresh)
    window.addEventListener(LINKAGE_READ_EVENT, refresh)
    return () => {
      stop()
      controller.abort()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refresh)
      window.removeEventListener(LINKAGE_READ_EVENT, refresh)
    }
  }, [side, pathname, search])

  return count
}
