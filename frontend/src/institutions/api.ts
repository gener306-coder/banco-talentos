import { ApiError, request } from '../lib/http'

/** Edición de Administración (HU-S16-06): todos los datos son opcionales; un valor vacío se guarda como faltante. */
export interface InstitutionInput {
  name: string | null
  cct: string | null
  contact_name: string | null
  contact_position: string | null
  contact_email: string | null
  contact_phone: string | null
}

/**
 * Invitación (HU-S16-06): solo el correo de la cuenta y, opcionales, un nombre de referencia y el de la persona. El
 * enlace se envía por correo o se genera para compartirlo (HU-S2-01); el perfil lo captura la institución al entrar.
 */
export interface NewInstitutionInput {
  email: string
  name: string | null
  person_name: string | null
  delivery_method: DeliveryMethod
}

export interface CreatedInstitution {
  institution: Institution
  setupDelivery: SetupDelivery
  /** Solo con la entrega manual: enlace de un solo uso que el Administrador comparte con el responsable. */
  setupLink?: string
}

/** HU-S16-05: los datos del perfil llegan en null mientras la institución invitada no los captura. */
export interface Institution extends InstitutionInput {
  id: number
  is_active: boolean
  created_at: string
  updated_at: string
}

function responseData(response: unknown): unknown {
  if (typeof response !== 'object' || response === null || !('data' in response)) {
    throw new ApiError(502)
  }
  return response.data
}

function institution(data: unknown): Institution {
  if (typeof data !== 'object' || data === null ||
      !('id' in data) || typeof data.id !== 'number' || !Number.isSafeInteger(data.id) || data.id <= 0 ||
      !('name' in data) || (data.name !== null && typeof data.name !== 'string') ||
      !('cct' in data) || (data.cct !== null && typeof data.cct !== 'string') ||
      !('contact_name' in data) || (data.contact_name !== null && typeof data.contact_name !== 'string') ||
      !('contact_position' in data) || (data.contact_position !== null && typeof data.contact_position !== 'string') ||
      !('contact_email' in data) || (data.contact_email !== null && typeof data.contact_email !== 'string') ||
      !('contact_phone' in data) || (data.contact_phone !== null && typeof data.contact_phone !== 'string') ||
      !('is_active' in data) || typeof data.is_active !== 'boolean' ||
      !('created_at' in data) || typeof data.created_at !== 'string' ||
      !('updated_at' in data) || typeof data.updated_at !== 'string') {
    throw new ApiError(502)
  }

  return {
    id: data.id, name: data.name as string | null, cct: data.cct as string | null, contact_name: data.contact_name, contact_position: data.contact_position,
    contact_email: data.contact_email as string | null, contact_phone: data.contact_phone,
    is_active: data.is_active, created_at: data.created_at, updated_at: data.updated_at,
  }
}

function institutionPath(id: string): string {
  return `/api/institutions/${encodeURIComponent(id)}`
}

/** HU-S16-05: estado del perfil en el listado, como en las empresas. */
export type InstitutionProfileStatus = 'pending_access' | 'incomplete' | 'complete'

export interface InstitutionSummary extends Institution {
  account_email: string | null
  profile_status: InstitutionProfileStatus
}

export interface InstitutionPage {
  institutions: InstitutionSummary[]
  page: number
  lastPage: number
  total: number
}

const PROFILE_STATUSES: readonly InstitutionProfileStatus[] = ['pending_access', 'incomplete', 'complete']

function summary(data: unknown): InstitutionSummary {
  const base = institution(data)
  const row = data as Record<string, unknown>
  if ((row.account_email !== null && typeof row.account_email !== 'string') ||
      !PROFILE_STATUSES.includes(row.profile_status as InstitutionProfileStatus)) throw new ApiError(502)
  return { ...base, account_email: row.account_email as string | null, profile_status: row.profile_status as InstitutionProfileStatus }
}

const isPositiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

