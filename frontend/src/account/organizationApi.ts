import { ApiError, csrfToken, request } from '../lib/http'
import { isSectorCode } from '../companies/catalogs'
import type { SectorCode } from '../companies/catalogs'
import type { CompanyGap } from '../auth/api'

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
  /** D2: null mientras no se establezca; después solo la Secretaría lo cambia. */
  sector_code: SectorCode | null
  trade_name: string | null
  state_code: string | null
  municipality_code: string | null
  municipality: string | null
}

export interface InstitutionProfile extends OrganizationContact {
  type: 'institution'
  name: string
  cct: string
}

export type OrganizationProfile = CompanyProfile | InstitutionProfile

/** Lo que le falta al perfil de la empresa, con las mismas claves y orden que `Company::missing()` del servidor. */
export function companyGaps(profile: CompanyProfile): CompanyGap[] {
  const gaps: [CompanyGap, unknown][] = [
    ['name', profile.name], ['contact_name', profile.contact_name], ['contact_position', profile.contact_position],
    ['contact_email', profile.contact_email], ['legal_name', profile.legal_name], ['rfc', profile.rfc],
    ['sector_code', profile.sector_code], ['location', profile.municipality_code],
  ]
  return gaps.filter(([, value]) => value === null).map(([gap]) => gap)
}

export type CompanyProfileInput = OrganizationContact & {
  trade_name: string | null
  state_code: string | null
  municipality_code: string | null
  sector_code?: SectorCode
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string'
const isOptionalText = (value: unknown): value is string | null => value === null || typeof value === 'string'

function profile(data: unknown): OrganizationProfile {
  if (!isObject(data) || !isOptionalText(data.name) || !isOptionalText(data.contact_name) || !isOptionalText(data.contact_position) ||
      !isOptionalText(data.contact_email) || !isOptionalText(data.contact_phone)) throw new ApiError(502)
  const contact = { contact_name: data.contact_name, contact_position: data.contact_position, contact_email: data.contact_email, contact_phone: data.contact_phone }
  if (data.type === 'institution') {
    if (!isText(data.name) || !isText(data.cct)) throw new ApiError(502)
    return { type: 'institution', name: data.name, cct: data.cct, ...contact }
  }
  if (data.type !== 'company' || !isOptionalText(data.legal_name) || !isOptionalText(data.rfc) || !isOptionalText(data.trade_name) ||
      (data.sector_code !== null && !isSectorCode(data.sector_code)) || !isOptionalText(data.state_code) || !isOptionalText(data.municipality_code) ||
      !isOptionalText(data.municipality)) throw new ApiError(502)
  return {
    type: 'company', name: data.name, legal_name: data.legal_name, rfc: data.rfc, sector_code: data.sector_code as SectorCode | null,
    trade_name: data.trade_name, state_code: data.state_code, municipality_code: data.municipality_code, municipality: data.municipality, ...contact,
  }
}

export async function getOrganizationProfile(signal?: AbortSignal): Promise<OrganizationProfile> {
  const response = await request('/api/organization/profile', { signal })
  if (!isObject(response)) throw new ApiError(502)
  return profile(response.data)
}

/** Guarda solo los campos editables del lado de la sesión; el sector viaja únicamente al establecerlo (D2). */
export async function updateOrganizationProfile(input: CompanyProfileInput | OrganizationContact): Promise<OrganizationProfile> {
  if (!csrfToken()) await request('/sanctum/csrf-cookie')
  const response = await request('/api/organization/profile', { method: 'PUT', body: JSON.stringify(input) })
  if (!isObject(response)) throw new ApiError(502)
  return profile(response.data)
}
