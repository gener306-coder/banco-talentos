import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const institution = { id: 7, name: 'Instituto Dual', cct: 'CCT-7', contact_email: 'contacto@example.test', is_active: true, created_at: '2026-09-30', updated_at: '2026-09-30' }
const email = 'titular@example.test'
const fetchMock = vi.fn<typeof fetch>()
const resetRequest = vi.fn<typeof fetch>()
let isActive: boolean
let role: string

function renderApp() {
  return render(<MemoryRouter initialEntries={['/institutions/7']}><App /></MemoryRouter>)
}

async function fillForm() {
  fireEvent.change(await screen.findByLabelText('Correo de la cuenta institucional'), { target: { value: email } })
}

beforeEach(() => {
  isActive = true
  role = 'ADMIN'
  resetRequest.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/api/me') return Response.json({ user: { id: 1, name: 'Admin', email: 'admin@example.test', role } })
    if (path === '/api/institutions/7') return Response.json({ data: { ...institution, is_active: isActive } })
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    return resetRequest(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('inicio administrativo del restablecimiento HU-S1-04', () => {
  it('está disponible en el detalle de una institución activa', async () => {
    const view = renderApp()
    expect(await screen.findByRole('button', { name: 'Iniciar restablecimiento de contraseña' })).toBeEnabled()
    view.unmount()
    renderApp()
    expect(await screen.findByRole('button', { name: 'Iniciar restablecimiento de contraseña' })).toBeEnabled()
    expect(resetRequest).not.toHaveBeenCalled()
  })

  it('envía solo correo e institución, sin campos de contraseña, y nunca muestra ni almacena el enlace (CA-02, CA-03)', async () => {
    resetRequest.mockResolvedValueOnce(Response.json({ reset_delivery: 'sent', reset_url: 'https://private.example.test/reset-password?token=secret' }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar restablecimiento de contraseña' }))
    expect(await screen.findByText(/Se envió el enlace de restablecimiento/)).toHaveAttribute('role', 'status')
    expect(resetRequest).toHaveBeenCalledTimes(1)
    const [path, options] = resetRequest.mock.calls[0]
    expect(path).toBe('/api/institution-accounts/password-reset/start')
    expect(options?.method).toBe('POST')
    expect(JSON.parse(options?.body as string)).toEqual({ email, institution_id: 7 })
    expect(document.body.textContent).not.toContain('token=secret')
    expect(document.querySelector('a[href*="private.example.test"]')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/contraseña/i, { selector: 'input' })).not.toBeInTheDocument()
    expect(document.querySelector('input[type="password"]')).not.toBeInTheDocument()
    expect(screen.queryByText(/Nueva contraseña|Confirmar contraseña/)).not.toBeInTheDocument()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('comunica una entrega pendiente y permite reintentar sin perder el correo', async () => {
    resetRequest.mockResolvedValueOnce(Response.json({ reset_delivery: 'pending' }))
      .mockResolvedValueOnce(Response.json({ reset_delivery: 'sent' }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar restablecimiento de contraseña' }))
    expect(await screen.findByText(/El envío del correo sigue sin confirmarse. Espera un minuto/)).toHaveAttribute('role', 'status')
    expect(screen.getByLabelText('Correo de la cuenta institucional')).toHaveValue(email)
    expect(resetRequest).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar restablecimiento de contraseña' }))
    expect(await screen.findByText(/Se envió el enlace de restablecimiento/)).toBeInTheDocument()
    expect(resetRequest).toHaveBeenCalledTimes(2)
  })

  it('valida el correo antes de iniciar el restablecimiento', async () => {
    renderApp()
    const button = await screen.findByRole('button', { name: 'Iniciar restablecimiento de contraseña' })
    fireEvent.click(button)
    expect(screen.getByLabelText('Correo de la cuenta institucional')).toBeInvalid()
    fireEvent.change(screen.getByLabelText('Correo de la cuenta institucional'), { target: { value: 'invalido' } })
    fireEvent.click(button)
    expect(screen.getByLabelText('Correo de la cuenta institucional')).toBeInvalid()
    expect(resetRequest).not.toHaveBeenCalled()
  })

  it('muestra una cuenta no elegible, incluida una pendiente de configuración, junto al campo de correo', async () => {
    resetRequest.mockResolvedValueOnce(Response.json({ errors: { email: ['La cuenta aún no ha establecido su contraseña inicial. Reenvía el enlace de configuración.'] } }, { status: 422 }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar restablecimiento de contraseña' }))
    expect(await screen.findByText('La cuenta aún no ha establecido su contraseña inicial. Reenvía el enlace de configuración.')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo de la cuenta institucional')).toHaveAccessibleDescription('La cuenta aún no ha establecido su contraseña inicial. Reenvía el enlace de configuración.')
    expect(screen.getByLabelText('Correo de la cuenta institucional')).toHaveValue(email)
    expect(screen.queryByText(/Se envió el enlace de restablecimiento/)).not.toBeInTheDocument()
  })

  it('explica el límite de un minuto sin reintentar automáticamente', async () => {
    resetRequest.mockResolvedValueOnce(new Response(null, { status: 429 }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar restablecimiento de contraseña' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Espera al menos un minuto')
    expect(screen.getByLabelText('Correo de la cuenta institucional')).toHaveValue(email)
    expect(resetRequest).toHaveBeenCalledTimes(1)
  })

  it('impide un inicio duplicado mientras espera al servidor', async () => {
    let resolve!: (response: Response) => void
    resetRequest.mockReturnValueOnce(new Promise<Response>((done) => { resolve = done }))
    renderApp()
    await fillForm()
    const button = screen.getByRole('button', { name: 'Iniciar restablecimiento de contraseña' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(resetRequest).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Iniciando restablecimiento…' })).toBeDisabled()
    await act(async () => { resolve(Response.json({ reset_delivery: 'sent' })) })
    expect(await screen.findByText(/Se envió el enlace de restablecimiento/)).toBeInTheDocument()
  })

  it.each([403, 419, 500])('conserva el correo sin anunciar éxito ante HTTP %i', async (status) => {
    resetRequest.mockResolvedValueOnce(new Response(null, { status }))
    renderApp()
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar restablecimiento de contraseña' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo de la cuenta institucional')).toHaveValue(email)
    expect(screen.queryByText(/Se envió el enlace de restablecimiento/)).not.toBeInTheDocument()
    expect(resetRequest).toHaveBeenCalledTimes(1)
  })

  it('oculta la acción para instituciones inactivas', async () => {
    isActive = false
    renderApp()
    expect(await screen.findByText('Activa la institución para crear una cuenta institucional.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Iniciar restablecimiento de contraseña' })).not.toBeInTheDocument()
  })

  it.each(['INSTITUTION', 'COMPANY', 'SECRETARY'])('no ofrece la acción al rol %s (CA-01, CA-12)', async (otherRole) => {
    role = otherRole
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Correo de la cuenta institucional')).not.toBeInTheDocument()
    expect(resetRequest).not.toHaveBeenCalled()
  })
})
