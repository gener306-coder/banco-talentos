import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'

const user = { id: 1, name: 'Ana García', email: 'ana@example.test', role: 'ADMIN' }
const fetchMock = vi.fn<typeof fetch>()

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}

function renderApp(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)
}

function csrfResponse() {
  document.cookie = 'XSRF-TOKEN=csrf%3D; Path=/'
  return Promise.resolve(new Response(null, { status: 204 }))
}

async function fillLogin() {
  await screen.findByRole('heading', { name: 'Iniciar sesión' })
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: user.email } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'contraseña-segura' } })
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('acceso y sesión', () => {
  it('espera a comprobar la sesión antes de mostrar contenido o redirigir', async () => {
    let resolve!: (value: Response) => void
    fetchMock.mockReturnValueOnce(new Promise<Response>((done) => { resolve = done }))
    renderApp()
    expect(screen.getByText('Comprobando sesión…')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sesión iniciada' })).not.toBeInTheDocument()
    await act(async () => { resolve(new Response(null, { status: 401 })) })
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/login')
  })

  it.each([
    ['ADMIN', 'Administrador'],
    ['INSTITUTION', 'Institución'],
    ['COMPANY', 'Empresa'],
    ['SECRETARY', 'Secretaría de Economía'],
  ])('restaura la sesión de %s al recargar y ofrece únicamente su identidad y salir', async (role, label) => {
    fetchMock.mockResolvedValueOnce(Response.json({ user: { ...user, role } }))
    renderApp()
    expect(await screen.findByText(user.email)).toBeInTheDocument()
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me')
  })

  it('redirige a un usuario autenticado desde login al área protegida', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ user }))
    renderApp('/login')
    await screen.findByText(user.email)
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/')
  })

  it('inicia sesión con CSRF, impide doble envío y no guarda credenciales en storage', async () => {
    let resolve!: (value: Response) => void
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockImplementationOnce(csrfResponse)
      .mockReturnValueOnce(new Promise<Response>((done) => { resolve = done }))
    renderApp('/login')
    await fillLogin()
    expect(screen.getByRole('button', { name: 'Iniciando sesión…' })).toBeDisabled()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    await act(async () => { resolve(Response.json({ user })) })
    expect(await screen.findByText(user.email)).toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
  })

  it('muestra el mismo error genérico para credenciales inválidas y permite reintentar', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockImplementationOnce(csrfResponse)
      .mockResolvedValueOnce(Response.json({ message: 'Cuenta inactiva o no existente' }, { status: 422 }))
      .mockImplementationOnce(csrfResponse)
      .mockResolvedValueOnce(Response.json({ user }))
    renderApp('/login')
    await fillLogin()
    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible iniciar sesión con esos datos.')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/login')
    await fillLogin()
    expect(await screen.findByText(user.email)).toBeInTheDocument()
  })

  it.each([
    [401, 'Tu sesión terminó'],
    [419, 'Tu sesión terminó'],
    [403, 'No tienes permiso'],
    [429, 'Demasiados intentos'],
  ])('presenta una respuesta %i de login de forma controlada', async (status, message) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockImplementationOnce(csrfResponse)
      .mockResolvedValueOnce(new Response(null, { status }))
    renderApp('/login')
    await fillLogin()
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
    expect(screen.queryByText(user.email)).not.toBeInTheDocument()
  })

  it('permite reintentar si falla la red durante el login', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockRejectedValueOnce(new TypeError('Network error'))
      .mockImplementationOnce(csrfResponse)
      .mockResolvedValueOnce(Response.json({ user }))
    renderApp('/login')
    await fillLogin()
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectar')
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled()
    await fillLogin()
    expect(await screen.findByText(user.email)).toBeInTheDocument()
  })

  it('cierra sesión después de la respuesta del servidor y deniega acceso al recargar', async () => {
    let resolve!: (value: Response) => void
    document.cookie = 'XSRF-TOKEN=csrf; Path=/'
    fetchMock.mockResolvedValueOnce(Response.json({ user }))
      .mockReturnValueOnce(new Promise<Response>((done) => { resolve = done }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
    const view = renderApp()
    await screen.findByText(user.email)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(screen.getByRole('button', { name: 'Cerrando sesión…' })).toBeDisabled()
    await act(async () => { resolve(new Response(null, { status: 204 })) })
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.queryByText(user.email)).not.toBeInTheDocument()
    view.unmount()
    renderApp()
    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/login')
  })

  it('limpia la sesión cuando logout responde 401', async () => {
    document.cookie = 'XSRF-TOKEN=csrf; Path=/'
    fetchMock.mockResolvedValueOnce(Response.json({ user }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
    renderApp()
    await screen.findByText(user.email)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión terminó')
    expect(screen.queryByText(user.email)).not.toBeInTheDocument()
  })

  it('conserva la sesión si el cierre sigue fallando con 419 tras renovar CSRF', async () => {
    document.cookie = 'XSRF-TOKEN=csrf; Path=/'
    fetchMock.mockResolvedValueOnce(Response.json({ user }))
      .mockResolvedValueOnce(new Response(null, { status: 419 }))
      .mockImplementationOnce(csrfResponse)
      .mockResolvedValueOnce(new Response(null, { status: 419 }))
    renderApp()
    await screen.findByText(user.email)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cerrar la sesión')
    expect(screen.getByText(user.email)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('mantiene la sesión y distingue un 403 de logout', async () => {
    document.cookie = 'XSRF-TOKEN=csrf; Path=/'
    fetchMock.mockResolvedValueOnce(Response.json({ user }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
    renderApp()
    await screen.findByText(user.email)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso')
    expect(screen.getByText(user.email)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled()
  })

  it('no anuncia un cierre exitoso ante un error de red y permite reintentarlo', async () => {
    document.cookie = 'XSRF-TOKEN=csrf; Path=/'
    fetchMock.mockResolvedValueOnce(Response.json({ user }))
      .mockRejectedValueOnce(new TypeError('Network error'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    renderApp()
    await screen.findByText(user.email)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectar')
    expect(screen.getByText(user.email)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })

  it('ofrece reintento ante un error de red al recuperar sesión sin mostrar el login', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network error'))
      .mockResolvedValueOnce(Response.json({ user }))
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectar')
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(user.email)).toBeInTheDocument()
  })

  it('muestra acceso denegado para un rol desconocido sin exponer el área protegida', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ user: { ...user, role: 'UNKNOWN' } }))
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument()
    expect(screen.queryByText(user.email)).not.toBeInTheDocument()
  })

  it('ignora una recuperación tardía de un montaje anterior tras cerrar sesión', async () => {
    let resolveStale!: (value: Response) => void
    document.cookie = 'XSRF-TOKEN=csrf; Path=/'
    fetchMock.mockReturnValueOnce(new Promise<Response>((done) => { resolveStale = done }))
      .mockResolvedValueOnce(Response.json({ user }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const staleView = renderApp()
    staleView.unmount()
    renderApp()
    await screen.findByText(user.email)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    await act(async () => { resolveStale(Response.json({ user })) })
    expect(screen.queryByText(user.email)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/login')
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })

  it('no inicia una recuperación concurrente que invalide el cierre de sesión pendiente', async () => {
    function Probe() {
      const { user: current, pending, restore, signOut } = useAuth()
      return <>
        <output>{current?.email ?? 'Sin sesión'}</output>
        <button onClick={() => { void restore() }}>Recuperar</button>
        <button disabled={pending} onClick={() => { void signOut() }}>Salir</button>
      </>
    }
    let resolve!: (value: Response) => void
    document.cookie = 'XSRF-TOKEN=csrf; Path=/'
    fetchMock.mockResolvedValueOnce(Response.json({ user }))
      .mockReturnValueOnce(new Promise<Response>((done) => { resolve = done }))
    render(<AuthProvider><Probe /></AuthProvider>)
    await screen.findByText(user.email)
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar' }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => { resolve(new Response(null, { status: 204 })) })
    expect(screen.getByText('Sin sesión')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salir' })).toBeEnabled()
  })
})
