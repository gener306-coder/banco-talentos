import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

// HU-S14-01: Mi cuenta. Nombre y contraseña de la persona de la sesión, para todos los roles.
const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const companyUser = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo', missing: [] } }
const adminUser = { id: 1, name: 'Administración', email: 'admin@bt.test', role: 'ADMIN', institution: null, company: null }
const companyProfile = {
  type: 'company', name: 'ManuGolfo', legal_name: 'Manufacturas del Golfo, S.A. de C.V.', rfc: 'MGO150320AB1', sector_code: '54', trade_name: 'ManuGolfo',
  state_code: '28', municipality_code: '28041', municipality: 'Tampico', contact_name: 'Lucía Herrera', contact_position: null, contact_email: 'dual@manugolfo.test', contact_phone: null,
}
const writes = () => apiMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}

beforeEach(() => {
  user = companyUser
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me' && (!init?.method || init.method === 'GET')) return Response.json({ user })
    if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: 0, items: [] } })
    if (path === '/api/organization/profile' && (!init?.method || init.method === 'GET')) return Response.json({ data: companyProfile })
    if (typeof path === 'string' && path.startsWith('/api/catalogs/')) return Response.json({ data: [{ code: '28041', name: 'Tampico' }] })
    if (path === '/api/dashboard' || (typeof path === 'string' && path.startsWith('/api/promotional-videos'))) return new Promise<Response>(() => undefined)
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    return apiMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('menú de cuenta', () => {
  it('ofrece Mi cuenta a cualquier rol y lleva a /account', async () => {
    user = adminUser
    render(<MemoryRouter initialEntries={['/']}><App /><Location /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /Cuenta|Administración/ }))
    const panel = screen.getByRole('region', { name: 'Cuenta' })
    fireEvent.click(within(panel).getByRole('link', { name: 'Mi cuenta' }))
    expect(screen.getByRole('status', { name: 'Ruta actual' })).toHaveTextContent('/account')
    expect(await screen.findByRole('heading', { name: 'Mi cuenta' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cuenta' })).not.toBeInTheDocument()
  })
})

describe('Mi cuenta', () => {
  it('muestra el correo de acceso en solo lectura con a quién pedir el cambio, el rol y la organización', async () => {
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const data = await screen.findByRole('region', { name: 'Tus datos' })
    expect(within(data).getByLabelText('Nombre')).toHaveValue('Reclutadora')
    expect(data).toHaveTextContent('rh@manugolfo.test')
    expect(data).toHaveTextContent('Para cambiarlo, escribe a la Secretaría de Economía.')
    expect(data).toHaveTextContent('Empresa')
    expect(data).toHaveTextContent('ManuGolfo')
    expect(within(data).queryByRole('textbox', { name: /correo/i })).not.toBeInTheDocument()
  })

  it('guarda el nombre y el menú lo refleja; muestra el error del servidor junto al campo', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ message: 'Error', errors: { name: ['El nombre admite hasta 120 caracteres.'] } }, { status: 422 }))
      .mockResolvedValueOnce(Response.json({ user: { ...companyUser, name: 'Lucía Herrera' } }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const field = await screen.findByLabelText('Nombre')
    const save = screen.getByRole('button', { name: 'Guardar' })
    expect(save).toBeDisabled()

    fireEvent.change(field, { target: { value: 'x'.repeat(121) } })
    fireEvent.click(save)
    expect(await screen.findByText('El nombre admite hasta 120 caracteres.')).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(field, { target: { value: '  Lucía Herrera ' } })
    fireEvent.click(save)
    expect(await screen.findByText('Nombre actualizado correctamente.')).toHaveAttribute('role', 'status')
    const [path, init] = writes()[1]
    expect([path, init?.method, JSON.parse(String(init?.body))]).toEqual(['/api/me', 'PATCH', { name: 'Lucía Herrera' }])
    expect(screen.getByRole('button', { name: /Cuenta|Lucía Herrera/ })).toHaveTextContent('LH')
  })

  it('cambia la contraseña en una hoja con la actual, valida la confirmación y muestra los errores del servidor', async () => {
    let respond: (value: Response) => void = () => undefined
    apiMock.mockResolvedValueOnce(Response.json({ message: 'Error', errors: { current_password: ['La contraseña actual no es correcta.'] } }, { status: 422 }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { respond = resolve }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar contraseña' }))
    const sheet = await screen.findByRole('dialog', { name: 'Cambiar contraseña' })
    const fill = (current: string, next: string, confirm: string) => {
      fireEvent.change(within(sheet).getByLabelText('Contraseña actual'), { target: { value: current } })
      fireEvent.change(within(sheet).getByLabelText('Contraseña nueva'), { target: { value: next } })
      fireEvent.change(within(sheet).getByLabelText('Confirma la contraseña nueva'), { target: { value: confirm } })
    }

    fill('Actual-2026!', 'Nueva-Larga-2026', 'Otra-Distinta-2026')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar contraseña' }))
    expect(within(sheet).getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)

    fill('Equivocada-1', 'Nueva-Larga-2026', 'Nueva-Larga-2026')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar contraseña' }))
    expect(await within(sheet).findByText('La contraseña actual no es correcta.')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Contraseña actual')).toHaveAttribute('aria-invalid', 'true')

    // Mostrar u ocultar.
    fireEvent.click(within(sheet).getByRole('button', { name: 'Mostrar contraseña nueva' }))
    expect(within(sheet).getByLabelText('Contraseña nueva')).toHaveAttribute('type', 'text')

    fill('Actual-2026!', 'Nueva-Larga-2026', 'Nueva-Larga-2026')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar contraseña' }))
    expect(await within(sheet).findByRole('button', { name: 'Guardando contraseña…' })).toBeDisabled()
    const [path, init] = writes()[1]
    expect([path, init?.method, JSON.parse(String(init?.body))]).toEqual(['/api/me/password', 'PUT',
      { current_password: 'Actual-2026!', password: 'Nueva-Larga-2026', password_confirmation: 'Nueva-Larga-2026' }])

    await act(async () => { respond(new Response(null, { status: 204 })) })
    expect(await screen.findByText('Contraseña actualizada correctamente. Cerramos tus sesiones en otros dispositivos.')).toHaveAttribute('role', 'status')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Cambiar contraseña' })).not.toBeInTheDocument())
  })

  it('explica el límite de intentos', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ message: 'Too Many Attempts.' }, { status: 429 }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar contraseña' }))
    const sheet = await screen.findByRole('dialog', { name: 'Cambiar contraseña' })
    for (const [label, value] of [['Contraseña actual', 'Actual-2026!'], ['Contraseña nueva', 'Nueva-Larga-2026'], ['Confirma la contraseña nueva', 'Nueva-Larga-2026']]) {
      fireEvent.change(within(sheet).getByLabelText(label), { target: { value } })
    }
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar contraseña' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Hiciste demasiados intentos seguidos.')
  })
})
