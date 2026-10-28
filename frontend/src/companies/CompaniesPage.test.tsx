import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { clearMunicipalityCache } from '../students/municipalities'

const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
// Las cuentas de la empresa (HU-S4-03) se cargan aparte; no consumen las respuestas de apiMock.
const accountsMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const secretary = { id: 2, name: 'Analista', email: 'analista@economia.test', role: 'SECRETARY', institution: null }
const summary = {
  id: 5, legal_name: 'Manufacturas del Golfo', trade_name: 'ManuGolfo', rfc: 'MGO150320AB1', sector_code: '31-33',
  state_code: '28', municipality_code: '28032', municipality: 'Reynosa', is_active: true,
}
const company = {
  ...summary, contact_name: 'Lucía Herrera', contact_email: 'dual@manugolfo.test', contact_phone: '899 123 4567',
  validation_reference: 'SE/2026/0141', registered_by: { id: 2, name: 'Analista' }, created_at: '2026-10-22T10:00:00Z',
}
const page = (companies: unknown[]) => Response.json({ data: companies, meta: { current_page: 1, last_page: 1, total: companies.length } })

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}
function renderApp(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)
}
function writes(method: string) {
  return apiMock.mock.calls.filter(([, options]) => options?.method === method)
}

beforeEach(() => {
  user = secretary
  clearMunicipalityCache()
  apiMock.mockReset()
  accountsMock.mockReset()
  accountsMock.mockImplementation(async () => Response.json({ data: [] }))
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/api/me') return Response.json({ user })
    // Indicadores del inicio (HU-S5-01): ajenos a estas pruebas, quedan pendientes sin consumir respuestas.
    if (path === '/api/dashboard') return new Promise<Response>(() => undefined)
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    if (typeof path === 'string' && path.includes('/accounts')) return accountsMock(path, options)
    if (typeof path === 'string' && path.startsWith('/api/catalogs/')) {
      return Response.json({ data: [{ code: '28032', name: 'Reynosa' }, { code: '28041', name: 'Victoria' }] })
    }
    return apiMock(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function fillCompany(form: HTMLElement) {
  fireEvent.change(within(form).getByLabelText('Razón social'), { target: { value: ' Manufacturas del Golfo ' } })
  fireEvent.change(within(form).getByLabelText('RFC'), { target: { value: 'mgo150320ab1' } })
  fireEvent.change(within(form).getByLabelText('Sector económico (SCIAN)'), { target: { value: '31-33' } })
  fireEvent.change(within(form).getByLabelText('Estado'), { target: { value: '28' } })
  const municipality = within(form).getByRole('combobox', { name: 'Municipio' })
  await waitFor(() => expect(municipality).toBeEnabled())
  fireEvent.focus(municipality)
  fireEvent.change(municipality, { target: { value: 'reyn' } })
  fireEvent.mouseDown(await within(form).findByRole('option', { name: 'Reynosa' }))
  fireEvent.change(within(form).getByLabelText('Nombre del contacto'), { target: { value: 'Lucía Herrera' } })
  fireEvent.change(within(form).getByLabelText('Correo del contacto'), { target: { value: 'dual@manugolfo.test' } })
}

describe('empresas HU-S4-02', () => {
  it('ofrece Empresas a SECRETARY desde el inicio y la niega a otros roles (CA-01, CA-09)', async () => {
    const view = renderApp('/')
    expect(await screen.findByRole('link', { name: 'Empresas' })).toHaveAttribute('href', '/companies')
    view.unmount()

    user = { id: 1, name: 'Admin', email: 'admin@example.test', role: 'ADMIN', institution: null }
    renderApp('/companies')
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para gestionar empresas.')
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('lista las empresas y busca por razón social, nombre comercial o RFC (CA-08)', async () => {
    apiMock.mockResolvedValueOnce(page([summary, { ...summary, id: 6, legal_name: 'Zeta', trade_name: null, rfc: 'ZET010101AA1', municipality_code: '28041', municipality: 'Victoria', is_active: false }]))
      .mockResolvedValueOnce(page([]))
    renderApp('/companies')
    const table = await screen.findByRole('table', { name: 'Empresas registradas' })
    expect(within(table).getByText('MGO150320AB1')).toBeInTheDocument()
    expect(within(table).getByText('Reynosa')).toBeInTheDocument()
    expect(within(table).getByText('INACTIVA')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Buscar empresa'), { target: { value: '  inexistente ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByText('Ninguna empresa coincide con la búsqueda.')).toBeInTheDocument()
    expect(apiMock.mock.calls[1][0]).toBe('/api/companies?page=1&q=inexistente')
  })

  it('registra una empresa con el municipio del catálogo y abre su detalle (CA-02, CA-05)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: company }, { status: 201 })).mockResolvedValueOnce(Response.json({ data: company }))
    renderApp('/companies/new')
    const form = (await screen.findByRole('button', { name: 'Registrar empresa' })).closest('form') as HTMLElement
    await fillCompany(form)
    fireEvent.click(within(form).getByRole('button', { name: 'Registrar empresa' }))

    expect(await screen.findByText('Empresa registrada correctamente.')).toHaveAttribute('role', 'status')
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/companies/5')
    expect(JSON.parse(writes('POST')[0][1]?.body as string)).toEqual({
      legal_name: 'Manufacturas del Golfo', trade_name: null, rfc: 'MGO150320AB1', sector_code: '31-33', state_code: '28',
      municipality_code: '28032', contact_name: 'Lucía Herrera', contact_email: 'dual@manugolfo.test', contact_phone: null, validation_reference: null,
    })
  })

  it('valida en línea y no envía con errores (CA-03, CA-09)', async () => {
    renderApp('/companies/new')
    const form = (await screen.findByRole('button', { name: 'Registrar empresa' })).closest('form') as HTMLElement
    const rfc = within(form).getByLabelText('RFC')
    fireEvent.change(rfc, { target: { value: 'XAXX010101000' } })
    fireEvent.blur(rfc)
    expect(rfc).toHaveAccessibleDescription(/El RFC no es válido/)
    const phone = within(form).getByLabelText('Teléfono del contacto (opcional)')
    fireEvent.change(phone, { target: { value: '123' } })
    fireEvent.blur(phone)
    expect(phone).toHaveAccessibleDescription(/entre 10 y 15 dígitos/)

    fireEvent.click(within(form).getByRole('button', { name: 'Registrar empresa' }))
    expect(within(form).getByLabelText('Razón social')).toHaveAccessibleDescription('La razón social es obligatoria.')
    expect(within(form).getByLabelText('Sector económico (SCIAN)')).toHaveAccessibleDescription('El sector económico es obligatorio.')
    expect(within(form).getByLabelText('Estado')).toHaveAccessibleDescription('El estado es obligatorio.')
    expect(within(form).getByLabelText('Nombre del contacto')).toHaveAccessibleDescription('El nombre del contacto es obligatorio.')
    expect(writes('POST')).toHaveLength(0)
  })

  it('muestra junto al campo el RFC repetido que rechaza el servidor (CA-03)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ errors: { rfc: ['Ya existe una empresa registrada con ese RFC.'] } }, { status: 422 }))
    renderApp('/companies/new')
    const form = (await screen.findByRole('button', { name: 'Registrar empresa' })).closest('form') as HTMLElement
    await fillCompany(form)
    fireEvent.click(within(form).getByRole('button', { name: 'Registrar empresa' }))
    await waitFor(() => expect(within(form).getByLabelText('RFC')).toHaveAccessibleDescription(/Ya existe una empresa registrada con ese RFC\./))
  })

  it('muestra el detalle con el registrante y edita la empresa conservando su municipio', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: company }))
      .mockResolvedValueOnce(Response.json({ data: company }))
      .mockResolvedValueOnce(Response.json({ data: { ...company, legal_name: 'Golfo Industrial' } }))
      .mockResolvedValueOnce(Response.json({ data: { ...company, legal_name: 'Golfo Industrial' } }))
    renderApp('/companies/5')
    expect(await screen.findByText('Analista, el 22 de octubre de 2026')).toBeInTheDocument()
    expect(screen.getByText('31-33 · Industrias manufactureras')).toBeInTheDocument()
    expect(screen.getByText('Reynosa, Tamaulipas')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Editar empresa' }))
    const form = (await screen.findByRole('button', { name: 'Guardar cambios' })).closest('form') as HTMLElement
    expect(within(form).getByRole('combobox', { name: 'Municipio' })).toHaveValue('Reynosa')
    fireEvent.change(within(form).getByLabelText('Razón social'), { target: { value: 'Golfo Industrial' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Empresa actualizada correctamente.')).toBeInTheDocument()
    expect(JSON.parse(writes('PUT')[0][1]?.body as string)).toMatchObject({ legal_name: 'Golfo Industrial', municipality_code: '28032', contact_phone: '899 123 4567' })
  })

  it('inactiva tras confirmar y reactiva sin confirmación (CA-07)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: company }))
      .mockResolvedValueOnce(Response.json({ data: { ...company, is_active: false } }))
      .mockResolvedValueOnce(Response.json({ data: company }))
    renderApp('/companies/5')
    fireEvent.click(await screen.findByRole('button', { name: 'Inactivar empresa' }))
    const dialog = await screen.findByRole('alertdialog', { name: '¿Inactivar la empresa?' })
    expect(writes('PATCH')).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Inactivar' }))
    expect(await screen.findByText('Empresa inactivada correctamente.')).toBeInTheDocument()
    expect(screen.getByText('INACTIVA')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Activar empresa' }))
    expect(await screen.findByText('Empresa activada correctamente.')).toBeInTheDocument()
    expect(writes('PATCH').map(([, options]) => JSON.parse(options?.body as string))).toEqual([{ is_active: false }, { is_active: true }])
  })

  describe('cuentas de la empresa HU-S4-03', () => {
    const accounts = [
      { id: 21, name: 'Ana Talento', email: 'ana@manugolfo.test', status: 'active', created_at: '2026-10-22T10:00:00Z' },
      { id: 22, name: 'Beto Pendiente', email: 'beto@manugolfo.test', status: 'pending', created_at: '2026-10-22T11:00:00Z' },
    ]
    const setupUrl = 'http://localhost:5173/set-initial-password?email=carla%40manugolfo.test&token=abc'

    it('lista las cuentas de la empresa con su estado (CA-06)', async () => {
      apiMock.mockResolvedValueOnce(Response.json({ data: company }))
      accountsMock.mockResolvedValueOnce(Response.json({ data: accounts }))
      renderApp('/companies/5')
      const table = await screen.findByRole('table', { name: 'Cuentas de la empresa' })
      expect(within(table).getByText('ana@manugolfo.test')).toBeInTheDocument()
      expect(within(table).getByText('PENDIENTE')).toBeInTheDocument()
      expect(within(table).getByRole('button', { name: 'Reenviar enlace a Beto Pendiente' })).toBeInTheDocument()
      expect(accountsMock.mock.calls[0][0]).toBe('/api/companies/5/accounts')
    })

    it('crea una cuenta con enlace manual y actualiza el listado (CA-01, CA-02)', async () => {
      apiMock.mockResolvedValueOnce(Response.json({ data: company }))
      accountsMock.mockResolvedValueOnce(Response.json({ data: [] }))
        .mockResolvedValueOnce(Response.json({ setup_delivery: 'manual', setup_url: setupUrl, data: { id: 23, name: 'Carla', email: 'carla@manugolfo.test', status: 'pending', created_at: '2026-10-22T12:00:00Z' } }, { status: 201 }))
        .mockResolvedValueOnce(Response.json({ data: [{ id: 23, name: 'Carla', email: 'carla@manugolfo.test', status: 'pending', created_at: '2026-10-22T12:00:00Z' }] }))
      renderApp('/companies/5')
      expect(await screen.findByText('La empresa aún no tiene cuentas.')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Nueva cuenta de la empresa' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nueva cuenta de la empresa' })
      fireEvent.change(within(dialog).getByLabelText('Nombre de la cuenta'), { target: { value: 'Carla' } })
      fireEvent.change(within(dialog).getByLabelText('Correo de acceso'), { target: { value: 'carla@manugolfo.test' } })
      fireEvent.click(within(dialog).getByLabelText(/Generar un enlace para compartirlo/))
      fireEvent.click(within(dialog).getByRole('button', { name: 'Crear cuenta de la empresa' }))
      expect(await within(dialog).findByLabelText('Enlace de configuración')).toHaveValue(setupUrl)
      const post = accountsMock.mock.calls.find(([, options]) => options?.method === 'POST')
      expect(post?.[0]).toBe('/api/companies/5/accounts')
      expect(JSON.parse(post?.[1]?.body as string)).toEqual({ name: 'Carla', email: 'carla@manugolfo.test', delivery_method: 'manual' })
      await waitFor(() => expect(screen.getByRole('table', { name: 'Cuentas de la empresa' })).toHaveTextContent('carla@manugolfo.test'))
    })

    it('reenvía el enlace de una cuenta pendiente desde su fila (CA-02)', async () => {
      apiMock.mockResolvedValueOnce(Response.json({ data: company }))
      accountsMock.mockResolvedValueOnce(Response.json({ data: accounts })).mockResolvedValueOnce(Response.json({ setup_delivery: 'sent' }))
      renderApp('/companies/5')
      fireEvent.click(await screen.findByRole('button', { name: 'Reenviar enlace a Beto Pendiente' }))
      const dialog = await screen.findByRole('dialog', { name: 'Reenviar enlace de configuración' })
      expect(within(dialog).getByLabelText('Correo de la cuenta pendiente')).toHaveValue('beto@manugolfo.test')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Reenviar enlace de configuración' }))
      expect(await within(dialog).findByText(/Enlace de configuración solicitado/)).toBeInTheDocument()
      expect(accountsMock.mock.calls[1][0]).toBe('/api/companies/5/accounts/resend-setup')
    })

    it('no ofrece altas ni reenvíos mientras la empresa está inactiva (CA-01)', async () => {
      apiMock.mockResolvedValueOnce(Response.json({ data: { ...company, is_active: false } }))
      accountsMock.mockResolvedValueOnce(Response.json({ data: accounts }))
      renderApp('/companies/5')
      expect(await screen.findByText(/Activa la empresa para crear cuentas, reenviar enlaces o gestionar el acceso/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Nueva cuenta de la empresa' })).not.toBeInTheDocument()
      await screen.findByRole('table', { name: 'Cuentas de la empresa' })
      expect(screen.queryByRole('button', { name: /Reenviar enlace a/ })).not.toBeInTheDocument()
      // HU-S6-04 CA-03: tampoco se gestiona el acceso de sus cuentas.
      expect(screen.queryByRole('button', { name: /Inactivar la cuenta|Restablecer la contraseña|Activar la cuenta/ })).not.toBeInTheDocument()
    })

    it('inactiva tras confirmar, activa y restablece la contraseña de una cuenta de la empresa (HU-S6-04 CA-03, CA-04)', async () => {
      const ana = accounts[0]
      apiMock.mockResolvedValueOnce(Response.json({ data: company }))
      accountsMock.mockResolvedValueOnce(Response.json({ data: accounts }))
        .mockResolvedValueOnce(Response.json({ data: { ...ana, status: 'inactive' } }))
        .mockResolvedValueOnce(Response.json({ data: ana }))
        .mockResolvedValueOnce(Response.json({ reset_delivery: 'sent' }))
      renderApp('/companies/5')
      const table = await screen.findByRole('table', { name: 'Cuentas de la empresa' })
      // La cuenta pendiente se gestiona con su enlace.
      expect(within(table).queryByRole('button', { name: 'Inactivar la cuenta de Beto Pendiente' })).not.toBeInTheDocument()

      fireEvent.click(within(table).getByRole('button', { name: 'Inactivar la cuenta de Ana Talento' }))
      let dialog = await screen.findByRole('alertdialog', { name: '¿Inactivar la cuenta?' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      expect(accountsMock).toHaveBeenCalledTimes(1)
      fireEvent.click(within(table).getByRole('button', { name: 'Inactivar la cuenta de Ana Talento' }))
      dialog = await screen.findByRole('alertdialog', { name: '¿Inactivar la cuenta?' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Inactivar' }))
      expect(await screen.findByText(/Cuenta de Ana Talento inactivada correctamente/)).toBeInTheDocument()
      expect(accountsMock.mock.calls[1][0]).toBe('/api/companies/5/accounts/21/status')
      expect(JSON.parse(accountsMock.mock.calls[1][1]?.body as string)).toEqual({ is_active: false })
      expect(within(table).getByRole('row', { name: /Ana Talento/ })).toHaveTextContent('INACTIVA')

      fireEvent.click(within(table).getByRole('button', { name: 'Activar la cuenta de Ana Talento' }))
      expect(await screen.findByText('Cuenta de Ana Talento activada correctamente.')).toBeInTheDocument()
      expect(JSON.parse(accountsMock.mock.calls[2][1]?.body as string)).toEqual({ is_active: true })

      fireEvent.click(within(table).getByRole('button', { name: 'Restablecer la contraseña de Ana Talento' }))
      dialog = await screen.findByRole('alertdialog', { name: '¿Restablecer la contraseña?' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar enlace' }))
      expect(await screen.findByText(/Se envió el enlace de restablecimiento a ana@manugolfo.test/)).toBeInTheDocument()
      expect(accountsMock.mock.calls[3][0]).toBe('/api/companies/5/accounts/password-reset/start')
      expect(JSON.parse(accountsMock.mock.calls[3][1]?.body as string)).toEqual({ email: 'ana@manugolfo.test' })
    })

    it('muestra el motivo si el servidor rechaza el cambio de estado', async () => {
      apiMock.mockResolvedValueOnce(Response.json({ data: company }))
      accountsMock.mockResolvedValueOnce(Response.json({ data: accounts }))
        .mockResolvedValueOnce(Response.json({ errors: { company: ['La empresa está inactiva: actívala para cambiar el estado de sus cuentas.'] } }, { status: 422 }))
      renderApp('/companies/5')
      fireEvent.click(await screen.findByRole('button', { name: 'Inactivar la cuenta de Ana Talento' }))
      fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Inactivar' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('La empresa está inactiva: actívala para cambiar el estado de sus cuentas.')
    })

    it('muestra el aviso del servidor si la empresa se inactivó durante el alta', async () => {
      apiMock.mockResolvedValueOnce(Response.json({ data: company }))
      accountsMock.mockResolvedValueOnce(Response.json({ data: [] }))
        .mockResolvedValueOnce(Response.json({ errors: { company: ['La empresa está inactiva: actívala para crear cuentas.'] } }, { status: 422 }))
      renderApp('/companies/5')
      fireEvent.click(await screen.findByRole('button', { name: 'Nueva cuenta de la empresa' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nueva cuenta de la empresa' })
      fireEvent.change(within(dialog).getByLabelText('Nombre de la cuenta'), { target: { value: 'Carla' } })
      fireEvent.change(within(dialog).getByLabelText('Correo de acceso'), { target: { value: 'carla@manugolfo.test' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Crear cuenta de la empresa' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('La empresa está inactiva: actívala para crear cuentas.')
    })
  })
})
