import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

// Sprint 19, PR 1: correo de acceso en Mi cuenta (T-S19-03 y T-S19-04), la confirmación pública y la corrección de una
// cuenta pendiente (T-S19-02).
const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown> | null
const adminUser = { id: 1, name: 'Administración', email: 'admin@bt.test', role: 'ADMIN', institution: null, company: null, email_verified: true, pending_email: null, email_link_sent_at: null }
const writes = () => apiMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname + useLocation().search}</output>
}

beforeEach(() => {
  user = adminUser
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me' && (!init?.method || init.method === 'GET')) return user ? Response.json({ user }) : new Response(null, { status: 401 })
    if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: 0, items: [] } })
    if (path === '/api/dashboard') return new Promise<Response>(() => undefined)
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    return apiMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function security() {
  return screen.findByRole('region', { name: 'Acceso y seguridad' })
}

describe('Mi cuenta: cambio de correo (T-S19-03)', () => {
  it('pide el correo nuevo y la contraseña actual, y muestra la confirmación pendiente', async () => {
    const sentAt = new Date().toISOString()
    apiMock.mockResolvedValueOnce(Response.json({ user: { ...adminUser, pending_email: 'nuevo@bt.test', email_link_sent_at: sentAt }, email_link_delivery: 'sent' }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    fireEvent.click(within(await security()).getByRole('button', { name: 'Cambiar correo' }))

    const sheet = await screen.findByRole('dialog', { name: 'Cambiar correo de acceso' })
    expect(sheet).toHaveTextContent('Tu correo actual seguirá activo hasta que lo confirmes; el enlace vence en 60 minutos.')
    fireEvent.change(within(sheet).getByLabelText('Nuevo correo de acceso'), { target: { value: ' nuevo@bt.test ' } })
    fireEvent.change(within(sheet).getByLabelText('Contraseña actual'), { target: { value: 'Password123!' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar enlace de confirmación' }))

    expect(await screen.findByText('Enviamos el enlace a nuevo@bt.test. Vence en 60 minutos.')).toBeInTheDocument()
    const [path, init] = writes()[0]
    expect(path).toBe('/api/me/email')
    expect(JSON.parse(init?.body as string)).toEqual({ email: 'nuevo@bt.test', current_password: 'Password123!' })

    const card = await security()
    expect(card).toHaveTextContent('Cambio pendiente')
    const pending = within(card).getByRole('region', { name: 'Confirmación de correo pendiente' })
    expect(pending).toHaveTextContent('Enviamos un enlace a nuevo@bt.test')
    expect(pending).toHaveTextContent('Sigues entrando con admin@bt.test hasta que lo confirmes.')
    // Espera visible de 60 segundos antes de reenviar.
    expect(within(pending).getByRole('button', { name: /^Reenviar enlace \(\d+ s\)$/ })).toBeDisabled()
    expect(within(card).queryByRole('button', { name: 'Cambiar correo' })).not.toBeInTheDocument()
  })

  it('muestra los errores del servidor junto a cada campo', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ message: 'x', errors: { current_password: ['La contraseña actual no es correcta.'], email: ['Ese correo ya está registrado en otra cuenta.'] } }, { status: 422 }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    fireEvent.click(within(await security()).getByRole('button', { name: 'Cambiar correo' }))
    const sheet = await screen.findByRole('dialog', { name: 'Cambiar correo de acceso' })
    fireEvent.change(within(sheet).getByLabelText('Nuevo correo de acceso'), { target: { value: 'usado@bt.test' } })
    fireEvent.change(within(sheet).getByLabelText('Contraseña actual'), { target: { value: 'otra' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar enlace de confirmación' }))

    expect(await within(sheet).findByText('Ese correo ya está registrado en otra cuenta.')).toBeInTheDocument()
    expect(within(sheet).getByText('La contraseña actual no es correcta.')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Nuevo correo de acceso')).toHaveAttribute('aria-invalid', 'true')
  })

  it('reenvía el enlace cuando termina la espera y cancela el cambio', async () => {
    const sentAt = new Date(Date.now() - 61_000).toISOString()
    user = { ...adminUser, pending_email: 'nuevo@bt.test', email_link_sent_at: sentAt }
    apiMock
      .mockResolvedValueOnce(Response.json({ user: { ...user, email_link_sent_at: new Date().toISOString() }, email_link_delivery: 'sent' }))
      .mockResolvedValueOnce(Response.json({ user: adminUser }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const pending = within(await security()).getByRole('region', { name: 'Confirmación de correo pendiente' })

    fireEvent.click(within(pending).getByRole('button', { name: 'Reenviar enlace' }))
    expect(await screen.findByText('Enviamos el enlace a nuevo@bt.test. Vence en 60 minutos.')).toBeInTheDocument()
    expect(writes()[0][0]).toBe('/api/me/email/resend')
    await waitFor(() => expect(within(pending).getByRole('button', { name: /^Reenviar enlace \(\d+ s\)$/ })).toBeDisabled())

    fireEvent.click(within(pending).getByRole('button', { name: 'Cancelar cambio' }))
    expect(await screen.findByText('Cambio de correo cancelado. Sigues entrando con tu correo actual.')).toBeInTheDocument()
    expect(writes()[1][0]).toBe('/api/me/email/cancel')
    expect(await security()).toHaveTextContent('Correo verificado')
  })
})

describe('Mi cuenta: verificar el correo (T-S19-04)', () => {
  it('ofrece un aviso no bloqueante y envía el enlace de verificación', async () => {
    user = { ...adminUser, email_verified: false }
    apiMock.mockResolvedValueOnce(Response.json({ user: { ...user, email_link_sent_at: new Date().toISOString() }, email_link_delivery: 'sent' }))
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const card = await security()
    expect(card).toHaveTextContent('Sin verificar')
    const notice = within(card).getByRole('region', { name: 'Verifica tu correo de acceso' })
    expect(notice).toHaveTextContent('Así garantizas que podrás restablecer tu contraseña si la olvidas.')

    fireEvent.click(within(notice).getByRole('button', { name: 'Enviar enlace de verificación' }))
    expect(await screen.findByText('Enviamos el enlace a admin@bt.test. Vence en 60 minutos.')).toBeInTheDocument()
    expect(writes()[0][0]).toBe('/api/me/email/verification')
    // La sesión se actualiza tras el envío; la espera aparece cuando llega la fecha del enlace.
    await waitFor(() => expect(within(notice).getByRole('button', { name: /^Reenviar enlace \(\d+ s\)$/ })).toBeDisabled())
  })

  it('no muestra el aviso con el correo verificado', async () => {
    render(<MemoryRouter initialEntries={['/account']}><App /></MemoryRouter>)
    const card = await security()
    expect(card).toHaveTextContent('Correo verificado')
    expect(within(card).queryByRole('region', { name: 'Verifica tu correo de acceso' })).not.toBeInTheDocument()
  })
})

describe('confirmación pública del correo', () => {
  it.each([
    [null, 'Iniciar sesión'],
    [adminUser, 'Ir a Mi cuenta'],
  ] as const)('confirma el cambio una sola vez y quita el token de la URL (sesión: %o)', async (session, next) => {
    user = session
    apiMock.mockResolvedValueOnce(Response.json({ result: 'changed', email: 'nuevo@bt.test' }))
    render(<MemoryRouter initialEntries={['/confirm-email?token=' + 'a'.repeat(64)]}><App /><Location /></MemoryRouter>)

    expect(await screen.findByText('Listo: tu correo de acceso ahora es nuevo@bt.test. Cerramos tus sesiones en otros dispositivos.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: next })).toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/confirm-email')
    expect(writes()).toHaveLength(1)
    const [path, init] = writes()[0]
    expect(path).toBe('/api/account-email/confirm')
    expect(JSON.parse(init?.body as string)).toEqual({ token: 'a'.repeat(64) })
  })

  it('confirma la verificación del correo actual', async () => {
    user = null
    apiMock.mockResolvedValueOnce(Response.json({ result: 'verified', email: 'admin@bt.test' }))
    render(<MemoryRouter initialEntries={['/confirm-email?token=' + 'b'.repeat(64)]}><App /></MemoryRouter>)
    expect(await screen.findByText('Listo: verificamos tu correo de acceso admin@bt.test.')).toBeInTheDocument()
  })

  it.each([
    [422, { code: 'EMAIL_LINK_INVALID' }, 'El enlace no es válido: venció, ya se usó o el cambio se canceló.'],
    [409, { code: 'EMAIL_TAKEN' }, 'Ese correo ya fue registrado en otra cuenta, así que no pudimos usarlo. Tu correo de acceso no cambió.'],
  ])('explica un enlace rechazado con HTTP %i', async (status, body, message) => {
    user = null
    apiMock.mockResolvedValueOnce(Response.json(body, { status }))
    render(<MemoryRouter initialEntries={['/confirm-email?token=' + 'c'.repeat(64)]}><App /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('sin token no consulta al servidor', async () => {
    user = null
    render(<MemoryRouter initialEntries={['/confirm-email']}><App /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace no es válido')
    await act(async () => { await Promise.resolve() })
    expect(writes()).toHaveLength(0)
  })
})

describe('corregir el correo de una cuenta pendiente (T-S19-02)', () => {
  const pending = { id: 5, name: 'Beto Pendiente', email: 'beto@sedeco.tset', status: 'pending', email_verified: false, created_at: '2026-11-20T10:00:00Z' }
  const active = { id: 6, name: 'Ana Activa', email: 'ana@sedeco.test', status: 'active', email_verified: true, created_at: '2026-11-20T10:00:00Z' }

  it('muestra las etiquetas y corrige el correo con un enlace nuevo', async () => {
    apiMock.mockImplementation(async (path, init) => {
      if (path === '/api/secretary-accounts?page=1') return Response.json({ data: [pending, active], meta: { current_page: 1, last_page: 1, total: 2 } })
      if (path === '/api/secretary-accounts/5/email' && init?.method === 'PATCH') {
        return Response.json({ data: { ...pending, email: 'beto@sedeco.test' }, setup_delivery: 'sent' })
      }
      return new Response(null, { status: 404 })
    })
    render(<MemoryRouter initialEntries={['/secretary-accounts']}><App /></MemoryRouter>)
    const table = await screen.findByRole('region', { name: 'Listado de cuentas de la Secretaría' })
    expect(within(table).getByText('Pendiente de activar')).toBeInTheDocument()
    expect(within(table).getByText('Correo verificado')).toBeInTheDocument()
    expect(within(table).queryByRole('button', { name: 'Corregir el correo de Ana Activa' })).not.toBeInTheDocument()

    fireEvent.click(within(table).getByRole('button', { name: 'Corregir el correo de Beto Pendiente' }))
    const sheet = await screen.findByRole('dialog', { name: 'Corregir correo de acceso' })
    expect(sheet).toHaveTextContent('el enlace que se envió antes deja de funcionar y enviamos uno nuevo, de un solo uso')
    expect(within(sheet).getByLabelText('Correo actual')).toHaveValue('beto@sedeco.tset')
    expect(within(sheet).getByLabelText('Correo actual')).toHaveAttribute('readonly')
    fireEvent.change(within(sheet).getByLabelText('Correo nuevo'), { target: { value: 'beto@sedeco.test' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar y enviar enlace' }))

    expect(await within(sheet).findByRole('status')).toHaveTextContent('Correo corregido. Enviamos un enlace nuevo a beto@sedeco.test.')
    const [path, init] = writes()[0]
    expect(path).toBe('/api/secretary-accounts/5/email')
    expect(JSON.parse(init?.body as string)).toEqual({ email: 'beto@sedeco.test' })
    expect(within(table).getByText('beto@sedeco.test')).toBeInTheDocument()
  })

  it('lista las cuentas de la institución con su estado y corrige la pendiente', async () => {
    const institution = { id: 7, name: 'Instituto Dual', cct: 'CCT-7', contact_name: 'María', contact_position: null, contact_email: 'contacto@ut.test', contact_phone: null, is_active: true, created_at: '2026-09-30', updated_at: '2026-09-30' }
    apiMock.mockImplementation(async (path, init) => {
      if (path === '/api/institutions/7') return Response.json({ data: institution })
      if (path === '/api/institutions/7/accounts') return Response.json({ data: [{ ...pending, email: 'coordinacoin@ut.test' }, active] })
      if (path === '/api/institutions/7/accounts/5/email' && init?.method === 'PATCH') {
        return Response.json({ data: { ...pending, email: 'coordinacion@ut.test' }, setup_delivery: 'sent' })
      }
      return new Response(null, { status: 404 })
    })
    render(<MemoryRouter initialEntries={['/institutions/7']}><App /></MemoryRouter>)
    const table = await screen.findByRole('region', { name: 'Listado de cuentas institucionales' })
    expect(within(table).getByText('coordinacoin@ut.test')).toBeInTheDocument()
    expect(within(table).getByText('Pendiente de activar')).toBeInTheDocument()
    expect(within(table).getByText('ACTIVA')).toBeInTheDocument()

    fireEvent.click(within(table).getByRole('button', { name: 'Corregir el correo de Beto Pendiente' }))
    const sheet = await screen.findByRole('dialog', { name: 'Corregir correo de acceso' })
    fireEvent.change(within(sheet).getByLabelText('Correo nuevo'), { target: { value: 'coordinacion@ut.test' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar y enviar enlace' }))
    expect(await within(sheet).findByRole('status')).toHaveTextContent('Enviamos un enlace nuevo a coordinacion@ut.test.')
    expect(within(table).getByText('coordinacion@ut.test')).toBeInTheDocument()
  })
})
