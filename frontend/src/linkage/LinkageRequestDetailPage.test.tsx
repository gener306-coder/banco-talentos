import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const fetchMock = vi.fn<typeof fetch>()
let unreadConversations = 0
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const companyUser = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo', missing: [] } }
const publicId = '3f2c1b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f'
const accepted = {
  id: 41, status: 'ACEPTADA', created_at: '2026-10-28T10:00:00Z', message: 'Nos interesa su perfil.',
  opportunity: { id: 12, title: 'Tableros de producción' },
  profile: { public_id: publicId, headline: 'Analista de datos', program: 'Ingeniería en Datos', period_type: 'semester', period_number: 6 },
  institution: { name: 'UT del Golfo', contact_name: 'Laura Méndez', contact_position: 'Coordinación Dual', contact_email: 'dual@utgolfo.edu.mx', contact_phone: '+52 833 357 4800' },
  responded_at: '2026-10-29T16:00:00Z', response_message: 'Coordinemos la entrevista.', unread_count: 0,
}
const pending = { ...accepted, status: 'PENDIENTE_INSTITUCION', responded_at: null, response_message: null }
const page = (items: unknown[]) => Response.json({ data: items, meta: { current_page: 1, last_page: 1, total: items.length, per_page: 20 } })

/** Ruta y regreso actuales, para seguir la navegación contextual. */
function Location() {
  const location = useLocation()
  const state: unknown = location.state
  const back = typeof state === 'object' && state !== null && 'back' in state ? JSON.stringify(state.back) : ''
  return <output aria-label="Ruta actual" data-back={back}>{location.pathname + location.search}</output>
}

function renderApp(path = '/linkage-requests/41') {
  return render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)
}
const gets = () => apiMock.mock.calls.filter(([, init]) => !init?.method || init.method === 'GET').map(([path]) => path)

beforeEach(() => {
  user = companyUser
  apiMock.mockReset()
  fetchMock.mockReset()
  unreadConversations = 0
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me') return Response.json({ user })
    // Aviso de conversaciones sin leer del menú (HU-S13-04): ajeno a estas pruebas salvo donde se indique.
    if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: unreadConversations } })
    if (path === '/api/dashboard') return new Promise<Response>(() => undefined)
    if (typeof path === 'string' && path.startsWith('/api/promotional-videos')) return new Promise<Response>(() => undefined)
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    // Conversación de la solicitud aceptada (HU-S13-03): hilo vacío; su comportamiento se prueba en LinkageConversation.test.tsx.
    if (typeof path === 'string' && path.includes('/messages')) {
      return Response.json({ data: [], meta: { has_more: false, can_write: true, last_read_message_id: null } })
    }
    return apiMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('detalle de la solicitud para la empresa HU-S13-02', () => {
  it('resume la solicitud aceptada: estado, perfil anónimo, oportunidad y contacto de la institución (CA-02)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: accepted }))
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Detalle de solicitud' })).toBeInTheDocument()
    expect(await screen.findByText('Analista de datos')).toBeInTheDocument()
    expect(gets()).toEqual(['/api/linkage-requests/41'])

    expect(screen.getByText('Aceptada', { selector: '.linkage-status' })).toBeInTheDocument()
    expect(screen.getByRole('note', { name: 'Estado de la solicitud' })).toHaveTextContent('UT del Golfo aceptó la solicitud. Coordina la vinculación en la conversación o con su contacto.')
    // T-S13-14: los mensajes de la solicitud y de la respuesta se leen en la conversación, no en el detalle.
    expect(screen.queryByText('Nos interesa su perfil.')).not.toBeInTheDocument()
    expect(screen.queryByText('Coordinemos la entrevista.')).not.toBeInTheDocument()
    expect(screen.getByText('29 de octubre de 2026')).toBeInTheDocument()

    const profile = screen.getByRole('region', { name: 'Perfil solicitado' })
    expect(profile).toHaveTextContent('Ingeniería en Datos')
    expect(profile).toHaveTextContent('6.º semestre')
    expect(within(profile).getByRole('link', { name: /Ver perfil/ })).toHaveAttribute('href', `/talent/${publicId}`)
    expect(within(screen.getByRole('region', { name: 'Oportunidad' })).getByRole('link', { name: /Ver oportunidad/ })).toHaveAttribute('href', '/opportunities/12')

    const institution = screen.getByRole('region', { name: 'Institución y contacto del programa dual' })
    expect(institution).toHaveTextContent('Laura Méndez')
    expect(institution).toHaveTextContent('Coordinación Dual')
    expect(within(institution).getByRole('button', { name: 'Escribir a dual@utgolfo.edu.mx' })).toHaveAttribute('aria-haspopup', 'menu')
    expect(within(institution).getByRole('link', { name: '+52 833 357 4800' })).toHaveAttribute('href', 'tel:+528333574800')

    // Aceptada: ya no se cancela. HU-S13-06: la conversación vive en su vista; el detalle no la carga.
    expect(screen.queryByRole('button', { name: 'Cancelar solicitud' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir conversación' })).toHaveAttribute('href', '/linkage-requests/41/chat')
    expect(screen.queryByRole('log', { name: 'Mensajes' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([path]) => path)).not.toContain('/api/linkage-requests/41/messages')
  })

  it('muestra en «Abrir conversación» los mensajes sin leer y la abre con regreso al detalle (HU-S13-06 CA-05)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...accepted, unread_count: 2 } }))
    renderApp('/linkage-requests/41?x=1')
    const open = await screen.findByRole('link', { name: 'Abrir conversación Nuevo: 2 mensajes sin leer' })
    fireEvent.click(open)
    const location = screen.getByRole('status', { name: 'Ruta actual' })
    await waitFor(() => expect(location).toHaveTextContent('/linkage-requests/41/chat'))
    expect(JSON.parse(location.dataset.back ?? '')).toEqual({ to: '/linkage-requests/41?x=1', label: 'Volver a la solicitud' })
  })

  it('cancela una pendiente tras confirmarla y retira la cancelación (CA-02)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: pending }))
      .mockResolvedValueOnce(Response.json({ data: { ...pending, status: 'CANCELADA' } }))
    renderApp()
    expect(await screen.findByRole('note', { name: 'Estado de la solicitud' })).toHaveTextContent('La institución aún no responde.')
    // HU-S13-06: también se abre la conversación de una pendiente, en solo lectura con el mensaje de la solicitud.
    expect(screen.getByRole('link', { name: 'Abrir conversación' })).toHaveAttribute('href', '/linkage-requests/41/chat')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar solicitud' }))
    const dialog = await screen.findByRole('alertdialog', { name: '¿Cancelar la solicitud?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar solicitud' }))

    const notice = 'Solicitud para Tableros de producción cancelada correctamente.'
    expect(await screen.findByText((_, element) => element?.tagName === 'P' && element.textContent === notice)).toHaveAttribute('role', 'status')
    const patch = apiMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
    expect(patch?.[0]).toBe('/api/linkage-requests/41/cancel')
    expect(screen.getByText('Cancelada', { selector: '.linkage-status' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar solicitud' })).not.toBeInTheDocument()
    expect(screen.queryByRole('note', { name: 'Estado de la solicitud' })).not.toBeInTheDocument()
  })

  it('responde igual a una solicitud ajena o inexistente', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ message: 'La solicitud no existe.' }, { status: 404 }))
    renderApp('/linkage-requests/999')
    expect(await screen.findByText('No encontramos esta solicitud')).toBeInTheDocument()
    expect(screen.getByText('La solicitud no existe.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a solicitudes' })).toHaveAttribute('href', '/linkage-requests')
  })

  it('solo la abre una cuenta COMPANY', async () => {
    user = { id: 2, name: 'Coordinación', email: 'dual@ut.test', role: 'INSTITUTION', institution: { id: 1, name: 'UT' }, company: null }
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para consultar solicitudes de vinculación.')
    expect(apiMock).not.toHaveBeenCalled()
  })
})

