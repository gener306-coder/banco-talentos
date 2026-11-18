import type { LinkageSide } from './conversationApi'
import { useUnreadSummarySubscription } from './unreadSummaryContext'

/** Actualización del resumen (HU-S13-04 CA-03): cada 60 s, también con la pestaña oculta desde T-S13-08. */
export const UNREAD_POLL_INTERVAL_MS = 60_000

/**
 * Conversaciones de la organización con mensajes sin leer (HU-S13-04 CA-03). Lee la consulta única de
 * `UnreadSummaryProvider` (T-S13-08): varios contadores en la pantalla no multiplican las peticiones.
 */
export function useUnreadConversations(side: LinkageSide): number {
  const state = useUnreadSummarySubscription()
  return state && state.side === side ? state.summary?.conversations ?? 0 : 0
}
