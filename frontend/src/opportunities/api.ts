import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'
import { isStateCode } from '../students/catalogs'
import { isCvLanguage, isLanguageLevel, isSkillKind } from '../students/cvCatalogs'
import type { SkillKind } from '../students/cvCatalogs'

// Mensajes propios del módulo; los demás códigos usan los generales.
export const opportunityMessages: FailureMessages = {
  403: 'No tienes permiso para gestionar oportunidades.',
  404: 'La oportunidad no existe.',
}

/** Límites del contrato (HU-S5-02 CA-03). */
export const OPPORTUNITY_LIMITS = { title: 150, program: 150, description: 1500, vacancies: 50, skills: 15 } as const

export interface OpportunitySkill { name: string; kind: SkillKind }

/** Datos que captura la empresa. Sin empresa, autoría, estado ni coordenadas: los asigna el servidor (CA-02, CA-05). */
export interface OpportunityInput {
  title: string
  program: string
  /** T-S14-10: periodo mínimo como número, sea semestre o cuatrimestre según el plan del alumno. */
  period_number: number
  vacancies: number
  can_relocate: boolean
  state_code: string
  municipality_code: string
  description: string
  skills: OpportunitySkill[]
  /** Idioma y nivel mínimo: ambos o ninguno. */
  language_code: string | null
  min_level: number | null
}

export interface OpportunitySummary {
  id: number
  title: string
  program: string
  state_code: string
  municipality_code: string
  municipality: string | null
  vacancies: number
  /** T-S14-11: lugares cubiertos por solicitudes aceptadas. */
  accepted_count: number
  is_active: boolean
  created_at: string
  /** En el listado, las habilidades principales; en el detalle, todas. */
  skills: OpportunitySkill[]
}

export interface Opportunity extends OpportunitySummary {
  period_number: number
  can_relocate: boolean
  description: string
  language_code: string | null
  min_level: number | null
  created_by: { id: number; name: string }
  updated_at: string
}

export interface OpportunityPage {
  opportunities: OpportunitySummary[]
  page: number
  lastPage: number
  total: number
}

