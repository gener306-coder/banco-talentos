import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const institution = { id: 7, name: 'Instituto Dual', cct: 'CCT-7', contact_email: 'contacto@example.test', is_active: true, created_at: '2026-09-30', updated_at: '2026-09-30' }
const email = 'titular@example.test'
const fetchMock = vi.fn<typeof fetch>()
const resendRequest = vi.fn<typeof fetch>()
let isActive: boolean
let role: string

function renderApp() {
  return render(<MemoryRouter initialEntries={['/institutions/7']}><App /></MemoryRouter>)
}

async function fillForm() {
  fireEvent.change(await screen.findByLabelText('Correo de la cuenta pendiente'), { target: { value: email } })
}

beforeEach(() => {
  isActive = true
  role = 'ADMIN'
  resendRequest.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/api/me') return Response.json({ user: { id: 1, name: 'Admin', email: 'admin@example.test', role } })
    if (path === '/api/institutions/7') return Response.json({ data: { ...institution, is_active: isActive } })
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    return resendRequest(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('reenvío administrativo del enlace inicial', () => {
  it('permanece disponible al volver al detalle sin necesitar una creación previa', async () => {
    const view = renderApp()
    expect(await screen.findByRole('button', { name: 'Reenviar enlace de configuración' })).toBeEnabled()
    view.unmount()
    renderApp()
    expect(await screen.findByRole('button', { name: 'Reenviar enlace de configuración' })).toBeEnabled()
    expect(resendRequest).not.toHaveBeenCalled()
  })

  it('envía correo e institución y nunca muestra ni almacena el enlace', async () => {
    resendRequest.mockResolvedValueOnce(Response.json({ setup_delivery: 'sent', setup_url: 'https://private.example.test?token=secret' }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar enlace de configuración' }))
    expect(await screen.findByText(/Enlace de configuración solicitado/)).toHaveAttribute('role', 'status')
    expect(resendRequest).toHaveBeenCalledTimes(1)
    const [path, options] = resendRequest.mock.calls[0]
    expect(path).toBe('/api/institution-accounts/resend-setup')
    expect(options?.method).toBe('POST')
    expect(JSON.parse(options?.body as string)).toEqual({ email, institution_id: 7 })
    expect(document.body.textContent).not.toContain('token=secret')
    expect(document.querySelector('a[href*="private.example.test"]')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('comunica una entrega pendiente y permite reintentar sin perder el correo', async () => {
    resendRequest.mockResolvedValueOnce(Response.json({ setup_delivery: 'pending' }))
      .mockResolvedValueOnce(Response.json({ setup_delivery: 'sent' }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar enlace de configuración' }))
    expect(await screen.findByText(/El envío del correo sigue sin confirmarse/)).toHaveAttribute('role', 'status')
    expect(screen.getByLabelText('Correo de la cuenta pendiente')).toHaveValue(email)
    expect(resendRequest).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar enlace de configuración' }))
    expect(await screen.findByText(/Enlace de configuración solicitado/)).toBeInTheDocument()
    expect(resendRequest).toHaveBeenCalledTimes(2)
  })

  it('valida el correo antes de solicitar el reenvío', async () => {
    renderApp()
    const button = await screen.findByRole('button', { name: 'Reenviar enlace de configuración' })
    fireEvent.click(button)
    expect(screen.getByLabelText('Correo de la cuenta pendiente')).toBeInvalid()
    fireEvent.change(screen.getByLabelText('Correo de la cuenta pendiente'), { target: { value: 'invalido' } })
    fireEvent.click(button)
    expect(screen.getByLabelText('Correo de la cuenta pendiente')).toBeInvalid()
    expect(resendRequest).not.toHaveBeenCalled()
  })

  it('muestra una cuenta no elegible junto al campo de correo', async () => {
    resendRequest.mockResolvedValueOnce(Response.json({ errors: { email: ['La cuenta no está pendiente.'] } }, { status: 422 }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar enlace de configuración' }))
    expect(await screen.findByText('La cuenta no está pendiente.')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo de la cuenta pendiente')).toHaveAccessibleDescription('La cuenta no está pendiente.')
    expect(screen.getByLabelText('Correo de la cuenta pendiente')).toHaveValue(email)
    expect(screen.queryByText(/Enlace de configuración solicitado/)).not.toBeInTheDocument()
  })

  it('explica el límite de un minuto sin reintentar automáticamente', async () => {
    resendRequest.mockResolvedValueOnce(new Response(null, { status: 429 }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar enlace de configuración' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Espera al menos un minuto')
    expect(screen.getByLabelText('Correo de la cuenta pendiente')).toHaveValue(email)
    expect(resendRequest).toHaveBeenCalledTimes(1)
  })

  it('impide un reenvío duplicado mientras espera al servidor', async () => {
    let resolve!: (response: Response) => void
    resendRequest.mockReturnValueOnce(new Promise<Response>((done) => { resolve = done }))
    renderApp()
    await fillForm()
    const button = screen.getByRole('button', { name: 'Reenviar enlace de configuración' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(resendRequest).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Reenviando enlace…' })).toBeDisabled()
    await act(async () => { resolve(Response.json({ setup_delivery: 'sent' })) })
    expect(await screen.findByText(/Enlace de configuración solicitado/)).toBeInTheDocument()
  })

  it.each([403, 419, 500])('conserva el correo sin anunciar éxito ante HTTP %i', async (status) => {
    resendRequest.mockResolvedValueOnce(new Response(null, { status }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar enlace de configuración' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo de la cuenta pendiente')).toHaveValue(email)
    expect(screen.queryByText(/Enlace de configuración solicitado/)).not.toBeInTheDocument()
    expect(resendRequest).toHaveBeenCalledTimes(1)
  })

  it('oculta el reenvío para instituciones inactivas', async () => {
    isActive = false
    renderApp()
    expect(await screen.findByText('Activa la institución para crear una cuenta institucional.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reenviar enlace de configuración' })).not.toBeInTheDocument()
  })

  it.each(['INSTITUTION', 'COMPANY', 'SECRETARY'])('no ofrece reenvío al rol %s', async (otherRole) => {
    role = otherRole
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Correo de la cuenta pendiente')).not.toBeInTheDocument()
    expect(resendRequest).not.toHaveBeenCalled()
  })
})
