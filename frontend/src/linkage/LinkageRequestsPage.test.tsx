import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

/** Aviso cuyo texto completo, con el nombre resaltado en strong, es exactamente `text`. */
const noticeText = (text: string) => (_: string, element: Element | null) => element?.tagName === 'P' && element.textContent === text
const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const companyUser = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo' } }
const publicId = '3f2c1b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f'
const pending = {
  id: 41, status: 'PENDIENTE_INSTITUCION', created_at: '2026-10-28T10:00:00Z', message: 'Nos interesa su perfil.',
  opportunity: { id: 12, title: 'Tableros de producción' },
  profile: { public_id: publicId, headline: 'Analista de datos', program: 'Ingeniería en Datos', period_type: 'semester', period_number: 6 },
  institution: { name: 'UT del Golfo', contact_name: 'Laura Méndez', contact_position: 'Coordinación Dual', contact_email: 'dual@utgolfo.edu.mx', contact_phone: '+52 833 357 4800' }, responded_at: null, response_message: null,
}
const cancelled = { ...pending, id: 40, status: 'CANCELADA', opportunity: { id: 13, title: 'Calidad' } }
const page = (items: unknown[], meta = {}) => Response.json({ data: items, meta: { current_page: 1, last_page: 1, total: items.length, per_page: 20, ...meta } })

function renderApp(path = '/linkage-requests') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}
const patches = () => apiMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')

beforeEach(() => {
  user = companyUser
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me') return Response.json({ user })
    if (path === '/api/dashboard') return new Promise<Response>(() => undefined)
    // Módulo destacado del inicio (HU-S9-05): ajeno a estas pruebas.
    if (typeof path === 'string' && path.startsWith('/api/promotional-videos')) return new Promise<Response>(() => undefined)
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    return apiMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('bandeja de solicitudes HU-S5-05', () => {
  it('ofrece la bandeja a COMPANY desde el inicio y la niega a otros roles (CA-05)', async () => {
    const view = renderApp('/')
    expect(await screen.findByRole('link', { name: 'Solicitudes de vinculación' })).toHaveAttribute('href', '/linkage-requests')
    view.unmount()

    user = { id: 2, name: 'Analista', email: 'analista@economia.test', role: 'SECRETARY', institution: null, company: null }
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para consultar solicitudes de vinculación.')
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('lista perfil anónimo, oportunidad, contacto institucional, fecha y estado (CA-02, CA-05)', async () => {
    apiMock.mockResolvedValueOnce(page([pending, cancelled]))
    renderApp()
    const table = await screen.findByRole('table', { name: 'Solicitudes de vinculación enviadas' })
    expect(apiMock.mock.calls[0][0]).toBe('/api/linkage-requests?page=1')
    const row = within(table).getByRole('row', { name: /Tableros de producción/ })
    // T-S12-04: sin enlaces subrayados; la fila abre el perfil y las acciones van en pastillas.
    expect(row).toHaveAttribute('data-href', `/talent/${publicId}`)
    expect(within(row).getByRole('rowheader')).toHaveTextContent('Analista de datos')
    expect(within(row).getByRole('link', { name: 'Ver perfil: Analista de datos' })).toHaveAttribute('href', `/talent/${publicId}`)
    // T-S8-15: solo la carrera; el periodo está en el perfil.
    expect(within(row).getByText('Ingeniería en Datos')).toBeInTheDocument()
    expect(row).not.toHaveTextContent('6.º semestre')
    expect(within(row).queryByRole('link', { name: 'Tableros de producción' })).not.toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Ver la oportunidad Tableros de producción' })).toHaveAttribute('href', '/opportunities/12')
    expect(within(row).getByText('UT del Golfo')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Escribir a dual@utgolfo.edu.mx' })).toHaveAttribute('href', 'mailto:dual@utgolfo.edu.mx')
    expect(within(row).getByRole('link', { name: 'Escribir a dual@utgolfo.edu.mx' })).toHaveAttribute('target', '_blank')
    // T-S8-11: responsable de la institución con su puesto, y su teléfono opcional listo para llamar.
    expect(within(row).getByText('Laura Méndez')).toHaveAttribute('title', 'Coordinación Dual')
    expect(within(row).getByRole('link', { name: 'Llamar al +52 833 357 4800' })).toHaveAttribute('href', 'tel:+528333574800')
    expect(within(row).getByText('Pendiente de la institución')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /Cancelar la solicitud/ })).toBeInTheDocument()

    const cancelledRow = within(table).getByRole('row', { name: /Calidad/ })
    expect(within(cancelledRow).getByText('Cancelada', { selector: '.linkage-status' })).toBeInTheDocument()
    expect(within(cancelledRow).queryByRole('button')).not.toBeInTheDocument()
  })

  it('filtra por estado y pagina (CA-01, CA-05)', async () => {
    apiMock.mockResolvedValueOnce(page([pending], { last_page: 2, total: 21 }))
      .mockResolvedValueOnce(page([cancelled]))
      .mockResolvedValueOnce(page([]))
    renderApp()
    expect(await screen.findByText('Página 1 de 2 · 21 solicitudes')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'CANCELADA' } })
    expect(await screen.findByText('Calidad')).toBeInTheDocument()
    expect(apiMock.mock.calls[1][0]).toBe('/api/linkage-requests?page=1&status=CANCELADA')
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'ACEPTADA' } })
    expect(await screen.findByText('Ninguna solicitud con ese estado.')).toBeInTheDocument()
  })

  it('invita a buscar talento cuando no hay solicitudes', async () => {
    apiMock.mockResolvedValueOnce(page([]))
    renderApp()
    expect(await screen.findByText('Aún no has enviado solicitudes.')).toBeInTheDocument()
    // El enlace del estado vacío, además del de la navegación.
    expect(screen.getAllByRole('link', { name: 'Buscar talento' }).map((link) => link.getAttribute('href'))).toEqual(['/talent', '/talent'])
  })

  it('cancela una pendiente tras confirmarla; cancelar el diálogo no cambia nada (CA-03, CA-05)', async () => {
    apiMock.mockResolvedValueOnce(page([pending])).mockResolvedValueOnce(Response.json({ data: { ...pending, status: 'CANCELADA' } }))
    renderApp()
    const button = await screen.findByRole('button', { name: 'Cancelar la solicitud de Analista de datos para Tableros de producción' })
    fireEvent.click(button)
    let dialog = await screen.findByRole('alertdialog', { name: '¿Cancelar la solicitud?' })
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(patches()).toHaveLength(0)

    fireEvent.click(button)
    dialog = await screen.findByRole('alertdialog', { name: '¿Cancelar la solicitud?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar solicitud' }))
    expect(await screen.findByText(noticeText('Solicitud para Tableros de producción cancelada correctamente.'))).toHaveAttribute('role', 'status')
    expect(patches()[0][0]).toBe('/api/linkage-requests/41/cancel')
    expect(screen.getByText('Cancelada', { selector: '.linkage-status' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cancelar la solicitud/ })).not.toBeInTheDocument()
  })

  it('muestra el motivo si la solicitud ya no estaba pendiente', async () => {
    apiMock.mockResolvedValueOnce(page([pending])).mockResolvedValueOnce(Response.json({ message: 'Invalid', errors: {
      status: ['Solo puedes cancelar solicitudes pendientes de la institución.'],
    } }, { status: 422 }))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: /Cancelar la solicitud/ }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar solicitud' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo puedes cancelar solicitudes pendientes de la institución.')
  })

  it('muestra la fecha y el mensaje de la respuesta institucional, sin quién respondió (HU-S6-02 CA-04)', async () => {
    const answered = { ...pending, id: 39, status: 'ACEPTADA', opportunity: { id: 14, title: 'Mantenimiento' },
      responded_at: '2026-10-29T16:00:00Z', response_message: 'Coordinemos la entrevista.' }
    apiMock.mockResolvedValueOnce(page([answered]))
    renderApp()
    const row = within(await screen.findByRole('table', { name: 'Solicitudes de vinculación enviadas' })).getByRole('row', { name: /Mantenimiento/ })
    expect(row).toHaveTextContent('Aceptada')
    expect(row).toHaveTextContent('Respondida el 29 oct 2026')
    expect(row).toHaveTextContent('“Coordinemos la entrevista.”')
    expect(within(row).queryByRole('button', { name: /Cancelar/ })).not.toBeInTheDocument()
  })
})

