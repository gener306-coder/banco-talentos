import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'
import { isPeriodType, isStateCode } from '../students/catalogs'
import type { PeriodType } from '../students/catalogs'
import { isCvLanguage, isLanguageLevel, isSkillKind } from '../students/cvCatalogs'
import type { SkillKind } from '../students/cvCatalogs'
import { LINKAGE_STATUSES } from './api'
import type { LinkageStatus } from './api'

export const institutionLinkageMessages: FailureMessages = {
  403: 'No tienes permiso para consultar solicitudes de vinculación.',
  404: 'La solicitud no existe.',
}

/** Identidad interna del alumno (HU-S6-01 CA-04): solo para su institución, nunca para la empresa. */
export interface ReceivedStudent {
  id: number
  enrollment_number: string
  given_names: string
  first_surname: string
  second_surname: string | null
  is_active: boolean
  program: string | null
  period_type: PeriodType | null
  period_number: number | null
}

export interface ReceivedLinkage {
  id: number
  status: LinkageStatus
  created_at: string
  company: { name: string; municipality: string | null }
  opportunity: { id: number; title: string; program: string; vacancies: number }
  student: ReceivedStudent
}

export interface ReceivedLinkagePage {
  items: ReceivedLinkage[]
  page: number
  lastPage: number
  total: number
}

/** Detalle para evaluar la solicitud (CA-05); el seguro facultativo solo como indicador, sin NSS ni comprobante. */
export interface ReceivedLinkageDetail extends ReceivedLinkage {
  message: string | null
  company: ReceivedLinkage['company'] & {
    legal_name: string
    trade_name: string | null
    sector_code: string
    state_code: string
    contact_name: string
    contact_email: string
    contact_phone: string | null
  }
  opportunity: ReceivedLinkage['opportunity'] & {
    period_type: PeriodType
    period_number: number
    can_relocate: boolean
    state_code: string
    municipality: string | null
    description: string
    skills: { name: string; kind: SkillKind }[]
    language_code: string | null
    min_level: number | null
    is_active: boolean
  }
  student: ReceivedStudent & {
    dual_available: boolean | null
    state_code: string | null
    municipality: string | null
    can_relocate: boolean | null
    social_security: { has_nss: boolean; has_document: boolean }
  }
}

const STATUSES: readonly LinkageStatus[] = LINKAGE_STATUSES.map((item) => item.value)
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isPositiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const isText = (value: unknown): value is string => typeof value === 'string'
const isOptionalText = (value: unknown): value is string | null => value === null || typeof value === 'string'
const isOptionalBoolean = (value: unknown): value is boolean | null => value === null || typeof value === 'boolean'
const invalid = (): never => { throw new ApiError(502) }

function student(data: unknown): ReceivedStudent {
  if (!isObject(data) || !isPositiveInt(data.id) || !isText(data.enrollment_number) || !isText(data.given_names) ||
      !isText(data.first_surname) || !isOptionalText(data.second_surname) || typeof data.is_active !== 'boolean' ||
      !isOptionalText(data.program) || (data.period_type !== null && !isPeriodType(data.period_type)) ||
      (data.period_number !== null && !isPositiveInt(data.period_number))) return invalid()
  return {
    id: data.id, enrollment_number: data.enrollment_number, given_names: data.given_names, first_surname: data.first_surname,
    second_surname: data.second_surname, is_active: data.is_active, program: data.program,
    period_type: data.period_type as PeriodType | null, period_number: data.period_number as number | null,
  }
}

function item(data: unknown): ReceivedLinkage {
  if (!isObject(data) || !isPositiveInt(data.id) || !STATUSES.includes(data.status as LinkageStatus) || !isText(data.created_at) ||
      !isObject(data.company) || !isText(data.company.name) || !isOptionalText(data.company.municipality) ||
      !isObject(data.opportunity) || !isPositiveInt(data.opportunity.id) || !isText(data.opportunity.title) ||
      !isText(data.opportunity.program) || !isPositiveInt(data.opportunity.vacancies)) return invalid()
  // Solo se conservan los campos del contrato.
  return {
    id: data.id, status: data.status as LinkageStatus, created_at: data.created_at,
    company: { name: data.company.name, municipality: data.company.municipality },
    opportunity: { id: data.opportunity.id, title: data.opportunity.title, program: data.opportunity.program, vacancies: data.opportunity.vacancies },
    student: student(data.student),
  }
}

