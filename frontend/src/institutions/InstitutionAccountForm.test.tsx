import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const admin = { id: 1, name: 'Admin', email: 'admin@example.test', role: 'ADMIN' }
const institution = { id: 7, name: 'Instituto Dual', cct: 'CCT-7', contact_email: 'contacto@example.test', is_active: true, created_at: '2026-09-30', updated_at: '2026-09-30' }
const input = { name: 'Responsable institucional', email: 'titular@example.test', institution_id: 7 }
const account = { id: 12, name: input.name, email: input.email, role: 'INSTITUTION', is_active: true, institution: { id: 7, name: institution.name } }
const successMessage = 'Cuenta creada. La persona titular debe establecer su contraseña desde el enlace de configuración.'
const fetchMock = vi.fn<typeof fetch>()
const accountRequest = vi.fn<typeof fetch>()
let isActive: boolean
let role: string

function renderApp() {
  return render(<MemoryRouter initialEntries={['/institutions/7']}><App /></MemoryRouter>)
}

async function fillForm() {
  await screen.findByLabelText('Nombre de la cuenta')
  fireEvent.change(screen.getByLabelText('Nombre de la cuenta'), { target: { value: input.name } })
  fireEvent.change(screen.getByLabelText('Correo de acceso'), { target: { value: input.email } })
}

