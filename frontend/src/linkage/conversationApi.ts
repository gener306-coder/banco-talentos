import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'

/** Lado de la conversación: la cuenta de la sesión es de la empresa o de la institución (HU-S13-01). */
export type LinkageSide = 'COMPANY' | 'INSTITUTION'

export const LINKAGE_CONVERSATION_LIMIT = 2000

export const conversationMessages: FailureMessages = {
  403: 'No tienes permiso para consultar esta conversación.',
  404: 'La solicitud no existe.',
  429: 'Enviaste demasiados mensajes seguidos. Espera un minuto antes de enviar otro.',
}

/** Mensaje tal como lo entrega la API: del otro lado solo se conoce la organización (`account_name` es null). */
export interface LinkageMessage {
  id: number
  sender_party: LinkageSide
  sender_name: string
  is_own: boolean
  account_name: string | null
  body: string
  created_at: string
}

/** Hilo leído hasta ahora: si el lado puede escribir y su marcador de lectura. */
export interface LinkageThread {
  items: LinkageMessage[]
  canWrite: boolean
  lastReadMessageId: number | null
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isPositiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const isSide = (value: unknown): value is LinkageSide => value === 'COMPANY' || value === 'INSTITUTION'

function linkageMessage(data: unknown): LinkageMessage {
  if (!isObject(data) || !isPositiveInt(data.id) || !isSide(data.sender_party) || typeof data.sender_name !== 'string' ||
      typeof data.is_own !== 'boolean' || (data.account_name !== null && typeof data.account_name !== 'string') ||
      typeof data.body !== 'string' || typeof data.created_at !== 'string') throw new ApiError(502)
  // Solo se conservan los campos del contrato.
  return {
    id: data.id, sender_party: data.sender_party, sender_name: data.sender_name, is_own: data.is_own,
    account_name: data.account_name, body: data.body, created_at: data.created_at,
  }
}

const messagesPath = (side: LinkageSide, linkageRequestId: number) =>
  `${side === 'COMPANY' ? '/api/linkage-requests' : '/api/institution/linkage-requests'}/${linkageRequestId}/messages`

/** Una página del hilo, posterior a `after` (CA-06). */
async function listPage(side: LinkageSide, linkageRequestId: number, after: number, signal?: AbortSignal) {
  const query = after > 0 ? `?after=${after}` : ''
  const response = await request(`${messagesPath(side, linkageRequestId)}${query}`, { signal })
  if (!isObject(response) || !Array.isArray(response.data) || !isObject(response.meta)) throw new ApiError(502)
  const { has_more: hasMore, can_write: canWrite, last_read_message_id: lastRead } = response.meta
  if (typeof hasMore !== 'boolean' || typeof canWrite !== 'boolean' || (lastRead !== null && !isPositiveInt(lastRead))) throw new ApiError(502)
  return { items: response.data.map(linkageMessage), hasMore, canWrite, lastReadMessageId: lastRead }
}

/** Todos los mensajes posteriores a `after`, recorriendo las páginas de 100 (carga inicial y consulta periódica). */
export async function listLinkageMessages(side: LinkageSide, linkageRequestId: number, after = 0, signal?: AbortSignal): Promise<LinkageThread> {
  const items: LinkageMessage[] = []
  let cursor = after
  for (;;) {
    const page = await listPage(side, linkageRequestId, cursor, signal)
    items.push(...page.items)
    cursor = page.items.at(-1)?.id ?? cursor
    if (!page.hasMore || page.items.length === 0) return { items, canWrite: page.canWrite, lastReadMessageId: page.lastReadMessageId }
  }
}

export async function sendLinkageMessage(side: LinkageSide, linkageRequestId: number, body: string): Promise<LinkageMessage> {
  await request('/sanctum/csrf-cookie')
  const response = await request(messagesPath(side, linkageRequestId), { method: 'POST', body: JSON.stringify({ body }) })
  if (!isObject(response)) throw new ApiError(502)
  return linkageMessage(response.data)
}

/** Marcador de lectura del lado de la sesión (CA-08): el servidor nunca lo retrocede. */
export async function markLinkageMessagesRead(side: LinkageSide, linkageRequestId: number, lastReadMessageId: number): Promise<number> {
  await request('/sanctum/csrf-cookie')
  const response = await request(`${messagesPath(side, linkageRequestId)}/read`, {
    method: 'POST', body: JSON.stringify({ last_read_message_id: lastReadMessageId }),
  })
  if (!isObject(response) || !isObject(response.data) || !isPositiveInt(response.data.last_read_message_id)) throw new ApiError(502)
  return response.data.last_read_message_id
}

/**
 * Burbuja de presentación que no es un mensaje del hilo (HU-S13-06 CA-02): el mensaje con el que la empresa abrió la
 * solicitud y la respuesta de la institución. No tiene id, así que nunca entra en el marcador de lectura ni en `after`.
 */
export interface IntroMessage {
  key: 'request-message' | 'response-message'
  label: string
  sender_party: LinkageSide
  sender_name: string
  is_own: boolean
  body: string
  created_at: string
}

/** Campos de la solicitud que abren la conversación, comunes a la vista de la empresa y a la de la institución. */
export interface ConversationOpening {
  message: string | null
  created_at: string
  response_message: string | null
  responded_at: string | null
}

/** Primeras burbujas de la conversación, en orden: el mensaje de la solicitud y la respuesta de la institución. */
export function introMessages(opening: ConversationOpening, role: LinkageSide, names: { company: string; institution: string }): IntroMessage[] {
  const intro: IntroMessage[] = []
  if (opening.message) {
    intro.push({
      key: 'request-message', label: 'Mensaje de la solicitud', sender_party: 'COMPANY', sender_name: names.company,
      is_own: role === 'COMPANY', body: opening.message, created_at: opening.created_at,
    })
  }
  if (opening.response_message && opening.responded_at) {
    intro.push({
      key: 'response-message', label: 'Respuesta a la solicitud', sender_party: 'INSTITUTION', sender_name: names.institution,
      is_own: role === 'INSTITUTION', body: opening.response_message, created_at: opening.responded_at,
    })
  }
  return intro
}

/** Conversaciones de la organización con mensajes sin leer, para el aviso del menú (HU-S13-04 CA-02). */
/** Conversación con novedades del resumen (T-S13-08): lo necesario para nombrarla en un aviso y llevar a ella. */
export interface UnreadConversation {
  id: number
  counterpart_name: string
  opportunity_title: string
  unread_count: number
  last_message_id: number
}

/** Resumen de mensajes sin leer del lado (HU-S13-04 CA-03, T-S13-08). */
export interface UnreadSummary {
  conversations: number
  items: UnreadConversation[]
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isId = (value: unknown): value is number => isCount(value) && value > 0

function unreadConversation(value: unknown): UnreadConversation {
  if (!isObject(value) || !isId(value.id) || typeof value.counterpart_name !== 'string' || typeof value.opportunity_title !== 'string' ||
      !isCount(value.unread_count) || !isId(value.last_message_id)) throw new ApiError(502)
  return {
    id: value.id, counterpart_name: value.counterpart_name, opportunity_title: value.opportunity_title,
    unread_count: value.unread_count, last_message_id: value.last_message_id,
  }
}

export async function getUnreadSummary(side: LinkageSide, signal?: AbortSignal): Promise<UnreadSummary> {
  const prefix = side === 'COMPANY' ? '/api/linkage-requests' : '/api/institution/linkage-requests'
  const response = await request(`${prefix}/unread-summary`, { signal })
  if (!isObject(response) || !isObject(response.data)) throw new ApiError(502)
  const { conversations, items = [] } = response.data
  if (!isCount(conversations) || !Array.isArray(items)) throw new ApiError(502)
  return { conversations, items: items.map(unreadConversation) }
}

/** Ruta de la conversación de una solicitud en el lado de la cuenta. */
export const chatPath = (side: LinkageSide, id: number) =>
  side === 'COMPANY' ? `/linkage-requests/${id}/chat` : `/institution/linkage-requests/${id}/chat`

/** Aviso de que el lado leyó una conversación: el contador del menú se actualiza sin esperar a su siguiente consulta. */
export const LINKAGE_READ_EVENT = 'linkage-conversation-read'

/** Une mensajes nuevos al hilo sin duplicarlos (un envío y la consulta periódica pueden traer el mismo) y en orden. */
export function mergeThread(current: LinkageThread, update: Partial<LinkageThread> & { items: LinkageMessage[] }): LinkageThread {
  const known = new Set(current.items.map((message) => message.id))
  const fresh = update.items.filter((message) => !known.has(message.id))
  const items = fresh.length ? [...current.items, ...fresh].sort((a, b) => a.id - b.id) : current.items
  const lastRead = Math.max(current.lastReadMessageId ?? 0, update.lastReadMessageId ?? 0) || null
  return { items, canWrite: update.canWrite ?? current.canWrite, lastReadMessageId: lastRead }
}
