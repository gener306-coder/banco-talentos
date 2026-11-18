import { createContext, useContext, useEffect } from 'react'
import type { LinkageSide, UnreadSummary } from './conversationApi'

/**
 * Única consulta del resumen de mensajes sin leer (T-S13-08), compartida por el contador del menú, el título de la
 * pestaña y los avisos del navegador. `summary` es `null` hasta la primera respuesta para la cuenta actual.
 */
export interface UnreadSummaryState {
  side: LinkageSide
  /** Identifica la cuenta (id y rol): al cambiar, la línea base de los avisos se reinicia. */
  account: string
  summary: UnreadSummary | null
  /** Se suscribe a la consulta y devuelve cómo cancelar: sin suscriptores (ni contador ni avisos), no se consulta. */
  subscribe: () => () => void
}

export const UnreadSummaryContext = createContext<UnreadSummaryState | null>(null)

export const useUnreadSummary = () => useContext(UnreadSummaryContext)

/** Lee el resumen y mantiene activa la consulta mientras el componente lo necesite. */
export function useUnreadSummarySubscription(active = true) {
  const state = useUnreadSummary()
  const subscribe = state?.subscribe
  useEffect(() => (active && subscribe ? subscribe() : undefined), [active, subscribe])
  return state
}
