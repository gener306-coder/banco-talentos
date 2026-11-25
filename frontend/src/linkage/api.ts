import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'
import { isPeriodType } from '../students/catalogs'
import type { PeriodType } from '../students/catalogs'
import { inboxParams } from './inboxFilters'
import type { InboxFilters } from './inboxFilters'

export const linkageMessages: FailureMessages = {
  403: 'No tienes permiso para enviar solicitudes de vinculación.',
  404: 'El perfil no existe.',
  429: 'Enviaste demasiadas solicitudes seguidas. Espera un minuto antes de enviar otra.',
}

export const LINKAGE_MESSAGE_LIMIT = 500

/** T-S14-13: BAJA, una aceptada que la institución o la empresa dio de baja; libera el lugar. */
export type LinkageStatus = 'PENDIENTE_INSTITUCION' | 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA' | 'BAJA'

/** Estados en el orden del filtro de la bandeja (HU-S5-05 CA-05). */
export const LINKAGE_STATUSES: readonly { value: LinkageStatus; label: string }[] = [
  { value: 'PENDIENTE_INSTITUCION', label: 'Pendiente de la institución' },
  { value: 'ACEPTADA', label: 'Aceptada' },
  { value: 'RECHAZADA', label: 'Rechazada' },
  { value: 'CANCELADA', label: 'Cancelada' },
  { value: 'BAJA', label: 'Dada de baja' },
]

/** T-S14-13: baja de una vinculación aceptada. `by` solo llega si la registró la organización que consulta. */
export interface LinkageTermination {
  at: string
  party: 'COMPANY' | 'INSTITUTION'
  reason: string
  by: { name: string } | null
}

/** Límite del motivo de la baja (T-S14-13). */
export const TERMINATION_REASON_LIMIT = 500

/** Valida la baja del contrato; null si la solicitud no está dada de baja, undefined si el dato no es válido. */
export function parseTermination(value: unknown): LinkageTermination | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) return undefined
  const data = value as Record<string, unknown>
  if (typeof data.at !== 'string' || (data.party !== 'COMPANY' && data.party !== 'INSTITUTION') || typeof data.reason !== 'string') return undefined
  const by = data.by === null ? null
    : typeof data.by === 'object' && data.by !== null && typeof (data.by as Record<string, unknown>).name === 'string'
      ? { name: (data.by as Record<string, unknown>).name as string } : undefined
  if (by === undefined) return undefined
  return { at: data.at, party: data.party, reason: data.reason, by }
}

export const linkageStatusLabel = (status: LinkageStatus) => LINKAGE_STATUSES.find((item) => item.value === status)?.label ?? status

/** Solicitud tal como la ve la empresa: el alumno solo por su public_id (HU-S5-04 CA-05). */
export interface LinkageRequest {
  id: number
  status: LinkageStatus
  student_public_id: string
  opportunity: { id: number; title: string }
  message: string | null
  created_at: string
}

export interface LinkageInput {
  student_public_id: string
  opportunity_id: number
  message: string | null
}

const STATUSES: readonly LinkageStatus[] = LINKAGE_STATUSES.map((item) => item.value)
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isPositiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

export function linkageRequest(data: unknown): LinkageRequest {
  if (!isObject(data) || !isPositiveInt(data.id) || !STATUSES.includes(data.status as LinkageStatus) ||
      typeof data.student_public_id !== 'string' || !isObject(data.opportunity) || !isPositiveInt(data.opportunity.id) ||
      typeof data.opportunity.title !== 'string' || (data.message !== null && typeof data.message !== 'string') ||
      typeof data.created_at !== 'string') throw new ApiError(502)
  // Solo se conservan los campos del contrato.
  return {
    id: data.id, status: data.status as LinkageStatus, student_public_id: data.student_public_id,
    opportunity: { id: data.opportunity.id, title: data.opportunity.title }, message: data.message, created_at: data.created_at,
  }
}

/** Solicitud directa a la institución del alumno, sin la Secretaría (HU-S5-04 CA-04). */
export async function createLinkageRequest(input: LinkageInput): Promise<LinkageRequest> {
  await request('/sanctum/csrf-cookie')
  const response = await request('/api/linkage-requests', {
    method: 'POST',
    body: JSON.stringify({ student_public_id: input.student_public_id, opportunity_id: input.opportunity_id, message: input.message }),
  })
  if (!isObject(response)) throw new ApiError(502)
  return linkageRequest(response.data)
}

/** Elemento de la bandeja de la empresa (HU-S5-05 CA-02): perfil anónimo y contacto institucional, sin datos protegidos. */
export interface LinkageInboxItem {
  id: number
  status: LinkageStatus
  created_at: string
  message: string | null
  /** T-S15-03: `is_active` en false, la institución no puede aceptar la solicitud (auditoría QA #6). */
  opportunity: { id: number; title: string; is_active: boolean }
  profile: { public_id: string; headline: string | null; program: string | null; period_type: PeriodType | null; period_number: number | null }
  /** El teléfono es opcional (T-S8-11). */
  /** HU-S16-05: el nombre llega con respaldo (label()); el correo del contacto puede faltar mientras la institución lo captura. */
  institution: { name: string; contact_name: string | null; contact_position: string | null; contact_email: string | null; contact_phone: string | null }
  /** Respuesta de la institución (HU-S6-02 CA-04), sin la cuenta que respondió. */
  responded_at: string | null
  response_message: string | null
  /** T-S14-13: la baja, si la hubo. */
  termination: LinkageTermination | null
  /** Mensajes de la institución sin leer (HU-S13-04 CA-02). */
  unread_count: number
  /** Último mensaje del hilo (T-S13-09), para explicar el orden por actividad. */
  last_message_at: string | null
  /** T-S19-05: solo en el detalle; fecha de la ficha compartida vigente, o null. */
  shared_profile_at?: string | null
}

