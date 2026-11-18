import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { lastMessageLabel } from './inboxFilters'
import { UNREAD_POLL_INTERVAL_MS } from './useUnreadConversations'

// T-S13-09: búsqueda, interacción y orden de las bandejas, sincronizados con la URL.
const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
let summary: { conversations: number; items: unknown[] }
const companyUser = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo' } }
const institutionUser = { id: 2, name: 'Coordinación', email: 'dual@ut.test', role: 'INSTITUTION', institution: { id: 1, name: 'UT del Golfo' }, company: null }
const sent = {
  id: 41, status: 'ACEPTADA', created_at: '2026-10-28T10:00:00Z', message: null, opportunity: { id: 12, title: 'Tableros de producción' },
  profile: { public_id: '3f2c1b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f', headline: 'Analista de datos', program: 'Ingeniería', period_type: 'semester', period_number: 6 },
  institution: { name: 'UT del Golfo', contact_name: null, contact_position: null, contact_email: 'dual@utgolfo.edu.mx', contact_phone: null },
  responded_at: '2026-10-29T16:00:00Z', response_message: null, unread_count: 0, last_message_at: '2026-11-15T16:42:00Z',
}
const received = {
  id: 5, status: 'ACEPTADA', created_at: '2026-10-28T10:00:00Z', company: { name: 'ManuGolfo', municipality: 'Victoria' },
  opportunity: { id: 12, title: 'Tableros de producción', program: 'Ingeniería en Datos', vacancies: 2 },
  student: { id: 7, enrollment_number: 'MAT-1', given_names: 'Ana', first_surname: 'García', second_surname: null, is_active: true, program: null, period_type: null, period_number: null },
  unread_count: 0, last_message_at: null,
}
const page = (items: unknown[]) => Response.json({ data: items, meta: { current_page: 1, last_page: 1, total: items.length, per_page: 20 } })
const listCalls = () => apiMock.mock.calls.map(([path]) => String(path))
const narrowMatchMedia = (query: string) => ({
  matches: /max-width|prefers-reduced-motion/.test(query), media: query, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})

function Location() {
  const location = useLocation()
  const state: unknown = location.state
  const back = typeof state === 'object' && state !== null && 'back' in state ? JSON.stringify(state.back) : ''
  return <output aria-label="Ruta actual" data-back={back}>{location.pathname + location.search}</output>
}
const route = () => screen.getByRole('status', { name: 'Ruta actual' })

