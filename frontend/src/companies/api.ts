import { createSetupAccount, resendSetupLink, setupAccount } from '../accounts/api'
import type { CreatedSetupAccount, SetupAccount, SetupAccountInput } from '../accounts/api'
import { manualSetupLink, setupDelivery } from '../institutions/api'
import type { DeliveryMethod, SetupDelivery, SetupResult } from '../institutions/api'
import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'
import { isStateCode } from '../students/catalogs'
import { isSectorCode } from './catalogs'
import type { SectorCode } from './catalogs'

// Mensajes propios del módulo; los demás códigos usan los generales.
export const companyMessages: FailureMessages = {
  403: 'No tienes permiso para gestionar empresas.',
  404: 'La empresa no existe.',
}

/**
 * Datos del perfil que la Secretaría puede corregir (HU-S4-02, M4 de HU-S14-02). Desde HU-S14-02 todos son opcionales:
 * la empresa los captura desde su perfil y viajan como `null` si están vacíos.
 */
export interface CompanyInput {
  legal_name: string | null
  trade_name: string | null
  rfc: string | null
  sector_code: SectorCode | null
  state_code: string | null
  municipality_code: string | null
  contact_name: string | null
  contact_position: string | null
  contact_email: string | null
  contact_phone: string | null
  validation_reference: string | null
}

/** HU-S14-02 CA-01: la invitación solo pide el correo de la cuenta; los nombres son de referencia. */
export interface CompanyInvitation {
  email: string
  trade_name: string | null
  person_name: string | null
}

/** Acceso pendiente: ninguna cuenta ha creado su contraseña; incompleto: falta algún dato del perfil. */
export type CompanyProfileStatus = 'pending_access' | 'incomplete' | 'complete'
const PROFILE_STATUSES: readonly CompanyProfileStatus[] = ['pending_access', 'incomplete', 'complete']

/** Claves de lo que falta del perfil, en el orden del servidor. */
export type CompanyProfileGap = 'name' | 'contact_name' | 'contact_position' | 'contact_email' | 'legal_name' | 'rfc' | 'sector_code' | 'location'
const PROFILE_GAPS: readonly CompanyProfileGap[] = ['name', 'contact_name', 'contact_position', 'contact_email', 'legal_name', 'rfc', 'sector_code', 'location']

export interface CompanySummary {
  id: number
  /** Nombre visible (comercial o razón social); null mientras la empresa no capture ninguno. */
  name: string | null
  legal_name: string | null
  trade_name: string | null
  rfc: string | null
  sector_code: SectorCode | null
  state_code: string | null
  municipality_code: string | null
  municipality: string | null
  is_active: boolean
  /** Correo de su primera cuenta: identifica a la invitada sin nombre. */
  account_email: string | null
  profile_status: CompanyProfileStatus
}

export interface Company extends CompanySummary {
  contact_name: string | null
  contact_position: string | null
  contact_email: string | null
  contact_phone: string | null
  validation_reference: string | null
  missing: CompanyProfileGap[]
  registered_by: { id: number; name: string }
  created_at: string
}

export interface CompanyPage {
  companies: CompanySummary[]
  page: number
  lastPage: number
  total: number
}

const isText = (value: unknown): value is string => typeof value === 'string'
const isOptionalText = (value: unknown): value is string | null => value === null || isText(value)
const isPositiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const isOptionalMunicipality = (value: unknown): value is string | null => value === null || (isText(value) && /^\d{5}$/.test(value))

function summary(data: unknown): CompanySummary {
  if (typeof data !== 'object' || data === null ||
      !('id' in data) || !isPositiveInt(data.id) ||
      !('name' in data) || !isOptionalText(data.name) ||
      !('legal_name' in data) || !isOptionalText(data.legal_name) ||
      !('trade_name' in data) || !isOptionalText(data.trade_name) ||
      !('rfc' in data) || !isOptionalText(data.rfc) ||
      !('sector_code' in data) || (data.sector_code !== null && !isSectorCode(data.sector_code)) ||
      !('state_code' in data) || (data.state_code !== null && !isStateCode(data.state_code)) ||
      !('municipality_code' in data) || !isOptionalMunicipality(data.municipality_code) ||
      !('municipality' in data) || !isOptionalText(data.municipality) ||
      !('is_active' in data) || typeof data.is_active !== 'boolean' ||
      !('account_email' in data) || !isOptionalText(data.account_email) ||
      !('profile_status' in data) || !PROFILE_STATUSES.includes(data.profile_status as CompanyProfileStatus)) throw new ApiError(502)
  // Solo se conservan los campos del contrato.
  return {
    id: data.id, name: data.name, legal_name: data.legal_name, trade_name: data.trade_name, rfc: data.rfc, sector_code: data.sector_code as SectorCode | null,
    state_code: data.state_code as string | null, municipality_code: data.municipality_code, municipality: data.municipality, is_active: data.is_active,
    account_email: data.account_email, profile_status: data.profile_status as CompanyProfileStatus,
  }
}

