import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const admin = { id: 1, name: 'Dirección General', email: 'direccion@example.test', role: 'ADMIN', institution: null }
const accounts = [
  { id: 1, name: 'Dirección General', email: 'direccion@example.test', status: 'active', created_at: '2026-10-20T10:00:00Z' },
  { id: 2, name: 'Operación', email: 'operacion@example.test', status: 'active', created_at: '2026-11-21T10:00:00Z' },
  { id: 3, name: 'Pendiente', email: 'pendiente@example.test', status: 'pending', created_at: '2026-11-22T10:00:00Z' },
]
const listResponse = (data = accounts) => Response.json({ data, meta: { current_page: 1, last_page: 1, total: data.length } })

function renderApp(path = '/admin-accounts') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}
const calls = (method: string) => apiMock.mock.calls.filter(([, options]) => options?.method === method)

beforeEach(() => {
  user = admin
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/api/me') return Response.json({ user })
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    return apiMock(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('cuentas de Administración HU-S16-02', () => {
  it('ofrece la sección desde el inicio del ADMIN (CA-05)', async () => {
    renderApp('/')
    const navigation = await screen.findByRole('navigation', { name: 'Administración' })
    expect(within(navigation).getByRole('link', { name: /Cuentas de Administración/ })).toHaveAttribute('href', '/admin-accounts')
  })

  it('niega la sección a la Secretaría', async () => {
    user = { id: 9, name: 'Laura', email: 'laura@economia.test', role: 'SECRETARY', institution: null }
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para gestionar las cuentas de Administración.')
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('lista las cuentas con su estado y no ofrece inactivar la propia (CA-02, CA-05)', async () => {
    apiMock.mockResolvedValueOnce(listResponse())
    renderApp()
    const table = await screen.findByRole('table', { name: 'Cuentas de Administración' })
    expect(apiMock.mock.calls[0][0]).toBe('/api/admin-accounts?page=1')
    expect(within(table).getByRole('row', { name: /Pendiente/ })).toHaveTextContent('PENDIENTE')
    expect(within(table).queryByRole('button', { name: 'Inactivar la cuenta de Dirección General' })).not.toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'Inactivar la cuenta de Operación' })).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'Reenviar enlace a Pendiente' })).toBeInTheDocument()
  })

  it('invita a un Administrador con enlace manual desde la hoja (CA-01)', async () => {
    apiMock.mockResolvedValueOnce(listResponse())
      .mockResolvedValueOnce(Response.json({ setup_delivery: 'manual', setup_url: 'http://localhost:5173/set-initial-password?email=nuevo%40example.test&token=abc',
        data: { id: 4, name: 'Nuevo', email: 'nuevo@example.test', status: 'pending', created_at: '2026-11-22T12:00:00Z' } }, { status: 201 }))
      .mockResolvedValueOnce(listResponse())
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva cuenta de Administración' }))
    const sheet = await screen.findByRole('dialog', { name: 'Nueva cuenta de Administración' })
    fireEvent.change(within(sheet).getByLabelText(/Nombre/), { target: { value: 'Nuevo' } })
    fireEvent.change(within(sheet).getByLabelText(/Correo/), { target: { value: 'nuevo@example.test' } })
    fireEvent.click(within(sheet).getByRole('radio', { name: /Generar un enlace/ }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Crear cuenta de Administración' }))

    await waitFor(() => expect(calls('POST')[0][0]).toBe('/api/admin-accounts'))
    expect(JSON.parse(calls('POST')[0][1]?.body as string)).toEqual({ name: 'Nuevo', email: 'nuevo@example.test', delivery_method: 'manual' })
    expect(await within(sheet).findByDisplayValue(/set-initial-password/)).toBeInTheDocument()
  })

  it('muestra el aviso del servidor si la inactivación dejaría la plataforma sin Administrador (CA-03)', async () => {
    apiMock.mockResolvedValueOnce(listResponse())
      .mockResolvedValueOnce(Response.json({ message: 'Invalid', errors: { is_active: ['No puedes inactivar al último Administrador activo.'] } }, { status: 422 }))
    renderApp()
    const table = await screen.findByRole('table', { name: 'Cuentas de Administración' })
    fireEvent.click(within(table).getByRole('button', { name: 'Inactivar la cuenta de Operación' }))
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: '¿Inactivar la cuenta?' })).getByRole('button', { name: 'Inactivar' }))

    expect(await screen.findByText('No puedes inactivar al último Administrador activo.')).toBeInTheDocument()
    expect(calls('PATCH')[0][0]).toBe('/api/admin-accounts/2/status')
    expect(within(table).getByRole('row', { name: /Operación/ })).toHaveTextContent('ACTIVA')
  })
})
