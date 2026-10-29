import { roleLabels } from '../auth/api'
import type { Role } from '../auth/api'
import { LINKAGE_STATUSES } from '../linkage/api'
import type { LinkageStatus } from '../linkage/api'
import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'

export const auditMessages: FailureMessages = {
  403: 'No tienes permiso para consultar la bitácora.',
}

/** Tipos de evento en el orden del filtro (HU-S7-03 CA-02). */
export const AUDIT_EVENT_TYPES = [
  { value: 'account_created', label: 'Cuenta creada' },
  { value: 'company_registered', label: 'Empresa registrada' },
  { value: 'opportunity_created', label: 'Oportunidad registrada' },
  { value: 'linkage_requested', label: 'Vinculación solicitada' },
  { value: 'linkage_responded', label: 'Vinculación respondida' },
] as const

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number]['value']

export const auditEventLabel = (type: AuditEventType) => AUDIT_EVENT_TYPES.find((item) => item.value === type)?.label ?? type

interface Actor { id: number; name: string; role: Role }
interface LinkageResource { id: number; status: LinkageStatus; institution: string; company: string }

/** Evento con solo los campos públicos del contrato (CA-03). */
export type AuditEvent = { occurred_at: string; actor: Actor } & (
  | { type: 'account_created'; resource: { id: number; name: string; email: string; role: Role } }
  | { type: 'company_registered'; resource: { id: number; legal_name: string } }
  | { type: 'opportunity_created'; resource: { id: number; title: string } }
  | { type: 'linkage_requested' | 'linkage_responded'; resource: LinkageResource }
)

export interface AuditEventPage {
  items: AuditEvent[]
  page: number
  lastPage: number
  total: number
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isPositiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const isRole = (value: unknown): value is Role => typeof value === 'string' && value in roleLabels
const isString = (value: unknown): value is string => typeof value === 'string'
const isStatus = (value: unknown): value is LinkageStatus => LINKAGE_STATUSES.some((item) => item.value === value)

function actor(value: unknown): Actor {
  if (!isObject(value) || !isPositiveInt(value.id) || !isString(value.name) || !isRole(value.role)) throw new ApiError(502)
  return { id: value.id, name: value.name, role: value.role }
}

/** Valida cada evento y copia solo los campos de su tipo; cualquier otro dato se descarta. */
function event(value: unknown): AuditEvent {
  if (!isObject(value) || !isString(value.occurred_at) || !isObject(value.resource) || !isPositiveInt(value.resource.id)) throw new ApiError(502)
  const base = { occurred_at: value.occurred_at, actor: actor(value.actor) }
  const resource = value.resource
  const id = resource.id as number

  switch (value.type) {
    case 'account_created':
      if (!isString(resource.name) || !isString(resource.email) || !isRole(resource.role)) break
      return { ...base, type: value.type, resource: { id, name: resource.name, email: resource.email, role: resource.role } }
    case 'company_registered':
      if (!isString(resource.legal_name)) break
      return { ...base, type: value.type, resource: { id, legal_name: resource.legal_name } }
    case 'opportunity_created':
      if (!isString(resource.title)) break
      return { ...base, type: value.type, resource: { id, title: resource.title } }
    case 'linkage_requested':
    case 'linkage_responded':
      if (!isStatus(resource.status) || !isString(resource.institution) || !isString(resource.company)) break
      return { ...base, type: value.type, resource: { id, status: resource.status, institution: resource.institution, company: resource.company } }
  }
  throw new ApiError(502)
}

export async function listAuditEvents(filters: { page?: number; type?: AuditEventType | '' }, signal?: AbortSignal): Promise<AuditEventPage> {
  const params = new URLSearchParams({ page: String(filters.page ?? 1) })
  if (filters.type) params.set('type', filters.type)
  const response = await request(`/api/audit-events?${params.toString()}`, { signal })
  if (!isObject(response) || !Array.isArray(response.data) || !isObject(response.meta)) throw new ApiError(502)
  const meta = response.meta
  if (!isPositiveInt(meta.current_page) || !isPositiveInt(meta.last_page) ||
      typeof meta.total !== 'number' || !Number.isSafeInteger(meta.total) || meta.total < 0) throw new ApiError(502)
  return { items: response.data.map(event), page: meta.current_page, lastPage: meta.last_page, total: meta.total }
}
