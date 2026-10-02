import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { SetInitialPasswordPage } from './SetInitialPasswordPage'

const path = '/set-initial-password?email=titular%40example.test&token=token-de-un-solo-uso'
const password = 'Mi-contraseña-2026'
const fetchMock = vi.fn<typeof fetch>()
const setupRequest = vi.fn<typeof fetch>()

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

beforeEach(() => {
  setupRequest.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url, options) => {
    if (url === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    return setupRequest(url, options)
  })
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('configuración pública de contraseña inicial', () => {
  it('abre el enlace sin restaurar sesión y funciona aunque exista una sesión ADMIN', () => {
    document.cookie = 'session=admin; Path=/'
    renderApp()
    expect(screen.getByRole('heading', { name: 'Establecer contraseña' })).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'Establecer contraseña' }).textContent).not.toContain('token-de-un-solo-uso')
  })

  it('retira el token al cargar bajo StrictMode y conserva las credenciales solo en memoria', async () => {
    setupRequest.mockResolvedValueOnce(new Response(null, { status: 204 }))
    render(<StrictMode><MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter></StrictMode>)
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/set-initial-password')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Establecer contraseña' }))
    expect(await screen.findByText('Contraseña establecida. Ya puedes iniciar sesión.')).toBeInTheDocument()
    expect(JSON.parse(setupRequest.mock.calls[0][1]?.body as string)).toMatchObject({ email: 'titular@example.test', token: 'token-de-un-solo-uso' })
    for (const [, options] of fetchMock.mock.calls) expect(options?.referrerPolicy).toBe('no-referrer')
  })

  it('al recargar la dirección limpia requiere volver a abrir el enlace', () => {
    const view = renderApp()
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/set-initial-password')
    view.unmount()
    renderApp('/set-initial-password')
    expect(screen.getByRole('alert')).toHaveTextContent('El enlace de configuración no es válido')
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('reemplaza el historial y no restaura el token al volver adelante', () => {
    function HistoryControls() {
      const navigate = useNavigate()
      return <><button onClick={() => navigate(-1)}>Atrás</button><button onClick={() => navigate(1)}>Adelante</button></>
    }
    render(<MemoryRouter initialEntries={['/other', path]} initialIndex={1}>
      <Routes>
        <Route path="/other" element={<p>Otra página</p>} />
        <Route path="/set-initial-password" element={<SetInitialPasswordPage />} />
      </Routes>
      <HistoryControls /><Location />
    </MemoryRouter>)
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/set-initial-password')
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(screen.getByText('Otra página')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Adelante' }))
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/set-initial-password')
    expect(screen.getByRole('alert')).toHaveTextContent('El enlace de configuración no es válido')
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('establece la contraseña tras confirmar el servidor, borra los secretos y ofrece iniciar sesión', async () => {
    setupRequest.mockResolvedValueOnce(new Response(null, { status: 204 }))
    renderApp()
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Establecer contraseña' }))
    expect(await screen.findByText('Contraseña establecida. Ya puedes iniciar sesión.')).toHaveAttribute('role', 'status')
    expect(setupRequest).toHaveBeenCalledTimes(1)
    const [url, options] = setupRequest.mock.calls[0]
    expect(url).toBe('/api/institution-accounts/password-setup')
    expect(JSON.parse(options?.body as string)).toEqual({
      email: 'titular@example.test', token: 'token-de-un-solo-uso', password, password_confirmation: password,
    })
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login')
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Confirmar contraseña')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Ruta actual').textContent).toBe('/set-initial-password'))
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it.each(['/set-initial-password', '/set-initial-password?email=titular%40example.test', '/set-initial-password?token=token'])('rechaza el enlace incompleto %s sin hacer solicitudes', (initialPath) => {
    renderApp(initialPath)
    expect(screen.getByRole('alert')).toHaveTextContent('El enlace de configuración no es válido')
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('valida mínimo de caracteres y confirmación antes de enviar', () => {
    renderApp()
    fillForm('breve', 'otra')
    fireEvent.click(screen.getByRole('button', { name: 'Establecer contraseña' }))
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(/al menos 12 caracteres/)
    expect(screen.getByText('La contraseña debe tener al menos 12 caracteres.')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmar contraseña')).toHaveAccessibleDescription('La confirmación de la contraseña no coincide.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cuenta bytes UTF-8: rechaza 37 letras acentuadas aunque sean menos de 72 caracteres', () => {
    renderApp()
    fillForm('á'.repeat(37))
    fireEvent.click(screen.getByRole('button', { name: 'Establecer contraseña' }))
    expect(screen.getByText('La contraseña no debe superar 72 bytes.')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('permite exactamente 72 bytes UTF-8', async () => {
    setupRequest.mockResolvedValueOnce(new Response(null, { status: 204 }))
    renderApp()
    fillForm('á'.repeat(36))
    fireEvent.click(screen.getByRole('button', { name: 'Establecer contraseña' }))
    expect(await screen.findByText('Contraseña establecida. Ya puedes iniciar sesión.')).toBeInTheDocument()
    expect(setupRequest).toHaveBeenCalledTimes(1)
  })

  it('rechaza el carácter nulo antes de enviar', () => {
    renderApp()
    fillForm('Clave-segura-2026\0')
    fireEvent.click(screen.getByRole('button', { name: 'Establecer contraseña' }))
    expect(screen.getByText('La contraseña contiene un carácter no permitido.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['inválido', 'caducado', 'utilizado'])('presenta de forma segura un token %s rechazado por backend', async (reason) => {
    setupRequest.mockResolvedValueOnce(Response.json({ errors: { token: [`Token ${reason}: contenido privado`] } }, { status: 422 }))
    renderApp()
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Establecer contraseña' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace de configuración no es válido, ha caducado o ya fue utilizado.')
    expect(screen.queryByText(/contenido privado/)).not.toBeInTheDocument()
    expect(screen.queryByText('Contraseña establecida. Ya puedes iniciar sesión.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Establecer contraseña' })).toBeEnabled()
  })

  it('muestra errores backend por campo sin anunciar éxito', async () => {
    setupRequest.mockResolvedValueOnce(Response.json({ errors: { password: ['La contraseña no cumple la validación.'] } }, { status: 422 }))
    renderApp()
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Establecer contraseña' }))
    expect(await screen.findByText('La contraseña no cumple la validación.')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(/La contraseña no cumple la validación/)
    expect(screen.queryByText('Contraseña establecida. Ya puedes iniciar sesión.')).not.toBeInTheDocument()
  })

  it('impide doble envío y espera la respuesta del servidor', async () => {
    let resolve!: (response: Response) => void
    setupRequest.mockReturnValueOnce(new Promise<Response>((done) => { resolve = done }))
    renderApp()
    fillForm()
    const button = screen.getByRole('button', { name: 'Establecer contraseña' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(setupRequest).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Estableciendo contraseña…' })).toBeDisabled()
    expect(screen.queryByText('Contraseña establecida. Ya puedes iniciar sesión.')).not.toBeInTheDocument()
    await act(async () => { resolve(new Response(null, { status: 204 })) })
    expect(await screen.findByText('Contraseña establecida. Ya puedes iniciar sesión.')).toBeInTheDocument()
  })

  it.each([419, 429, 500])('conserva el formulario y permite reintentar ante HTTP %i', async (status) => {
    setupRequest.mockResolvedValueOnce(new Response(null, { status }))
    renderApp()
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Establecer contraseña' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Establecer contraseña' })).toBeEnabled()
    expect(screen.queryByText('Contraseña establecida. Ya puedes iniciar sesión.')).not.toBeInTheDocument()
    expect(setupRequest).toHaveBeenCalledTimes(1)
  })

  it('no repite una escritura al perder conexión y permite un reintento manual', async () => {
    setupRequest.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    renderApp()
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Establecer contraseña' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectar con el servidor.')
    expect(setupRequest).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Establecer contraseña' }))
    expect(await screen.findByText('Contraseña establecida. Ya puedes iniciar sesión.')).toBeInTheDocument()
    expect(setupRequest).toHaveBeenCalledTimes(2)
  })
})

describe('estado de la cuenta al establecer contraseña', () => {
  it.each([
    ['INSTITUTION_INACTIVE', 'La institución está inactiva. No puedes acceder al sistema.'],
    ['ACCOUNT_INACTIVE', 'La cuenta está inactiva. No puedes acceder al sistema.'],
  ])('muestra un mensaje seguro cuando backend rechaza %s', async (code, message) => {
    setupRequest.mockResolvedValueOnce(Response.json({ code, message: 'No mostrar este texto arbitrario' }, { status: 403 }))
    renderApp()
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Establecer contraseña' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByText('No mostrar este texto arbitrario')).not.toBeInTheDocument()
    expect(screen.queryByText('Contraseña establecida. Ya puedes iniciar sesión.')).not.toBeInTheDocument()
  })
})