beforeEach(() => {
  user = companyUser
  summary = { conversations: 0, items: [] }
  apiMock.mockReset()
  apiMock.mockImplementation(async () => page([sent]))
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me') return Response.json({ user })
    if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: summary })
    if (path === '/api/dashboard' || (typeof path === 'string' && path.startsWith('/api/promotional-videos'))) return new Promise<Response>(() => undefined)
    return apiMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('barra de la bandeja de la empresa', () => {
  it('busca al enviar, filtra y ordena en la URL, y vuelve a la página 1', async () => {
    render(<MemoryRouter initialEntries={['/linkage-requests?page=3']}><App /><Location /></MemoryRouter>)
    await screen.findByRole('table', { name: 'Solicitudes de vinculación enviadas' })
    expect(listCalls()[0]).toBe('/api/linkage-requests?page=3')
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Buscar por institución, oportunidad o perfil'), { target: { value: '  Tecnológica  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(route()).toHaveTextContent('/linkage-requests?q=Tecnol%C3%B3gica'))
    fireEvent.change(screen.getByLabelText('Interacción'), { target: { value: 'conversation' } })
    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'created_asc' } })
    await waitFor(() => expect(listCalls().at(-1)).toBe('/api/linkage-requests?page=1&q=Tecnol%C3%B3gica&interaction=conversation&sort=created_asc'))

    // El orden por actividad es el predeterminado y no viaja.
    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'activity' } })
    await waitFor(() => expect(route()).not.toHaveTextContent('sort='))
    fireEvent.click(await screen.findByRole('button', { name: 'Limpiar filtros' }))
    await waitFor(() => expect(route()).toHaveTextContent(/^\/linkage-requests$/))
    expect(screen.getByLabelText('Buscar por institución, oportunidad o perfil')).toHaveValue('')
  })

  it('al vaciar el campo de búsqueda quita la búsqueda de la URL sin tener que enviarla', async () => {
    render(<MemoryRouter initialEntries={['/linkage-requests?q=golfo&status=ACEPTADA']}><App /><Location /></MemoryRouter>)
    const field = await screen.findByLabelText('Buscar por institución, oportunidad o perfil')
    expect(field).toHaveValue('golfo')
    expect(listCalls()[0]).toBe('/api/linkage-requests?page=1&status=ACEPTADA&q=golfo')
    fireEvent.change(field, { target: { value: '' } })
    await waitFor(() => expect(route()).toHaveTextContent(/^\/linkage-requests\?status=ACEPTADA$/))
  })

  it('el chat y el detalle regresan a la bandeja con la misma búsqueda, filtros y orden', async () => {
    render(<MemoryRouter initialEntries={['/linkage-requests?q=golfo&interaction=conversation&sort=created_desc']}><App /><Location /></MemoryRouter>)
    const table = await screen.findByRole('table', { name: 'Solicitudes de vinculación enviadas' })
    apiMock.mockImplementation(() => new Promise<Response>(() => undefined))
    fireEvent.click(within(table).getByRole('link', { name: 'Abrir la conversación con UT del Golfo' }))
    await waitFor(() => expect(route()).toHaveTextContent('/linkage-requests/41/chat'))
    expect(JSON.parse(route().dataset.back ?? '')).toEqual({
      to: '/linkage-requests?q=golfo&interaction=conversation&sort=created_desc', label: 'Volver a solicitudes',
    })
  })

  it('explica con el último mensaje por qué la fila está arriba, y sin coincidencias ofrece limpiar los filtros', async () => {
    render(<MemoryRouter initialEntries={['/linkage-requests']}><App /></MemoryRouter>)
    const row = within(await screen.findByRole('table', { name: 'Solicitudes de vinculación enviadas' })).getByRole('row', { name: /Analista de datos/ })
    expect(row).toHaveTextContent(lastMessageLabel(sent.last_message_at) ?? '')

    apiMock.mockImplementation(async () => page([]))
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'RECHAZADA' } })
    expect(await screen.findByText('Ninguna solicitud coincide con la búsqueda o los filtros.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Limpiar filtros' }).length).toBeGreaterThan(0)
  })

  it('a 390 px deja el buscador visible y lleva los demás controles a una hoja con su contador', async () => {
    vi.stubGlobal('matchMedia', narrowMatchMedia)
    render(<MemoryRouter initialEntries={['/linkage-requests?interaction=unread']}><App /><Location /></MemoryRouter>)
    await screen.findByRole('table', { name: 'Solicitudes de vinculación enviadas' })
    expect(screen.getByLabelText('Buscar por institución, oportunidad o perfil')).toBeVisible()
    // Los selectores esperan en la hoja cerrada: no empujan la tabla.
    expect(screen.getByLabelText('Interacción')).not.toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Filtros (1)' }))
    const sheet = await screen.findByRole('dialog', { name: 'Filtros' })
    expect(within(sheet).getByLabelText('Interacción')).toHaveValue('unread')
    fireEvent.change(within(sheet).getByLabelText('Ordenar por'), { target: { value: 'created_desc' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Filtros (2)' })).toBeInTheDocument())
    fireEvent.click(within(sheet).getByRole('button', { name: 'Limpiar filtros' }))
    await waitFor(() => expect(route()).toHaveTextContent(/^\/linkage-requests$/))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Ver resultados' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filtros' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeInTheDocument()
  })
})

describe('recarga sin saltos (T-S13-13)', () => {
  it('al filtrar, la tabla anterior se queda atenuada y ocupada hasta que llega la nueva, que entra con su animación', async () => {
    render(<MemoryRouter initialEntries={['/linkage-requests']}><App /></MemoryRouter>)
    const table = await screen.findByRole('table', { name: 'Solicitudes de vinculación enviadas' })
    const firstBody = table.querySelector('tbody')!
    expect(firstBody).toHaveClass('rows-enter')
    let respond: (value: Response) => void = () => undefined
    apiMock.mockImplementation(() => new Promise<Response>((resolve) => { respond = resolve }))

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'ACEPTADA' } })
    const region = await screen.findByRole('region', { name: 'Listado de solicitudes' })
    await waitFor(() => expect(region).toHaveAttribute('aria-busy', 'true'))
    expect(screen.getByRole('table', { name: 'Solicitudes de vinculación enviadas' })).toBe(table)
    expect(region.closest('.table-card')).toHaveClass('is-refreshing')
    expect(screen.getByText('Actualizando resultados…')).toBeInTheDocument()
    expect(screen.queryByText('Cargando solicitudes…')).not.toBeInTheDocument()

    await act(async () => { respond(page([{ ...sent, id: 77 }])) })
    await waitFor(() => expect(region).toHaveAttribute('aria-busy', 'false'))
    // El resultado nuevo monta sus filas otra vez para que entren con su animación escalonada.
    expect(table.querySelector('tbody')).not.toBe(firstBody)
    expect(table.querySelector('tbody tr')).toHaveStyle({ '--row-index': '0' })
  })
})

