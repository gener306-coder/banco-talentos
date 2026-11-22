import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

// HU-S16-07: onboarding de la institución invitada, recordatorio en su inicio y avance del perfil en Mi cuenta.
const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
let profile: Record<string, unknown>
const ALL_GAPS = ['name', 'cct', 'contact_name', 'contact_email']
// M3: invitada sin nombre de la persona; la cuenta lleva el correo como nombre provisional.
const invitedUser = {
  id: 20, name: 'coordinacion@utg.test', email: 'coordinacion@utg.test', role: 'INSTITUTION', company: null,
  institution: { id: 8, name: null, missing: ALL_GAPS, onboarding: 'pending', can_operate: false },
}
const emptyProfile = {
  type: 'institution', name: null, cct: null, contact_name: null, contact_position: null, contact_email: null, contact_phone: null, missing: ALL_GAPS,
}
const puts = () => apiMock.mock.calls.filter(([, init]) => init?.method === 'PUT')
const body = (index = 0) => JSON.parse(String(puts()[index][1]?.body)) as Record<string, unknown>

function Location() {
  const location = useLocation()
  return <output aria-label="Ruta actual">{location.pathname + location.hash}</output>
}
const renderApp = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)

beforeEach(() => {
  user = invitedUser
  profile = emptyProfile
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me') return Response.json({ user })
    if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: 0, items: [] } })
    if (path === '/api/dashboard' || (typeof path === 'string' && path.startsWith('/api/promotional-videos'))) return new Promise<Response>(() => undefined)
    if (path === '/api/organization/profile' && !init?.method) return Response.json({ data: profile })
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    return apiMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('onboarding /welcome de la institución (CA-02)', () => {
  it('lleva del inicio al onboarding con Soy yo marcado, el correo de la cuenta y sin el nombre provisional', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Completa el perfil de tu institución' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/welcome')
    const form = (await screen.findByRole('button', { name: 'Guardar y continuar' })).closest('form') as HTMLElement
    expect(within(form).getByLabelText('Soy yo')).toBeChecked()
    expect(within(form).getByLabelText(/Tu nombre/)).toHaveValue('')
    expect(within(form).getByLabelText('Correo de contacto')).toHaveValue('coordinacion@utg.test')
    // Guardado parcial real: ningún campo es obligatorio.
    expect(form.querySelectorAll('[required]')).toHaveLength(0)
    // El pie legal sigue a la vista, como en el onboarding de la empresa.
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('guarda en parcial, corrige el nombre de la cuenta y sigue al inicio con el recordatorio', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: {
      ...emptyProfile, name: 'UT del Golfo', contact_name: 'Rosa Garza', contact_email: 'coordinacion@utg.test', missing: ['cct'],
    } }))
    renderApp('/welcome')
    const form = (await screen.findByRole('button', { name: 'Guardar y continuar' })).closest('form') as HTMLElement
    fireEvent.change(within(form).getByLabelText('Nombre oficial'), { target: { value: ' UT del Golfo ' } })
    fireEvent.change(within(form).getByLabelText(/Tu nombre/), { target: { value: 'Rosa Garza' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar y continuar' }))

    const reminder = await screen.findByRole('link', { name: /Completa tu perfil para que tus alumnos aparezcan en la búsqueda de talento\./ })
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent(/^\/$/)
    expect(body()).toEqual({
      name: 'UT del Golfo', cct: null, contact_name: 'Rosa Garza', contact_position: null, contact_email: 'coordinacion@utg.test', contact_phone: null,
      account_name: 'Rosa Garza',
    })
    expect(reminder).toHaveAttribute('href', '/account#organization')
    expect(screen.getByRole('heading', { name: 'Hola, Rosa Garza' })).toBeInTheDocument()
    expect(screen.getByText('UT del Golfo')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Completa el perfil de tu institución' })).not.toBeInTheDocument()
  })

  it('pospone con Completar más tarde y sigue al inicio sin guardar datos', async () => {
    apiMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    renderApp('/welcome')
    fireEvent.click(await screen.findByRole('button', { name: 'Completar más tarde' }))
    expect(await screen.findByRole('link', { name: /Completa tu perfil para que tus alumnos aparezcan/ })).toHaveAttribute('href', '/account#organization')
    expect(apiMock.mock.calls.map(([path, init]) => [path, init?.method])).toEqual([['/api/organization/profile/postpone', 'POST']])
    expect(screen.getByText('Institución sin nombre')).toBeInTheDocument()
  })

  it('con el onboarding terminado, /welcome lleva al inicio; una institución completa no ve recordatorio', async () => {
    user = { ...invitedUser, name: 'Laura Méndez', institution: { id: 8, name: 'UT del Golfo', missing: [], onboarding: 'done', can_operate: true } }
    renderApp('/welcome')
    expect(await screen.findByRole('heading', { name: 'Hola, Laura Méndez' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent(/^\/$/)
    expect(screen.queryByRole('link', { name: /Completa tu perfil/ })).not.toBeInTheDocument()
  })
})

describe('avance del perfil en Mi cuenta (CA-04)', () => {
  beforeEach(() => {
    user = { ...invitedUser, institution: { ...invitedUser.institution, onboarding: 'done' } }
  })

  it('con #organization y datos pendientes abre la edición con el avance de los 4 datos mínimos', async () => {
    profile = { ...emptyProfile, name: 'UT del Golfo', missing: ['cct', 'contact_name', 'contact_email'] }
    renderApp('/account#organization')
    const section = await screen.findByRole('region', { name: 'Perfil de la institución' })
    expect(await within(section).findByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    expect(within(section).getByText('1 de 4 datos')).toBeInTheDocument()
    const gaps = within(section).getByRole('list', { name: 'Datos pendientes' })
    expect(within(gaps).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Clave de Centro de Trabajo (CCT) (necesario para operar)', 'Nombre del responsable (necesario para operar)', 'Correo de contacto (necesario para operar)',
    ])
  })

  it('en Mi cuenta no propone Soy yo con el responsable vacío (T-S14-02)', async () => {
    profile = { ...emptyProfile, name: 'UT del Golfo', cct: '28EUT0001A', missing: ['contact_name', 'contact_email'] }
    renderApp('/account#organization')
    const section = await screen.findByRole('region', { name: 'Perfil de la institución' })
    await within(section).findByRole('button', { name: 'Guardar cambios' })
    expect(within(section).getByLabelText('Soy yo')).not.toBeChecked()
    expect(within(section).getByLabelText('Correo de contacto')).toHaveValue('')
  })

  it('sin ningún dato muestra el estado vacío con la acción de completar', async () => {
    renderApp('/account')
    const section = await screen.findByRole('region', { name: 'Perfil de la institución' })
    expect(await within(section).findByText('Tu institución aún no tiene perfil')).toBeInTheDocument()
    expect(within(section).getByText('0 de 4 datos')).toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    fireEvent.click(within(section).getByRole('button', { name: 'Completar perfil' }))
    expect(await within(section).findByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
  })

  it('al completar el perfil, la sesión se actualiza sin volver a cargarse', async () => {
    profile = { ...emptyProfile, name: 'UT del Golfo', cct: '28EUT0001A', contact_name: 'Laura Méndez', missing: ['contact_email'] }
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...profile, contact_email: 'dual@ut.test', missing: [] } }))
    renderApp('/account#organization')
    const section = await screen.findByRole('region', { name: 'Perfil de la institución' })
    fireEvent.change(await within(section).findByLabelText('Correo de contacto'), { target: { value: 'dual@ut.test' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }))
    expect(await within(section).findByText('Perfil completo')).toBeInTheDocument()
    // La tarjeta de identidad refleja el nombre de la institución sin volver a pedir la sesión.
    expect(screen.getByRole('region', { name: 'Tu perfil' })).toHaveTextContent('Institución · UT del Golfo')
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/me')).toHaveLength(1)
  })
})
