import { useCallback, useEffect, useRef, useState } from 'react'
import { useUnreadSummarySubscription } from './unreadSummaryContext'

/**
 * T-S13-10: la bandeja se entera de los mensajes nuevos sin recargar la página. Escucha la consulta única del resumen
 * (la misma que alimenta el contador del menú y los avisos del navegador) y, cuando cambian las conversaciones con
 * novedades o sus últimos mensajes, llama a `onChange` para que la tabla se vuelva a pedir en silencio. Así la fila,
 * su contador y el orden por actividad se actualizan a la vez que llega el aviso. La primera respuesta es la línea base.
 */
export function useLiveInbox(onChange: () => void) {
  const state = useUnreadSummarySubscription()
  const summary = state?.summary
  const signature = summary
    ? `${summary.conversations}|${summary.items.map((item) => `${item.id}:${item.last_message_id}:${item.unread_count}`).join(',')}`
    : null
  const latest = useRef(onChange)
  useEffect(() => { latest.current = onChange }, [onChange])
  const previous = useRef<string | null>(null)

  useEffect(() => {
    if (signature === null) return
    const before = previous.current
    previous.current = signature
    if (before !== null && before !== signature) latest.current()
  }, [signature])
}

interface LiveRow { id: number; unread_count: number }

/** Filas que ya estaban y cuyos mensajes sin leer aumentaron (T-S13-13); las nuevas ya entran con su animación. */
export function raisedRows(before: readonly LiveRow[], after: readonly LiveRow[]): ReadonlySet<number> {
  const previous = new Map(before.map((row) => [row.id, row.unread_count]))
  return new Set(after.filter((row) => (previous.get(row.id) ?? Infinity) < row.unread_count).map((row) => row.id))
}

const RAISED_MS = 1600

/**
 * Bandeja en vivo con señal (T-S13-13): recarga la página en silencio cuando llegan mensajes (useLiveInbox) y devuelve
 * las filas cuyo contador subió, para marcarlas con un pulso breve (`row-updated`) que se apaga solo.
 */
export function useLiveRows<T extends LiveRow, P extends { items: T[] }>(items: readonly T[] | undefined, fetch: () => Promise<P>, apply: (next: P) => void) {
  const current = useRef<readonly T[]>([])
  useEffect(() => { current.current = items ?? [] }, [items])
  const [raised, setRaised] = useState<ReadonlySet<number>>(() => new Set())
  useLiveInbox(useCallback(() => {
    fetch().then((next) => {
      setRaised(raisedRows(current.current, next.items))
      apply(next)
    }).catch(() => { /* El siguiente cambio lo reintenta. */ })
  }, [fetch, apply]))
  useEffect(() => {
    if (raised.size === 0) return
    const timer = window.setTimeout(() => setRaised(new Set()), RAISED_MS)
    return () => window.clearTimeout(timer)
  }, [raised])
  return raised
}
