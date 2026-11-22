import { ApiError, csrfToken, request } from '../lib/http'
import { isSectorCode } from '../companies/catalogs'
import type { SectorCode } from '../companies/catalogs'
import { isCompanyGap, isInstitutionGap } from '../auth/api'
import type { CompanyGap, InstitutionGap } from '../auth/api'

/** Contacto del programa dual: editable por la empresa y por la institución (HU-S14-02). */
export interface OrganizationContact {
  contact_name: string | null
  contact_position: string | null
  contact_email: string | null
  contact_phone: string | null
}

export interface CompanyProfile extends OrganizationContact {
  type: 'company'
  /** Nombre visible: el comercial o, sin él, la razón social; null si la empresa invitada no captura ninguno (HU-S14-02). */
  name: string | null
  legal_name: string | null
  rfc: string | null
  /** HU-S14-03: la empresa lo captura y corrige cuando quiera. */
  sector_code: SectorCode | null
  trade_name: string | null
  state_code: string | null
  municipality_code: string | null
  municipality: string | null
  /** Lo que falta del perfil (sin valores), en el orden del servidor. */
  missing: CompanyGap[]
}

export interface InstitutionProfile extends OrganizationContact {
  type: 'institution'
  /** HU-S16-05: null mientras la institución invitada no los captura. */
  name: string | null
  cct: string | null
  /** HU-S16-07: lo que falta de los 4 datos mínimos (D6), en el orden del servidor. */
  missing: InstitutionGap[]
}

export type OrganizationProfile = CompanyProfile | InstitutionProfile

/** HU-S14-03: todo el perfil de la empresa es opcional; `account_name` corrige además el nombre de la cuenta. */
export type CompanyProfileInput = OrganizationContact & {
  trade_name: string | null
  legal_name: string | null
  rfc: string | null
  sector_code: SectorCode | null
  state_code: string | null
  municipality_code: string | null
  account_name?: string | null
}

/**
 * T-S14-15: la institución corrige su nombre oficial, su CCT y su contacto; `account_name` con «Soy yo». Desde HU-S16-07
 * todo es opcional (guardado parcial).
 */
export type InstitutionProfileInput = OrganizationContact & {
  name: string | null
  cct: string | null
  account_name?: string | null
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isOptionalText = (value: unknown): value is string | null => value === null || typeof value === 'string'

function profile(data: unknown): OrganizationProfile {
  if (!isObject(data) || !isOptionalText(data.name) || !isOptionalText(data.contact_name) || !isOptionalText(data.contact_position) ||
      !isOptionalText(data.contact_email) || !isOptionalText(data.contact_phone)) throw new ApiError(502)
  const contact = { contact_name: data.contact_name, contact_position: data.contact_position, contact_email: data.contact_email, contact_phone: data.contact_phone }
  if (data.type === 'institution') {
    if (!isOptionalText(data.name) || !isOptionalText(data.cct) || !Array.isArray(data.missing) || !data.missing.every(isInstitutionGap)) throw new ApiError(502)
    return { type: 'institution', name: data.name, cct: data.cct, ...contact, missing: data.missing as InstitutionGap[] }
  }
  if (data.type !== 'company' || !isOptionalText(data.legal_name) || !isOptionalText(data.rfc) || !isOptionalText(data.trade_name) ||
      (data.sector_code !== null && !isSectorCode(data.sector_code)) || !isOptionalText(data.state_code) || !isOptionalText(data.municipality_code) ||
      !isOptionalText(data.municipality) || !Array.isArray(data.missing) || !data.missing.every(isCompanyGap)) throw new ApiError(502)
  return {
    type: 'company', name: data.name, legal_name: data.legal_name, rfc: data.rfc, sector_code: data.sector_code as SectorCode | null,
    trade_name: data.trade_name, state_code: data.state_code, municipality_code: data.municipality_code, municipality: data.municipality, ...contact,
    missing: data.missing as CompanyGap[],
  }
}

export async function getOrganizationProfile(signal?: AbortSignal): Promise<OrganizationProfile> {
  const response = await request('/api/organization/profile', { signal })
  if (!isObject(response)) throw new ApiError(502)
  return profile(response.data)
}

/** Guarda solo los campos editables del lado de la sesión. */
export async function updateOrganizationProfile(input: CompanyProfileInput | InstitutionProfileInput | OrganizationContact): Promise<OrganizationProfile> {
  if (!csrfToken()) await request('/sanctum/csrf-cookie')
  const response = await request('/api/organization/profile', { method: 'PUT', body: JSON.stringify(input) })
  if (!isObject(response)) throw new ApiError(502)
  return profile(response.data)
}

/** HU-S14-03 CA-02: «Completar más tarde» termina el onboarding sin guardar datos. */
export async function postponeOnboarding(): Promise<void> {
  if (!csrfToken()) await request('/sanctum/csrf-cookie')
  await request('/api/organization/profile/postpone', { method: 'POST' })
}