describe('bandeja de solicitudes sin enlaces subrayados (T-S12-04)', () => {
  function Location() {
    const location = useLocation()
    const state: unknown = location.state
    const back = typeof state === 'object' && state !== null && 'back' in state ? JSON.stringify(state.back) : ''
    return <output aria-label="Ruta actual" data-back={back}>{location.pathname + location.search}</output>
  }

  it('toda la fila abre el perfil y su regreso conserva el filtro de la URL', async () => {
    apiMock.mockResolvedValueOnce(page([{ ...pending, status: 'ACEPTADA' }]))
      .mockImplementation(() => new Promise<Response>(() => undefined))
    render(<MemoryRouter initialEntries={['/linkage-requests?status=ACEPTADA']}><App /><Location /></MemoryRouter>)
    const table = await screen.findByRole('table', { name: 'Solicitudes de vinculación enviadas' })
    expect(apiMock.mock.calls[0][0]).toBe('/api/linkage-requests?page=1&status=ACEPTADA')
    expect(screen.getByLabelText('Estado')).toHaveValue('ACEPTADA')

    fireEvent.click(within(table).getByRole('rowheader'))
    const location = screen.getByRole('status', { name: 'Ruta actual' })
    await waitFor(() => expect(location).toHaveTextContent(`/talent/${publicId}`))
    expect(JSON.parse(location.dataset.back ?? '')).toEqual({ to: '/linkage-requests?status=ACEPTADA', label: 'Volver a solicitudes' })
  })

  it('los botones de la fila no la abren', async () => {
    apiMock.mockResolvedValueOnce(page([pending]))
    render(<MemoryRouter initialEntries={['/linkage-requests']}><App /><Location /></MemoryRouter>)
    const table = await screen.findByRole('table', { name: 'Solicitudes de vinculación enviadas' })
    fireEvent.click(within(table).getByRole('button', { name: /^Cancelar la solicitud/ }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Ruta actual' })).toHaveTextContent('/linkage-requests')
  })
})

