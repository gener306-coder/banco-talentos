import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import type { LinkageSide, UnreadSummary } from './conversationApi'
import { UnreadSummaryContext } from './unreadSummaryContext'
import { startUnreadPolling } from './unreadTransport'
import type { UnreadTransport } from './unreadTransport'

/**
 * Consulta única del resumen de mensajes sin leer (T-S13-08) para las cuentas de empresa e institución, activa
 * mientras haya un contador en la pantalla o los avisos del navegador estén permitidos. Cómo llega el resumen lo decide
 * el transporte (T-S14-17, `unreadTransport.ts`): hoy, cada 10 s con la pestaña visible y cada 60 s oculta, al volver a
 * la pestaña, al leer y compartido entre pestañas. Además se consulta al navegar. Un error deja el último valor.
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

  const transport = useRef<UnreadTransport | null>(null)
  useEffect(() => {
    if (!side || !account || !active) return
    transport.current = startUnreadPolling({ side, account, onSummary: (summary) => setResult({ account, summary }) })
    return () => {
      transport.current?.stop()
      transport.current = null
    }
  }, [side, account, active])

  // Al navegar se consulta de nuevo (la primera vez ya lo hizo el transporte al arrancar).
  const route = `${pathname}${search}`
  const lastRoute = useRef(route)
  useEffect(() => {
    if (lastRoute.current === route) return
    lastRoute.current = route
    transport.current?.refresh()
  }, [route])

  // Un resumen de otra cuenta (cambio de sesión) nunca se muestra.
  const summary = result?.account === account ? result.summary : null
  // El proveedor se renderiza siempre (con null sin cuenta de empresa o institución): devolver los hijos sin él cambiaba el
  // tipo de elemento al iniciar sesión y React volvía a montar todo el árbol, encabezado incluido (ver useAppBarHeight).
  return <UnreadSummaryContext.Provider value={side && account ? { side, account, summary, subscribe } : null}>{children}</UnreadSummaryContext.Provider>
}
