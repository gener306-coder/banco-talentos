import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { AuthContext } from '../auth/auth-context'
import type { AuthState } from '../auth/auth-context'
import type { User } from '../auth/api'
import { LINKAGE_READ_EVENT } from './conversationApi'
import { UnreadBadge } from './UnreadBadge'
import { UnreadSummaryProvider } from './UnreadSummaryProvider'
import { UNREAD_POLL_INTERVAL_MS } from './useUnreadConversations'

// HU-S13-04: aviso de conversaciones sin leer en el menú, contador en las bandejas (T-S13-08) y filtro.
const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
let unreadConversations: number
let hidden: boolean
const companyUser = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo' } }
const institutionUser = { id: 2, name: 'Coordinación', email: 'dual@ut.test', role: 'INSTITUTION', institution: { id: 1, name: 'UT del Golfo' }, company: null }
const page = (items: unknown[]) => Response.json({ data: items, meta: { current_page: 1, last_page: 1, total: items.length, per_page: 20 } })
const sent = (id: number, title: string, unread: number) => ({
  id, status: 'ACEPTADA', created_at: '2026-10-28T10:00:00Z', message: null, opportunity: { id, title },
  profile: { public_id: '3f2c1b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f', headline: `Perfil ${title}`, program: 'Ingeniería', period_type: 'semester', period_number: 6 },
  institution: { name: 'UT del Golfo', contact_name: null, contact_position: null, contact_email: 'dual@utgolfo.edu.mx', contact_phone: null },
  responded_at: '2026-10-29T16:00:00Z', response_message: null, unread_count: unread,
})
const received = (id: number, title: string, unread: number) => ({
  id, status: 'ACEPTADA', created_at: '2026-10-28T10:00:00Z',
  company: { name: 'ManuGolfo', municipality: 'Victoria' },
  opportunity: { id, title, program: 'Ingeniería en Datos', vacancies: 2 },
  student: { id: 7, enrollment_number: 'MAT-1', given_names: 'Ana', first_surname: `García ${title}`, second_surname: null, is_active: true, program: null, period_type: null, period_number: null },
  unread_count: unread,
})
const summaries = () => fetchMock.mock.calls.map(([path]) => String(path)).filter((path) => path.endsWith('/unread-summary'))

function Location() {
  const location = useLocation()
  return <output aria-label="Ruta actual">{location.pathname + location.search}</output>
}

beforeEach(() => {
  user = companyUser
  unreadConversations = 0
  hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me') return Response.json({ user })
    if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: unreadConversations } })
    if (path === '/api/dashboard') return new Promise<Response>(() => undefined)
    if (typeof path === 'string' && path.startsWith('/api/promotional-videos')) return new Promise<Response>(() => undefined)
    return apiMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'hidden')
})

describe('aviso del menú (CA-03)', () => {
  it('muestra en el inicio de la empresa cuántas conversaciones tienen mensajes sin leer', async () => {
    unreadConversations = 3
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    const card = await screen.findByRole('link', { name: 'Solicitudes de vinculación, 3 conversaciones con mensajes sin leer' })
    expect(card).toHaveAttribute('href', '/linkage-requests')
    expect(within(card).getByText('3')).toHaveAttribute('aria-hidden', 'true')
    expect(summaries()).toContain('/api/linkage-requests/unread-summary')
  })

  it('usa el resumen de la institución en su inicio', async () => {
    user = institutionUser
    unreadConversations = 1
    apiMock.mockResolvedValue(page([]))
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: 'Solicitudes de vinculación, 1 conversación con mensajes sin leer' })).toHaveAttribute('href', '/institution/linkage-requests')
    expect(summaries().every((path) => path === '/api/institution/linkage-requests/unread-summary')).toBe(true)
  })

  it('no muestra nada sin conversaciones pendientes', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: 'Solicitudes de vinculación' })).toBeInTheDocument()
    await waitFor(() => expect(summaries()).toHaveLength(1))
    expect(document.querySelector('.unread-badge')).toBeNull()
  })

  describe('actualización', () => {
    function renderBadge() {
      const auth: AuthState = {
        status: 'ready', user: companyUser as User, message: null, pending: false,
        restore: async () => undefined, expireSession: () => undefined, signIn: async () => undefined, signOut: async () => undefined, updateUser: () => undefined,
      }
      // T-S13-08: el contador lee la consulta única del proveedor montado en el shell con sesión.
      return render(
        <MemoryRouter initialEntries={['/']}>
          <AuthContext.Provider value={auth}>
            <UnreadSummaryProvider>
              <Link to="/linkage-requests">Solicitudes de vinculación<UnreadBadge side="COMPANY" /></Link>
              <UnreadBadge side="COMPANY" />
              <Link to="/talent">Otra vista</Link>
            </UnreadSummaryProvider>
          </AuthContext.Provider>
        </MemoryRouter>,
      )
    }
    const badge = () => screen.getByRole('link', { name: /^Solicitudes de vinculación/ })

    beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }) })

    it('consulta una sola vez para varios contadores, cada 60 s aun con la pestaña oculta, y enseguida al volver', async () => {
      renderBadge()
      await waitFor(() => expect(summaries()).toHaveLength(1))

      unreadConversations = 2
      await act(async () => { vi.advanceTimersByTime(UNREAD_POLL_INTERVAL_MS) })
      await waitFor(() => expect(badge()).toHaveAccessibleName('Solicitudes de vinculación, 2 conversaciones con mensajes sin leer'))

      // T-S13-08: con la pestaña oculta sigue consultando, porque es cuando sirve el aviso del navegador.
      hidden = true
      act(() => { document.dispatchEvent(new Event('visibilitychange')) })
      await act(async () => { vi.advanceTimersByTime(UNREAD_POLL_INTERVAL_MS * 3) })
      expect(summaries()).toHaveLength(5)

      unreadConversations = 0
      hidden = false
      act(() => { document.dispatchEvent(new Event('visibilitychange')) })
      await waitFor(() => expect(badge()).toHaveAccessibleName('Solicitudes de vinculación'))
      expect(summaries()).toHaveLength(6)
    })

    it('se actualiza al navegar y en cuanto una conversación se marca como leída', async () => {
      unreadConversations = 1
      renderBadge()
      await waitFor(() => expect(badge()).toHaveAccessibleName('Solicitudes de vinculación, 1 conversación con mensajes sin leer'))

      unreadConversations = 0
      act(() => { window.dispatchEvent(new Event(LINKAGE_READ_EVENT)) })
      await waitFor(() => expect(badge()).toHaveAccessibleName('Solicitudes de vinculación'))

      unreadConversations = 4
      fireEvent.click(screen.getByRole('link', { name: 'Otra vista' }))
      await waitFor(() => expect(badge()).toHaveAccessibleName('Solicitudes de vinculación, 4 conversaciones con mensajes sin leer'))
    })

    it('abrevia más de 99 conversaciones', async () => {
      unreadConversations = 120
      renderBadge()
      await waitFor(() => expect(screen.getAllByText('99+')).toHaveLength(2))
    })
  })
})

