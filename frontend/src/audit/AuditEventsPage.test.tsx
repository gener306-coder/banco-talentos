import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const admin = { id: 1, name: 'Administración', email: 'admin@bt.test', role: 'ADMIN', institution: null, company: null }
const secretaryActor = { id: 2, name: 'Analista Económica', role: 'SECRETARY' }
const linkage = { id: 41, status: 'ACEPTADA', institution: 'Universidad Tecnológica', company: 'ManuGolfo' }
const events = [
  { type: 'linkage_responded', occurred_at: '2026-10-06T16:00:00Z', actor: { id: 7, name: 'Coordinación Dual', role: 'INSTITUTION' }, resource: linkage },
  { type: 'linkage_requested', occurred_at: '2026-10-05T16:00:00Z', actor: { id: 5, name: 'Reclutadora', role: 'COMPANY' }, resource: { ...linkage, status: 'PENDIENTE_INSTITUCION' } },
  { type: 'opportunity_created', occurred_at: '2026-10-04T16:00:00Z', actor: { id: 5, name: 'Reclutadora', role: 'COMPANY' }, resource: { id: 12, title: 'Tableros de producción' } },
  { type: 'company_registered', occurred_at: '2026-10-02T16:00:00Z', actor: secretaryActor, resource: { id: 3, legal_name: 'Manufacturas del Golfo, S.A. de C.V.' } },
  { type: 'account_created', occurred_at: '2026-10-01T16:00:00Z', actor: { id: 1, name: 'Administración', role: 'ADMIN' }, resource: { id: 2, name: 'Analista Económica', email: 'analista@economia.test', role: 'SECRETARY' } },
]
const page = (items: unknown[], meta = {}) => Response.json({ data: items, meta: { current_page: 1, last_page: 1, total: items.length, per_page: 30, ...meta } })

function renderApp(path = '/audit-events') {
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

describe('bitácora HU-S7-03', () => {
  it('ofrece la bitácora solo desde el inicio de ADMIN (CA-01)', async () => {
    renderApp('/')
    expect(await screen.findByRole('link', { name: 'Bitácora' })).toHaveAttribute('href', '/audit-events')
  })

  it.each([
    { id: 2, name: 'Analista', email: 'analista@economia.test', role: 'SECRETARY', institution: null, company: null },
    { id: 3, name: 'Coordinación', email: 'dual@ut.test', role: 'INSTITUTION', institution: { id: 2, name: 'UT' }, company: null },
    { id: 9, name: 'Reclutadora', email: 'rh@empresa.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo' } },
  ])('niega la vista a $role sin consultar la bitácora (CA-01)', async (account) => {
    user = account
    const view = renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para consultar la bitácora.')
    expect(apiMock).not.toHaveBeenCalled()
    view.unmount()

    renderApp('/')
    await screen.findByRole('heading', { name: `Hola, ${account.name}` })
    expect(screen.queryByRole('link', { name: 'Bitácora' })).not.toBeInTheDocument()
  })

  it('lista tipo, fecha, actor y descripción pública de cada evento (CA-02, CA-03)', async () => {
    apiMock.mockResolvedValueOnce(page(events))
    renderApp()
    const table = await screen.findByRole('table', { name: 'Eventos de la bitácora' })
    expect(apiMock.mock.calls[0][0]).toBe('/api/audit-events?page=1')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      'Vinculación respondida', 'Vinculación solicitada', 'Oportunidad registrada', 'Empresa registrada', 'Cuenta creada',
    ])
    expect(rows[0]).toHaveTextContent('Coordinación DualInstitución')
    expect(rows[0]).toHaveTextContent('Solicitud #41 de ManuGolfo a Universidad Tecnológica: aceptada')
    expect(rows[1]).toHaveTextContent('Solicitud #41 de ManuGolfo a Universidad Tecnológica')
    expect(rows[2]).toHaveTextContent('Oportunidad: «Tableros de producción»')
    expect(rows[3]).toHaveTextContent('Empresa: Manufacturas del Golfo, S.A. de C.V.')
    expect(rows[3]).toHaveTextContent('Analista EconómicaSecretaría de Economía')
    expect(rows[4]).toHaveTextContent('Cuenta de Secretaría de Economía: Analista Económica (analista@economia.test)')
    expect(within(rows[4]).getByText(/2026/).closest('time')).toHaveAttribute('dateTime', '2026-10-01T16:00:00Z')
  })

  it('filtra por tipo y pagina de 30 en 30 (CA-02)', async () => {
    apiMock.mockResolvedValueOnce(page(events, { last_page: 2, total: 35 }))
      .mockResolvedValueOnce(page(events.slice(0, 1), { current_page: 2, last_page: 2, total: 35 }))
      .mockResolvedValueOnce(page([]))
    renderApp()
    expect(await screen.findByText('Página 1 de 2 · 35 eventos')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))
    expect(await screen.findByText('Página 2 de 2 · 35 eventos')).toBeInTheDocument()
    expect(apiMock.mock.calls[1][0]).toBe('/api/audit-events?page=2')

    fireEvent.change(screen.getByLabelText('Tipo de evento'), { target: { value: 'company_registered' } })
    expect(await screen.findByText('Ningún evento de ese tipo.')).toBeInTheDocument()
    expect(apiMock.mock.calls[2][0]).toBe('/api/audit-events?page=1&type=company_registered')
  })

  it('explica la bitácora vacía', async () => {
    apiMock.mockResolvedValueOnce(page([]))
    renderApp()
    expect(await screen.findByText('Aún no hay eventos registrados.')).toBeInTheDocument()
  })

  it('rechaza un evento fuera de contrato y descarta campos ajenos', async () => {
    apiMock.mockResolvedValueOnce(page([{ ...events[4], type: 'password_changed' }]))
      .mockResolvedValueOnce(page([{ ...events[1], resource: { ...events[1].resource, student: 'Ximena Zaragoza' }, token: 'secreto' }]))
    renderApp()
    expect(await screen.findByText('No pudimos cargar la información')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await screen.findByRole('table', { name: 'Eventos de la bitácora' })
    expect(screen.queryByText(/Ximena|secreto/)).not.toBeInTheDocument()
  })
})