/** HU-S16-05: listado paginado con búsqueda por nombre, CCT o correo de la cuenta. */
export async function listInstitutions(page: number, query: string, signal?: AbortSignal): Promise<InstitutionPage> {
  const params = new URLSearchParams({ page: String(page) })
  if (query) params.set('q', query)
  const response = await request(`/api/institutions?${params.toString()}`, { signal })
  if (typeof response !== 'object' || response === null || !('data' in response) || !Array.isArray(response.data) ||
      !('meta' in response) || typeof response.meta !== 'object' || response.meta === null) throw new ApiError(502)
  const meta = response.meta
  if (!('current_page' in meta) || !isPositiveInt(meta.current_page) || !('last_page' in meta) || !isPositiveInt(meta.last_page) ||
      !('total' in meta) || typeof meta.total !== 'number' || !Number.isSafeInteger(meta.total) || meta.total < 0) throw new ApiError(502)
  return { institutions: response.data.map(summary), page: meta.current_page, lastPage: meta.last_page, total: meta.total }
}

/** Nombre para mostrar en las vistas de Administración: el oficial o el respaldo. */
export const UNNAMED_INSTITUTION = 'Institución sin nombre'

export async function getInstitution(id: string, signal?: AbortSignal): Promise<Institution> {
  return institution(responseData(await request(institutionPath(id), { signal })))
}

async function send(path: string, method: string, body: object): Promise<unknown> {
  // Preparar CSRF antes de cada envío permite reintentar manualmente un 419.
  // Las escrituras nunca se repiten automáticamente ante fallos de red.
  await request('/sanctum/csrf-cookie')
  return request(path, { method, body: JSON.stringify(body) })
}

async function writeInstitution(path: string, method: string, body: InstitutionInput | { is_active: boolean }): Promise<Institution> {
  return institution(responseData(await send(path, method, body)))
}

function fields(input: InstitutionInput): InstitutionInput {
  return {
    name: input.name || null, cct: input.cct || null, contact_name: input.contact_name || null, contact_position: input.contact_position || null,
    contact_email: input.contact_email || null, contact_phone: input.contact_phone || null,
  }
}

/**
 * Invita a la institución y crea la cuenta de su persona (HU-S16-06). Con correo, el enlace nunca vuelve; con la entrega
 * manual se valida como en «Nueva cuenta institucional» y solo vive en la memoria de quien lo pidió.
 */
export async function createInstitution(input: NewInstitutionInput): Promise<CreatedInstitution> {
  const response = await send('/api/institutions', 'POST', {
    email: input.email, name: input.name || null, person_name: input.person_name || null, delivery_method: input.delivery_method,
  })
  const delivery = setupDelivery(response, true)!
  const setupLink = manualSetupLink(response, delivery)
  return { institution: institution(responseData(response)), setupDelivery: delivery, ...(setupLink ? { setupLink } : {}) }
}

export function updateInstitution(id: string, input: InstitutionInput): Promise<Institution> {
  return writeInstitution(institutionPath(id), 'PUT', fields(input))
}

export function setInstitutionStatus(id: string, isActive: boolean): Promise<Institution> {
  return writeInstitution(`${institutionPath(id)}/status`, 'PATCH', { is_active: isActive })
}

export type DeliveryMethod = 'email' | 'manual'

export interface InstitutionAccountInput {
  name: string
  email: string
  institution_id: number
  delivery_method?: DeliveryMethod
}

export type SetupDelivery = 'sent' | 'pending' | 'manual'

export function setupDelivery(response: unknown, required = false): SetupDelivery | undefined {
  if (typeof response !== 'object' || response === null) throw new ApiError(502)
  const value = 'setup_delivery' in response ? response.setup_delivery : undefined
  if (value === undefined && !required) return undefined
  if (value !== 'sent' && value !== 'pending' && value !== 'manual') throw new ApiError(502)
  return value
}

