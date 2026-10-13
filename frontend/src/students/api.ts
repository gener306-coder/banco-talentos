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
  created_at: string
}

/** Expediente público (HU-S2-03). Cada campo es `null` mientras no se haya capturado. */
export interface StudentProfileInput {
  program: string
  period_type: PeriodType
  period_number: number
  dual_available: boolean
  state_code: string
  municipality: string
  can_relocate: boolean
}

export type StudentProfile = { [K in keyof StudentProfileInput]: StudentProfileInput[K] | null }

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
      !('created_at' in data) || !isText(data.created_at)) {
    throw new ApiError(502)
  }
  // Solo se conservan los campos del contrato.
  return {
    id: data.id, enrollment_number: data.enrollment_number, given_names: data.given_names,
    first_surname: data.first_surname, second_surname: data.second_surname, created_at: data.created_at,
  }
}

const nullable = <T>(check: (value: unknown) => value is T) => (value: unknown): value is T | null => value === null || check(value)
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isPeriodNumber = (value: unknown): value is number => isPositiveInt(value) && value <= MAX_PERIOD

function profile(data: unknown): StudentProfile {
  if (typeof data !== 'object' || data === null ||
      !('program' in data) || !nullable(isText)(data.program) ||
      !('period_type' in data) || !nullable(isPeriodType)(data.period_type) ||
      !('period_number' in data) || !nullable(isPeriodNumber)(data.period_number) ||
      !('dual_available' in data) || !nullable(isBoolean)(data.dual_available) ||
      !('state_code' in data) || !nullable(isStateCode)(data.state_code) ||
      !('municipality' in data) || !nullable(isText)(data.municipality) ||
      !('can_relocate' in data) || !nullable(isBoolean)(data.can_relocate)) {
    throw new ApiError(502)
  }
  return {
    program: data.program, period_type: data.period_type, period_number: data.period_number,
    dual_available: data.dual_available, state_code: data.state_code, municipality: data.municipality,
    can_relocate: data.can_relocate,
  }
}

function detail(response: unknown): StudentDetail {
  if (typeof response !== 'object' || response === null || !('data' in response) ||
      typeof response.data !== 'object' || response.data === null || !('profile' in response.data)) throw new ApiError(502)
  return { ...student(response.data), profile: profile(response.data.profile) }
}

const studentPath = (id: string | number) => `/api/students/${encodeURIComponent(String(id))}`

export async function listStudents(page: number, signal?: AbortSignal): Promise<StudentPage> {
  const response = await request(`/api/students?page=${encodeURIComponent(String(page))}`, { signal })
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
      dual_available: input.dual_available, state_code: input.state_code, municipality: input.municipality,
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

/** «López García, María Fernanda»: apellidos primero, como en un padrón. */
export function surnames(value: Pick<StudentInput, 'first_surname' | 'second_surname'>): string {
  return [value.first_surname, value.second_surname].filter(Boolean).join(' ')
}

/** «María Fernanda López García». */
export function fullName(value: Pick<StudentInput, 'given_names' | 'first_surname' | 'second_surname'>): string {
  return [value.given_names, surnames(value)].join(' ')
}
