import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const admin = { id: 1, name: 'Ana García', email: 'admin@example.test', role: 'ADMIN' }
const institution = {
  id: 27,
  name: 'Instituto Tecnológico del Norte',
  cct: '19EIT0001A',
  contact_email: 'contacto@example.test',
  is_active: true,
  created_at: '2026-09-01T12:00:00.000000Z',
  updated_at: '2026-09-01T12:00:00.000000Z',
}
const fields = {
  name: institution.name,
  cct: institution.cct,
  contact_email: institution.contact_email,
}
const institutionPaths = ['/institutions', '/institutions/new', '/institutions/27', '/institutions/27/edit']
const otherRoles = ['INSTITUTION', 'COMPANY', 'SECRETARY']
const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let sessionUser: typeof admin | null

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}

function renderApp(path = '/institutions') {
  return render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)
}

function deferredResponse() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((done) => { resolve = done })
  return { promise, resolve }
}

function fillForm(values = fields) {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: values.name } })
  fireEvent.change(screen.getByLabelText('CCT'), { target: { value: values.cct } })
  fireEvent.change(screen.getByLabelText('Correo de contacto'), { target: { value: values.contact_email } })
}

function expectFormValues(values = fields) {
  expect(screen.getByLabelText('Nombre')).toHaveValue(values.name)
  expect(screen.getByLabelText('CCT')).toHaveValue(values.cct)
  expect(screen.getByLabelText('Correo de contacto')).toHaveValue(values.contact_email)
}

function writes() {
  return apiMock.mock.calls.filter(([, options]) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options?.method ?? 'GET'))
}

beforeEach(() => {
  sessionUser = admin
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/api/me') {
      return sessionUser ? Response.json({ user: sessionUser }) : new Response(null, { status: 401 })
    }
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf%3D; Path=/'
      return new Response(null, { status: 204 })
    }
    return apiMock(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('acceso administrativo a instituciones', () => {
  it('ofrece al ADMIN la navegación desde su sesión al listado', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: [institution] }))
    renderApp('/')
    fireEvent.click(await screen.findByRole('link', { name: 'Instituciones' }))
    expect(await screen.findByRole('heading', { name: 'Instituciones' })).toBeInTheDocument()
    expect(await screen.findByText(institution.name)).toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/institutions')
  })

  it.each(otherRoles)('no ofrece gestión de instituciones a %s en su sesión', async (role) => {
    sessionUser = { ...admin, role }
    renderApp('/')
    await screen.findByText(admin.email)
    expect(screen.queryByRole('link', { name: 'Instituciones' })).not.toBeInTheDocument()
    expect(apiMock).not.toHaveBeenCalled()
  })

  it.each(otherRoles.flatMap((role) => institutionPaths.map((path) => [role, path])))(
    'bloquea al rol %s en %s antes de consultar instituciones', async (role, path) => {
      sessionUser = { ...admin, role }
      renderApp(path)
      expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Activar institución|Inactivar institución/ })).not.toBeInTheDocument()
      expect(apiMock).not.toHaveBeenCalled()
      expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
    },
  )

  it.each(institutionPaths)('redirige una visita anónima de %s a login sin consultar instituciones', async (path) => {
    sessionUser = null
    renderApp(path)
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/login')
    expect(apiMock).not.toHaveBeenCalled()
  })
})

