import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSecretaryAccount, listSecretaryAccounts, resendSecretaryAccountSetup } from './api'

const fetchMock = vi.fn<typeof fetch>()
const account = { id: 4, name: 'Ana', email: 'ana@economia.test', status: 'pending', created_at: '2026-10-22T10:00:00Z' }
const setupUrl = 'http://localhost:5173/set-initial-password?email=ana%40economia.test&token=abc'

function csrf() {
  document.cookie = 'XSRF-TOKEN=token%3D; Path=/'
  return Promise.resolve(new Response(null, { status: 204 }))
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('cuentas de la Secretaría HU-S4-01', () => {
  it('lista las cuentas con su página y conserva solo los campos del contrato (CA-05)', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ ...account, role: 'SECRETARY' }], meta: { current_page: 1, last_page: 2, total: 51 } }))
    await expect(listSecretaryAccounts(1)).resolves.toEqual({ accounts: [account], page: 1, lastPage: 2, total: 51 })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/secretary-accounts?page=1')
  })

  it.each([
    [{ data: [{ ...account, status: 'blocked' }], meta: { current_page: 1, last_page: 1, total: 1 } }],
    [{ data: [{ ...account, id: '4' }], meta: { current_page: 1, last_page: 1, total: 1 } }],
    [{ data: [account] }],
  ])('rechaza un listado inesperado', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body))
    await expect(listSecretaryAccounts(1)).rejects.toMatchObject({ status: 502 })
  })

  it('crea la cuenta con CSRF enviando solo nombre, correo y entrega (CA-01)', async () => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ setup_delivery: 'sent', setup_url: setupUrl, data: account }, { status: 201 }))
    await expect(createSecretaryAccount({ name: 'Ana', email: 'ana@economia.test', delivery_method: 'email', ...{ role: 'ADMIN' } }))
      .resolves.toEqual({ account, delivery: 'sent' })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/secretary-accounts')
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({ name: 'Ana', email: 'ana@economia.test', delivery_method: 'email' })
  })

  it('devuelve el enlace manual solo con entrega manual (CA-03)', async () => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ setup_delivery: 'manual', setup_url: setupUrl, data: account }, { status: 201 }))
    await expect(createSecretaryAccount({ name: 'Ana', email: 'ana@economia.test', delivery_method: 'manual' }))
      .resolves.toEqual({ account, delivery: 'manual', setupLink: setupUrl })
  })

  it('reenvía el enlace de una cuenta pendiente (CA-04)', async () => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ setup_delivery: 'manual', setup_url: setupUrl }))
    await expect(resendSecretaryAccountSetup({ email: 'ana@economia.test', delivery_method: 'manual' }))
      .resolves.toEqual({ delivery: 'manual', setupLink: setupUrl })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/secretary-accounts/resend-setup')
  })
})
