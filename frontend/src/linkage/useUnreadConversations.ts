import type { LinkageSide } from './conversationApi'
import { useUnreadSummarySubscription } from './unreadSummaryContext'

import { UNREAD_HIDDEN_INTERVAL_MS } from './unreadTransport'

/**
 * Actualización del resumen (HU-S13-04 CA-03): cada 60 s como mínimo, también con la pestaña oculta (T-S13-08). Con la
 * pestaña visible, cada 10 s desde T-S14-17 (`UNREAD_VISIBLE_INTERVAL_MS`).
 */
export const UNREAD_POLL_INTERVAL_MS = UNREAD_HIDDEN_INTERVAL_MS

/**
 * Conversaciones de la organización con mensajes sin leer (HU-S13-04 CA-03). Lee la consulta única de
 * `UnreadSummaryProvider` (T-S13-08): varios contadores en la pantalla no multiplican las peticiones.
 */
export function useUnreadConversations(side: LinkageSide): number {
  const state = useUnreadSummarySubscription()
  return state && state.side === side ? state.summary?.conversations ?? 0 : 0
}
