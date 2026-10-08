import { ApiError, request } from '../lib/http'

export interface InstitutionInput {
  name: string
  cct: string
  contact_email: string
}

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
      !('name' in data) || typeof data.name !== 'string' ||
      !('cct' in data) || typeof data.cct !== 'string' ||
      !('contact_email' in data) || typeof data.contact_email !== 'string' ||
      !('is_active' in data) || typeof data.is_active !== 'boolean' ||
      !('created_at' in data) || typeof data.created_at !== 'string' ||
      !('updated_at' in data) || typeof data.updated_at !== 'string') {
    throw new ApiError(502)
  }

  return {
    id: data.id, name: data.name, cct: data.cct, contact_email: data.contact_email,
    is_active: data.is_active, created_at: data.created_at, updated_at: data.updated_at,
  }
}

function institutionPath(id: string): string {
  return `/api/institutions/${encodeURIComponent(id)}`
}

export async function listInstitutions(signal?: AbortSignal): Promise<Institution[]> {
  const data = responseData(await request('/api/institutions', { signal }))
  if (!Array.isArray(data)) throw new ApiError(502)
  return data.map(institution)
}

export async function getInstitution(id: string, signal?: AbortSignal): Promise<Institution> {
  return institution(responseData(await request(institutionPath(id), { signal })))
}

async function writeInstitution(path: string, method: string, body: InstitutionInput | { is_active: boolean }): Promise<Institution> {
  // Preparar CSRF antes de cada envío permite reintentar manualmente un 419.
  // Las escrituras nunca se repiten automáticamente ante fallos de red.
  await request('/sanctum/csrf-cookie')
  return institution(responseData(await request(path, { method, body: JSON.stringify(body) })))
}

function fields(input: InstitutionInput): InstitutionInput {
  return { name: input.name, cct: input.cct, contact_email: input.contact_email }
}

export function createInstitution(input: InstitutionInput): Promise<Institution> {
  return writeInstitution('/api/institutions', 'POST', fields(input))
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

function setupDelivery(response: unknown, required = false): SetupDelivery | undefined {
  if (typeof response !== 'object' || response === null) throw new ApiError(502)
  const value = 'setup_delivery' in response ? response.setup_delivery : undefined
  if (value === undefined && !required) return undefined
  if (value !== 'sent' && value !== 'pending' && value !== 'manual') throw new ApiError(502)
  return value
}

// Solo la entrega manual (HU-S2-01) conserva el enlace, y únicamente si es un enlace de configuración válido.
// Con correo se descarta siempre cualquier setup_url que llegara en la respuesta.
function manualSetupLink(response: unknown, delivery: SetupDelivery | undefined): string | undefined {
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