/** Ubicación precargada en el alta: la de la empresa de la sesión (CA-05). */
export interface OpportunityDefaults {
  state_code: string
  municipality_code: string
  municipality: string | null
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string'
const isOptionalText = (value: unknown): value is string | null => value === null || isText(value)
const isPositiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** T-S14-11: la oportunidad ya cubrió todos sus lugares. */
export const isFull = (opportunity: { vacancies: number; accepted_count: number }) => opportunity.accepted_count >= opportunity.vacancies

/** «2 de 5 lugares cubiertos», «1 de 1 lugar cubierto». */
export function placesLabel(opportunity: { vacancies: number; accepted_count: number }): string {
  return `${opportunity.accepted_count} de ${opportunity.vacancies} ${opportunity.vacancies === 1 ? 'lugar cubierto' : 'lugares cubiertos'}`
}
const isMunicipalityCode = (value: unknown): value is string => isText(value) && /^\d{5}$/.test(value)

function skill(value: unknown): OpportunitySkill {
  if (!isObject(value) || !isText(value.name) || !isSkillKind(value.kind)) throw new ApiError(502)
  return { name: value.name, kind: value.kind }
}

function summary(data: unknown): OpportunitySummary {
  if (!isObject(data) || !isPositiveInt(data.id) || !isText(data.title) || !isText(data.program) ||
      !isStateCode(data.state_code) || !isMunicipalityCode(data.municipality_code) || !isOptionalText(data.municipality) ||
      !isPositiveInt(data.vacancies) || !isCount(data.accepted_count) || typeof data.is_active !== 'boolean' || !isText(data.created_at) ||
      !Array.isArray(data.skills)) throw new ApiError(502)
  // Solo se conservan los campos del contrato.
  return {
    id: data.id, title: data.title, program: data.program, state_code: data.state_code, municipality_code: data.municipality_code,
    municipality: data.municipality, vacancies: data.vacancies, accepted_count: data.accepted_count, is_active: data.is_active, created_at: data.created_at,
    skills: data.skills.map(skill),
  }
}

function detail(response: unknown): Opportunity {
  if (!isObject(response) || !isObject(response.data)) throw new ApiError(502)
  const data = response.data
  const language = data.language_code === null && data.min_level === null
    ? { language_code: null, min_level: null }
    : isCvLanguage(data.language_code) && isLanguageLevel(data.min_level)
      ? { language_code: data.language_code, min_level: data.min_level }
      : null
  if (!isPositiveInt(data.period_number) || typeof data.can_relocate !== 'boolean' ||
      !isText(data.description) || language === null || !isObject(data.created_by) || !isPositiveInt(data.created_by.id) ||
      !isText(data.created_by.name) || !isText(data.updated_at)) throw new ApiError(502)
  return {
    ...summary(data), period_number: data.period_number, can_relocate: data.can_relocate,
    description: data.description, ...language, created_by: { id: data.created_by.id, name: data.created_by.name },
    updated_at: data.updated_at,
  }
}

const opportunityPath = (id: string | number) => `/api/opportunities/${encodeURIComponent(String(id))}`

const body = (input: OpportunityInput) => JSON.stringify({
  title: input.title, program: input.program, period_number: input.period_number,
  vacancies: input.vacancies, can_relocate: input.can_relocate, state_code: input.state_code,
  municipality_code: input.municipality_code, description: input.description,
  skills: input.skills.map(({ name, kind }) => ({ name, kind })), language_code: input.language_code, min_level: input.min_level,
})

export async function listOpportunities(page: number, signal?: AbortSignal): Promise<OpportunityPage> {
  const response = await request(`/api/opportunities?page=${page}`, { signal })
  if (!isObject(response) || !Array.isArray(response.data) || !isObject(response.meta)) throw new ApiError(502)
  const meta = response.meta
  if (!isPositiveInt(meta.current_page) || !isPositiveInt(meta.last_page) ||
      typeof meta.total !== 'number' || !Number.isSafeInteger(meta.total) || meta.total < 0) throw new ApiError(502)
  return { opportunities: response.data.map(summary), page: meta.current_page, lastPage: meta.last_page, total: meta.total }
}

export async function getOpportunity(id: string, signal?: AbortSignal): Promise<Opportunity> {
  return detail(await request(opportunityPath(id), { signal }))
}

/** Ubicación de la empresa para precargar el alta; null si la empresa invitada aún no la captura (HU-S14-02). */
export async function getOpportunityDefaults(signal?: AbortSignal): Promise<OpportunityDefaults | null> {
  const response = await request('/api/opportunities/defaults', { signal })
  if (!isObject(response) || !isObject(response.data)) throw new ApiError(502)
  const data = response.data
  if (data.state_code === null && data.municipality_code === null) return null
  if (!isStateCode(data.state_code) || !isMunicipalityCode(data.municipality_code) || !isOptionalText(data.municipality)) throw new ApiError(502)
  return { state_code: data.state_code, municipality_code: data.municipality_code, municipality: data.municipality }
}

export async function createOpportunity(input: OpportunityInput): Promise<Opportunity> {
  // CSRF antes de cada escritura; el envío no se repite automáticamente ante fallos de red.
  await request('/sanctum/csrf-cookie')
  return detail(await request('/api/opportunities', { method: 'POST', body: body(input) }))
}

export async function updateOpportunity(id: string | number, input: OpportunityInput): Promise<Opportunity> {
  await request('/sanctum/csrf-cookie')
  return detail(await request(opportunityPath(id), { method: 'PUT', body: body(input) }))
}

/** Baja lógica (HU-S5-03): no existe borrado. */
export async function setOpportunityStatus(id: string | number, active: boolean): Promise<Opportunity> {
  await request('/sanctum/csrf-cookie')
  return detail(await request(`${opportunityPath(id)}/status`, { method: 'PATCH', body: JSON.stringify({ is_active: active }) }))
}

/** Oportunidad activa que se puede elegir en una solicitud de vinculación (HU-S5-04 CA-06). */
export interface OpportunityOption {
  id: number
  title: string
  program: string
  municipality: string | null
  vacancies: number
  accepted_count: number
}

export async function listOpportunityOptions(signal?: AbortSignal): Promise<OpportunityOption[]> {
  const response = await request('/api/opportunities/options', { signal })
  if (!isObject(response) || !Array.isArray(response.data)) throw new ApiError(502)
  return response.data.map((item: unknown): OpportunityOption => {
    if (!isObject(item) || !isPositiveInt(item.id) || !isText(item.title) || !isText(item.program) || !isOptionalText(item.municipality) ||
        !isPositiveInt(item.vacancies) || !isCount(item.accepted_count)) {
      throw new ApiError(502)
    }
    return { id: item.id, title: item.title, program: item.program, municipality: item.municipality, vacancies: item.vacancies, accepted_count: item.accepted_count }
  })
}
