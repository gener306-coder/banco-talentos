import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/http'
import { getDashboard } from './api'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const respond = (body: unknown) => fetchMock.mockResolvedValueOnce(Response.json(body))

describe('indicadores del inicio HU-S5-01', () => {
  it('consulta GET /api/dashboard y conserva solo los indicadores del rol', async () => {
    respond({ data: { role: 'INSTITUTION', metrics: { active_students: 3, searchable_students: 2, pending_municipality_students: 1, extra: 9 } } })
    await expect(getDashboard('INSTITUTION')).resolves.toEqual({
      role: 'INSTITUTION', metrics: { active_students: 3, searchable_students: 2, pending_municipality_students: 1 },
    })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/dashboard')
  })

  it('acepta metrics: null de una cuenta sin organización (CA-06)', async () => {
    respond({ data: { role: 'COMPANY', metrics: null } })
    await expect(getDashboard('COMPANY')).resolves.toEqual({ role: 'COMPANY', metrics: null })
  })

  it.each([
    ['otro rol', { data: { role: 'ADMIN', metrics: { available_talent_profiles: 1 } } }],
    ['un conteo faltante', { data: { role: 'COMPANY', metrics: {} } }],
    ['un conteo negativo', { data: { role: 'COMPANY', metrics: { available_talent_profiles: -1 } } }],
    ['un conteo decimal', { data: { role: 'COMPANY', metrics: { available_talent_profiles: 1.5 } } }],
    ['un conteo como texto', { data: { role: 'COMPANY', metrics: { available_talent_profiles: '4' } } }],
    ['sin data', { metrics: null }],
  ])('rechaza como 502 una respuesta con %s', async (_case, body) => {
    respond(body)
    await expect(getDashboard('COMPANY')).rejects.toMatchObject({ status: 502 } satisfies Partial<ApiError>)
  })
})