describe('bandejas (CA-04)', () => {
  it('muestra en la fila cuántos mensajes sin leer hay, junto al correo, y filtra por ellos en la URL (T-S13-08)', async () => {
    apiMock.mockResolvedValueOnce(page([sent(1, 'Con mensajes', 2), sent(2, 'Al día', 0)]))
      .mockResolvedValueOnce(page([sent(1, 'Con mensajes', 2)]))
      .mockResolvedValueOnce(page([]))
    render(<MemoryRouter initialEntries={['/linkage-requests']}><App /><Location /></MemoryRouter>)
    const table = await screen.findByRole('table', { name: 'Solicitudes de vinculación enviadas' })
    const withMessages = within(table).getByRole('row', { name: /Con mensajes/ })
    const chat = within(withMessages).getByRole('link', { name: 'Abrir la conversación con UT del Golfo: 2 mensajes sin leer' })
    expect(chat).toHaveClass('has-unread')
    expect(chat).toHaveAttribute('title', '2 mensajes sin leer')
    expect(chat).toHaveTextContent('2')
    // El chat es la primera vía de contacto, junto al correo de la institución.
    expect(chat.parentElement).toHaveClass('cell-actions')
    expect(chat.nextElementSibling).toHaveAccessibleName(/dual@utgolfo\.edu\.mx/)
    expect(withMessages).toHaveClass('has-unread')
    expect(within(withMessages).queryByText('Nuevo')).not.toBeInTheDocument()
    const quiet = within(table).getByRole('row', { name: /Al día/ })
    expect(quiet).not.toHaveClass('has-unread')
    expect(within(quiet).getByRole('link', { name: 'Abrir la conversación con UT del Golfo' })).not.toHaveClass('has-unread')

    // T-S13-09: la casilla pasó a ser la opción del filtro de interacción.
    fireEvent.change(screen.getByLabelText('Interacción'), { target: { value: 'unread' } })
    await waitFor(() => expect(screen.getByRole('status', { name: 'Ruta actual' })).toHaveTextContent('/linkage-requests?interaction=unread'))
    await waitFor(() => expect(apiMock.mock.calls[1][0]).toBe('/api/linkage-requests?page=1&interaction=unread'))
    expect(await screen.findByRole('row', { name: /Con mensajes/ })).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Al día/ })).not.toBeInTheDocument()

    // Con el estado: los dos filtros se combinan; sin resultados, el vacío lo explica.
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'CANCELADA' } })
    expect(await screen.findByText('Ninguna solicitud coincide con la búsqueda o los filtros.')).toBeInTheDocument()
    expect(apiMock.mock.calls[2][0]).toBe('/api/linkage-requests?page=1&status=CANCELADA&interaction=unread')
  })

  it('traduce una URL antigua con unread=1 al filtro de interacción en la bandeja de la institución y marca sus filas', async () => {
    user = institutionUser
    apiMock.mockResolvedValueOnce(page([received(5, 'Uno', 1)]))
    render(<MemoryRouter initialEntries={['/institution/linkage-requests?unread=1']}><App /><Location /></MemoryRouter>)
    const table = await screen.findByRole('table', { name: 'Solicitudes de vinculación recibidas' })
    expect(apiMock.mock.calls[0][0]).toBe('/api/institution/linkage-requests?page=1&interaction=unread')
    expect(screen.getByLabelText('Interacción')).toHaveValue('unread')
    await waitFor(() => expect(screen.getByRole('status', { name: 'Ruta actual' })).toHaveTextContent('/institution/linkage-requests?interaction=unread'))
    expect(within(table).getByRole('link', { name: 'Abrir la conversación con ManuGolfo sobre García Uno, Ana: 1 mensaje sin leer' })).toHaveTextContent('1')
    expect(within(table).getByRole('row', { name: /García Uno/ })).toHaveClass('has-unread')

    apiMock.mockResolvedValueOnce(page([received(5, 'Uno', 1)]))
    fireEvent.change(screen.getByLabelText('Interacción'), { target: { value: 'all' } })
    await waitFor(() => expect(apiMock.mock.calls[1][0]).toBe('/api/institution/linkage-requests?page=1'))
  })
})