function detail(data: unknown): ReceivedLinkageDetail {
  const base = item(data)
  if (!isObject(data) || !isOptionalText(data.message)) return invalid()
  const { company, opportunity, student: person } = data
  if (!isObject(company) || !isText(company.legal_name) || !isOptionalText(company.trade_name) || !isText(company.sector_code) ||
      !isStateCode(company.state_code) || !isText(company.contact_name) || !isText(company.contact_email) || !isOptionalText(company.contact_phone)) return invalid()
  if (!isObject(opportunity) || !isPeriodType(opportunity.period_type) || !isPositiveInt(opportunity.period_number) ||
      typeof opportunity.can_relocate !== 'boolean' || !isStateCode(opportunity.state_code) || !isOptionalText(opportunity.municipality) ||
      !isText(opportunity.description) || !Array.isArray(opportunity.skills) ||
      !opportunity.skills.every((skill) => isObject(skill) && isText(skill.name) && isSkillKind(skill.kind)) ||
      (opportunity.language_code !== null && !isCvLanguage(opportunity.language_code)) ||
      (opportunity.min_level !== null && !isLanguageLevel(opportunity.min_level)) || typeof opportunity.is_active !== 'boolean') return invalid()
  if (!isObject(person) || !isOptionalBoolean(person.dual_available) || (person.state_code !== null && !isStateCode(person.state_code)) ||
      !isOptionalText(person.municipality) || !isOptionalBoolean(person.can_relocate) || !isObject(person.social_security) ||
      typeof person.social_security.has_nss !== 'boolean' || typeof person.social_security.has_document !== 'boolean') return invalid()
  return {
    ...base,
    message: data.message,
    company: {
      ...base.company, legal_name: company.legal_name, trade_name: company.trade_name, sector_code: company.sector_code,
      state_code: company.state_code, contact_name: company.contact_name, contact_email: company.contact_email, contact_phone: company.contact_phone,
    },
    opportunity: {
      ...base.opportunity, period_type: opportunity.period_type, period_number: opportunity.period_number, can_relocate: opportunity.can_relocate,
      state_code: opportunity.state_code, municipality: opportunity.municipality, description: opportunity.description,
      skills: (opportunity.skills as { name: string; kind: SkillKind }[]).map((skill) => ({ name: skill.name, kind: skill.kind })),
      language_code: opportunity.language_code as string | null, min_level: opportunity.min_level as number | null, is_active: opportunity.is_active,
    },
    student: {
      ...base.student, dual_available: person.dual_available, state_code: person.state_code as string | null,
      municipality: person.municipality, can_relocate: person.can_relocate,
      social_security: { has_nss: person.social_security.has_nss, has_document: person.social_security.has_document },
    },
  }
}

/** Bandeja de la institución, de la más reciente a la más antigua, con filtro opcional por estado (HU-S6-01 CA-03). */
export async function listReceivedLinkages(filters: { page?: number; status?: LinkageStatus | '' }, signal?: AbortSignal): Promise<ReceivedLinkagePage> {
  const params = new URLSearchParams({ page: String(filters.page ?? 1) })
  if (filters.status) params.set('status', filters.status)
  const response = await request(`/api/institution/linkage-requests?${params.toString()}`, { signal })
  if (!isObject(response) || !Array.isArray(response.data) || !isObject(response.meta)) throw new ApiError(502)
  const meta = response.meta
  if (!isPositiveInt(meta.current_page) || !isPositiveInt(meta.last_page) ||
      typeof meta.total !== 'number' || !Number.isSafeInteger(meta.total) || meta.total < 0) throw new ApiError(502)
  return { items: response.data.map(item), page: meta.current_page, lastPage: meta.last_page, total: meta.total }
}

export async function getReceivedLinkage(id: string, signal?: AbortSignal): Promise<ReceivedLinkageDetail> {
  const response = await request(`/api/institution/linkage-requests/${encodeURIComponent(id)}`, { signal })
  if (!isObject(response)) throw new ApiError(502)
  return detail(response.data)
}
