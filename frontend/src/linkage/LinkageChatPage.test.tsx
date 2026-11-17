import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

// HU-S13-06: vista dedicada a la conversación, que empieza con el mensaje de la solicitud.
const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const companyUser = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo' } }
const institutionUser = { id: 4, name: 'Coordinación dual', email: 'dual@utgolfo.edu.mx', role: 'INSTITUTION', institution: { id: 2, name: 'UT del Golfo' }, company: null }
const sent = {
  id: 41, status: 'ACEPTADA', created_at: '2026-10-28T10:00:00Z', message: 'Nos interesa su perfil para tableros.',
  opportunity: { id: 12, title: 'Tableros de producción' },
  profile: { public_id: '3f2c1b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f', headline: 'Analista de datos', program: 'Ingeniería en Datos', period_type: 'semester', period_number: 6 },
  institution: { name: 'UT del Golfo', contact_name: null, contact_position: null, contact_email: 'dual@utgolfo.edu.mx', contact_phone: null },
  responded_at: '2026-10-29T16:00:00Z', response_message: 'Coordinemos la entrevista.', unread_count: 0,
}
const received = {
  id: 41, status: 'PENDIENTE_INSTITUCION', created_at: '2026-10-28T10:00:00Z', message: 'Nos interesa su perfil para tableros.',
  company: {
    name: 'ManuGolfo', municipality: 'Victoria', legal_name: 'Manufacturas del Golfo, S.A. de C.V.', trade_name: 'ManuGolfo',
    sector_code: '54', state_code: '28', contact_name: 'Laura Méndez', contact_position: null, contact_email: 'rh@manugolfo.mx', contact_phone: null,
  },
  opportunity: {
    id: 12, title: 'Tableros de producción', program: 'Ingeniería en Datos', vacancies: 2, period_type: 'semester', period_number: 5,
    can_relocate: false, state_code: '28', municipality: 'Victoria', description: 'Actividades.', skills: [], language_code: null, min_level: null, is_active: true,
  },
  student: {
    id: 7, enrollment_number: 'MAT-0001', given_names: 'Ana Sofía', first_surname: 'García', second_surname: 'López', is_active: true,
    program: 'Ingeniería en Datos', period_type: 'semester', period_number: 6, dual_available: true, state_code: '28', municipality: 'Victoria',
    can_relocate: false, social_security: { insurance_type: 'IMSS', insurer_name: null, has_number: true, has_document: true },
  },
  responded_at: null, response_message: null, responded_by: null,
}
const thread = [{ id: 5, sender_party: 'INSTITUTION', sender_name: 'UT del Golfo', is_own: false, account_name: null, body: '¿Puede iniciar el lunes?', created_at: '2026-10-30T09:00:00Z' }]
const messagePaths = () => fetchMock.mock.calls.map(([path]) => String(path)).filter((path) => path.includes('/messages'))

function Location() {
  const location = useLocation()
  return <output aria-label="Ruta actual">{location.pathname + location.search}</output>
}