describe('consulta de instituciones', () => {
  it('muestra carga antes de recibir el listado y presenta los datos y estados de cada institución', async () => {
    const response = deferredResponse()
    const inactive = { ...institution, id: 28, name: 'Instituto del Sur', cct: '19EIT0002B', is_active: false }
    apiMock.mockReturnValueOnce(response.promise)
    renderApp()
    expect(await screen.findByText('Cargando instituciones…')).toHaveAttribute('role', 'status')
    expect(screen.queryByText('No hay instituciones registradas.')).not.toBeInTheDocument()
    await act(async () => { response.resolve(Response.json({ data: [institution, inactive] })) })

    const activeRow = screen.getByRole('row', { name: new RegExp(institution.name) })
    expect(within(activeRow).getByText(institution.cct)).toBeInTheDocument()
    expect(within(activeRow).getByText(institution.contact_email)).toBeInTheDocument()
    expect(within(activeRow).getByText('ACTIVA')).toBeInTheDocument()
    expect(within(activeRow).getByRole('link', { name: `Ver detalle de ${institution.name}` })).toHaveAttribute('href', '/institutions/27')
    const inactiveRow = screen.getByRole('row', { name: /Instituto del Sur/ })
    expect(within(inactiveRow).getByText('INACTIVA')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nueva institución' })).toHaveAttribute('href', '/institutions/new')
    expect(apiMock.mock.calls[0][0]).toBe('/api/institutions')
    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument()
  })

  it('muestra un listado vacío y permite abrir el formulario de registro', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: [] }))
    renderApp()
    expect(await screen.findByText('No hay instituciones registradas.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Nueva institución' }))
    expect(await screen.findByRole('button', { name: 'Crear institución' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/institutions/new')
  })

  it.each(['red', 'servidor'])('permite reintentar la consulta ante un error de %s', async (failure) => {
    if (failure === 'red') apiMock.mockRejectedValueOnce(new TypeError('Network error'))
    else apiMock.mockResolvedValueOnce(new Response(null, { status: 500 }))
    apiMock.mockResolvedValueOnce(Response.json({ data: [institution] }))
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent(failure === 'red' ? 'No pudimos conectar' : 'No pudimos completar')
    expect(screen.queryByText('No hay instituciones registradas.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(institution.name)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(apiMock).toHaveBeenCalledTimes(2)
  })

  it('consulta los datos individuales y ofrece edición y cambio de estado sin eliminación', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: [institution] }))
      .mockResolvedValueOnce(Response.json({ data: institution }))
    renderApp()
    fireEvent.click(await screen.findByRole('link', { name: `Ver detalle de ${institution.name}` }))
    expect(await screen.findByText(institution.name)).toBeInTheDocument()
    expect(screen.getByText(institution.cct)).toBeInTheDocument()
    expect(screen.getByText(institution.contact_email)).toBeInTheDocument()
    expect(screen.getByText('ACTIVA')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar institución' })).toHaveAttribute('href', '/institutions/27/edit')
    expect(screen.getByRole('button', { name: 'Inactivar institución' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Volver a instituciones' })).toHaveAttribute('href', '/institutions')
    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /eliminar/i })).not.toBeInTheDocument()
    expect(apiMock.mock.calls[1][0]).toBe('/api/institutions/27')
  })

  it.each(['/institutions/27', '/institutions/27/edit'])('muestra un 404 en %s sin ofrecer modificaciones', async (path) => {
    apiMock.mockResolvedValueOnce(new Response(null, { status: 404 }))
    renderApp(path)
    expect(await screen.findByRole('alert')).toHaveTextContent('La institución no existe.')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Guardar cambios|Inactivar institución|Activar institución/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a instituciones' })).toHaveAttribute('href', '/institutions')
  })

  it('presenta acceso denegado de la API sin inventar un listado vacío', async () => {
    apiMock.mockResolvedValueOnce(new Response(null, { status: 403 }))
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para gestionar instituciones.')
    expect(screen.queryByText('No hay instituciones registradas.')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument()
    expect(screen.queryByText(institution.name)).not.toBeInTheDocument()
  })

  it('redirige a login cuando la consulta informa una sesión expirada', async () => {
    apiMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión terminó')
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/login')
    expect(screen.queryByText(institution.name)).not.toBeInTheDocument()
  })
})

