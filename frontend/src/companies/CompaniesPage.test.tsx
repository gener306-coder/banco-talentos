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
  id: 5, name: 'ManuGolfo', legal_name: 'Manufacturas del Golfo', trade_name: 'ManuGolfo', rfc: 'MGO150320AB1', sector_code: '31-33',
  state_code: '28', municipality_code: '28032', municipality: 'Reynosa', is_active: true, account_email: 'dual@manugolfo.test', profile_status: 'complete',
}
const company = {
  ...summary, contact_name: 'Lucía Herrera', contact_position: 'Recursos Humanos', contact_email: 'dual@manugolfo.test', contact_phone: '899 123 4567',
  validation_reference: 'SE/2026/0141', missing: [], registered_by: { id: 2, name: 'Analista' }, created_at: '2026-10-22T10:00:00Z',
}
// HU-S14-02: empresa recién invitada, sin ningún dato del perfil.
const invited = {
  ...company, id: 7, name: null, legal_name: null, trade_name: null, rfc: null, sector_code: null, state_code: null, municipality_code: null,
  municipality: null, contact_name: null, contact_position: null, contact_email: null, contact_phone: null, validation_reference: null,
  account_email: 'operador@nueva.test', profile_status: 'pending_access',
  missing: ['name', 'contact_name', 'contact_email', 'legal_name', 'rfc', 'sector_code', 'location'],
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
  // T-S14-19: el carrusel de Historias del Dual también pide la galería en el inicio de la Secretaría y de la institución;
  // se responde aparte para que no consuma las respuestas en orden de fetchMock.
  vi.stubGlobal('fetch', (path: RequestInfo | URL, options?: RequestInit) => String(path).startsWith('/api/promotional-videos')
    ? Promise.resolve(Response.json({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } })) : fetchMock(path, options))
})
afterEach(() => vi.unstubAllGlobals())

