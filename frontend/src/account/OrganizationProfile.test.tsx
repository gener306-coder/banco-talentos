import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

// HU-S14-02: perfil de la organización en /account, sector de un solo establecimiento (D2) y aviso en el inicio.
const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
let profile: Record<string, unknown>
const companyUser = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo', missing: ['sector_code'] } }
const institutionUser = { id: 2, name: 'Coordinación', email: 'dual@ut.test', role: 'INSTITUTION', institution: { id: 1, name: 'UT del Golfo' }, company: null }
const companyProfile = {
  type: 'company', name: 'ManuGolfo', legal_name: 'Manufacturas del Golfo, S.A. de C.V.', rfc: 'MGO150320AB1', sector_code: null, trade_name: 'ManuGolfo',
  state_code: '28', municipality_code: '28041', municipality: 'Tampico', contact_name: 'Lucía Herrera', contact_position: null, contact_email: 'dual@manugolfo.test', contact_phone: null,
}
const institutionProfile = {
  type: 'institution', name: 'Universidad Tecnológica del Golfo', cct: '28EUT0001A', contact_name: 'Laura Méndez', contact_position: 'Coordinación Dual', contact_email: 'dual@ut.test', contact_phone: null,
}
const puts = () => apiMock.mock.calls.filter(([, init]) => init?.method === 'PUT')

beforeEach(() => {
  user = companyUser
  profile = companyProfile
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me') return Response.json({ user })
    if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: 0, items: [] } })
    if (path === '/api/dashboard' || (typeof path === 'string' && path.startsWith('/api/promotional-videos'))) return new Promise<Response>(() => undefined)
    if (path === '/api/organization/profile' && !init?.method) return Response.json({ data: profile })
    if (typeof path === 'string' && path.startsWith('/api/catalogs/')) return Response.json({ data: [{ code: '28041', name: 'Tampico' }, { code: '28038', name: 'Reynosa' }] })
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    return apiMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('perfil de la empresa', () => {
  it('muestra los datos legales en solo lectura con a quién pedir el cambio y el formulario de los operativos', async () => {
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    expect(section).toHaveTextContent('Manufacturas del Golfo, S.A. de C.V.')
    expect(section).toHaveTextContent('MGO150320AB1')
    expect(within(section).getByRole('note')).toHaveTextContent('Secretaría de Economía')
    expect(within(section).queryByLabelText(/Razón social/)).not.toBeInTheDocument()
    expect(within(section).getByLabelText('Nombre comercial (opcional)')).toHaveValue('ManuGolfo')
    expect(within(section).getByLabelText('Correo de contacto')).toHaveValue('dual@manugolfo.test')
    expect(within(section).getByLabelText('Sector económico (SCIAN)')).toHaveAccessibleDescription(/solo la Secretaría de Economía podrá cambiarlo/)
  })

  it('pide confirmar el sector antes de fijarlo, lo envía una sola vez y después queda en solo lectura', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...companyProfile, sector_code: '31-33' } }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    fireEvent.change(within(section).getByLabelText('Sector económico (SCIAN)'), { target: { value: '31-33' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }))

    const dialog = await screen.findByRole('alertdialog', { name: '¿Establecer el sector económico?' })
    expect(dialog).toHaveTextContent('31-33')
    expect(puts()).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Establecer sector' }))

    expect(await within(section).findByText('Perfil actualizado correctamente.')).toHaveAttribute('role', 'status')
    expect(JSON.parse(String(puts()[0][1]?.body))).toMatchObject({ sector_code: '31-33', contact_email: 'dual@manugolfo.test' })
    expect(within(section).queryByLabelText('Sector económico (SCIAN)')).not.toBeInTheDocument()
    expect(section).toHaveTextContent('31-33 · Industrias manufactureras')
  })

  it('sin sector elegido guarda sin pedir confirmación ni enviar el sector', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...companyProfile, trade_name: 'Golfo Industrial', name: 'Golfo Industrial' } }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    fireEvent.change(within(section).getByLabelText('Nombre comercial (opcional)'), { target: { value: 'Golfo Industrial' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }))
    expect(await within(section).findByText('Perfil actualizado correctamente.')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(JSON.parse(String(puts()[0][1]?.body))).not.toHaveProperty('sector_code')
    // La sesión refleja el nombre visible de la empresa sin volver a cargarse.
    expect(screen.getByRole('region', { name: 'Tus datos' })).toHaveTextContent('Golfo Industrial')
  })

  it('muestra los errores del servidor junto a su campo', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ message: 'Error', errors: { contact_email: ['Ingresa un correo de contacto válido.'] } }, { status: 422 }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    fireEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }))
    expect(await within(section).findByText('Ingresa un correo de contacto válido.')).toBeInTheDocument()
    expect(within(section).getByLabelText('Correo de contacto')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('perfil de la institución', () => {
  it('solo edita el contacto del programa dual; el nombre oficial y la clave quedan en solo lectura', async () => {
    user = institutionUser
    profile = institutionProfile
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...institutionProfile, contact_phone: '8331234567' } }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Perfil de la institución' })
    expect(section).toHaveTextContent('Universidad Tecnológica del Golfo')
    expect(section).toHaveTextContent('28EUT0001A')
    expect(within(section).getByRole('note')).toHaveTextContent('Administración del Banco de Talentos')
    expect(within(section).queryByLabelText(/Nombre comercial|Sector|Municipio/)).not.toBeInTheDocument()
    fireEvent.change(within(section).getByLabelText('Teléfono de contacto (opcional)'), { target: { value: '8331234567' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(JSON.parse(String(puts()[0][1]?.body))).toEqual({ contact_name: 'Laura Méndez', contact_position: 'Coordinación Dual', contact_email: 'dual@ut.test', contact_phone: '8331234567' })
  })

  it('no se muestra a ADMIN ni a SECRETARY', async () => {
    user = { id: 1, name: 'Administración', email: 'admin@bt.test', role: 'ADMIN', institution: null, company: null }
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    await screen.findByRole('region', { name: 'Tus datos' })
    expect(screen.queryByRole('region', { name: /Perfil de la/ })).not.toBeInTheDocument()
  })
})

describe('aviso del sector en el inicio de la empresa', () => {
  it('recuerda establecer el sector mientras falte, con enlace a Mi cuenta', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    const notice = await screen.findByRole('note', { name: 'Sector económico pendiente' })
    expect(within(notice).getByRole('link', { name: /Establecer sector/ })).toHaveAttribute('href', '/account')
  })

  it('no aparece con el sector establecido', async () => {
    user = { ...companyUser, company: { id: 3, name: 'ManuGolfo', missing: [] } }
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    await screen.findByRole('heading', { name: /Hola/ })
    expect(screen.queryByRole('note', { name: 'Sector económico pendiente' })).not.toBeInTheDocument()
  })
})
