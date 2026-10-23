import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { distanceLabel, emptyFilters, getTalent, searchParams, searchTalent } from './api'

const fetchMock = vi.fn<typeof fetch>()
const publicId = '3f2c1b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f'
export const apiCard = {
  public_id: publicId, headline: 'Analista de datos', program: 'Ingeniería', period_type: 'semester', period_number: 6,
  institution: 'UT del Golfo', state_code: '28', municipality: 'Matamoros', distance_km: 80,
  skills: [{ name: 'Python', kind: 'technical' }], languages: [{ language_code: 'en', level: 4 }],
  verified_certifications: 2, dual_available: true, can_relocate: false,
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('buscador de talento HU-S4-05', () => {
  it('envía solo los filtros con valor y nunca coordenadas (CA-03, CA-04)', () => {
    expect(searchParams(emptyFilters, 1).toString()).toBe('page=1')
    const params = searchParams({
      ...emptyFilters, skills: ['React', 'SQL'], language: 'en', minLevel: '4', program: '  Mecatrónica ', minPeriod: '5',
      dualAvailable: true, canRelocate: true, verifiedCertification: true, stateCode: '28', radiusKm: '50', originMunicipalityCode: '28041',
    }, 2)
    expect([...params.entries()]).toEqual([
      ['skills[]', 'React'], ['skills[]', 'SQL'], ['language', 'en'], ['min_level', '4'], ['program', 'Mecatrónica'], ['min_period', '5'],
      ['dual_available', '1'], ['can_relocate', '1'], ['verified_certification', '1'], ['state_code', '28'], ['radius_km', '50'],
      ['origin_municipality_code', '28041'], ['page', '2'],
    ])
  })

  it('omite el idioma sin nivel', () => {
    expect(searchParams({ ...emptyFilters, language: 'en' }, 1).has('language')).toBe(false)
  })

  it('convierte las tarjetas y conserva solo los campos públicos (CA-05, CA-07)', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ ...apiCard, id: 9, enrollment_number: 'X' }], meta: { current_page: 1, last_page: 1, total: 1, per_page: 20 } }))
    const page = await searchTalent(emptyFilters, 1)
    expect(page.total).toBe(1)
    expect(page.cards[0]).toEqual({
      publicId, headline: 'Analista de datos', program: 'Ingeniería', periodType: 'semester', periodNumber: 6, institution: 'UT del Golfo',
      stateCode: '28', municipality: 'Matamoros', distanceKm: 80, skills: [{ name: 'Python', kind: 'technical' }],
      languages: [{ languageCode: 'en', level: 4 }], verifiedCertifications: 2, dualAvailable: true, canRelocate: false,
    })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/talent?page=1')
  })

  it.each([
    [{ ...apiCard, public_id: '12' }],
    [{ ...apiCard, distance_km: -5 }],
    [{ ...apiCard, skills: [{ name: 'X', kind: 'otro' }] }],
  ])('rechaza una tarjeta inesperada', async (data) => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [data], meta: { current_page: 1, last_page: 1, total: 1 } }))
    await expect(searchTalent(emptyFilters, 1)).rejects.toMatchObject({ status: 502 })
  })

  it('consulta el perfil solo con un UUID público (CA-08)', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: { ...apiCard, certifications: [], projects: [] } }))
    await expect(getTalent(publicId)).resolves.toMatchObject({ publicId, certifications: [], projects: [] })
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/talent/${publicId}`)
    await expect(getTalent('15')).rejects.toMatchObject({ status: 404 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('redondea la distancia en el texto (CA-04)', () => {
    expect(distanceLabel(0)).toBe('A menos de 5 km')
    expect(distanceLabel(80)).toBe('A unos 80 km')
  })
})
