import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStudent, listStudents, surnames } from './api'

const fetchMock = vi.fn<typeof fetch>()
const record = { id: 3, enrollment_number: 'A-001', given_names: 'María', first_surname: 'López', second_surname: null, created_at: '2026-10-13T12:00:00Z' }

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
})
