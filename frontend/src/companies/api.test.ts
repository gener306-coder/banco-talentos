import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCompany, inviteCompany, listCompanies, setCompanyStatus, updateCompany } from './api'

const fetchMock = vi.fn<typeof fetch>()
const summary = {
  id: 5, name: 'ManuGolfo', legal_name: 'Manufacturas del Golfo', trade_name: 'ManuGolfo', rfc: 'MGO150320AB1', sector_code: '31-33',
  state_code: '28', municipality_code: '28032', municipality: 'Reynosa', is_active: true, account_email: 'dual@manugolfo.test', profile_status: 'incomplete',
} as const
const company = {
  ...summary, contact_name: 'Lucía', contact_position: null, contact_email: 'dual@manugolfo.test', contact_phone: null, validation_reference: 'SE/1',
  missing: ['contact_position'], registered_by: { id: 2, name: 'Analista' }, created_at: '2026-10-22T10:00:00Z',
}
// HU-S14-02: la empresa recién invitada no tiene ningún dato del perfil.
const invited = {
  ...company, name: null, legal_name: null, trade_name: null, rfc: null, sector_code: null, state_code: null, municipality_code: null, municipality: null,
  contact_name: null, contact_email: null, validation_reference: null, profile_status: 'pending_access',
  missing: ['name', 'contact_name', 'contact_position', 'contact_email', 'legal_name', 'rfc', 'sector_code', 'location'],
}
const invitation = { email: 'dual@manugolfo.test', trade_name: null, person_name: 'Lucía' }
const input = {
  legal_name: 'Manufacturas del Golfo', trade_name: 'ManuGolfo', rfc: 'MGO150320AB1', sector_code: '31-33', state_code: '28',
  municipality_code: '28032', contact_name: 'Lucía', contact_position: null, contact_email: 'dual@manugolfo.test', contact_phone: null, validation_reference: 'SE/1',
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
    [{ data: [{ ...summary, profile_status: 'listo' }], meta: { current_page: 1, last_page: 1, total: 1 } }],
    [{ data: [summary] }],
  ])('rechaza un listado inesperado', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body))
    await expect(listCompanies(1, '')).rejects.toMatchObject({ status: 502 })
  })

  it('consulta el detalle', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: company }))
    await expect(getCompany('5')).resolves.toEqual(company)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/companies/5')
    fetchMock.mockResolvedValueOnce(Response.json({ data: invited }))
    await expect(getCompany('5')).resolves.toEqual(invited)
  })

  it('invita solo con el correo y los nombres de referencia, y edita con CSRF (HU-S14-02 CA-01)', async () => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: invited, setup_delivery: 'sent', setup_url: 'https://ignorado' }, { status: 201 }))
      .mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: company }))
    await expect(inviteCompany({ ...invitation, ...{ legal_name: 'X', is_active: false } })).resolves.toMatchObject({ setupDelivery: 'sent' })
    await updateCompany(5, input)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/companies')
    // T-S8-12: la invitación indica cómo entregar el enlace; la edición no.
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({ ...invitation, delivery_method: 'email' })
    expect(JSON.parse(fetchMock.mock.calls[3][1]?.body as string)).toEqual(input)
    expect(fetchMock.mock.calls[3][0]).toBe('/api/companies/5')
    expect(fetchMock.mock.calls[3][1]?.method).toBe('PUT')
  })

  it('devuelve el enlace para compartir solo con la entrega manual y rechaza respuestas fuera del contrato (T-S8-12)', async () => {
    const link = 'http://localhost:5173/set-initial-password?email=dual%40manugolfo.test&token=abc'
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: company, setup_delivery: 'manual', setup_url: link }, { status: 201 }))
    await expect(inviteCompany(invitation, 'manual')).resolves.toMatchObject({ setupDelivery: 'manual', setupLink: link })
    for (const body of [{ data: company }, { data: company, setup_delivery: 'manual', setup_url: 'https://otro.example/x' }]) {
      fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json(body, { status: 201 }))
      await expect(inviteCompany(invitation)).rejects.toMatchObject({ status: 502 })
    }
  })

  it('cambia el estado con un booleano (CA-07)', async () => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: { ...company, is_active: false } }))
    await expect(setCompanyStatus(5, false)).resolves.toMatchObject({ is_active: false })
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH')
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({ is_active: false })
  })
})