beforeEach(() => {
  user = companyUser
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    const url = String(path)
    if (url === '/api/me') return Response.json({ user })
    if (url.endsWith('/unread-summary')) return Response.json({ data: { conversations: 0 } })
    if (url === '/api/dashboard' || url.startsWith('/api/promotional-videos')) return new Promise<Response>(() => undefined)
    if (url === '/sanctum/csrf-cookie') return new Response(null, { status: 204 })
    if (url.endsWith('/read')) return Response.json({ data: { last_read_message_id: 5 } })
    if (url.includes('/messages')) return Response.json({ data: thread, meta: { has_more: false, can_write: true, last_read_message_id: 5 } })
    return apiMock(url, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('vista de la conversación de la empresa', () => {
  it('encabeza con la institución, la oportunidad y el estado, y empieza con el mensaje de la solicitud (CA-01, CA-02)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: sent }))
    render(<MemoryRouter initialEntries={['/linkage-requests/41/chat']}><App /></MemoryRouter>)
    const page = await screen.findByRole('region', { name: 'Conversación con UT del Golfo' })
    expect(apiMock.mock.calls[0][0]).toBe('/api/linkage-requests/41')
    expect(page).toHaveTextContent('Tableros de producción')
    expect(within(page).getByText('Aceptada', { selector: '.linkage-status' })).toBeInTheDocument()
    expect(within(page).getByRole('link', { name: /Ver detalle/ })).toHaveAttribute('href', '/linkage-requests/41')
    expect(within(page).getByRole('note', { name: 'Aviso de privacidad' })).toHaveTextContent('No compartas datos personales del alumno por este medio.')

    const log = await within(page).findByRole('log', { name: 'Mensajes' })
    await within(log).findByText('¿Puede iniciar el lunes?')
    const bubbles = within(log).getAllByRole('listitem')
    expect(bubbles).toHaveLength(3)
    expect(bubbles[0]).toHaveTextContent('Mensaje de la solicitud')
    expect(bubbles[0]).toHaveTextContent('ManuGolfo')
    expect(bubbles[0]).toHaveTextContent('Nos interesa su perfil para tableros.')
    expect(bubbles[0]).toHaveClass('own')
    expect(bubbles[1]).toHaveTextContent('Coordinemos la entrevista.')
    expect(bubbles[1]).toHaveClass('other')
    expect(within(page).getByLabelText('Mensaje para la institución')).toBeEnabled()
    expect(messagePaths()[0]).toBe('/api/linkage-requests/41/messages')
  })

  it('en una pendiente muestra solo el mensaje de la solicitud, sin consultar el hilo ni permitir escribir (CA-03)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...sent, status: 'PENDIENTE_INSTITUCION', responded_at: null, response_message: null } }))
    render(<MemoryRouter initialEntries={['/linkage-requests/41/chat']}><App /></MemoryRouter>)
    const log = await screen.findByRole('log', { name: 'Mensajes' })
    expect(within(log).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('La conversación se habilita cuando la institución acepte la solicitud.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(messagePaths()).toEqual([])
  })

  it('regresa a la bandeja con sus filtros cuando se abre desde ella, y a la bandeja completa sin regreso (CA-01, CA-04)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: [sent], meta: { current_page: 1, last_page: 1, total: 1, per_page: 20 } }))
      .mockResolvedValueOnce(Response.json({ data: sent }))
      .mockResolvedValue(Response.json({ data: [sent], meta: { current_page: 1, last_page: 1, total: 1, per_page: 20 } }))
    render(<MemoryRouter initialEntries={['/linkage-requests?status=ACEPTADA']}><App /><Location /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('link', { name: 'Abrir la conversación con UT del Golfo' }))
    const back = await screen.findByRole('link', { name: 'Volver a solicitudes' })
    expect(back).toHaveAttribute('href', '/linkage-requests?status=ACEPTADA')
    fireEvent.click(back)
    await waitFor(() => expect(screen.getByRole('status', { name: 'Ruta actual' })).toHaveTextContent('/linkage-requests?status=ACEPTADA'))
  })

  it('sin regreso contextual vuelve a la bandeja completa', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: sent }))
    render(<MemoryRouter initialEntries={['/linkage-requests/41/chat']}><App /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: 'Volver a solicitudes' })).toHaveAttribute('href', '/linkage-requests')
  })

  it('responde igual a una solicitud ajena o inexistente', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ message: 'La solicitud no existe.' }, { status: 404 }))
    render(<MemoryRouter initialEntries={['/linkage-requests/999/chat']}><App /></MemoryRouter>)
    expect(await screen.findByText('No encontramos esta solicitud')).toBeInTheDocument()
    expect(messagePaths()).toEqual([])
  })

  it('no la abre una cuenta de otro rol', async () => {
    user = institutionUser
    render(<MemoryRouter initialEntries={['/linkage-requests/41/chat']}><App /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para consultar solicitudes de vinculación.')
    expect(apiMock).not.toHaveBeenCalled()
  })
})

describe('vista de la conversación de la institución', () => {
  it('en una pendiente muestra el mensaje de la empresa como ajeno y ofrece responder la solicitud (CA-01, CA-03)', async () => {
    user = institutionUser
    apiMock.mockResolvedValueOnce(Response.json({ data: received }))
    render(<MemoryRouter initialEntries={['/institution/linkage-requests/41/chat']}><App /></MemoryRouter>)
    const page = await screen.findByRole('region', { name: 'Conversación con ManuGolfo' })
    expect(apiMock.mock.calls[0][0]).toBe('/api/institution/linkage-requests/41')
    const bubbles = within(await within(page).findByRole('log', { name: 'Mensajes' })).getAllByRole('listitem')
    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]).toHaveClass('other')
    expect(bubbles[0]).toHaveTextContent('ManuGolfo')
    expect(within(page).getByText('La conversación se habilita cuando aceptes la solicitud.')).toBeInTheDocument()
    expect(within(page).getByRole('link', { name: /Responder solicitud/ })).toHaveAttribute('href', '/institution/linkage-requests/41')
    expect(within(page).getByRole('link', { name: 'Volver a solicitudes' })).toHaveAttribute('href', '/institution/linkage-requests')
    expect(messagePaths()).toEqual([])
  })

  it('en una aceptada consulta el hilo por la ruta de la institución y permite escribir', async () => {
    user = institutionUser
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...received, status: 'ACEPTADA', responded_at: '2026-10-29T16:00:00Z', response_message: 'Coordinemos.', responded_by: { name: 'Coordinación dual' } } }))
    render(<MemoryRouter initialEntries={['/institution/linkage-requests/41/chat']}><App /></MemoryRouter>)
    expect(await screen.findByLabelText('Mensaje para la empresa')).toBeEnabled()
    const bubbles = within(screen.getByRole('log', { name: 'Mensajes' })).getAllByRole('listitem')
    // La respuesta de la institución es propia y nombra a su organización.
    expect(bubbles[1]).toHaveClass('own')
    expect(bubbles[1]).toHaveTextContent('UT del Golfo')
    expect(messagePaths()[0]).toBe('/api/institution/linkage-requests/41/messages')
  })
})