describe('regreso contextual del detalle (HU-S13-02 CA-03)', () => {
  it('la fila abre el detalle y «Volver a solicitudes» recupera el filtro y la página de la bandeja', async () => {
    apiMock.mockResolvedValueOnce(page([accepted]))
      .mockResolvedValueOnce(Response.json({ data: accepted }))
      .mockResolvedValueOnce(page([accepted]))
    renderApp('/linkage-requests?status=ACEPTADA&page=2')
    const table = await screen.findByRole('table', { name: 'Solicitudes de vinculación enviadas' })

    fireEvent.click(within(table).getByRole('rowheader'))
    expect(await screen.findByRole('heading', { name: 'Detalle de solicitud' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Ruta actual' })).toHaveTextContent('/linkage-requests/41')
    const back = await screen.findByRole('link', { name: 'Volver a solicitudes' })
    expect(back).toHaveAttribute('href', '/linkage-requests?status=ACEPTADA&page=2')
    // T-S13-14: el regreso ya lleva a la bandeja; la navegación no repite «Solicitudes de vinculación».
    const nav = screen.getByRole('navigation', { name: 'Navegación de solicitudes' })
    expect(within(nav).queryByRole('link', { name: /^Solicitudes de vinculación/ })).not.toBeInTheDocument()
    // T-S13-15: «Buscar talento» no pertenece al detalle de una solicitud.
    expect(within(nav).queryByRole('link', { name: 'Buscar talento' })).not.toBeInTheDocument()

    fireEvent.click(back)
    expect(await screen.findByRole('table', { name: 'Solicitudes de vinculación enviadas' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Ruta actual' })).toHaveTextContent('/linkage-requests?status=ACEPTADA&page=2')
    expect(screen.getByLabelText('Estado')).toHaveValue('ACEPTADA')
    expect(gets().at(-1)).toBe('/api/linkage-requests?page=2&status=ACEPTADA')
  })

  it('sin regreso contextual vuelve a la bandeja completa', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: accepted }))
    renderApp()
    expect(await screen.findByRole('link', { name: 'Volver a solicitudes' })).toHaveAttribute('href', '/linkage-requests')
  })

  it('el perfil regresa a la solicitud, y la solicitud conserva su regreso a la bandeja', async () => {
    apiMock.mockResolvedValueOnce(page([accepted]))
      .mockResolvedValueOnce(Response.json({ data: accepted }))
      .mockImplementation(() => new Promise<Response>(() => undefined))
    renderApp('/linkage-requests?status=ACEPTADA')
    fireEvent.click(within(await screen.findByRole('table', { name: 'Solicitudes de vinculación enviadas' })).getByRole('rowheader'))

    const profile = await screen.findByRole('region', { name: 'Perfil solicitado' })
    fireEvent.click(within(profile).getByRole('link', { name: /Ver perfil/ }))
    const location = screen.getByRole('status', { name: 'Ruta actual' })
    await waitFor(() => expect(location).toHaveTextContent(`/talent/${publicId}`))
    expect(JSON.parse(location.dataset.back ?? '')).toEqual({
      to: '/linkage-requests/41', label: 'Volver a la solicitud',
      state: { back: { to: '/linkage-requests?status=ACEPTADA', label: 'Volver a solicitudes' } },
    })
  })
})
