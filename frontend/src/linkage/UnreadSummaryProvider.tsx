import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { getUnreadSummary, LINKAGE_READ_EVENT } from './conversationApi'
import type { LinkageSide, UnreadSummary } from './conversationApi'
import { UnreadSummaryContext } from './unreadSummaryContext'
import { UNREAD_POLL_INTERVAL_MS } from './useUnreadConversations'

/**
 * Consulta única del resumen de mensajes sin leer (T-S13-08) para las cuentas de empresa e institución, activa
 * mientras haya un contador en la pantalla o los avisos del navegador estén permitidos. Se actualiza
 * al navegar, al volver a la pestaña o a la ventana, cuando una conversación se marca como leída y cada 60 s, también
 * con la pestaña oculta: es cuando el aviso del navegador sirve. Un error deja el último valor.
 */
export function UnreadSummaryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const side: LinkageSide | null = user?.role === 'COMPANY' || user?.role === 'INSTITUTION' ? user.role : null
  const account = user && side ? `${user.id}:${side}` : null
  const [result, setResult] = useState<{ account: string; summary: UnreadSummary } | null>(null)
  const { pathname, search } = useLocation()
  // Solo se consulta mientras algo lo usa: un contador en la pantalla o los avisos del navegador activados.
  const [subscribers, setSubscribers] = useState(0)
  const subscribe = useCallback(() => {
    setSubscribers((count) => count + 1)
    return () => setSubscribers((count) => count - 1)
  }, [])
  const active = subscribers > 0

  useEffect(() => {
    if (!side || !account || !active) return
    const controller = new AbortController()
    const refresh = () => {
      getUnreadSummary(side, controller.signal)
        .then((summary) => setResult({ account, summary }))
        .catch(() => { /* El siguiente intento lo corrige. */ })
    }
    const onVisibility = () => { if (!document.hidden) refresh() }

    refresh()
    const timer = window.setInterval(refresh, UNREAD_POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', refresh)
    window.addEventListener(LINKAGE_READ_EVENT, refresh)
    return () => {
      window.clearInterval(timer)
      controller.abort()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refresh)
      window.removeEventListener(LINKAGE_READ_EVENT, refresh)
    }
  }, [side, account, active, pathname, search])

  if (!side || !account) return children
  // Un resumen de otra cuenta (cambio de sesión) nunca se muestra.
  const summary = result?.account === account ? result.summary : null
  return <UnreadSummaryContext.Provider value={{ side, account, summary, subscribe }}>{children}</UnreadSummaryContext.Provider>
}