function invite(form: HTMLElement) {
  fireEvent.change(within(form).getByLabelText('Correo de la cuenta'), { target: { value: ' operador@nueva.test ' } })
  fireEvent.change(within(form).getByLabelText('Nombre de la persona (opcional)'), { target: { value: 'Lucía Herrera' } })
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

  it('lista las empresas con su perfil y busca por nombre, RFC o correo de la cuenta (CA-08, HU-S14-02 CA-03)', async () => {
    apiMock.mockResolvedValueOnce(page([summary, { ...summary, id: 6, name: 'Zeta', legal_name: 'Zeta', trade_name: null, rfc: 'ZET010101AA1', municipality_code: '28041', municipality: 'Victoria', is_active: false, profile_status: 'incomplete' }, invited]))
      .mockResolvedValueOnce(page([]))
    renderApp('/companies')
    const table = await screen.findByRole('table', { name: 'Empresas registradas' })
    expect(within(table).getByText('MGO150320AB1')).toBeInTheDocument()
    expect(within(table).getByText('Reynosa')).toBeInTheDocument()
    expect(within(table).getByText('INACTIVA')).toBeInTheDocument()
    expect(within(table).getByText('Perfil completo')).toBeInTheDocument()
    expect(within(table).getByText('Perfil incompleto')).toBeInTheDocument()
    // La invitada sin nombre se reconoce por el correo de su cuenta.
    const row = within(table).getByText('operador@nueva.test').closest('tr') as HTMLElement
    expect(row).toHaveTextContent('Empresa sin nombre')
    expect(row).toHaveTextContent('Acceso pendiente')
    expect(within(row).getAllByText('Sin capturar')).toHaveLength(2)
    expect(within(row).getByRole('link', { name: 'Ver detalle de Empresa sin nombre' })).toHaveAttribute('href', '/companies/7')
    expect(screen.getByRole('link', { name: 'Invitar empresa' })).toHaveAttribute('href', '/companies/new')

    fireEvent.change(screen.getByLabelText('Buscar empresa'), { target: { value: '  inexistente ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByText('Ninguna empresa coincide con la búsqueda.')).toBeInTheDocument()
    expect(apiMock.mock.calls[1][0]).toBe('/api/companies?page=1&q=inexistente')
  })

  it('invita a una empresa solo con el correo de la cuenta y abre su detalle sin perfil (HU-S14-02 CA-01)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: invited, setup_delivery: 'sent' }, { status: 201 })).mockResolvedValueOnce(Response.json({ data: invited }))
    renderApp('/companies/new')
    expect(await screen.findByRole('heading', { name: 'Invitar empresa' })).toBeInTheDocument()
    const form = screen.getByRole('button', { name: 'Enviar invitación' }).closest('form') as HTMLElement
    // Solo tres campos: el perfil lo captura la empresa.
    expect(within(form).queryByLabelText(/Razón social|RFC|Sector|Municipio/)).not.toBeInTheDocument()
    expect(within(form).getByLabelText('Nombre de la empresa (opcional)')).toHaveAccessibleDescription('Solo como referencia; la empresa podrá cambiarlo.')
    invite(form)
    fireEvent.click(within(form).getByRole('button', { name: 'Enviar invitación' }))

    expect(await screen.findByText('Invitación enviada. operador@nueva.test recibirá el enlace para crear su contraseña y completar el perfil de su empresa.')).toHaveAttribute('role', 'status')
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/companies/7')
    expect(JSON.parse(writes('POST')[0][1]?.body as string)).toEqual({ email: 'operador@nueva.test', trade_name: null, person_name: 'Lucía Herrera', delivery_method: 'email' })
    // El detalle de la invitada muestra lo que aún no captura.
    const details = document.querySelector('.company-details') as HTMLElement
    expect(details).toHaveTextContent('Empresa sin nombre')
    expect(details).toHaveTextContent('Acceso pendiente')
    expect(details).toHaveTextContent('Sin sector asignado')
    expect(within(details).getAllByText('Sin capturar').length).toBeGreaterThanOrEqual(4)
  })

  it('con la entrega manual muestra el enlace para copiarlo, sin salir de la invitación (T-S8-12)', async () => {
    const link = 'http://localhost:5173/set-initial-password?email=operador%40nueva.test&token=abc'
    apiMock.mockResolvedValueOnce(Response.json({ data: invited, setup_delivery: 'manual', setup_url: link }, { status: 201 }))
    renderApp('/companies/new')
    const form = (await screen.findByRole('button', { name: 'Enviar invitación' })).closest('form') as HTMLElement
    invite(form)
    fireEvent.click(within(form).getByRole('radio', { name: /Generar un enlace para compartirlo/ }))
    expect(within(form).getByLabelText('Correo de la cuenta')).toHaveAccessibleDescription('Será el correo con el que inicie sesión. Recibirás un enlace para compartírselo.')
    fireEvent.click(within(form).getByRole('button', { name: 'Enviar invitación' }))

    expect(await screen.findByText('Invitación lista. Copia el enlace y compártelo con operador@nueva.test para que cree su contraseña y complete el perfil de su empresa.')).toHaveAttribute('role', 'status')
    expect(screen.getByLabelText('Enlace de configuración')).toHaveValue(link)
    expect(screen.getByRole('link', { name: 'Ver la empresa' })).toHaveAttribute('href', '/companies/7')
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/companies/new')
    expect(JSON.stringify(window.history.state)).not.toContain('token=abc')
    expect(JSON.parse(writes('POST')[0][1]?.body as string)).toMatchObject({ delivery_method: 'manual' })
  })

  it('avisa que hay que reenviar el enlace si no se pudo enviar (T-S8-12)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: invited, setup_delivery: 'pending' }, { status: 201 })).mockResolvedValueOnce(Response.json({ data: invited }))
    renderApp('/companies/new')
    const form = (await screen.findByRole('button', { name: 'Enviar invitación' })).closest('form') as HTMLElement
    invite(form)
    fireEvent.click(within(form).getByRole('button', { name: 'Enviar invitación' }))
    expect(await screen.findByText('Empresa invitada, pero no pudimos enviar el enlace. Usa “Reenviar enlace”.')).toHaveAttribute('role', 'status')
  })

  it('pide el correo, valida su formato y muestra junto al campo el correo repetido que rechaza el servidor', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ errors: { email: ['El correo ya está registrado en otra cuenta.'] } }, { status: 422 }))
    renderApp('/companies/new')
    const form = (await screen.findByRole('button', { name: 'Enviar invitación' })).closest('form') as HTMLElement
    const email = within(form).getByLabelText('Correo de la cuenta')
    fireEvent.click(within(form).getByRole('button', { name: 'Enviar invitación' }))
    expect(email).toHaveAccessibleDescription(/El correo de la cuenta es obligatorio\./)
    fireEvent.change(email, { target: { value: 'no-es-correo' } })
    fireEvent.blur(email)
    expect(email).toHaveAccessibleDescription(/Ingresa un correo/)
    fireEvent.click(within(form).getByRole('button', { name: 'Enviar invitación' }))
    expect(writes('POST')).toHaveLength(0)

    invite(form)
    fireEvent.click(within(form).getByRole('button', { name: 'Enviar invitación' }))
    await waitFor(() => expect(email).toHaveAccessibleDescription(/El correo ya está registrado en otra cuenta\./))
  })

  it('edita el perfil de una invitada con todo opcional y valida solo lo capturado (M4)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: invited })).mockResolvedValueOnce(Response.json({ data: invited }))
    renderApp('/companies/7/edit')
    const form = (await screen.findByRole('button', { name: 'Guardar cambios' })).closest('form') as HTMLElement
    const rfc = within(form).getByLabelText('RFC')
    fireEvent.change(rfc, { target: { value: 'XAXX010101000' } })
    fireEvent.blur(rfc)
    expect(rfc).toHaveAccessibleDescription(/El RFC no es válido/)
    fireEvent.change(within(form).getByLabelText('Estado'), { target: { value: '28' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar cambios' }))
    expect(within(form).getByRole('combobox', { name: 'Municipio' })).toHaveAccessibleDescription(/Elige el municipio del estado\./)
    expect(writes('PUT')).toHaveLength(0)

    fireEvent.change(rfc, { target: { value: '' } })
    fireEvent.change(within(form).getByLabelText('Estado'), { target: { value: '' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(writes('PUT')).toHaveLength(1))
    expect(JSON.parse(writes('PUT')[0][1]?.body as string)).toEqual({
      legal_name: null, trade_name: null, rfc: null, sector_code: null, state_code: null, municipality_code: null,
      contact_name: null, contact_position: null, contact_email: null, contact_phone: null, validation_reference: null,
    })
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

describe('listado de empresas en la URL (T-S12-05)', () => {
  it('reconstruye búsqueda y página desde la URL y el detalle regresa a esa misma vista', async () => {
    apiMock.mockResolvedValueOnce(page([summary])).mockResolvedValueOnce(Response.json({ data: company }))
    renderApp('/companies?q=golfo&page=2')
    const table = await screen.findByRole('table', { name: 'Empresas registradas' })
    expect(apiMock.mock.calls[0][0]).toBe('/api/companies?page=2&q=golfo')
    expect(screen.getByLabelText('Buscar empresa')).toHaveValue('golfo')

    fireEvent.click(within(table).getByRole('rowheader'))
    expect(await screen.findByRole('link', { name: 'Volver a empresas' })).toHaveAttribute('href', '/companies?q=golfo&page=2')
  })

  it('una búsqueda nueva vuelve a la página 1', async () => {
    apiMock.mockResolvedValueOnce(page([summary])).mockResolvedValueOnce(page([]))
    renderApp('/companies?page=3')
    await screen.findByRole('table', { name: 'Empresas registradas' })
    fireEvent.change(screen.getByLabelText('Buscar empresa'), { target: { value: 'zeta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await screen.findByText('Ninguna empresa coincide con la búsqueda.')
    expect(apiMock.mock.calls[1][0]).toBe('/api/companies?page=1&q=zeta')
  })
})

