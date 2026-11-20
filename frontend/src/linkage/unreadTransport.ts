import { getUnreadSummary, LINKAGE_READ_EVENT } from './conversationApi'
import type { LinkageSide, UnreadSummary } from './conversationApi'

/** T-S14-17: con la pestaña a la vista, el resumen se consulta cada 10 s: un mensaje nuevo se avisa casi al instante. */
export const UNREAD_VISIBLE_INTERVAL_MS = 10_000
/** Con la pestaña oculta basta cada 60 s: es lo que necesitan los avisos del navegador (T-S13-08). */
export const UNREAD_HIDDEN_INTERVAL_MS = 60_000

const CHANNEL = 'bt-unread'

type ChannelMessage = { type: 'summary'; account: string; summary: UnreadSummary } | { type: 'refresh'; account: string }

export interface UnreadTransport {
  /** Consulta ahora (al navegar, por ejemplo). */
  refresh: () => void
  stop: () => void
}

/**
 * Transporte del resumen de mensajes sin leer (T-S14-17). Hoy es una consulta frecuente:
 * - cada 10 s con la pestaña visible y cada 60 s oculta;
 * - al instante al volver a la pestaña o a la ventana, y cuando una conversación se marca como leída;
 * - las pestañas abiertas se comparten el resultado por `BroadcastChannel`: una lectura o un resumen nuevo en una
 *   pestaña actualiza las demás sin otra petición por cada una.
 *
 * Es el único punto que sabe cómo llega el resumen. Para producción con WebSockets (p. ej. Laravel Reverb), otro
 * transporte con la misma firma escucharía un evento de difusión en el canal privado de la organización y llamaría a
 * `refresh()`; el proveedor, el menú de mensajes y los avisos no cambian.
 */
export function startUnreadPolling({ side, account, onSummary }: {
  side: LinkageSide
  account: string
  onSummary: (summary: UnreadSummary) => void
}): UnreadTransport {
  const controller = new AbortController()
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null
  let timer = 0
  let period = 0
  let stopped = false

  // Un intervalo con el periodo de la visibilidad actual; solo se reinicia cuando ese periodo cambia.
  const schedule = () => {
    const next = document.hidden ? UNREAD_HIDDEN_INTERVAL_MS : UNREAD_VISIBLE_INTERVAL_MS
    if (stopped || (timer && next === period)) return
    window.clearInterval(timer)
    period = next
    timer = window.setInterval(refresh, period)
  }

  function refresh() {
    if (stopped) return
    getUnreadSummary(side, controller.signal)
      .then((summary) => {
        if (stopped) return
        onSummary(summary)
        channel?.postMessage({ type: 'summary', account, summary } satisfies ChannelMessage)
      })
      .catch(() => { /* El siguiente intento lo corrige; queda el último valor. */ })
  }

  const onVisibility = () => {
    schedule()
    if (!document.hidden) refresh()
  }
  const onRead = () => {
    refresh()
    channel?.postMessage({ type: 'refresh', account } satisfies ChannelMessage)
  }
  const onChannel = (event: MessageEvent<ChannelMessage>) => {
    const message = event.data
    if (message.account !== account) return
    if (message.type === 'summary') onSummary(message.summary)
    else refresh()
  }

  schedule()
  refresh()
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', refresh)
  window.addEventListener(LINKAGE_READ_EVENT, onRead)
  channel?.addEventListener('message', onChannel)

  return {
    refresh,
    stop() {
      stopped = true
      window.clearInterval(timer)
      controller.abort()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refresh)
      window.removeEventListener(LINKAGE_READ_EVENT, onRead)
      channel?.removeEventListener('message', onChannel)
      channel?.close()
    },
  }
}
