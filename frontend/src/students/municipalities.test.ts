import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearMunicipalityCache, listMunicipalities } from './municipalities'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  clearMunicipalityCache()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('catálogo de municipios HU-S4-04', () => {
  it('consulta los municipios de un estado y conserva solo la clave y el nombre (CA-07)', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ code: '09003', name: 'Coyoacán', extra: 1 }, { code: '09015', name: 'Cuauhtémoc' }] }))
    await expect(listMunicipalities('09')).resolves.toEqual([{ code: '09003', name: 'Coyoacán' }, { code: '09015', name: 'Cuauhtémoc' }])
    expect(fetchMock.mock.calls[0][0]).toBe('/api/catalogs/states/09/municipalities')
  })

  it('descarga cada estado una sola vez', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ code: '28041', name: 'Victoria' }] }))
    await listMunicipalities('28')
    await expect(listMunicipalities('28')).resolves.toEqual([{ code: '28041', name: 'Victoria' }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('no consulta una clave de estado inválida', async () => {
    await expect(listMunicipalities('33')).rejects.toMatchObject({ status: 404 })
    await expect(listMunicipalities('../me')).rejects.toMatchObject({ status: 404 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [{ data: [{ code: '2804', name: 'Victoria' }] }],
    [{ data: [{ code: '19039', name: 'Monterrey' }] }],
    [{ data: [{ code: '28041', name: '' }] }],
    [{ data: {} }],
    [{}],
  ])('rechaza un catálogo inesperado', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body))
    await expect(listMunicipalities('28')).rejects.toMatchObject({ status: 502 })
  })
})
