import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getOpportunity, getOpportunityDefaults, listOpportunities, setOpportunityStatus } from './api'

const fetchMock = vi.fn<typeof fetch>()
const base = {
  id: 12, title: 'Automatización', program: 'Mecatrónica', state_code: '28', municipality_code: '28032', municipality: 'Reynosa',
  vacancies: 3, is_active: true, created_at: '2026-10-27T10:00:00Z', skills: [{ name: 'PLC', kind: 'technical' }],
  period_type: 'semester', period_number: 5, can_relocate: false, description: 'Actividades', language_code: 'en', min_level: 4,
  created_by: { id: 9, name: 'Reclutadora' }, updated_at: '2026-10-27T10:00:00Z',
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const respond = (body: unknown) => fetchMock.mockResolvedValueOnce(Response.json(body))

describe('cliente de oportunidades HU-S5-02', () => {
  it('conserva solo los campos del contrato', async () => {
    respond({ data: { ...base, company_id: 3, location: 'POINT(0 0)' } })
    const opportunity = await getOpportunity('12')
    expect(opportunity).not.toHaveProperty('company_id')
    expect(opportunity).not.toHaveProperty('location')
    expect(opportunity.created_by).toEqual({ id: 9, name: 'Reclutadora' })
  })

  it('acepta una oportunidad sin idioma', async () => {
    respond({ data: { ...base, language_code: null, min_level: null } })
    await expect(getOpportunity('12')).resolves.toMatchObject({ language_code: null, min_level: null })
  })

  it.each([
    ['idioma sin nivel', { min_level: null }],
    ['nivel fuera de catálogo', { min_level: 9 }],
    ['periodo desconocido', { period_type: 'year' }],
    ['habilidad sin tipo', { skills: [{ name: 'PLC' }] }],
    ['municipio mal formado', { municipality_code: '2803' }],
    ['vacantes en cero', { vacancies: 0 }],
  ])('rechaza como 502 un detalle con %s', async (_case, override) => {
    respond({ data: { ...base, ...override } })
    await expect(getOpportunity('12')).rejects.toMatchObject({ status: 502 })
  })

  it('lee la página y su meta', async () => {
    respond({ data: [base], meta: { current_page: 2, last_page: 3, total: 41, per_page: 20 } })
    const page = await listOpportunities(2)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/opportunities?page=2')
    expect(page).toMatchObject({ page: 2, lastPage: 3, total: 41 })
    expect(page.opportunities[0].title).toBe('Automatización')
  })

  it('lee la ubicación por defecto de la empresa (CA-05)', async () => {
    respond({ data: { state_code: '28', municipality_code: '28032', municipality: 'Reynosa' } })
    await expect(getOpportunityDefaults()).resolves.toEqual({ state_code: '28', municipality_code: '28032', municipality: 'Reynosa' })
    respond({ data: { state_code: '28', municipality_code: 'x' } })
    await expect(getOpportunityDefaults()).rejects.toMatchObject({ status: 502 })
  })

  it('cambia el estado con PATCH y solo is_active (HU-S5-03)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    respond({ data: { ...base, is_active: false } })
    document.cookie = 'XSRF-TOKEN=csrf; Path=/'
    await expect(setOpportunityStatus(12, false)).resolves.toMatchObject({ is_active: false })
    const [path, options] = fetchMock.mock.calls[1]
    expect(path).toBe('/api/opportunities/12/status')
    expect(options?.method).toBe('PATCH')
    expect(JSON.parse(options?.body as string)).toEqual({ is_active: false })
  })
})
