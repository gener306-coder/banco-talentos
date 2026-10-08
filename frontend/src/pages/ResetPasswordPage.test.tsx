import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { ResetPasswordPage } from './ResetPasswordPage'

const path = '/reset-password?email=titular%40example.test&token=token-de-restablecimiento'
const password = 'Nueva-contraseña-2026'
const success = 'Contraseña restablecida. Ya puedes iniciar sesión con tu nueva contraseña.'
const invalidLink = 'El enlace de restablecimiento no es válido, ha caducado o ya fue utilizado.'
const fetchMock = vi.fn<typeof fetch>()
const resetRequest = vi.fn<typeof fetch>()

function Location() {
  const location = useLocation()
  return <output aria-label="Ruta actual">{location.pathname}{location.search}</output>
}

function renderApp(initialPath = path) {
  return render(<MemoryRouter initialEntries={[initialPath]}><App /><Location /></MemoryRouter>)
}

function fillForm(value = password, confirmation = value) {
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value } })
  fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: confirmation } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }))
}

beforeEach(() => {
  resetRequest.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url, options) => {
    if (url === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    return resetRequest(url, options)
  })
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('restablecimiento público de contraseña HU-S1-04', () => {
  it('abre el enlace sin restaurar sesión aunque exista una sesión ADMIN y no muestra el token', () => {
    document.cookie = 'session=admin; Path=/'
    renderApp()
    const region = screen.getByRole('region', { name: 'Restablecer contraseña' })
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Confirmar contraseña')).toBeInTheDocument()
    expect(region.textContent).not.toContain('token-de-restablecimiento')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retira email y token de la URL al cargar bajo StrictMode y los conserva solo en memoria', async () => {
    resetRequest.mockResolvedValueOnce(new Response(null, { status: 204 }))
    render(<StrictMode><MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter></StrictMode>)
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/reset-password')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    fillForm()
    submit()
    expect(await screen.findByText(success)).toBeInTheDocument()
    expect(JSON.parse(resetRequest.mock.calls[0][1]?.body as string))
      .toMatchObject({ email: 'titular@example.test', token: 'token-de-restablecimiento' })
    for (const [, options] of fetchMock.mock.calls) expect(options?.referrerPolicy).toBe('no-referrer')
  })

  it('reemplaza el historial y no restaura el token al volver adelante', () => {
    function HistoryControls() {
      const navigate = useNavigate()
      return <><button onClick={() => navigate(-1)}>Atrás</button><button onClick={() => navigate(1)}>Adelante</button></>
    }
    render(<MemoryRouter initialEntries={['/other', path]} initialIndex={1}>
      <Routes>
        <Route path="/other" element={<p>Otra página</p>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
      <HistoryControls /><Location />
    </MemoryRouter>)
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/reset-password')
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adelante' }))
    expect(screen.getByRole('alert')).toHaveTextContent(invalidLink)
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
  })

  it('restablece tras confirmar el servidor, borra los secretos y no inicia sesión', async () => {
    resetRequest.mockResolvedValueOnce(new Response(null, { status: 204 }))
    renderApp()
    fillForm()
    submit()
    expect(await screen.findByText(success)).toHaveAttribute('role', 'status')
    const [url, options] = resetRequest.mock.calls[0]
    expect(url).toBe('/api/institution-accounts/password-reset')
    expect(JSON.parse(options?.body as string)).toEqual({
      email: 'titular@example.test', token: 'token-de-restablecimiento', password, password_confirmation: password,
    })
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login')
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([called]) => called)).not.toContain('/api/me')
    await waitFor(() => expect(screen.getByLabelText('Ruta actual').textContent).toBe('/reset-password'))
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it.each(['/reset-password', '/reset-password?email=titular%40example.test', '/reset-password?token=token'])('rechaza el enlace incompleto %s sin hacer solicitudes', (initialPath) => {
    renderApp(initialPath)
    expect(screen.getByRole('alert')).toHaveTextContent(invalidLink)
    expect(screen.getByText('Solicita a administración un nuevo restablecimiento de contraseña.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aplica la política de contraseña antes de enviar', () => {
    renderApp()
    fillForm('breve', 'otra')
    submit()
    expect(screen.getByText('La contraseña debe tener al menos 12 caracteres.')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmar contraseña')).toHaveAccessibleDescription('La confirmación de la contraseña no coincide.')
    fillForm('á'.repeat(37))
    submit()
    expect(screen.getByText('La contraseña no debe superar 72 bytes.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['token', 'email'])('presenta de forma segura un rechazo del enlace en %s', async (field) => {
    resetRequest.mockResolvedValueOnce(Response.json({ errors: { [field]: ['contenido privado'] } }, { status: 422 }))
    renderApp()
    fillForm()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(invalidLink)
    expect(screen.queryByText(/contenido privado/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restablecer contraseña' })).toBeEnabled()
  })

  it('muestra errores de la contraseña devueltos por backend en su campo', async () => {
    resetRequest.mockResolvedValueOnce(Response.json({ errors: { password: ['La contraseña no cumple la validación.'] } }, { status: 422 }))
    renderApp()
    fillForm()
    submit()
    expect(await screen.findByText('La contraseña no cumple la validación.')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(/La contraseña no cumple la validación/)
    expect(screen.queryByText(success)).not.toBeInTheDocument()
  })

  it.each([
    ['INSTITUTION_INACTIVE', 'La institución está inactiva. No puedes acceder al sistema.'],
    ['ACCOUNT_INACTIVE', 'La cuenta está inactiva. No puedes acceder al sistema.'],
  ])('muestra un mensaje seguro cuando backend rechaza %s', async (code, message) => {
    resetRequest.mockResolvedValueOnce(Response.json({ code, message: 'No mostrar este texto arbitrario' }, { status: 403 }))
    renderApp()
    fillForm()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByText('No mostrar este texto arbitrario')).not.toBeInTheDocument()
  })

  it('impide doble envío y espera la respuesta del servidor', async () => {
    let resolve!: (response: Response) => void
    resetRequest.mockReturnValueOnce(new Promise<Response>((done) => { resolve = done }))
    renderApp()
    fillForm()
    const button = screen.getByRole('button', { name: 'Restablecer contraseña' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(resetRequest).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Restableciendo contraseña…' })).toBeDisabled()
    await act(async () => { resolve(new Response(null, { status: 204 })) })
    expect(await screen.findByText(success)).toBeInTheDocument()
  })

  it.each([
    [419, 'No pudimos validar la solicitud.'],
    [429, 'Demasiados intentos.'],
    [500, 'No pudimos restablecer la contraseña.'],
  ])('conserva el formulario ante HTTP %i sin reintentar automáticamente', async (status, message) => {
    resetRequest.mockResolvedValueOnce(new Response(null, { status }))
    renderApp()
    fillForm()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: 'Restablecer contraseña' })).toBeEnabled()
    expect(resetRequest).toHaveBeenCalledTimes(1)
  })

  it('no repite la escritura al perder conexión y permite un reintento manual', async () => {
    resetRequest.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    renderApp()
    fillForm()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectar con el servidor.')
    expect(resetRequest).toHaveBeenCalledTimes(1)
    submit()
    expect(await screen.findByText(success)).toBeInTheDocument()
    expect(resetRequest).toHaveBeenCalledTimes(2)
  })
})
