import { useEffect } from 'react'
import { LINKAGE_STATUSES } from './api'
import type { LinkageStatus } from './api'
import { dayLabel } from './chatLayout'

/** Filtro de interacción de las bandejas (T-S13-09); reemplaza la casilla «unread» de HU-S13-04. */
export type InboxInteraction = 'all' | 'conversation' | 'unread'
/** Orden de las bandejas (T-S13-09); `activity` es el predeterminado. */
export type InboxSort = 'activity' | 'created_desc' | 'created_asc'

export const INBOX_INTERACTIONS: readonly { value: InboxInteraction; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'conversation', label: 'Con conversación' },
  { value: 'unread', label: 'Con mensajes sin leer' },
]
export const INBOX_SORTS: readonly { value: InboxSort; label: string }[] = [
  { value: 'activity', label: 'Actividad reciente' },
  { value: 'created_desc', label: 'Fecha más reciente' },
  { value: 'created_asc', label: 'Fecha más antigua' },
]

export interface InboxFilters {
  status: LinkageStatus | ''
  q: string
  interaction: InboxInteraction
  sort: InboxSort
}

/** Lo mínimo de `useListParams` que usan las bandejas. */
interface ListParams {
  get: (name: string) => string
  update: (changes: Record<string, string | number | null | undefined>) => void
}

/**
 * Filtros de la bandeja desde la URL (T-S13-09). Un valor desconocido se toma como el predeterminado. Una URL antigua
 * con `?unread=1` (HU-S13-04) se traduce a `interaction=unread`, para que los marcadores guardados sigan sirviendo.
 */
export function useInboxFilters(list: ListParams): InboxFilters {
  const legacyUnread = list.get('unread') === '1'
  const { update } = list
  useEffect(() => { if (legacyUnread) update({ unread: null, interaction: 'unread' }) }, [legacyUnread, update])

  const status = LINKAGE_STATUSES.find((item) => item.value === list.get('status'))?.value ?? ''
  const interaction = legacyUnread ? 'unread' : INBOX_INTERACTIONS.find((item) => item.value === list.get('interaction'))?.value ?? 'all'
  const sort = INBOX_SORTS.find((item) => item.value === list.get('sort'))?.value ?? 'activity'
  return { status, q: list.get('q').trim(), interaction, sort }
}

/** Filtros que difieren de la bandeja completa (sin contar la búsqueda): el número del botón «Filtros (n)». */
export const activeFilterCount = (filters: InboxFilters) =>
  [filters.status !== '', filters.interaction !== 'all', filters.sort !== 'activity'].filter(Boolean).length

/** Si la vista no es la bandeja completa: búsqueda, estado o interacción (el orden no oculta solicitudes). */
export const isFiltered = (filters: InboxFilters) => filters.q !== '' || filters.status !== '' || filters.interaction !== 'all'

/** Parámetros de la API; los predeterminados se omiten. */
export function inboxParams(filters: Partial<InboxFilters>, params = new URLSearchParams()): URLSearchParams {
  if (filters.status) params.set('status', filters.status)
  if (filters.q) params.set('q', filters.q)
  if (filters.interaction && filters.interaction !== 'all') params.set('interaction', filters.interaction)
  if (filters.sort && filters.sort !== 'activity') params.set('sort', filters.sort)
  return params
}

const time = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' })

/** «Último mensaje: hoy, 10:42», «ayer, 18:05» o «12 nov»: explica por qué la fila está arriba (T-S13-09). */
export function lastMessageLabel(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null
  const date = new Date(iso)
  const day = dayLabel(date, now)
  return day === 'Hoy' || day === 'Ayer' ? `Último mensaje: ${day.toLowerCase()}, ${time.format(date)}` : `Último mensaje: ${day}`
}