beforeEach(() => {
  isActive = true
  role = 'ADMIN'
  accountRequest.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/api/me') return Response.json({ user: { ...admin, role } })
    if (path === '/api/institutions/7') return Response.json({ data: { ...institution, is_active: isActive } })
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    return accountRequest(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('alta administrativa de cuentas institucionales', () => {
  it('por defecto envía por correo solo nombre, correo e institución; nunca pide contraseña ni muestra el enlace', async () => {
    accountRequest.mockResolvedValueOnce(Response.json({ data: account, setup_url: 'http://localhost/set-initial-password?token=secreto' }, { status: 201 }))
    renderApp()
    await fillForm()
    expect(screen.queryByLabelText(/contraseña/i, { selector: 'input' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Crear cuenta institucional' })).getByRole('radio', { name: 'Enviar por correo a la persona titular' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta institucional' }))
    expect(await screen.findByText(successMessage)).toHaveAttribute('role', 'status')
    expect(accountRequest).toHaveBeenCalledTimes(1)
    const [url, options] = accountRequest.mock.calls[0]
    expect(url).toBe('/api/institution-accounts')
    expect(options?.method).toBe('POST')
    expect(JSON.parse(options?.body as string)).toEqual({ ...input, delivery_method: 'email' })
    expect(screen.getByLabelText('Nombre de la cuenta')).toHaveValue('')
    expect(screen.getByLabelText('Correo de acceso')).toHaveValue('')
    expect(document.body.textContent).not.toContain('token=secreto')
    expect(document.querySelector('a[href*="set-initial-password"]')).not.toBeInTheDocument()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('confirma la cuenta creada aunque falle el correo y ofrece un reenvío recuperable', async () => {
    accountRequest.mockResolvedValueOnce(Response.json({ data: account, setup_delivery: 'pending' }, { status: 201 }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta institucional' }))
    expect(await screen.findByText('Cuenta creada. No se confirmó el envío del correo. Puedes reenviar el enlace de configuración para completar el alta.')).toHaveAttribute('role', 'status')
    expect(screen.getByLabelText('Nombre de la cuenta')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Reenviar enlace de configuración' })).toBeEnabled()
    expect(accountRequest).toHaveBeenCalledTimes(1)
  })

  it('valida campos obligatorios y correo antes de enviar', async () => {
    renderApp()
    const button = await screen.findByRole('button', { name: 'Crear cuenta institucional' })
    fireEvent.click(button)
    expect(screen.getByLabelText('Nombre de la cuenta')).toBeInvalid()
    expect(screen.getByLabelText('Correo de acceso')).toBeInvalid()
    await fillForm()
    fireEvent.change(screen.getByLabelText('Correo de acceso'), { target: { value: 'invalido' } })
    fireEvent.click(button)
    expect(screen.getByLabelText('Correo de acceso')).toBeInvalid()
    expect(accountRequest).not.toHaveBeenCalled()
  })

  it('rechaza un nombre formado por espacios', async () => {
    renderApp()
    await fillForm()
    fireEvent.change(screen.getByLabelText('Nombre de la cuenta'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta institucional' }))
    expect(await screen.findByText('El nombre de la cuenta es obligatorio.')).toBeInTheDocument()
    expect(accountRequest).not.toHaveBeenCalled()
  })

  it('conserva valores y presenta el correo duplicado como error accesible', async () => {
    accountRequest.mockResolvedValueOnce(Response.json({ errors: { email: ['El correo ya está registrado.'] } }, { status: 422 }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta institucional' }))
    expect(await screen.findByText('El correo ya está registrado.')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo de acceso')).toHaveAccessibleDescription('El correo ya está registrado.')
    expect(screen.getByLabelText('Nombre de la cuenta')).toHaveValue(input.name)
    expect(screen.getByLabelText('Correo de acceso')).toHaveValue(input.email)
    expect(screen.queryByText(successMessage)).not.toBeInTheDocument()
  })

  it('muestra la validación de institución si se inactiva antes de terminar el alta', async () => {
    accountRequest.mockResolvedValueOnce(Response.json({ errors: { institution_id: ['La institución debe estar activa.'] } }, { status: 422 }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta institucional' }))
    expect(await screen.findByText('La institución debe estar activa.')).toBeInTheDocument()
    expect(screen.queryByText(successMessage)).not.toBeInTheDocument()
  })

  it('impide envíos duplicados y espera confirmación del servidor', async () => {
    let resolve!: (response: Response) => void
    accountRequest.mockReturnValueOnce(new Promise<Response>((done) => { resolve = done }))
    renderApp()
    await fillForm()
    const button = screen.getByRole('button', { name: 'Crear cuenta institucional' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(accountRequest).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Creando cuenta…' })).toBeDisabled()
    expect(screen.queryByText(successMessage)).not.toBeInTheDocument()
    await act(async () => { resolve(Response.json({ data: account }, { status: 201 })) })
    expect(await screen.findByText(successMessage)).toBeInTheDocument()
  })

  it.each([403, 419, 500])('no anuncia éxito ante HTTP %i y conserva los datos', async (status) => {
    accountRequest.mockResolvedValueOnce(new Response(null, { status }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta institucional' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(successMessage)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Correo de acceso')).toHaveValue(input.email)
    expect(screen.getByRole('button', { name: 'Crear cuenta institucional' })).toBeEnabled()
    expect(accountRequest).toHaveBeenCalledTimes(1)
  })

  it('finaliza la sesión local ante una respuesta de institución inactiva', async () => {
    accountRequest.mockResolvedValueOnce(Response.json({ code: 'INSTITUTION_INACTIVE', message: 'Texto no confiable' }, { status: 401 }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta institucional' }))
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('La institución está inactiva. No puedes acceder al sistema.')
    expect(screen.queryByText('Texto no confiable')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre de la cuenta')).not.toBeInTheDocument()
  })

  it('no ofrece creación en una institución inactiva', async () => {
    isActive = false
    renderApp()
    expect(await screen.findByText('Activa la institución para crear una cuenta institucional.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crear cuenta institucional' })).not.toBeInTheDocument()
    expect(accountRequest).not.toHaveBeenCalled()
  })

  it.each(['INSTITUTION', 'COMPANY', 'SECRETARY'])('impide al rol %s abrir el formulario administrativo', async (otherRole) => {
    role = otherRole
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre de la cuenta')).not.toBeInTheDocument()
    expect(accountRequest).not.toHaveBeenCalled()
  })
})

describe('enlace manual en el alta HU-S2-01', () => {
  const link = 'http://localhost:5173/set-initial-password?email=titular%40example.test&token=token-manual'

  async function createManually() {
    accountRequest.mockResolvedValueOnce(Response.json({ data: account, setup_delivery: 'manual', setup_url: link }, { status: 201 }))
    renderApp()
    await fillForm()
    fireEvent.click(within(screen.getByRole('region', { name: 'Crear cuenta institucional' })).getByRole('radio', { name: /Generar un enlace para compartirlo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta institucional' }))
    return screen.findByLabelText('Enlace de configuración')
  }

  it('muestra el enlace de solo lectura, sin vínculo clicable ni almacenamiento (CA-01, CA-03)', async () => {
    const field = await createManually()
    expect(JSON.parse(accountRequest.mock.calls[0][1]?.body as string)).toEqual({ ...input, delivery_method: 'manual' })
    expect(screen.getByText('Cuenta creada. Copia el enlace de configuración y compártelo con la persona titular.')).toHaveAttribute('role', 'status')
    expect(field).toHaveValue(link)
    expect(field).toHaveAttribute('readonly')
    expect(field).toHaveAccessibleDescription(/caduca en 60 minutos, solo puede usarse una vez/)
    expect(document.querySelector('a[href*="set-initial-password"]')).not.toBeInTheDocument()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('copia el enlace al portapapeles (CA-04)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await createManually()
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))
    expect(await screen.findByText('Enlace copiado al portapapeles.')).toHaveAttribute('role', 'status')
    expect(writeText).toHaveBeenCalledWith(link)
  })

  it('selecciona el enlace y lo indica si no se puede copiar automáticamente', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denegado')) } })
    const field = await createManually() as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo copiar automáticamente')
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe(link.length)
  })

  it('retira el enlace anterior al crear otra cuenta', async () => {
    await createManually()
    let resolve!: (response: Response) => void
    accountRequest.mockReturnValueOnce(new Promise<Response>((done) => { resolve = done }))
    fireEvent.change(screen.getByLabelText('Nombre de la cuenta'), { target: { value: 'Otra cuenta' } })
    fireEvent.change(screen.getByLabelText('Correo de acceso'), { target: { value: 'otra@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta institucional' }))
    await waitFor(() => expect(screen.queryByLabelText('Enlace de configuración')).not.toBeInTheDocument())
    await act(async () => { resolve(Response.json({ data: { ...account, email: 'otra@example.test' }, setup_delivery: 'sent' }, { status: 201 })) })
    expect(await screen.findByText(successMessage)).toBeInTheDocument()
    expect(screen.queryByLabelText('Enlace de configuración')).not.toBeInTheDocument()
  })
})