describe('registro y edición de instituciones', () => {
  it('exige los tres campos y un correo válido antes de enviar el formulario', async () => {
    renderApp('/institutions/new')
    const submit = await screen.findByRole('button', { name: 'Crear institución' })
    fireEvent.click(submit)
    expect(screen.getByLabelText('Nombre')).toBeInvalid()
    expect(screen.getByLabelText('CCT')).toBeInvalid()
    expect(screen.getByLabelText('Correo de contacto')).toBeInvalid()
    expect(apiMock).not.toHaveBeenCalled()
    fillForm({ ...fields, contact_email: 'sin-arroba' })
    fireEvent.click(submit)
    expect(screen.getByLabelText('Correo de contacto')).toBeInvalid()
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('registra únicamente los campos acordados y muestra el estado activo devuelto por el servidor', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: institution }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ data: institution }))
    renderApp('/institutions/new')
    await screen.findByRole('button', { name: 'Crear institución' })
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Crear institución' }))
    expect(await screen.findByText(institution.name)).toBeInTheDocument()
    expect(screen.getByText('ACTIVA')).toBeInTheDocument()
    expect(screen.getByText('Institución registrada correctamente.')).toHaveAttribute('role', 'status')
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/institutions/27')
    expect(writes()).toHaveLength(1)
    const [path, options] = writes()[0]
    expect(path).toBe('/api/institutions')
    expect(options?.method).toBe('POST')
    expect(JSON.parse(options?.body as string)).toEqual(fields)
  })

  it('carga los datos existentes y edita los tres campos mediante PUT conservando el estado', async () => {
    const original = { ...institution, is_active: false }
    const edited = { name: 'Instituto actualizado', cct: '19EIT0099Z', contact_email: 'nuevo@example.test' }
    const saved = { ...original, ...edited }
    apiMock.mockResolvedValueOnce(Response.json({ data: original }))
      .mockResolvedValueOnce(Response.json({ data: saved }))
      .mockResolvedValueOnce(Response.json({ data: saved }))
    renderApp('/institutions/27/edit')
    await screen.findByRole('button', { name: 'Guardar cambios' })
    expectFormValues()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fillForm(edited)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(edited.name)).toBeInTheDocument()
    expect(screen.getByText(edited.cct)).toBeInTheDocument()
    expect(screen.getByText(edited.contact_email)).toBeInTheDocument()
    expect(screen.getByText('INACTIVA')).toBeInTheDocument()
    expect(screen.getByText('Institución actualizada correctamente.')).toHaveAttribute('role', 'status')
    expect(writes()).toHaveLength(1)
    const [path, options] = writes()[0]
    expect(path).toBe('/api/institutions/27')
    expect(options?.method).toBe('PUT')
    expect(JSON.parse(options?.body as string)).toEqual(edited)
  })

  it('presenta errores 422 por campo, accesibles y sin perder los datos introducidos', async () => {
    const errors = {
      name: ['El nombre indicado no es válido.'],
      cct: ['La clave indicada no es válida.'],
      contact_email: ['El correo indicado no es válido.'],
    }
    apiMock.mockResolvedValueOnce(Response.json({ message: 'Validation failed', errors }, { status: 422 }))
    renderApp('/institutions/new')
    await screen.findByRole('button', { name: 'Crear institución' })
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Crear institución' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa los campos indicados.')
    expectFormValues()
    for (const [label, field] of [['Nombre', 'name'], ['CCT', 'cct'], ['Correo de contacto', 'contact_email']] as const) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(expect.stringContaining(errors[field][0]))
    }
    expect(screen.getByRole('button', { name: 'Crear institución' })).toBeEnabled()
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/institutions/new')
    expect(writes()).toHaveLength(1)
  })

  it.each([
    ['/institutions/new', 'Crear institución'],
    ['/institutions/27/edit', 'Guardar cambios'],
  ])('explica un CCT duplicado y conserva los datos en %s', async (path, submitLabel) => {
    if (path.endsWith('/edit')) apiMock.mockResolvedValueOnce(Response.json({ data: institution }))
    apiMock.mockResolvedValueOnce(Response.json({ errors: { cct: ['El CCT ya está registrado.'] } }, { status: 422 }))
    renderApp(path)
    await screen.findByRole('button', { name: submitLabel })
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: submitLabel }))
    expect(await screen.findByText('El CCT ya está registrado.')).toBeInTheDocument()
    expect(screen.getByLabelText('CCT')).toHaveAccessibleDescription(/El CCT ya está registrado\./)
    expectFormValues()
    expect(screen.getByRole('button', { name: submitLabel })).toBeEnabled()
    expect(screen.getByLabelText('Ruta actual').textContent).toBe(path)
    expect(screen.queryByText(/Institución (registrada|actualizada) correctamente/)).not.toBeInTheDocument()
  })

  it('evita registros duplicados mientras el servidor procesa el alta y anuncia éxito sólo tras su respuesta', async () => {
    const response = deferredResponse()
    apiMock.mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce(Response.json({ data: institution }))
    renderApp('/institutions/new')
    const submit = await screen.findByRole('button', { name: 'Crear institución' })
    fillForm()
    fireEvent.click(submit)
    fireEvent.click(submit)
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
    expect(screen.queryByText('Institución registrada correctamente.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/institutions/new')
    await act(async () => { response.resolve(Response.json({ data: institution }, { status: 201 })) })
    expect(await screen.findByText(institution.name)).toBeInTheDocument()
    expect(writes()).toHaveLength(1)
  })

  it('conserva el formulario y la sesión tras un 419 y permite repetir el envío', async () => {
    apiMock.mockResolvedValueOnce(new Response(null, { status: 419 }))
      .mockResolvedValueOnce(Response.json({ data: institution }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ data: institution }))
    renderApp('/institutions/new')
    await screen.findByRole('button', { name: 'Crear institución' })
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Crear institución' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos validar la solicitud.')
    expectFormValues()
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument()
    expect(writes()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Crear institución' }))
    expect(await screen.findByText(institution.name)).toBeInTheDocument()
    expect(writes()).toHaveLength(2)
  })

  it('conserva los datos y permite reintentar un alta si falla la red', async () => {
    apiMock.mockRejectedValueOnce(new TypeError('Network error'))
      .mockResolvedValueOnce(Response.json({ data: institution }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ data: institution }))
    renderApp('/institutions/new')
    await screen.findByRole('button', { name: 'Crear institución' })
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Crear institución' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectar')
    expectFormValues()
    expect(screen.queryByText('Institución registrada correctamente.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Crear institución' }))
    expect(await screen.findByText(institution.name)).toBeInTheDocument()
  })

  it('cierra la sesión local cuando la API rechaza una escritura con 401', async () => {
    apiMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
    renderApp('/institutions/new')
    await screen.findByRole('button', { name: 'Crear institución' })
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Crear institución' }))
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión terminó')
    expect(screen.queryByLabelText('CCT')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/login')
  })
})