// Solo la entrega manual (HU-S2-01) conserva el enlace, y únicamente si es un enlace de configuración válido.
// Con correo se descarta siempre cualquier setup_url que llegara en la respuesta.
export function manualSetupLink(response: unknown, delivery: SetupDelivery | undefined): string | undefined {
  if (delivery !== 'manual') return undefined
  const value = typeof response === 'object' && response !== null && 'setup_url' in response ? response.setup_url : undefined
  if (typeof value !== 'string') throw new ApiError(502)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ApiError(502)
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/set-initial-password' ||
      !url.searchParams.get('email') || !url.searchParams.get('token')) throw new ApiError(502)
  return url.toString()
}

export interface SetupResult {
  delivery: SetupDelivery
  setupLink?: string
}

export interface InstitutionAccount {
  id: number
  name: string
  email: string
  role: 'INSTITUTION'
  is_active: boolean
  institution: { id: number; name: string }
  setup_delivery?: SetupDelivery
  setup_link?: string
}

export async function createInstitutionAccount(input: InstitutionAccountInput): Promise<InstitutionAccount> {
  await request('/sanctum/csrf-cookie')
  const response = await request('/api/institution-accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name, email: input.email, institution_id: input.institution_id,
      ...(input.delivery_method ? { delivery_method: input.delivery_method } : {}),
    }),
  })
  const data = responseData(response)
  const delivery = setupDelivery(response)
  const setupLink = manualSetupLink(response, delivery)
  if (typeof data !== 'object' || data === null ||
      !('id' in data) || typeof data.id !== 'number' || !Number.isSafeInteger(data.id) || data.id <= 0 ||
      !('name' in data) || typeof data.name !== 'string' ||
      !('email' in data) || typeof data.email !== 'string' ||
      !('role' in data) || data.role !== 'INSTITUTION' ||
      !('is_active' in data) || typeof data.is_active !== 'boolean' ||
      !('institution' in data) || typeof data.institution !== 'object' || data.institution === null ||
      !('id' in data.institution) || typeof data.institution.id !== 'number' ||
      data.institution.id !== input.institution_id ||
      !('name' in data.institution) || typeof data.institution.name !== 'string') throw new ApiError(502)

  // Con correo el enlace nunca se conserva; el manual se devuelve para que el ADMIN lo comparta.
  return {
    id: data.id, name: data.name, email: data.email, role: data.role, is_active: data.is_active,
    institution: { id: data.institution.id, name: data.institution.name },
    ...(delivery ? { setup_delivery: delivery } : {}),
    ...(setupLink ? { setup_link: setupLink } : {}),
  }
}

export async function resendInstitutionAccountSetup(input: {
  email: string; institution_id: number; delivery_method?: DeliveryMethod
}): Promise<SetupResult> {
  await request('/sanctum/csrf-cookie')
  const response = await request('/api/institution-accounts/resend-setup', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email, institution_id: input.institution_id,
      ...(input.delivery_method ? { delivery_method: input.delivery_method } : {}),
    }),
  })
  const delivery = setupDelivery(response, true) as SetupDelivery
  const setupLink = manualSetupLink(response, delivery)
  return setupLink ? { delivery, setupLink } : { delivery }
}

export type ResetDelivery = 'sent' | 'pending'

export async function startInstitutionPasswordReset(input: { email: string; institution_id: number }): Promise<ResetDelivery> {
  await request('/sanctum/csrf-cookie')
  // Solo identifica la cuenta: el ADMIN nunca envía ni recibe contraseñas, tokens o enlaces.
  const response = await request('/api/institution-accounts/password-reset/start', {
    method: 'POST', body: JSON.stringify({ email: input.email, institution_id: input.institution_id }),
  })
  const value = typeof response === 'object' && response !== null && 'reset_delivery' in response
    ? response.reset_delivery : undefined
  if (value !== 'sent' && value !== 'pending') throw new ApiError(502)
  return value
}
