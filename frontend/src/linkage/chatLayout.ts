/**
 * Agrupación del hilo para presentarlo como una app de mensajería (T-S13-07): por día, con separadores, y en grupos de
 * burbujas consecutivas del mismo remitente con menos de 5 minutos entre una y otra (estilo Meta).
 */

/** Burbuja ya resuelta para pintar: mensaje del hilo o burbuja de la solicitud. */
export interface Bubble {
  key: string
  own: boolean
  name: string
  createdAt: string
  body: string
  /** Solo las burbujas de la solicitud (HU-S13-06): «Mensaje de la solicitud» o «Respuesta a la solicitud». */
  label?: string
}

/** Posición dentro de su grupo: define las esquinas y si se muestra el remitente. */
export type GroupPosition = 'single' | 'first' | 'middle' | 'last'

export interface PlacedBubble extends Bubble {
  position: GroupPosition
}

export interface DayGroup {
  key: string
  label: string
  bubbles: PlacedBubble[]
}

/** Palabras que no aportan a las iniciales de una organización («UT del Golfo» → «UG»). */
const MINOR_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'para', 'sa', 'cv', 's.a.', 'c.v.'])

/** Iniciales para el avatar de una organización: las dos primeras palabras significativas, en mayúsculas. */
export function initials(name: string): string {
  const words = name.split(/[\s,]+/).filter((word) => word && !MINOR_WORDS.has(word.toLowerCase()))
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? '').join('')
  return (letters || Array.from(name.trim())[0] || '?').toLocaleUpperCase('es-MX')
}

/** Mensajes del mismo remitente con menos de este lapso entre sí forman un grupo. */
export const GROUP_WINDOW_MS = 5 * 60 * 1000

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
const dayFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })
const dayWithYearFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

/** «Hoy», «Ayer», «12 nov» o, de otro año, «12 nov 2025». */
export function dayLabel(date: Date, now: Date = new Date()): string {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (dayKey(date) === dayKey(now)) return 'Hoy'
  if (dayKey(date) === dayKey(yesterday)) return 'Ayer'
  return (date.getFullYear() === now.getFullYear() ? dayFormat : dayWithYearFormat).format(date).replace('.', '')
}

/**
 * Agrupa por día y, dentro de cada día, por remitente y cercanía. Las burbujas de la solicitud nunca se agrupan con
 * los mensajes del hilo: son el contexto inicial y conservan su etiqueta.
 */
export function layoutThread(bubbles: Bubble[], now: Date = new Date()): DayGroup[] {
  const days: DayGroup[] = []
  let previous: Bubble | null = null
  let run: PlacedBubble[] = []

  const closeRun = () => {
    if (run.length === 1) run[0].position = 'single'
    else run.forEach((bubble, index) => { bubble.position = index === 0 ? 'first' : index === run.length - 1 ? 'last' : 'middle' })
    run = []
  }

  for (const bubble of bubbles) {
    const date = new Date(bubble.createdAt)
    const key = dayKey(date)
    let day = days.at(-1)
    if (!day || day.key !== key) {
      closeRun()
      day = { key, label: dayLabel(date, now), bubbles: [] }
      days.push(day)
      previous = null
    }
    const joins = previous !== null && !previous.label && !bubble.label && previous.own === bubble.own && previous.name === bubble.name
      && date.getTime() - new Date(previous.createdAt).getTime() < GROUP_WINDOW_MS
    if (!joins) closeRun()
    const placed: PlacedBubble = { ...bubble, position: 'single' }
    run.push(placed)
    day.bubbles.push(placed)
    previous = bubble
  }
  closeRun()
  return days
}
