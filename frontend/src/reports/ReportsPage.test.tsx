import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const admin = { id: 1, name: 'Administración', email: 'admin@bt.test', role: 'ADMIN', institution: null, company: null }
const secretary = { id: 2, name: 'Analista', email: 'analista@economia.test', role: 'SECRETARY', institution: null, company: null }
const report = {
  generated_at: '2026-10-28T18:00:00Z',
  linkage_summary: { total: 8, by_status: { PENDIENTE_INSTITUCION: 2, ACEPTADA: 4, RECHAZADA: 1, CANCELADA: 1 } },
  by_institution: [
    { id: 4, name: 'Bachillerato Cerrado', is_active: false, active_students: 3, searchable_profiles: 0, received_requests: 0, accepted_requests: 0 },
    { id: 2, name: 'Universidad Tecnológica', is_active: true, active_students: 1250, searchable_profiles: 40, received_requests: 8, accepted_requests: 4 },
  ],
  by_sector: [
    { sector_code: '31-33', active_companies: 2, active_opportunities: 5, accepted_requests: 3 },
    { sector_code: '54', active_companies: 1, active_opportunities: 0, accepted_requests: 1 },
  ],
}

function renderApp(path = '/reports') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

beforeEach(() => {
  user = admin
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me') return Response.json({ user })
    if (path === '/api/dashboard') return new Promise<Response>(() => undefined)
    return apiMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('reporte ejecutivo HU-S7-01', () => {
  it.each([admin, secretary])('ofrece el reporte desde el inicio de $role (CA-03)', async (account) => {
    user = account
    renderApp('/')
    expect(await screen.findByRole('link', { name: 'Reporte ejecutivo' })).toHaveAttribute('href', '/reports')
  })

  it.each([
    { id: 3, name: 'Coordinación', email: 'dual@ut.test', role: 'INSTITUTION', institution: { id: 2, name: 'UT' }, company: null },
    { id: 9, name: 'Reclutadora', email: 'rh@empresa.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo' } },
  ])('niega la vista a $role sin consultar el reporte (CA-01)', async (account) => {
    user = account
    const view = renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para consultar el reporte ejecutivo.')
    expect(apiMock).not.toHaveBeenCalled()
    view.unmount()

    renderApp('/')
    await screen.findByRole('heading', { name: `Hola, ${account.name}` })
    expect(screen.queryByRole('link', { name: 'Reporte ejecutivo' })).not.toBeInTheDocument()
  })

  it('presenta el embudo, las instituciones y los sectores en tablas accesibles (CA-02, CA-03)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: report }))
    renderApp()

    const statuses = await screen.findByRole('table', { name: 'Solicitudes de vinculación por estado' })
    expect(apiMock.mock.calls[0][0]).toBe('/api/reports/dual-program')
    expect(screen.getByText('8 solicitudes registradas')).toBeInTheDocument()
    expect(within(statuses).getByRole('row', { name: /Aceptada/ })).toHaveTextContent(/50\s?%/)
    expect(within(statuses).getByRole('row', { name: /Pendiente de la institución/ })).toHaveTextContent(/25\s?%/)

    const institutions = screen.getByRole('table', { name: 'Participación por institución educativa' })
    const rows = within(institutions).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['Bachillerato Cerrado', 'Universidad Tecnológica'])
    expect(rows[0]).toHaveTextContent('INACTIVA')
    expect(within(rows[1]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['ACTIVA', '1,250', '40', '8', '4'])

    const sectors = screen.getByRole('table', { name: 'Participación por sector SCIAN' })
    const manufacturing = within(sectors).getByRole('row', { name: /31-33/ })
    expect(manufacturing).toHaveTextContent(/Industrias manufactureras/)
    expect(within(manufacturing).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['2', '5', '3'])
    expect(screen.getByText(/Generado el 28 de octubre de 2026/)).toBeInTheDocument()
  })

  it('muestra 0% sin solicitudes y avisa de listas vacías', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: {
      ...report, linkage_summary: { total: 0, by_status: { PENDIENTE_INSTITUCION: 0, ACEPTADA: 0, RECHAZADA: 0, CANCELADA: 0 } },
      by_institution: [], by_sector: [],
    } }))
    renderApp()
    const statuses = await screen.findByRole('table', { name: 'Solicitudes de vinculación por estado' })
    expect(within(statuses).getByRole('row', { name: /Aceptada/ })).toHaveTextContent(/^Aceptada00\s?%$/)
    expect(screen.getByText('0 solicitudes registradas')).toBeInTheDocument()
    expect(screen.getByText('Aún no hay instituciones registradas.')).toBeInTheDocument()
    expect(screen.getByText('Aún no hay empresas registradas.')).toBeInTheDocument()
  })

  it('rechaza una respuesta fuera de contrato y permite reintentar', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...report, by_sector: [{ sector_code: '99', active_companies: 1 }] } }))
      .mockResolvedValueOnce(Response.json({ data: report }))
    renderApp()
    expect(await screen.findByText('No pudimos cargar la información')).toBeInTheDocument()
    screen.getByRole('button', { name: 'Reintentar' }).click()
    expect(await screen.findByRole('table', { name: 'Participación por sector SCIAN' })).toBeInTheDocument()
  })

  it('descarta campos ajenos al contrato', async () => {
    const leaked = { ...report, by_institution: [{ ...report.by_institution[1], contact_email: 'dual@ut.edu.mx', students: [{ name: 'Ximena' }] }] }
    apiMock.mockResolvedValueOnce(Response.json({ data: leaked }))
    renderApp()
    await screen.findByRole('table', { name: 'Participación por institución educativa' })
    expect(screen.queryByText(/dual@ut.edu.mx|Ximena/)).not.toBeInTheDocument()
  })
})
