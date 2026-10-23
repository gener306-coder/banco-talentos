import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCompany, getCompany, listCompanies, setCompanyStatus, updateCompany } from './api'

const fetchMock = vi.fn<typeof fetch>()
const summary = {
  id: 5, legal_name: 'Manufacturas del Golfo', trade_name: 'ManuGolfo', rfc: 'MGO150320AB1', sector_code: '31-33',
  state_code: '28', municipality_code: '28032', municipality: 'Reynosa', is_active: true,
} as const
const company = {
  ...summary, contact_name: 'Lucía', contact_email: 'dual@manugolfo.test', contact_phone: null, validation_reference: 'SE/1',
  registered_by: { id: 2, name: 'Analista' }, created_at: '2026-10-22T10:00:00Z',
}
const input = {
  legal_name: 'Manufacturas del Golfo', trade_name: 'ManuGolfo', rfc: 'MGO150320AB1', sector_code: '31-33', state_code: '28',
  municipality_code: '28032', contact_name: 'Lucía', contact_email: 'dual@manugolfo.test', contact_phone: null, validation_reference: 'SE/1',
} as const

function csrf() {
  document.cookie = 'XSRF-TOKEN=token%3D; Path=/'
  return Promise.resolve(new Response(null, { status: 204 }))
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('empresas HU-S4-02', () => {
  it('lista con página y búsqueda, conservando solo los campos del contrato (CA-08)', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ ...summary, location: 'x' }], meta: { current_page: 1, last_page: 1, total: 1 } }))
    await expect(listCompanies(1, 'golfo & co')).resolves.toEqual({ companies: [summary], page: 1, lastPage: 1, total: 1 })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/companies?page=1&q=golfo+%26+co')
  })

  it('omite la búsqueda vacía', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } }))
    await listCompanies(2, '')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/companies?page=2')
  })

  it.each([
    [{ data: [{ ...summary, sector_code: '99' }], meta: { current_page: 1, last_page: 1, total: 1 } }],
    [{ data: [{ ...summary, municipality_code: 'Reynosa' }], meta: { current_page: 1, last_page: 1, total: 1 } }],
    [{ data: [summary] }],
  ])('rechaza un listado inesperado', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body))
    await expect(listCompanies(1, '')).rejects.toMatchObject({ status: 502 })
  })

  it('consulta el detalle', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: company }))
    await expect(getCompany('5')).resolves.toEqual(company)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/companies/5')
  })

  it('registra y edita con CSRF enviando solo los datos de la empresa (CA-02)', async () => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: company }, { status: 201 }))
      .mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: company }))
    await createCompany({ ...input, ...{ is_active: false, latitude: 1 } })
    await updateCompany(5, input)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/companies')
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual(input)
    expect(fetchMock.mock.calls[3][0]).toBe('/api/companies/5')
    expect(fetchMock.mock.calls[3][1]?.method).toBe('PUT')
  })

  it('cambia el estado con un booleano (CA-07)', async () => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: { ...company, is_active: false } }))
    await expect(setCompanyStatus(5, false)).resolves.toMatchObject({ is_active: false })
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH')
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({ is_active: false })
  })
})
