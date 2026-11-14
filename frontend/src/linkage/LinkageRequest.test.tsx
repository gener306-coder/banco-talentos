import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { OPPORTUNITY_CONTACT_MESSAGE } from '../opportunities/OpportunityForm'
import { createLinkageRequest } from './api'

const fetchMock = vi.fn<typeof fetch>()
const linkageMock = vi.fn<typeof fetch>()
// Solicitudes ya enviadas para el perfil (HU-S5-05 CA-04).
const sentMock = vi.fn<typeof fetch>()
const sentPage = (items: unknown[]) => Response.json({ data: items, meta: { current_page: 1, last_page: 1, total: items.length, per_page: 20 } })
let options: unknown[]
const user = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo' } }
const publicId = '3f2c1b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f'
const profile = {
  public_id: publicId, headline: 'Analista de datos', program: 'Ingeniería', period_type: 'semester', period_number: 6,
  institution: 'UT del Golfo', state_code: '28', municipality: 'Matamoros', distance_km: 80,
  skills: [{ name: 'Python', kind: 'technical' }], languages: [], verified_certifications: 0, dual_available: true, can_relocate: false,
  certifications: [], projects: [],
}
const created = {
  id: 41, status: 'PENDIENTE_INSTITUCION', student_public_id: publicId, opportunity: { id: 12, title: 'Automatización de línea' },
  message: 'Nos interesa su perfil.', created_at: '2026-10-28T10:00:00Z',
}

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}
const posts = () => linkageMock.mock.calls.filter(([, init]) => init?.method === 'POST')

