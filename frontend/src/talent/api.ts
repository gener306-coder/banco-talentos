import { isPositiveInt } from '../accounts/api'
import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'
import { isPeriodType, isStateCode, MAX_PERIOD } from '../students/catalogs'
import type { PeriodType } from '../students/catalogs'
import { displayName, isCvLanguage, isLanguageLevel, isSkillKind } from '../students/cvCatalogs'
import type { SkillKind } from '../students/cvCatalogs'

export const talentMessages: FailureMessages = {
  403: 'No tienes permiso para buscar talento.',
  404: 'El perfil no existe.',
}

/** Radios disponibles (HU-S4-05 CA-03). */
export const RADII_KM = [10, 25, 50, 100, 200] as const

export const MAX_SKILL_FILTERS = 10

export const MAX_QUERY_LENGTH = 100

/** Filtros del buscador. Ninguno lleva coordenadas: el origen es siempre un municipio (CA-04). */
export interface TalentFilters {
  /** Texto libre sobre el titular y la carrera (HU-S11-03). */
  q: string
  skills: string[]
  language: string
  minLevel: string
  minPeriod: string
  dualAvailable: boolean
  canRelocate: boolean
  verifiedCertification: boolean
  stateCode: string
  radiusKm: string
  /** '' = municipio de la empresa. */
  originMunicipalityCode: string
}

export const emptyFilters: TalentFilters = {
  q: '', skills: [], language: '', minLevel: '', minPeriod: '', dualAvailable: false, canRelocate: false,
  verifiedCertification: false, stateCode: '', radiusKm: '', originMunicipalityCode: '',
}

export interface TalentCard {
  publicId: string
  headline: string | null
  program: string
  periodType: PeriodType
  periodNumber: number
  institution: string
  stateCode: string
  municipality: string | null
  /** Múltiplo de 5; 0 significa «a menos de 5 km». */
  distanceKm: number
  skills: { name: string; kind: SkillKind }[]
  languages: { languageCode: string; level: number }[]
  verifiedCertifications: number
  dualAvailable: boolean
  canRelocate: boolean
}

export interface TalentProfile extends TalentCard {
  certifications: { name: string; issuer: string; issuedOn: string; expiresOn: string | null; verified: boolean }[]
  projects: { title: string; description: string; role: string | null; year: number | null }[]
}

export interface TalentPage {
  cards: TalentCard[]
  page: number
  lastPage: number
  total: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const isText = (value: unknown): value is string => typeof value === 'string'
const isOptionalText = (value: unknown): value is string | null => value === null || isText(value)
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function card(data: unknown): TalentCard {
  if (!isObject(data) || !isText(data.public_id) || !UUID.test(data.public_id) || !isOptionalText(data.headline) ||
      !isText(data.program) || !isPeriodType(data.period_type) || !isPositiveInt(data.period_number) ||
      !isText(data.institution) || !isStateCode(data.state_code) || !isOptionalText(data.municipality) ||
      typeof data.distance_km !== 'number' || !Number.isSafeInteger(data.distance_km) || data.distance_km < 0 ||
      !Array.isArray(data.skills) || !Array.isArray(data.languages) ||
      typeof data.verified_certifications !== 'number' || typeof data.dual_available !== 'boolean' ||
      typeof data.can_relocate !== 'boolean') throw new ApiError(502)
  // Solo se conservan los campos públicos del contrato (CA-05).
  return {
    publicId: data.public_id, headline: data.headline, program: data.program, periodType: data.period_type,
    periodNumber: data.period_number, institution: data.institution, stateCode: data.state_code, municipality: data.municipality,
    distanceKm: data.distance_km,
    skills: data.skills.map((skill: unknown) => {
      if (!isObject(skill) || !isText(skill.name) || !isSkillKind(skill.kind)) throw new ApiError(502)
      return { name: skill.name, kind: skill.kind }
    }),
    languages: data.languages.map((language: unknown) => {
      if (!isObject(language) || !isCvLanguage(language.language_code) || !isLanguageLevel(language.level)) throw new ApiError(502)
      return { languageCode: language.language_code, level: language.level }
    }),
    verifiedCertifications: data.verified_certifications, dualAvailable: data.dual_available, canRelocate: data.can_relocate,
  }
}

function profile(data: unknown): TalentProfile {
  if (!isObject(data) || !Array.isArray(data.certifications) || !Array.isArray(data.projects)) throw new ApiError(502)
  return {
    ...card(data),
    certifications: data.certifications.map((item: unknown) => {
      if (!isObject(item) || !isText(item.name) || !isText(item.issuer) || !isText(item.issued_on) ||
          !isOptionalText(item.expires_on) || typeof item.verified !== 'boolean') throw new ApiError(502)
      return { name: item.name, issuer: item.issuer, issuedOn: item.issued_on, expiresOn: item.expires_on, verified: item.verified }
    }),
    projects: data.projects.map((item: unknown) => {
      if (!isObject(item) || !isText(item.title) || !isText(item.description) || !isOptionalText(item.role) ||
          (item.year !== null && !isPositiveInt(item.year))) throw new ApiError(502)
      return { title: item.title, description: item.description, role: item.role, year: item.year as number | null }
    }),
  }
}

/** Parámetros de la búsqueda: solo los filtros con valor. */
export function searchParams(filters: TalentFilters, page: number): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q.trim()) params.set('q', filters.q.trim())
  filters.skills.forEach((skill) => params.append('skills[]', skill))
  if (filters.language && filters.minLevel) {
    params.set('language', filters.language)
    params.set('min_level', filters.minLevel)
  }
  if (filters.minPeriod) params.set('min_period', filters.minPeriod)
  if (filters.dualAvailable) params.set('dual_available', '1')
  if (filters.canRelocate) params.set('can_relocate', '1')
  if (filters.verifiedCertification) params.set('verified_certification', '1')
  if (filters.stateCode) params.set('state_code', filters.stateCode)
  if (filters.radiusKm) params.set('radius_km', filters.radiusKm)
  if (filters.originMunicipalityCode) params.set('origin_municipality_code', filters.originMunicipalityCode)
  params.set('page', String(page))
  return params
}