export interface LinkageInboxPage {
  items: LinkageInboxItem[]
  page: number
  lastPage: number
  total: number
}

const isOptionalText = (value: unknown): value is string | null => value === null || typeof value === 'string'

function inboxItem(data: unknown): LinkageInboxItem {
  const termination = isObject(data) ? parseTermination(data.termination) : undefined
  if (termination === undefined || !isObject(data) || !isPositiveInt(data.id) || !STATUSES.includes(data.status as LinkageStatus) || typeof data.created_at !== 'string' ||
      !isOptionalText(data.message) || !isObject(data.opportunity) || !isPositiveInt(data.opportunity.id) || typeof data.opportunity.title !== 'string' ||
      !isObject(data.profile) || typeof data.profile.public_id !== 'string' || !isOptionalText(data.profile.headline) ||
      !isOptionalText(data.profile.program) || (data.profile.period_type !== null && !isPeriodType(data.profile.period_type)) ||
      (data.profile.period_number !== null && !isPositiveInt(data.profile.period_number)) ||
      !isObject(data.institution) || typeof data.institution.name !== 'string' || !isOptionalText(data.institution.contact_email) ||
      !isOptionalText(data.institution.contact_name) || !isOptionalText(data.institution.contact_position) ||
      !isOptionalText(data.institution.contact_phone) ||
      !isOptionalText(data.responded_at) || !isOptionalText(data.response_message) ||
      typeof data.unread_count !== 'number' || !Number.isSafeInteger(data.unread_count) || data.unread_count < 0 ||
      (data.last_message_at !== undefined && !isOptionalText(data.last_message_at))) {
    throw new ApiError(502)
  }
  // Solo se conservan los campos del contrato.
  return {
    id: data.id, status: data.status as LinkageStatus, created_at: data.created_at, message: data.message,
    // Sin el campo (respuestas anteriores), la oportunidad se considera activa.
    opportunity: { id: data.opportunity.id, title: data.opportunity.title, is_active: data.opportunity.is_active !== false },
    profile: {
      public_id: data.profile.public_id, headline: data.profile.headline, program: data.profile.program,
      period_type: data.profile.period_type as PeriodType | null, period_number: data.profile.period_number as number | null,
    },
    institution: {
      name: data.institution.name, contact_name: data.institution.contact_name, contact_position: data.institution.contact_position,
      contact_email: data.institution.contact_email, contact_phone: data.institution.contact_phone,
    },
    responded_at: data.responded_at, response_message: data.response_message, termination, unread_count: data.unread_count,
    last_message_at: (data.last_message_at as string | null | undefined) ?? null,
  }
}

/**
 * Bandeja de la empresa; filtros opcionales por estado y perfil (CA-01, CA-04), búsqueda, interacción y orden
 * (T-S13-09, por actividad reciente si no se indica).
 */
export async function listLinkageRequests(filters: Partial<InboxFilters> & { page?: number; publicId?: string }, signal?: AbortSignal): Promise<LinkageInboxPage> {
  // T-S13-09: búsqueda, interacción y orden; los valores predeterminados no viajan.
  const params = inboxParams(filters, new URLSearchParams({ page: String(filters.page ?? 1) }))
  if (filters.publicId) params.set('public_id', filters.publicId)
  const response = await request(`/api/linkage-requests?${params.toString()}`, { signal })
  if (!isObject(response) || !Array.isArray(response.data) || !isObject(response.meta)) throw new ApiError(502)
  const meta = response.meta
  if (!isPositiveInt(meta.current_page) || !isPositiveInt(meta.last_page) ||
      typeof meta.total !== 'number' || !Number.isSafeInteger(meta.total) || meta.total < 0) throw new ApiError(502)
  return { items: response.data.map(inboxItem), page: meta.current_page, lastPage: meta.last_page, total: meta.total }
}

/** Detalle de la solicitud (HU-S13-02): el mismo 404 para una ajena o inexistente. */
export const linkageDetailMessages: FailureMessages = {
  403: 'No tienes permiso para consultar solicitudes de vinculación.',
  404: 'La solicitud no existe.',
}

/** Detalle de una solicitud de la empresa (HU-S13-02 CA-01): los mismos campos que la bandeja. */
export async function getLinkageRequest(id: string, signal?: AbortSignal): Promise<LinkageInboxItem> {
  const response = await request(`/api/linkage-requests/${encodeURIComponent(id)}`, { signal })
  if (!isObject(response)) throw new ApiError(502)
  const item = inboxItem(response.data)
  const shared = isObject(response.data) ? response.data.shared_profile_at : undefined
  return { ...item, shared_profile_at: typeof shared === 'string' ? shared : null }
}

/** T-S14-13: la empresa da de baja una vinculación aceptada con su motivo; libera el lugar. */
export async function terminateLinkageRequest(id: number, reason: string): Promise<LinkageInboxItem> {
  await request('/sanctum/csrf-cookie')
  const response = await request(`/api/linkage-requests/${id}/termination`, { method: 'PATCH', body: JSON.stringify({ reason }) })
  if (!isObject(response)) throw new ApiError(502)
  return inboxItem(response.data)
}

/** Cancelación de una solicitud pendiente (CA-03). */
export async function cancelLinkageRequest(id: number): Promise<LinkageInboxItem> {
  await request('/sanctum/csrf-cookie')
  const response = await request(`/api/linkage-requests/${id}/cancel`, { method: 'PATCH' })
  if (!isObject(response)) throw new ApiError(502)
  return inboxItem(response.data)
}