describe('bandeja en vivo (T-S13-10)', () => {
  it('al llegar un mensaje nuevo, la fila muestra su contador sin recargar la página ni mostrar la carga', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      render(<MemoryRouter initialEntries={['/linkage-requests?status=ACEPTADA']}><App /></MemoryRouter>)
      const table = await screen.findByRole('table', { name: 'Solicitudes de vinculación enviadas' })
      expect(within(table).getByRole('link', { name: 'Abrir la conversación con UT del Golfo' })).not.toHaveClass('has-unread')
      const before = listCalls().length
      // La primera respuesta del resumen es la línea base: se espera a que llegue antes de cambiarlo.
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })

      summary = { conversations: 1, items: [{ id: 41, counterpart_name: 'UT del Golfo', opportunity_title: 'Tableros de producción', unread_count: 2, last_message_id: 9 }] }
      apiMock.mockImplementation(async () => page([{ ...sent, unread_count: 2 }]))
      await act(async () => { vi.advanceTimersByTime(UNREAD_POLL_INTERVAL_MS) })
      expect(await within(table).findByRole('link', { name: 'Abrir la conversación con UT del Golfo: 2 mensajes sin leer' })).toHaveClass('has-unread')
      // T-S13-13: la fila cuyo contador subió pulsa una vez.
      expect(within(table).getByRole('row', { name: /Analista de datos/ })).toHaveClass('row-updated')
      // Se pide de nuevo con la misma vista, sin el indicador de carga.
      expect(listCalls().slice(before)).toEqual(['/api/linkage-requests?page=1&status=ACEPTADA'])
      expect(screen.queryByText('Cargando solicitudes…')).not.toBeInTheDocument()

      // Sin novedades no vuelve a pedir la tabla.
      await act(async () => { vi.advanceTimersByTime(UNREAD_POLL_INTERVAL_MS) })
      expect(listCalls().slice(before)).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('barra de la bandeja de la institución', () => {
  it('busca por alumno o matrícula y descarga el CSV con los mismos filtros', async () => {
    user = institutionUser
    apiMock.mockImplementation(async () => page([received]))
    render(<MemoryRouter initialEntries={['/institution/linkage-requests?q=MAT-1&sort=created_asc']}><App /></MemoryRouter>)
    await screen.findByRole('table', { name: 'Solicitudes de vinculación recibidas' })
    expect(listCalls()[0]).toBe('/api/institution/linkage-requests?page=1&q=MAT-1&sort=created_asc')
    expect(screen.getByLabelText('Buscar por empresa, oportunidad, alumno o matrícula')).toHaveValue('MAT-1')

    apiMock.mockImplementation(() => new Promise<Response>(() => undefined))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Descargar CSV/ })) })
    await waitFor(() => expect(listCalls()).toContain('/api/institution/linkage-requests/export.csv?q=MAT-1&sort=created_asc'))
  })
})

describe('última actividad', () => {
  it('nombra hoy y ayer con la hora, y los demás días por su fecha', () => {
    const now = new Date(2026, 10, 18, 12, 0)
    expect(lastMessageLabel(new Date(2026, 10, 18, 10, 42).toISOString(), now)).toMatch(/^Último mensaje: hoy, 10:42/)
    expect(lastMessageLabel(new Date(2026, 10, 17, 18, 5).toISOString(), now)).toMatch(/^Último mensaje: ayer, 6:05/)
    expect(lastMessageLabel(new Date(2026, 10, 12, 9, 0).toISOString(), now)).toBe('Último mensaje: 12 nov')
    expect(lastMessageLabel(null, now)).toBeNull()
  })
})
