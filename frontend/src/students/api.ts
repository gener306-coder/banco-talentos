import { ApiError, request } from '../lib/http'

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

/** «López García, María Fernanda»: apellidos primero, como en un padrón. */
export function surnames(value: Pick<StudentInput, 'first_surname' | 'second_surname'>): string {
  return [value.first_surname, value.second_surname].filter(Boolean).join(' ')
}
