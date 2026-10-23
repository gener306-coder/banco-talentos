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

/** Datos que captura la Secretaría (HU-S4-02 CA-02). Los opcionales viajan como `null` si están vacíos. */
export interface CompanyInput {
  legal_name: string
  trade_name: string | null
  rfc: string
  sector_code: SectorCode
  state_code: string
  municipality_code: string
  contact_name: string
  contact_email: string
  contact_phone: string | null
  validation_reference: string | null
}

export interface CompanySummary {
  id: number
  legal_name: string
  trade_name: string | null
  rfc: string
  sector_code: SectorCode
  state_code: string
  municipality_code: string
  municipality: string | null
  is_active: boolean
}

export interface Company extends CompanySummary {
  contact_name: string
  contact_email: string
  contact_phone: string | null
  validation_reference: string | null
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

function summary(data: unknown): CompanySummary {
  if (typeof data !== 'object' || data === null ||
      !('id' in data) || !isPositiveInt(data.id) ||
      !('legal_name' in data) || !isText(data.legal_name) ||
      !('trade_name' in data) || !isOptionalText(data.trade_name) ||
      !('rfc' in data) || !isText(data.rfc) ||
      !('sector_code' in data) || !isSectorCode(data.sector_code) ||
      !('state_code' in data) || !isStateCode(data.state_code) ||
      !('municipality_code' in data) || !isText(data.municipality_code) || !/^\d{5}$/.test(data.municipality_code) ||
      !('municipality' in data) || !isOptionalText(data.municipality) ||
      !('is_active' in data) || typeof data.is_active !== 'boolean') throw new ApiError(502)
  // Solo se conservan los campos del contrato.
  return {
    id: data.id, legal_name: data.legal_name, trade_name: data.trade_name, rfc: data.rfc, sector_code: data.sector_code,
    state_code: data.state_code, municipality_code: data.municipality_code, municipality: data.municipality, is_active: data.is_active,
  }
}

function detail(response: unknown): Company {
  if (typeof response !== 'object' || response === null || !('data' in response)) throw new ApiError(502)
  const data = response.data
  if (typeof data !== 'object' || data === null ||
      !('contact_name' in data) || !isText(data.contact_name) ||
      !('contact_email' in data) || !isText(data.contact_email) ||
      !('contact_phone' in data) || !isOptionalText(data.contact_phone) ||
      !('validation_reference' in data) || !isOptionalText(data.validation_reference) ||
      !('registered_by' in data) || typeof data.registered_by !== 'object' || data.registered_by === null ||
      !('id' in data.registered_by) || !isPositiveInt(data.registered_by.id) ||
      !('name' in data.registered_by) || !isText(data.registered_by.name) ||
      !('created_at' in data) || !isText(data.created_at)) throw new ApiError(502)
  return {
    ...summary(data), contact_name: data.contact_name, contact_email: data.contact_email, contact_phone: data.contact_phone,
    validation_reference: data.validation_reference, registered_by: { id: data.registered_by.id, name: data.registered_by.name },
    created_at: data.created_at,
  }
}

const companyPath = (id: string | number) => `/api/companies/${encodeURIComponent(String(id))}`

const body = (input: CompanyInput) => JSON.stringify({
  legal_name: input.legal_name, trade_name: input.trade_name, rfc: input.rfc, sector_code: input.sector_code,
  state_code: input.state_code, municipality_code: input.municipality_code, contact_name: input.contact_name,
  contact_email: input.contact_email, contact_phone: input.contact_phone, validation_reference: input.validation_reference,
})

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

export async function createCompany(input: CompanyInput): Promise<Company> {
  // CSRF antes de cada escritura; el envío no se repite automáticamente ante fallos de red.
  await request('/sanctum/csrf-cookie')
  return detail(await request('/api/companies', { method: 'POST', body: body(input) }))
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
