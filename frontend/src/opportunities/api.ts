import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'
import { isPeriodType, isStateCode } from '../students/catalogs'
import type { PeriodType } from '../students/catalogs'
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
  period_type: PeriodType
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
  is_active: boolean
  created_at: string
  /** En el listado, las habilidades principales; en el detalle, todas. */
  skills: OpportunitySkill[]
}

export interface Opportunity extends OpportunitySummary {
  period_type: PeriodType
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
const isMunicipalityCode = (value: unknown): value is string => isText(value) && /^\d{5}$/.test(value)

function skill(value: unknown): OpportunitySkill {
  if (!isObject(value) || !isText(value.name) || !isSkillKind(value.kind)) throw new ApiError(502)
  return { name: value.name, kind: value.kind }
}

function summary(data: unknown): OpportunitySummary {
  if (!isObject(data) || !isPositiveInt(data.id) || !isText(data.title) || !isText(data.program) ||
      !isStateCode(data.state_code) || !isMunicipalityCode(data.municipality_code) || !isOptionalText(data.municipality) ||
      !isPositiveInt(data.vacancies) || typeof data.is_active !== 'boolean' || !isText(data.created_at) ||
      !Array.isArray(data.skills)) throw new ApiError(502)
  // Solo se conservan los campos del contrato.
  return {
    id: data.id, title: data.title, program: data.program, state_code: data.state_code, municipality_code: data.municipality_code,
    municipality: data.municipality, vacancies: data.vacancies, is_active: data.is_active, created_at: data.created_at,
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
  if (!isPeriodType(data.period_type) || !isPositiveInt(data.period_number) || typeof data.can_relocate !== 'boolean' ||
      !isText(data.description) || language === null || !isObject(data.created_by) || !isPositiveInt(data.created_by.id) ||
      !isText(data.created_by.name) || !isText(data.updated_at)) throw new ApiError(502)
  return {
    ...summary(data), period_type: data.period_type, period_number: data.period_number, can_relocate: data.can_relocate,
    description: data.description, ...language, created_by: { id: data.created_by.id, name: data.created_by.name },
    updated_at: data.updated_at,
  }
}

const opportunityPath = (id: string | number) => `/api/opportunities/${encodeURIComponent(String(id))}`

const body = (input: OpportunityInput) => JSON.stringify({
  title: input.title, program: input.program, period_type: input.period_type, period_number: input.period_number,
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

export async function getOpportunityDefaults(signal?: AbortSignal): Promise<OpportunityDefaults> {
  const response = await request('/api/opportunities/defaults', { signal })
  if (!isObject(response) || !isObject(response.data)) throw new ApiError(502)
  const data = response.data
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