describe('activación e inactivación sin eliminación', () => {
  it.each([
    [true, 'Inactivar institución', 'INACTIVA', 'Institución inactivada correctamente.'],
    [false, 'Activar institución', 'ACTIVA', 'Institución activada correctamente.'],
  ] as const)('cambia is_active=%s mediante PATCH y conserva los datos', async (isActive, action, state, notice) => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...institution, is_active: isActive } }))
      .mockResolvedValueOnce(Response.json({ data: { ...institution, is_active: !isActive } }))
    renderApp('/institutions/27')
    fireEvent.click(await screen.findByRole('button', { name: action }))
    expect(await screen.findByText(state)).toBeInTheDocument()
    expect(screen.getByText(notice)).toHaveAttribute('role', 'status')
    expect(screen.getByText(institution.name)).toBeInTheDocument()
    expect(screen.getByText(institution.cct)).toBeInTheDocument()
    expect(screen.getByText(institution.contact_email)).toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/institutions/27')
    expect(writes()).toHaveLength(1)
    const [path, options] = writes()[0]
    expect(path).toBe('/api/institutions/27/status')
    expect(options?.method).toBe('PATCH')
    expect(JSON.parse(options?.body as string)).toEqual({ is_active: !isActive })
    expect(screen.getByRole('button', { name: isActive ? 'Activar institución' : 'Inactivar institución' })).toBeEnabled()
  })

  it('espera la confirmación del servidor y bloquea solicitudes de estado repetidas', async () => {
    const response = deferredResponse()
    apiMock.mockResolvedValueOnce(Response.json({ data: institution }))
      .mockReturnValueOnce(response.promise)
    renderApp('/institutions/27')
    const submit = await screen.findByRole('button', { name: 'Inactivar institución' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(submit).toBeDisabled()
    expect(screen.getByText('ACTIVA')).toBeInTheDocument()
    expect(screen.queryByText('INACTIVA')).not.toBeInTheDocument()
    expect(screen.queryByText('Institución inactivada correctamente.')).not.toBeInTheDocument()
    await act(async () => { response.resolve(Response.json({ data: { ...institution, is_active: false } })) })
    expect(await screen.findByText('INACTIVA')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activar institución' })).toBeEnabled()
    expect(writes()).toHaveLength(1)
  })

  it('mantiene el estado confirmado si falla el cambio y permite reintentar', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: institution }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ data: { ...institution, is_active: false } }))
    renderApp('/institutions/27')
    fireEvent.click(await screen.findByRole('button', { name: 'Inactivar institución' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos completar')
    expect(screen.getByText('ACTIVA')).toBeInTheDocument()
    expect(screen.queryByText('INACTIVA')).not.toBeInTheDocument()
    expect(screen.queryByText('Institución inactivada correctamente.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Inactivar institución' }))
    expect(await screen.findByText('INACTIVA')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