beforeEach(() => {
  options = [{ id: 12, title: 'Automatización de línea', program: 'Mecatrónica', municipality: 'Reynosa' }, { id: 13, title: 'Calidad', program: 'Industrial', municipality: null }]
  linkageMock.mockReset()
  sentMock.mockReset()
  sentMock.mockImplementation(async () => sentPage([]))
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me') return Response.json({ user })
    if (path === '/api/dashboard') return new Promise<Response>(() => undefined)
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    if (path === `/api/talent/${publicId}`) return Response.json({ data: profile })
    if (path === '/api/opportunities/options') return Response.json({ data: options })
    if (typeof path === 'string' && path.startsWith('/api/linkage-requests?')) return sentMock(path, init)
    return linkageMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function openSheet() {
  render(<MemoryRouter initialEntries={[`/talent/${publicId}`]}><App /><Location /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Solicitar vinculación' }))
  return screen.findByRole('dialog', { name: 'Solicitar vinculación' })
}

describe('solicitud de vinculación HU-S5-04', () => {
  it('consulta las oportunidades con el perfil para decidir si ofrece la acción (T-S12-07)', async () => {
    render(<MemoryRouter initialEntries={[`/talent/${publicId}`]}><App /></MemoryRouter>)
    await screen.findByRole('button', { name: 'Solicitar vinculación' })
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/opportunities/options')).toBe(true)
  })

  it('elige una oportunidad activa, envía la solicitud directa y confirma (CA-02, CA-04, CA-06)', async () => {
    linkageMock.mockResolvedValueOnce(Response.json({ data: created }, { status: 201 }))
    const sheet = await openSheet()
    expect(within(sheet).getByText(/llega directamente a la institución del alumno/)).toBeInTheDocument()
    const select = await within(sheet).findByLabelText('Oportunidad')
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['Selecciona…', 'Automatización de línea · Reynosa', 'Calidad'])
    fireEvent.change(select, { target: { value: '12' } })
    fireEvent.change(within(sheet).getByLabelText('Mensaje para la institución (opcional)'), { target: { value: '  Nos interesa su perfil. ' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar solicitud' }))

    expect(await within(sheet).findByRole('status')).toHaveTextContent('Solicitud enviada a la institución del alumno para Automatización de línea. Queda pendiente de su respuesta.')
    expect(posts()[0][0]).toBe('/api/linkage-requests')
    expect(JSON.parse(posts()[0][1]?.body as string)).toEqual({ student_public_id: publicId, opportunity_id: 12, message: 'Nos interesa su perfil.' })
    expect(select).toHaveValue('')
    expect(within(sheet).getByLabelText('Mensaje para la institución (opcional)')).toHaveValue('')
  })

  it('sin oportunidades activas ofrece registrar una (CA-06)', async () => {
    options = []
    const sheet = await openSheet()
    expect(await within(sheet).findByText(/aún no tiene oportunidades activas/)).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'Registrar una oportunidad' })).toHaveAttribute('href', '/opportunities/new')
    expect(within(sheet).queryByRole('button', { name: 'Enviar solicitud' })).not.toBeInTheDocument()
  })

  it('valida en línea y no envía con errores (CA-02)', async () => {
    const sheet = await openSheet()
    const message = await within(sheet).findByLabelText('Mensaje para la institución (opcional)')
    fireEvent.change(message, { target: { value: 'Escríbenos a rh@manugolfo.mx' } })
    fireEvent.blur(message)
    expect(message).toHaveAccessibleDescription(new RegExp(OPPORTUNITY_CONTACT_MESSAGE.slice(0, 30)))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar solicitud' }))
    expect(within(sheet).getByLabelText('Oportunidad')).toHaveAccessibleDescription('Elige una de tus oportunidades activas.')
    expect(posts()).toHaveLength(0)
  })

  it('muestra junto a la oportunidad el rechazo del servidor por duplicada o inactiva (CA-03)', async () => {
    linkageMock.mockResolvedValueOnce(Response.json({ message: 'Invalid', errors: {
      opportunity_id: ['Ya enviaste una solicitud para este perfil en esa oportunidad.'],
    } }, { status: 422 }))
    const sheet = await openSheet()
    fireEvent.change(await within(sheet).findByLabelText('Oportunidad'), { target: { value: '12' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar solicitud' }))
    await waitFor(() => expect(within(sheet).getByLabelText('Oportunidad')).toHaveAccessibleDescription('Ya enviaste una solicitud para este perfil en esa oportunidad.'))
  })

  it('informa que el perfil ya no está disponible (CA-03)', async () => {
    linkageMock.mockResolvedValueOnce(Response.json({ message: 'El perfil no existe.' }, { status: 404 }))
    const sheet = await openSheet()
    fireEvent.change(await within(sheet).findByLabelText('Oportunidad'), { target: { value: '13' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar solicitud' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('El perfil no existe.')
  })

  it('el cliente conserva solo los campos del contrato (CA-05)', async () => {
    document.cookie = 'XSRF-TOKEN=csrf; Path=/'
    linkageMock.mockResolvedValueOnce(Response.json({ data: { ...created, student_id: 7, institution_id: 2 } }, { status: 201 }))
    const result = await createLinkageRequest({ student_public_id: publicId, opportunity_id: 12, message: null })
    expect(result).not.toHaveProperty('student_id')
    expect(result).not.toHaveProperty('institution_id')
    expect(result.student_public_id).toBe(publicId)
  })

  it('avisa de las solicitudes ya enviadas para el perfil y lo actualiza tras enviar otra (HU-S5-05 CA-04)', async () => {
    const sentItem = (id: number, title: string, status: string) => ({
      id, status, created_at: '2026-10-28T10:00:00Z', message: null, opportunity: { id, title },
      profile: { public_id: publicId, headline: 'Analista de datos', program: 'Ingeniería', period_type: 'semester', period_number: 6 },
      institution: { name: 'UT del Golfo', contact_name: 'Laura Méndez', contact_position: 'Coordinación Dual', contact_email: 'dual@utgolfo.edu.mx', contact_phone: '+52 833 357 4800' }, responded_at: null, response_message: null,
    })
    // Las solicitudes previas cambian solo después de enviar (el perfil también las vuelve a consultar al abrir la hoja).
    sentMock.mockImplementation(async () => sentPage(posts().length
      ? [sentItem(12, 'Automatización de línea', 'PENDIENTE_INSTITUCION'), sentItem(13, 'Calidad', 'CANCELADA')]
      : [sentItem(13, 'Calidad', 'CANCELADA')]))
    linkageMock.mockResolvedValueOnce(Response.json({ data: created }, { status: 201 }))
    const sheet = await openSheet()
    const notice = screen.getByRole('note', { name: 'Solicitudes enviadas para este perfil' })
    // T-S12-04: el título va en negritas, sin comillas, en un aviso informativo.
    expect(notice).toHaveClass('callout', 'info')
    expect(within(notice).getByText('Calidad', { selector: 'strong' })).toBeInTheDocument()
    expect(within(notice).getByText('Cancelada')).toBeInTheDocument()
    expect(within(notice).getByRole('link', { name: 'Ver tus solicitudes' })).toHaveAttribute('href', '/linkage-requests')
    expect(sentMock.mock.calls[0][0]).toBe(`/api/linkage-requests?page=1&public_id=${publicId}`)

    fireEvent.change(await within(sheet).findByLabelText('Oportunidad'), { target: { value: '12' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar solicitud' }))
    await within(sheet).findByRole('status')
    expect(await within(notice).findByText('Automatización de línea', { selector: 'li strong' })).toBeInTheDocument()
  })

  it('no muestra aviso si la empresa no ha solicitado el perfil', async () => {
    await openSheet()
    await waitFor(() => expect(sentMock).toHaveBeenCalled())
    expect(screen.queryByRole('note', { name: 'Solicitudes enviadas para este perfil' })).not.toBeInTheDocument()
  })
})

describe('solicitar vinculación según las solicitudes previas (T-S12-07)', () => {
  const sentTo = (opportunityId: number, title: string, status: string) => ({
    id: 100 + opportunityId, status, created_at: '2026-10-28T10:00:00Z', message: null, opportunity: { id: opportunityId, title },
    profile: { public_id: publicId, headline: 'Analista de datos', program: 'Ingeniería', period_type: 'semester', period_number: 6 },
    institution: { name: 'UT del Golfo', contact_name: null, contact_position: null, contact_email: 'dual@utgolfo.edu.mx', contact_phone: null },
    responded_at: null, response_message: null,
  })
  const renderProfile = () => render(<MemoryRouter initialEntries={[`/talent/${publicId}`]}><App /></MemoryRouter>)

  it('deshabilita con su motivo las oportunidades ya solicitadas y deja elegir las demás', async () => {
    sentMock.mockImplementation(async () => sentPage([sentTo(12, 'Automatización de línea', 'RECHAZADA')]))
    renderProfile()
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar vinculación' }))
    const select = await within(await screen.findByRole('dialog', { name: 'Solicitar vinculación' })).findByLabelText('Oportunidad')
    expect(within(select).getByRole('option', { name: 'Automatización de línea · Reynosa · Rechazada' })).toBeDisabled()
    expect(within(select).getByRole('option', { name: 'Calidad' })).toBeEnabled()
  })

  it('al abrir la hoja vuelve a consultar las oportunidades: una registrada en otra pestaña aparece', async () => {
    options = []
    renderProfile()
    const open = await screen.findByRole('button', { name: 'Solicitar vinculación' })
    await waitFor(() => expect(fetchMock.mock.calls.filter(([path]) => path === '/api/opportunities/options')).toHaveLength(1))
    options = [{ id: 21, title: 'Recién registrada', program: 'Mecatrónica', municipality: null }]
    fireEvent.click(open)
    const select = await within(await screen.findByRole('dialog', { name: 'Solicitar vinculación' })).findByLabelText('Oportunidad')
    expect(within(select).getByRole('option', { name: 'Recién registrada' })).toBeEnabled()
  })

  it('una solicitud cancelada no bloquea su oportunidad', async () => {
    sentMock.mockImplementation(async () => sentPage([sentTo(13, 'Calidad', 'CANCELADA')]))
    renderProfile()
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar vinculación' }))
    const select = await within(await screen.findByRole('dialog', { name: 'Solicitar vinculación' })).findByLabelText('Oportunidad')
    expect(within(select).getByRole('option', { name: 'Calidad' })).toBeEnabled()
  })

  it('sin oportunidades disponibles no ofrece la acción y el aviso lo explica', async () => {
    sentMock.mockImplementation(async () => sentPage([sentTo(12, 'Automatización de línea', 'ACEPTADA'), sentTo(13, 'Calidad', 'PENDIENTE_INSTITUCION')]))
    renderProfile()
    const notice = await screen.findByRole('note', { name: 'Solicitudes enviadas para este perfil' })
    expect(notice).toHaveTextContent('Ya solicitaste este perfil para todas tus oportunidades activas:')
    expect(within(notice).getByRole('link', { name: 'Ver tus solicitudes' })).toHaveAttribute('href', '/linkage-requests')
    expect(screen.queryByRole('button', { name: 'Solicitar vinculación' })).not.toBeInTheDocument()
  })

  it('al enviar la última oportunidad disponible retira la acción', async () => {
    const pendingBoth = [sentTo(12, 'Automatización de línea', 'PENDIENTE_INSTITUCION'), sentTo(13, 'Calidad', 'PENDIENTE_INSTITUCION')]
    sentMock.mockImplementation(async () => sentPage(posts().length ? pendingBoth : [sentTo(13, 'Calidad', 'PENDIENTE_INSTITUCION')]))
    linkageMock.mockResolvedValueOnce(Response.json({ data: created }, { status: 201 }))
    renderProfile()
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar vinculación' }))
    const sheet = await screen.findByRole('dialog', { name: 'Solicitar vinculación' })
    fireEvent.change(await within(sheet).findByLabelText('Oportunidad'), { target: { value: '12' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar solicitud' }))

    expect(await within(sheet).findByRole('status')).toHaveTextContent('Solicitud enviada a la institución del alumno')
    expect(await within(sheet).findByText(/Ya solicitaste este perfil para todas tus oportunidades activas/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Solicitar vinculación' })).not.toBeInTheDocument())
  })
})

