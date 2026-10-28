import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'
import { isPeriodType } from '../students/catalogs'
import type { PeriodType } from '../students/catalogs'

export const linkageMessages: FailureMessages = {
  403: 'No tienes permiso para enviar solicitudes de vinculación.',
  404: 'El perfil no existe.',
  429: 'Enviaste demasiadas solicitudes seguidas. Espera un minuto antes de enviar otra.',
}

export const LINKAGE_MESSAGE_LIMIT = 500

export type LinkageStatus = 'PENDIENTE_INSTITUCION' | 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA'

/** Estados en el orden del filtro de la bandeja (HU-S5-05 CA-05). */
export const LINKAGE_STATUSES: readonly { value: LinkageStatus; label: string }[] = [
  { value: 'PENDIENTE_INSTITUCION', label: 'Pendiente de la institución' },
  { value: 'ACEPTADA', label: 'Aceptada' },
  { value: 'RECHAZADA', label: 'Rechazada' },
  { value: 'CANCELADA', label: 'Cancelada' },
]

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
  opportunity: { id: number; title: string }
  profile: { public_id: string; headline: string | null; program: string | null; period_type: PeriodType | null; period_number: number | null }
  institution: { name: string; contact_email: string }
}

export interface LinkageInboxPage {
  items: LinkageInboxItem[]
  page: number
  lastPage: number
  total: number
}

const isOptionalText = (value: unknown): value is string | null => value === null || typeof value === 'string'

function inboxItem(data: unknown): LinkageInboxItem {
  if (!isObject(data) || !isPositiveInt(data.id) || !STATUSES.includes(data.status as LinkageStatus) || typeof data.created_at !== 'string' ||
      !isOptionalText(data.message) || !isObject(data.opportunity) || !isPositiveInt(data.opportunity.id) || typeof data.opportunity.title !== 'string' ||
      !isObject(data.profile) || typeof data.profile.public_id !== 'string' || !isOptionalText(data.profile.headline) ||
      !isOptionalText(data.profile.program) || (data.profile.period_type !== null && !isPeriodType(data.profile.period_type)) ||
      (data.profile.period_number !== null && !isPositiveInt(data.profile.period_number)) ||
      !isObject(data.institution) || typeof data.institution.name !== 'string' || typeof data.institution.contact_email !== 'string') {
    throw new ApiError(502)
  }
  // Solo se conservan los campos del contrato.
  return {
    id: data.id, status: data.status as LinkageStatus, created_at: data.created_at, message: data.message,
    opportunity: { id: data.opportunity.id, title: data.opportunity.title },
    profile: {
      public_id: data.profile.public_id, headline: data.profile.headline, program: data.profile.program,
      period_type: data.profile.period_type as PeriodType | null, period_number: data.profile.period_number as number | null,
    },
    institution: { name: data.institution.name, contact_email: data.institution.contact_email },
  }
}

/** Bandeja de la empresa, de la más reciente a la más antigua; filtros opcionales por estado y perfil (CA-01, CA-04). */
export async function listLinkageRequests(filters: { page?: number; status?: LinkageStatus | ''; publicId?: string }, signal?: AbortSignal): Promise<LinkageInboxPage> {
  const params = new URLSearchParams({ page: String(filters.page ?? 1) })
  if (filters.status) params.set('status', filters.status)
  if (filters.publicId) params.set('public_id', filters.publicId)
  const response = await request(`/api/linkage-requests?${params.toString()}`, { signal })
  if (!isObject(response) || !Array.isArray(response.data) || !isObject(response.meta)) throw new ApiError(502)
  const meta = response.meta
  if (!isPositiveInt(meta.current_page) || !isPositiveInt(meta.last_page) ||
      typeof meta.total !== 'number' || !Number.isSafeInteger(meta.total) || meta.total < 0) throw new ApiError(502)
  return { items: response.data.map(inboxItem), page: meta.current_page, lastPage: meta.last_page, total: meta.total }
}

/** Cancelación de una solicitud pendiente (CA-03). */
export async function cancelLinkageRequest(id: number): Promise<LinkageInboxItem> {
  await request('/sanctum/csrf-cookie')
  const response = await request(`/api/linkage-requests/${id}/cancel`, { method: 'PATCH' })
  if (!isObject(response)) throw new ApiError(502)
  return inboxItem(response.data)
}
