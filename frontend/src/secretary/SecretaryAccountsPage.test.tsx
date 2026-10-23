import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const secretary = { id: 9, name: 'Laura Secretaría', email: 'laura@economia.test', role: 'SECRETARY', institution: null }
const admin = { id: 1, name: 'Admin', email: 'admin@example.test', role: 'ADMIN', institution: null }
const accounts = [
  { id: 9, name: 'Laura Secretaría', email: 'laura@economia.test', status: 'active', created_at: '2026-10-20T10:00:00Z' },
  { id: 10, name: 'Mario Pendiente', email: 'mario@economia.test', status: 'pending', created_at: '2026-10-21T10:00:00Z' },
]
const listResponse = (data = accounts) => Response.json({ data, meta: { current_page: 1, last_page: 1, total: data.length } })
const setupUrl = 'http://localhost:5173/set-initial-password?email=nora%40economia.test&token=abc'

function renderApp(path = '/secretary-accounts') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}
function posts() {
  return apiMock.mock.calls.filter(([, options]) => options?.method === 'POST')
}

beforeEach(() => {
  user = secretary
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

describe('cuentas de la Secretaría HU-S4-01', () => {
  it('ofrece la sección desde el inicio a SECRETARY y a ADMIN (CA-08)', async () => {
    renderApp('/')
    expect(await screen.findByRole('link', { name: 'Cuentas de la Secretaría' })).toHaveAttribute('href', '/secretary-accounts')

    user = admin
    renderApp('/')
    const navigation = await screen.findByRole('navigation', { name: 'Administración' })
    expect(within(navigation).getByRole('link', { name: 'Cuentas de la Secretaría' })).toBeInTheDocument()
    expect(within(navigation).getByRole('link', { name: 'Instituciones' })).toBeInTheDocument()
  })

  it('niega la sección a otros roles', async () => {
    user = { id: 3, name: 'Empresa', email: 'e@example.test', role: 'COMPANY', institution: null }
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para gestionar las cuentas de la Secretaría.')
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('lista las cuentas con su estado y fecha de alta (CA-05)', async () => {
    apiMock.mockResolvedValueOnce(listResponse())
    renderApp()
    const table = await screen.findByRole('table', { name: 'Cuentas de la Secretaría' })
    const rows = within(table).getAllByRole('row')
    expect(within(rows[1]).getByText('laura@economia.test')).toBeInTheDocument()
    expect(within(rows[1]).getByText('ACTIVA')).toBeInTheDocument()
    expect(within(rows[2]).getByText('PENDIENTE')).toBeInTheDocument()
    expect(within(rows[1]).queryByRole('button')).not.toBeInTheDocument()
    expect(apiMock.mock.calls[0][0]).toBe('/api/secretary-accounts?page=1')
  })

  it('crea una cuenta con enlace manual, lo muestra para copiarlo y actualiza el listado (CA-01, CA-03)', async () => {
    apiMock.mockResolvedValueOnce(listResponse())
      .mockResolvedValueOnce(Response.json({
        setup_delivery: 'manual', setup_url: setupUrl,
        data: { id: 11, name: 'Nora', email: 'nora@economia.test', status: 'pending', created_at: '2026-10-22T10:00:00Z' },
      }, { status: 201 }))
      .mockResolvedValueOnce(listResponse([...accounts, { id: 11, name: 'Nora', email: 'nora@economia.test', status: 'pending', created_at: '2026-10-22T10:00:00Z' }]))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva cuenta de la Secretaría' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nueva cuenta de la Secretaría' })
    fireEvent.change(within(dialog).getByLabelText('Nombre de la cuenta'), { target: { value: '  Nora ' } })
    fireEvent.change(within(dialog).getByLabelText('Correo de acceso'), { target: { value: 'nora@economia.test' } })
    fireEvent.click(within(dialog).getByLabelText(/Generar un enlace para compartirlo/))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear cuenta de la Secretaría' }))

    expect(await within(dialog).findByText(/Copia el enlace de configuración/)).toHaveAttribute('role', 'status')
    expect(within(dialog).getByLabelText('Enlace de configuración')).toHaveValue(setupUrl)
    expect(JSON.parse(posts()[0][1]?.body as string)).toEqual({ name: 'Nora', email: 'nora@economia.test', delivery_method: 'manual' })
    await waitFor(() => expect(screen.getByRole('table', { name: 'Cuentas de la Secretaría' })).toHaveTextContent('nora@economia.test'))
  })

  it('valida los campos sin enviar y muestra los errores del servidor junto al campo (CA-07)', async () => {
    apiMock.mockResolvedValueOnce(listResponse())
      .mockResolvedValueOnce(Response.json({ errors: { email: ['El correo electrónico ya está registrado.'] } }, { status: 422 }))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva cuenta de la Secretaría' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nueva cuenta de la Secretaría' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear cuenta de la Secretaría' }))
    expect(within(dialog).getByLabelText('Nombre de la cuenta')).toHaveAccessibleDescription('El nombre de la cuenta es obligatorio.')
    expect(within(dialog).getByLabelText('Correo de acceso')).toHaveAccessibleDescription('El correo de acceso es obligatorio.')
    expect(posts()).toHaveLength(0)

    fireEvent.change(within(dialog).getByLabelText('Nombre de la cuenta'), { target: { value: 'Laura' } })
    fireEvent.change(within(dialog).getByLabelText('Correo de acceso'), { target: { value: 'laura@economia.test' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear cuenta de la Secretaría' }))
    await waitFor(() => expect(within(dialog).getByLabelText('Correo de acceso')).toHaveAccessibleDescription('El correo electrónico ya está registrado.'))
  })

  it('reenvía el enlace de una cuenta pendiente desde su fila (CA-04)', async () => {
    apiMock.mockResolvedValueOnce(listResponse()).mockResolvedValueOnce(Response.json({ setup_delivery: 'sent' }))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar enlace a Mario Pendiente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reenviar enlace de configuración' })
    expect(within(dialog).getByLabelText('Correo de la cuenta pendiente')).toHaveValue('mario@economia.test')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reenviar enlace de configuración' }))
    expect(await within(dialog).findByText(/Enlace de configuración solicitado/)).toBeInTheDocument()
    expect(posts()[0][0]).toBe('/api/secretary-accounts/resend-setup')
    expect(JSON.parse(posts()[0][1]?.body as string)).toEqual({ email: 'mario@economia.test', delivery_method: 'email' })
  })

  it('informa el límite de frecuencia del reenvío', async () => {
    apiMock.mockResolvedValueOnce(listResponse()).mockResolvedValueOnce(new Response(null, { status: 429 }))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar enlace' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reenviar enlace de configuración' })
    fireEvent.change(within(dialog).getByLabelText('Correo de la cuenta pendiente'), { target: { value: 'mario@economia.test' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reenviar enlace de configuración' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Espera al menos un minuto')
  })
})
