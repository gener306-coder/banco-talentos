import { ApiError, request } from '../lib/http'
import { isPeriodType, isStateCode, MAX_PERIOD } from './catalogs'
import type { PeriodType } from './catalogs'

/** Identidad interna del alumno: uso exclusivo de la institución (HU-S2-02 CA-05). */
export interface StudentInput {
  enrollment_number: string
  given_names: string
  first_surname: string
  second_surname: string | null
}

export interface Student extends StudentInput {
  id: number
  /** Baja lógica (HU-S2-04): un alumno inactivo no aparece en el Banco de Talentos. */
  is_active: boolean
  created_at: string
}

/** Expediente público (HU-S2-03). El municipio es una clave del catálogo INEGI (HU-S4-04). */
export interface StudentProfileInput {
  program: string
  period_type: PeriodType
  period_number: number
  dual_available: boolean
  state_code: string
  municipality_code: string
  can_relocate: boolean
}

/**
 * Cada campo es `null` mientras no se haya capturado. `municipality` es el nombre del municipio guardado;
 * `pending_municipality`, el texto libre anterior al catálogo que la institución aún debe confirmar.
 */
export type StudentProfile = { [K in keyof StudentProfileInput]: StudentProfileInput[K] | null } & {
  municipality: string | null
  pending_municipality: string | null
}

export interface StudentDetail extends Student {
  profile: StudentProfile
}

export interface StudentPage {
  students: Student[]
  page: number
  lastPage: number
  total: number
}

const isText = (value: unknown): value is string => typeof value === 'string'
const isPositiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

function student(data: unknown): Student {
  if (typeof data !== 'object' || data === null ||
      !('id' in data) || !isPositiveInt(data.id) ||
      !('enrollment_number' in data) || !isText(data.enrollment_number) ||
      !('given_names' in data) || !isText(data.given_names) ||
      !('first_surname' in data) || !isText(data.first_surname) ||
      !('second_surname' in data) || (data.second_surname !== null && !isText(data.second_surname)) ||
      !('is_active' in data) || typeof data.is_active !== 'boolean' ||
      !('created_at' in data) || !isText(data.created_at)) {
    throw new ApiError(502)
  }
  // Solo se conservan los campos del contrato.
  return {
    id: data.id, enrollment_number: data.enrollment_number, given_names: data.given_names,
    first_surname: data.first_surname, second_surname: data.second_surname, is_active: data.is_active,
    created_at: data.created_at,
  }
}

const nullable = <T>(check: (value: unknown) => value is T) => (value: unknown): value is T | null => value === null || check(value)
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isPeriodNumber = (value: unknown): value is number => isPositiveInt(value) && value <= MAX_PERIOD
const isMunicipalityCode = (value: unknown): value is string => typeof value === 'string' && /^\d{5}$/.test(value)

function profile(data: unknown): StudentProfile {
  if (typeof data !== 'object' || data === null ||
      !('program' in data) || !nullable(isText)(data.program) ||
      !('period_type' in data) || !nullable(isPeriodType)(data.period_type) ||
      !('period_number' in data) || !nullable(isPeriodNumber)(data.period_number) ||
      !('dual_available' in data) || !nullable(isBoolean)(data.dual_available) ||
      !('state_code' in data) || !nullable(isStateCode)(data.state_code) ||
      !('municipality_code' in data) || !nullable(isMunicipalityCode)(data.municipality_code) ||
      !('municipality' in data) || !nullable(isText)(data.municipality) ||
      !('pending_municipality' in data) || !nullable(isText)(data.pending_municipality) ||
      !('can_relocate' in data) || !nullable(isBoolean)(data.can_relocate)) {
    throw new ApiError(502)
  }
  return {
    program: data.program, period_type: data.period_type, period_number: data.period_number,
    dual_available: data.dual_available, state_code: data.state_code, municipality_code: data.municipality_code,
    municipality: data.municipality, pending_municipality: data.pending_municipality, can_relocate: data.can_relocate,
  }
}

function detail(response: unknown): StudentDetail {
  if (typeof response !== 'object' || response === null || !('data' in response) ||
      typeof response.data !== 'object' || response.data === null || !('profile' in response.data)) throw new ApiError(502)
  return { ...student(response.data), profile: profile(response.data.profile) }
}