function detail(response: unknown): Company {
  if (typeof response !== 'object' || response === null || !('data' in response)) throw new ApiError(502)
  const data = response.data
  if (typeof data !== 'object' || data === null ||
      !('contact_name' in data) || !isOptionalText(data.contact_name) ||
      !('contact_position' in data) || !isOptionalText(data.contact_position) ||
      !('contact_email' in data) || !isOptionalText(data.contact_email) ||
      !('contact_phone' in data) || !isOptionalText(data.contact_phone) ||
      !('validation_reference' in data) || !isOptionalText(data.validation_reference) ||
      !('missing' in data) || !Array.isArray(data.missing) || !data.missing.every((gap) => PROFILE_GAPS.includes(gap as CompanyProfileGap)) ||
      !('registered_by' in data) || typeof data.registered_by !== 'object' || data.registered_by === null ||
      !('id' in data.registered_by) || !isPositiveInt(data.registered_by.id) ||
      !('name' in data.registered_by) || !isText(data.registered_by.name) ||
      !('created_at' in data) || !isText(data.created_at)) throw new ApiError(502)
  return {
    ...summary(data), contact_name: data.contact_name, contact_position: data.contact_position, contact_email: data.contact_email, contact_phone: data.contact_phone,
    validation_reference: data.validation_reference, missing: data.missing as CompanyProfileGap[],
    registered_by: { id: data.registered_by.id, name: data.registered_by.name }, created_at: data.created_at,
  }
}

const companyPath = (id: string | number) => `/api/companies/${encodeURIComponent(String(id))}`

const fields = (input: CompanyInput): CompanyInput => ({
  legal_name: input.legal_name, trade_name: input.trade_name, rfc: input.rfc, sector_code: input.sector_code,
  state_code: input.state_code, municipality_code: input.municipality_code, contact_name: input.contact_name,
  contact_position: input.contact_position, contact_email: input.contact_email, contact_phone: input.contact_phone, validation_reference: input.validation_reference,
})
const body = (input: CompanyInput) => JSON.stringify(fields(input))

export async function listCompanies(page: number, query: string, signal?: AbortSignal): Promise<CompanyPage> {
  const params = new URLSearchParams({ page: String(page) })
  if (query) params.set('q', query)
  const response = await request(`/api/companies?${params.toString()}`, { signal })
  if (typeof response !== 'object' || response === null || !('data' in response) || !Array.isArray(response.data) ||
      !('meta' in response) || typeof response.meta !== 'object' || response.meta === null) throw new ApiError(502)
  const meta = response.meta
  if (!('current_page' in meta) || !isPositiveInt(meta.current_page) || !('last_page' in meta) || !isPositiveInt(meta.last_page) ||
      !('total' in meta) || typeof meta.total !== 'number' || !Number.isSafeInteger(meta.total) || meta.total < 0) throw new ApiError(502)
  return { companies: response.data.map(summary), page: meta.current_page, lastPage: meta.last_page, total: meta.total }
}

export async function getCompany(id: string, signal?: AbortSignal): Promise<Company> {
  return detail(await request(companyPath(id), { signal }))
}

export interface CreatedCompany {
  company: Company
  setupDelivery: SetupDelivery
  /** Solo con la entrega manual: enlace de un solo uso que la Secretaría comparte con el contacto. */
  setupLink?: string
}

/**
 * Invita a la empresa y crea la cuenta de su operador (HU-S14-02 CA-01). Con correo, el enlace nunca vuelve; con la
 * entrega manual se valida como en «Cuentas de la empresa» y solo vive en la memoria de quien lo pidió.
 */
export async function inviteCompany(input: CompanyInvitation, deliveryMethod: DeliveryMethod = 'email'): Promise<CreatedCompany> {
  // CSRF antes de cada escritura; el envío no se repite automáticamente ante fallos de red.
  await request('/sanctum/csrf-cookie')
  const response = await request('/api/companies', {
    method: 'POST',
    body: JSON.stringify({ email: input.email, trade_name: input.trade_name, person_name: input.person_name, delivery_method: deliveryMethod }),
  })
  const delivery = setupDelivery(response, true)!
  const setupLink = manualSetupLink(response, delivery)
  return { company: detail(response), setupDelivery: delivery, ...(setupLink ? { setupLink } : {}) }
}

export async function updateCompany(id: string | number, input: CompanyInput): Promise<Company> {
  await request('/sanctum/csrf-cookie')
  return detail(await request(companyPath(id), { method: 'PUT', body: body(input) }))
}

/** Baja lógica (CA-07): no existe borrado. */
export async function setCompanyStatus(id: string | number, active: boolean): Promise<Company> {
  await request('/sanctum/csrf-cookie')
  return detail(await request(`${companyPath(id)}/status`, { method: 'PATCH', body: JSON.stringify({ is_active: active }) }))
}

/** Cuentas de acceso de la empresa (HU-S4-03 CA-06). */
export async function listCompanyAccounts(id: string | number, signal?: AbortSignal): Promise<SetupAccount[]> {
  const response = await request(`${companyPath(id)}/accounts`, { signal })
  if (typeof response !== 'object' || response === null || !('data' in response) || !Array.isArray(response.data)) throw new ApiError(502)
  return response.data.map(setupAccount)
}

/** El rol COMPANY y la empresa los asigna el servidor a partir de la ruta (CA-01). */
export function createCompanyAccount(id: string | number, input: SetupAccountInput): Promise<CreatedSetupAccount> {
  return createSetupAccount(`${companyPath(id)}/accounts`, input)
}

export function resendCompanyAccountSetup(id: string | number, input: { email: string; delivery_method: DeliveryMethod }): Promise<SetupResult> {
  return resendSetupLink(`${companyPath(id)}/accounts/resend-setup`, input)
}