/** Habilidad de un filtro: nombre del catálogo, hasta 80 caracteres (el mismo límite que el campo). */
const MAX_SKILL_LENGTH = 80

/**
 * Inversa de `searchParams` para la URL de /talent (T-S12-07): la URL usa el mismo formato que la API, así que el regreso
 * desde un perfil, una recarga o un enlace compartido reconstruyen la búsqueda. Cada valor se valida contra su catálogo y
 * lo que no se reconoce se descarta (una URL editada a mano nunca llega como filtro inválido).
 */
export function filtersFromParams(params: URLSearchParams): { filters: TalentFilters; page: number } {
  const text = (name: string) => params.get(name) ?? ''
  const number = (name: string) => Number(text(name))
  const seen = new Set<string>()
  const skills = params.getAll('skills[]').map(displayName).filter((skill) => {
    const key = skill.toLocaleLowerCase('es')
    if (!skill || skill.length > MAX_SKILL_LENGTH || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, MAX_SKILL_FILTERS)
  const language = isCvLanguage(text('language')) ? text('language') : ''
  const level = number('min_level')
  const period = number('min_period')
  const radius = number('radius_km')
  const origin = text('origin_municipality_code')
  const page = number('page')
  return {
    filters: {
      q: displayName(text('q')).slice(0, MAX_QUERY_LENGTH),
      skills,
      language,
      minLevel: language && isLanguageLevel(level) ? String(level) : '',
      minPeriod: Number.isInteger(period) && period >= 1 && period <= MAX_PERIOD ? String(period) : '',
      dualAvailable: text('dual_available') === '1',
      canRelocate: text('can_relocate') === '1',
      verifiedCertification: text('verified_certification') === '1',
      stateCode: isStateCode(text('state_code')) ? text('state_code') : '',
      radiusKm: (RADII_KM as readonly number[]).includes(radius) ? String(radius) : '',
      // Clave INEGI de 5 dígitos: los dos primeros son el estado.
      originMunicipalityCode: /^\d{5}$/.test(origin) && isStateCode(origin.slice(0, 2)) ? origin : '',
    },
    page: Number.isSafeInteger(page) && page > 1 ? page : 1,
  }
}

/** URL de la vista: los filtros como en la API y la página solo si no es la primera. */
export function talentViewParams(filters: TalentFilters, page: number): URLSearchParams {
  const params = searchParams(filters, page)
  if (page <= 1) params.delete('page')
  return params
}

export async function searchTalent(filters: TalentFilters, page: number, signal?: AbortSignal): Promise<TalentPage> {
  const response = await request(`/api/talent?${searchParams(filters, page).toString()}`, { signal })
  if (!isObject(response) || !Array.isArray(response.data) || !isObject(response.meta)) throw new ApiError(502)
  const meta = response.meta
  if (!isPositiveInt(meta.current_page) || !isPositiveInt(meta.last_page) ||
      typeof meta.total !== 'number' || !Number.isSafeInteger(meta.total) || meta.total < 0) throw new ApiError(502)
  return { cards: response.data.map(card), page: meta.current_page, lastPage: meta.last_page, total: meta.total }
}

export async function getTalent(publicId: string, signal?: AbortSignal): Promise<TalentProfile> {
  if (!UUID.test(publicId)) throw new ApiError(404)
  const response = await request(`/api/talent/${publicId}`, { signal })
  if (!isObject(response)) throw new ApiError(502)
  return profile(response.data)
}

export function distanceLabel(km: number): string {
  return km === 0 ? 'A menos de 5 km' : `A unos ${km} km`
}