const studentPath = (id: string | number) => `/api/students/${encodeURIComponent(String(id))}`

/** Filtro de estado del padrón (HU-S8-01 CA-01). */
export type StudentStatusFilter = 'active' | 'inactive'

export interface StudentFilters {
  page?: number
  /** Matrícula, nombres o apellidos; cada palabra debe coincidir. */
  q?: string
  status?: StudentStatusFilter | ''
}

/** Página del padrón con la búsqueda y el filtro de estado opcionales (HU-S8-01). */
export async function listStudents(filters: StudentFilters = {}, signal?: AbortSignal): Promise<StudentPage> {
  const params = new URLSearchParams({ page: String(filters.page ?? 1) })
  const q = filters.q?.trim()
  if (q) params.set('q', q)
  if (filters.status) params.set('status', filters.status)
  const response = await request(`/api/students?${params.toString()}`, { signal })
  if (typeof response !== 'object' || response === null || !('data' in response) || !Array.isArray(response.data) ||
      !('meta' in response) || typeof response.meta !== 'object' || response.meta === null) throw new ApiError(502)
  const meta = response.meta
  if (!('current_page' in meta) || !isPositiveInt(meta.current_page) || !('last_page' in meta) || !isPositiveInt(meta.last_page) ||
      !('total' in meta) || typeof meta.total !== 'number' || !Number.isSafeInteger(meta.total) || meta.total < 0) throw new ApiError(502)
  return { students: response.data.map(student), page: meta.current_page, lastPage: meta.last_page, total: meta.total }
}

export async function createStudent(input: StudentInput): Promise<Student> {
  // CSRF antes de cada escritura; el envío no se repite automáticamente ante fallos de red.
  await request('/sanctum/csrf-cookie')
  const response = await request('/api/students', {
    method: 'POST',
    body: JSON.stringify({
      enrollment_number: input.enrollment_number, given_names: input.given_names,
      first_surname: input.first_surname, second_surname: input.second_surname,
    }),
  })
  if (typeof response !== 'object' || response === null || !('data' in response)) throw new ApiError(502)
  return student(response.data)
}

export async function getStudent(id: string, signal?: AbortSignal): Promise<StudentDetail> {
  return detail(await request(studentPath(id), { signal }))
}

export async function updateStudentProfile(id: number, input: StudentProfileInput): Promise<StudentDetail> {
  await request('/sanctum/csrf-cookie')
  return detail(await request(`${studentPath(id)}/profile`, {
    method: 'PUT',
    body: JSON.stringify({
      program: input.program, period_type: input.period_type, period_number: input.period_number,
      dual_available: input.dual_available, state_code: input.state_code, municipality_code: input.municipality_code,
      can_relocate: input.can_relocate,
    }),
  }))
}

/** Corrige la matrícula y el nombre (HU-S2-03 CA-07). */
export async function updateStudentIdentity(id: number, input: StudentInput): Promise<StudentDetail> {
  await request('/sanctum/csrf-cookie')
  return detail(await request(`${studentPath(id)}/identity`, {
    method: 'PUT',
    body: JSON.stringify({
      enrollment_number: input.enrollment_number, given_names: input.given_names,
      first_surname: input.first_surname, second_surname: input.second_surname,
    }),
  }))
}

/** Inactiva o reactiva a un alumno propio (HU-S2-04); no existe borrado. */
export async function setStudentStatus(id: number, active: boolean): Promise<StudentDetail> {
  await request('/sanctum/csrf-cookie')
  return detail(await request(`${studentPath(id)}/status`, { method: 'PATCH', body: JSON.stringify({ is_active: active }) }))
}

/** «López García, María Fernanda»: apellidos primero, como en un padrón. */
export function surnames(value: Pick<StudentInput, 'first_surname' | 'second_surname'>): string {
  return [value.first_surname, value.second_surname].filter(Boolean).join(' ')
}

/** «María Fernanda López García». */
export function fullName(value: Pick<StudentInput, 'given_names' | 'first_surname' | 'second_surname'>): string {
  return [value.given_names, surnames(value)].join(' ')
}
