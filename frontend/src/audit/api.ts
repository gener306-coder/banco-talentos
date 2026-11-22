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
  // HU-S14-04: cambios de cuentas y organizaciones (account_audit_events).
  { value: 'company_invited', label: 'Empresa invitada' },
  { value: 'institution_invited', label: 'Institución invitada' },
  { value: 'organization_profile_updated', label: 'Perfil de organización actualizado' },
  { value: 'account_updated', label: 'Cuenta actualizada' },
  { value: 'password_changed', label: 'Contraseña cambiada' },
  // Sprint 16: estados de cuentas y acciones de la consola del servidor.
  { value: 'account_status_changed', label: 'Estado de cuenta cambiado' },
  { value: 'admin_bootstrapped', label: 'Primer Administrador creado' },
  { value: 'password_reset_issued', label: 'Restablecimiento de contraseña emitido' },
  { value: 'email_changed', label: 'Correo de acceso cambiado' },
] as const

/** Etiqueta legible de un campo que cambió; uno desconocido no expone su nombre técnico. */
const FIELD_LABELS: Record<string, string> = {
  trade_name: 'Nombre comercial', legal_name: 'Razón social', rfc: 'RFC', sector_code: 'Sector económico',
  state_code: 'Estado', municipality_code: 'Municipio', contact_name: 'Nombre del contacto', contact_position: 'Puesto del contacto',
  contact_email: 'Correo del contacto', contact_phone: 'Teléfono del contacto', validation_reference: 'Folio de validación', cct: 'Clave de Centro de Trabajo',
}

export function fieldLabel(field: string, subject: ChangeSubject): string {
  // `name` es el nombre de la cuenta o el nombre oficial de la institución, según el sujeto.
  if (field === 'name') return subject === 'institution' ? 'Nombre oficial' : 'Nombre'
  return Object.hasOwn(FIELD_LABELS, field) ? FIELD_LABELS[field] : 'Otro dato'
}

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number]['value']

export const auditEventLabel = (type: AuditEventType) => AUDIT_EVENT_TYPES.find((item) => item.value === type)?.label ?? type

/** D3 (Sprint 16): null cuando el evento viene de la consola del servidor. */
type Actor = { id: number; name: string; role: Role } | null
interface LinkageResource { id: number; status: LinkageStatus; institution: string; company: string }
export type ChangeSubject = 'user' | 'company' | 'institution'
/** Eventos de account_audit_events: el sujeto afectado y los campos que cambiaron. */
export type ChangeEventType = 'company_invited' | 'institution_invited' | 'organization_profile_updated' | 'account_updated' | 'password_changed'
  | 'account_status_changed' | 'admin_bootstrapped' | 'password_reset_issued' | 'email_changed'
/** HU-S14-04: la cuenta, empresa o institución afectada y solo los nombres de los campos que cambiaron. */
export interface ChangeResource { subjectType: ChangeSubject; id: number; name: string; role: Role | null; fields: string[] }

/** Evento con solo los campos públicos del contrato (CA-03). */
export type AuditEvent = { occurred_at: string; actor: Actor } & (
  | { type: 'account_created'; resource: { id: number; name: string; email: string; role: Role } }
  | { type: 'company_registered'; resource: { id: number; name: string } }
  | { type: 'opportunity_created'; resource: { id: number; title: string } }
  | { type: 'linkage_requested' | 'linkage_responded'; resource: LinkageResource }
  | { type: ChangeEventType; resource: ChangeResource }
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
  if (value === null) return null
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
      // HU-S14-02: el nombre visible, o «Empresa sin nombre» si la invitada aún no lo captura.
      if (!isString(resource.name)) break
      return { ...base, type: value.type, resource: { id, name: resource.name } }
    case 'opportunity_created':
      if (!isString(resource.title)) break
      return { ...base, type: value.type, resource: { id, title: resource.title } }
    case 'linkage_requested':
    case 'linkage_responded':
      if (!isStatus(resource.status) || !isString(resource.institution) || !isString(resource.company)) break
      return { ...base, type: value.type, resource: { id, status: resource.status, institution: resource.institution, company: resource.company } }
    case 'company_invited':
    case 'institution_invited':
    case 'organization_profile_updated':
    case 'account_updated':
    case 'password_changed':
    case 'account_status_changed':
    case 'admin_bootstrapped':
    case 'password_reset_issued':
    case 'email_changed': {
      const subject = resource.subject_type
      if ((subject !== 'user' && subject !== 'company' && subject !== 'institution') || !isString(resource.name) ||
          (subject === 'user' && !isRole(resource.role)) || !Array.isArray(resource.fields) || !resource.fields.every(isString)) break
      return {
        ...base, type: value.type,
        resource: { subjectType: subject, id, name: resource.name, role: subject === 'user' ? resource.role as Role : null, fields: resource.fields as string[] },
      }
    }
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
