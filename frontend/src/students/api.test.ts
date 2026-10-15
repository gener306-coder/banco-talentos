import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStudent, fullName, getStudent, listStudents, setStudentStatus, surnames, updateStudentIdentity, updateStudentProfile } from './api'
import { MEXICAN_STATES, periodLabel, stateName } from './catalogs'

const fetchMock = vi.fn<typeof fetch>()
const emptyProfile = { program: null, period_type: null, period_number: null, dual_available: null, state_code: null, municipality: null, can_relocate: null }
const fullProfile = { program: 'Ingeniería', period_type: 'semester', period_number: 6, dual_available: true, state_code: '28', municipality: 'Victoria', can_relocate: false } as const
const record = { id: 3, enrollment_number: 'A-001', given_names: 'María', first_surname: 'López', second_surname: null, is_active: true, created_at: '2026-10-13T12:00:00Z' }

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
})
afterEach(() => vi.unstubAllGlobals())

function csrf() {
  document.cookie = 'XSRF-TOKEN=token%3D; Path=/'
  return Promise.resolve(new Response(null, { status: 204 }))
}

describe('cliente del padrón de alumnos', () => {
  it('lista una página y conserva solo los campos del contrato', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ ...record, institution_id: 9, extra: 'x' }], meta: { current_page: 2, last_page: 3, total: 101 } }))
    await expect(listStudents(2)).resolves.toEqual({ students: [record], page: 2, lastPage: 3, total: 101 })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/students?page=2')
  })

  it.each([
    [{ data: [], meta: null }],
    [{ data: {}, meta: { current_page: 1, last_page: 1, total: 0 } }],
    [{ data: [{ ...record, id: 'x' }], meta: { current_page: 1, last_page: 1, total: 1 } }],
    [{ data: [], meta: { current_page: 0, last_page: 1, total: 0 } }],
    [{ data: [{ ...record, is_active: 'true' }], meta: { current_page: 1, last_page: 1, total: 1 } }],
    [{ data: [{ ...record, is_active: undefined }], meta: { current_page: 1, last_page: 1, total: 1 } }],
  ])('rechaza una respuesta de listado inesperada', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body))
    await expect(listStudents(1)).rejects.toMatchObject({ status: 502 })
  })

  it('registra con CSRF y envía solo la identidad, nunca la institución', async () => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: record }, { status: 201 }))
    const input = { enrollment_number: 'A-001', given_names: 'María', first_surname: 'López', second_surname: null }
    await expect(createStudent({ ...input, ...{ institution_id: 9 } })).resolves.toEqual(record)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/sanctum/csrf-cookie', '/api/students'])
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual(input)
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('X-XSRF-TOKEN')).toBe('token=')
  })

  it('une los apellidos sin espacios sobrantes', () => {
    expect(surnames({ first_surname: 'López', second_surname: 'García' })).toBe('López García')
    expect(surnames({ first_surname: 'López', second_surname: null })).toBe('López')
  })

  it('une nombre y apellidos', () => {
    expect(fullName({ given_names: 'María', first_surname: 'López', second_surname: null })).toBe('María López')
  })
})

describe('cliente del expediente HU-S2-03', () => {
  it('obtiene el detalle con el expediente y descarta campos fuera del contrato', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: { ...record, institution_id: 9, profile: { ...emptyProfile, extra: 1 } } }))
    await expect(getStudent('3')).resolves.toEqual({ ...record, profile: emptyProfile })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/students/3')
  })

  it.each([
    [{ data: record }],
    [{ data: { ...record, profile: { ...emptyProfile, state_code: '33' } } }],
    [{ data: { ...record, profile: { ...emptyProfile, period_type: 'trimester' } } }],
    [{ data: { ...record, profile: { ...emptyProfile, period_number: 16 } } }],
    [{ data: { ...record, profile: { ...emptyProfile, dual_available: 'sí' } } }],
    [{ data: { ...record, profile: { program: null } } }],
  ])('rechaza un detalle inesperado', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body))
    await expect(getStudent('3')).rejects.toMatchObject({ status: 502 })
  })

  it('guarda el expediente con CSRF enviando solo sus campos', async () => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: { ...record, profile: fullProfile } }))
    await expect(updateStudentProfile(3, { ...fullProfile, ...{ institution_id: 9, enrollment_number: 'X' } }))
      .resolves.toEqual({ ...record, profile: fullProfile })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/students/3/profile')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PUT')
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual(fullProfile)
  })

  it('corrige la identidad con CSRF enviando solo la identidad', async () => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: { ...record, profile: emptyProfile } }))
    const input = { enrollment_number: 'A-001', given_names: 'María', first_surname: 'López', second_surname: null }
    await updateStudentIdentity(3, { ...input, ...{ program: 'X' } })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/students/3/identity')
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual(input)
  })

  it('usa las 32 claves INEGI y etiqueta el periodo', () => {
    expect(MEXICAN_STATES.map((state) => state.code)).toEqual(Array.from({ length: 32 }, (_, index) => String(index + 1).padStart(2, '0')))
    expect(stateName('28')).toBe('Tamaulipas')
    expect(periodLabel('semester', 6)).toBe('6.º semestre')
    expect(periodLabel('four_month', 1)).toBe('1.º cuatrimestre')
  })
})

describe('cliente de la baja lógica HU-S2-04', () => {
  it.each([false, true])('cambia el estado a %s con CSRF enviando solo is_active', async (active) => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: { ...record, is_active: active, profile: emptyProfile } }))
    await expect(setStudentStatus(3, active)).resolves.toEqual({ ...record, is_active: active, profile: emptyProfile })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/students/3/status')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH')
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({ is_active: active })
  })
})
