import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const neutral = 'Si el correo corresponde a una cuenta activa, en unos minutos recibirás un enlace para restablecer tu contraseña. Revisa también tu carpeta de correo no deseado.'
const fetchMock = vi.fn<typeof fetch>()
const forgotMock = vi.fn<typeof fetch>()

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}
const renderApp = (path = '/forgot-password') => render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)

beforeEach(() => {
  forgotMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    if (path === '/api/password/forgot') return forgotMock(path, options)
    if (path === '/api/me') return Response.json({ message: 'Unauthenticated.' }, { status: 401 })
    return new Promise<Response>(() => undefined)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('«¿Olvidaste tu contraseña?» HU-S16-03', () => {
  it('el inicio de sesión enlaza la recuperación (CA-04)', async () => {
    renderApp('/login')
    fireEvent.click(await screen.findByRole('link', { name: '¿Olvidaste tu contraseña?' }))
    expect(await screen.findByRole('heading', { name: '¿Olvidaste tu contraseña?', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Ruta actual' })).toHaveTextContent('/forgot-password')
  })

  it('pide el enlace sin sesión y muestra el mensaje neutro del servidor (CA-01, CA-04)', async () => {
    forgotMock.mockResolvedValueOnce(Response.json({ message: neutral }, { status: 202 }))
    renderApp()
    // Sin sesión: no consulta /api/me.
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/me')).toBe(false)
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: ' persona@example.test ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))

    expect(await screen.findByText(neutral)).toBeInTheDocument()
    expect(JSON.parse(forgotMock.mock.calls[0][1]?.body as string)).toEqual({ email: 'persona@example.test' })
    expect(screen.getByRole('link', { name: 'Volver al inicio de sesión' })).toHaveAttribute('href', '/login')
    expect(screen.getByText(/Responsable de tus datos/)).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('valida el correo vacío sin enviar y muestra el error del servidor junto al campo', async () => {
    forgotMock.mockResolvedValueOnce(Response.json({ message: 'Invalid', errors: { email: ['Escribe un correo electrónico válido.'] } }, { status: 422 }))
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe tu correo electrónico.')
    expect(forgotMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'no-es-correo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(await screen.findByText('Escribe un correo electrónico válido.')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('aria-invalid', 'true')
  })

  it('explica el límite de solicitudes (CA-03)', async () => {
    forgotMock.mockResolvedValueOnce(Response.json({ message: 'Too Many Attempts.' }, { status: 429 }))
    renderApp()
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'persona@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya pediste varios enlaces. Espera un momento antes de volver a intentarlo.')
    expect(within(screen.getByRole('region', { name: '¿Olvidaste tu contraseña?' })).getByRole('button', { name: 'Enviar enlace' })).toBeEnabled()
  })
})
