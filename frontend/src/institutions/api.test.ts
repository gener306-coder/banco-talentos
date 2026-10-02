import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInstitution, createInstitutionAccount, getInstitution, listInstitutions, resendInstitutionAccountSetup, setInstitutionStatus, updateInstitution } from './api'

const input = { name: 'Instituto Dual', cct: '09DIT0001A', contact_email: 'contacto@example.test' }
const record = { ...input, id: 7, is_active: true, created_at: '2026-09-30T12:00:00Z', updated_at: '2026-09-30T12:00:00Z' }
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
})

afterEach(() => vi.unstubAllGlobals())

function csrfResponse() {
  document.cookie = 'XSRF-TOKEN=renovado%2B%3D; Path=/'
  return Promise.resolve(new Response(null, { status: 204 }))
}

describe('cliente de instituciones', () => {
  it('lee listado y detalle desde data con cookies y permite cancelar las consultas', async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValueOnce(Response.json({ data: [record] }))
      .mockResolvedValueOnce(Response.json({ data: record }))
    await expect(listInstitutions(controller.signal)).resolves.toEqual([record])
    await expect(getInstitution('7', controller.signal)).resolves.toEqual(record)
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/api/institutions', '/api/institutions/7'])
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toMatchObject({ credentials: 'include', signal: controller.signal, referrerPolicy: 'origin' })
      expect(new Headers(options?.headers).get('Accept')).toBe('application/json')
      expect(new Headers(options?.headers).has('Authorization')).toBe(false)
    }
  })

  it('acepta un listado vacío', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [] }))
    await expect(listInstitutions()).resolves.toEqual([])
  })

  it.each([
    ['POST', '/api/institutions', () => createInstitution({ ...input, ...{ is_active: false, id: 999 } }), input],
    ['PUT', '/api/institutions/7', () => updateInstitution('7', { ...input, ...{ is_active: false } }), input],
    ['PATCH', '/api/institutions/7/status', () => setInstitutionStatus('7', false), { is_active: false }],
  ] as const)('envía %s con los campos exactos y el token CSRF recién obtenido', async (method, path, action, body) => {
    document.cookie = 'XSRF-TOKEN=viejo; Path=/'
    fetchMock.mockImplementationOnce(csrfResponse).mockResolvedValueOnce(Response.json({ data: record }))
    await expect(action()).resolves.toEqual(record)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/sanctum/csrf-cookie', path])
    const options = fetchMock.mock.calls[1][1]
    expect(options).toMatchObject({ method, credentials: 'include' })
    expect(JSON.parse(options?.body as string)).toEqual(body)
    expect(new Headers(options?.headers).get('X-XSRF-TOKEN')).toBe('renovado+=')
    expect(new Headers(options?.headers).get('Content-Type')).toBe('application/json')
  })

  it('conserva los errores 422 por campo para mostrarlos en el formulario', async () => {
    const errors = { cct: ['La Clave de Centro de Trabajo ya está registrada.'], contact_email: ['Correo inválido.'] }
    fetchMock.mockImplementationOnce(csrfResponse)
      .mockResolvedValueOnce(Response.json({ errors }, { status: 422 }))
    await expect(createInstitution(input)).rejects.toMatchObject({ status: 422, errors })
  })

  it('mantiene el código 422 aunque la respuesta de errores sea inválida', async () => {
    fetchMock.mockImplementationOnce(csrfResponse)
      .mockResolvedValueOnce(new Response('invalid JSON', { status: 422 }))
    await expect(createInstitution(input)).rejects.toMatchObject({ status: 422, errors: {} })
  })

  it.each([401, 403, 419, 500])('propaga %i sin repetir una escritura', async (status) => {
    fetchMock.mockImplementationOnce(csrfResponse).mockResolvedValueOnce(new Response(null, { status }))
    await expect(createInstitution(input)).rejects.toMatchObject({ status })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('no repite una escritura si se pierde la respuesta de red', async () => {
    fetchMock.mockImplementationOnce(csrfResponse).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(createInstitution(input)).rejects.toMatchObject({ status: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('no envía datos si falla la preparación CSRF', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(createInstitution(input)).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('no envía datos sin una cookie CSRF válida', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(createInstitution(input)).rejects.toMatchObject({ status: 419 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    {}, { data: null }, { data: record }, { data: [{ ...record, is_active: 'false' }] },
  ])('rechaza una respuesta de listado incompatible con el contrato', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body))
    await expect(listInstitutions()).rejects.toMatchObject({ status: 502 })
  })

  it('rechaza un detalle incompleto y conserva los errores 404', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: { id: 7 } }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
    await expect(getInstitution('7')).rejects.toMatchObject({ status: 502 })
    await expect(getInstitution('999')).rejects.toMatchObject({ status: 404 })
  })
})

describe('cliente de cuentas institucionales', () => {
  const accountInput = { name: 'Titular', email: 'titular@example.test', institution_id: 7 }
  const account = { id: 9, name: accountInput.name, email: accountInput.email, role: 'INSTITUTION', is_active: true, institution: { id: 7, name: input.name } }

  it('crea una cuenta sin contraseña ni rol y descarta cualquier enlace o credencial de la respuesta', async () => {
    fetchMock.mockImplementationOnce(csrfResponse).mockResolvedValueOnce(Response.json({
      data: { ...account, password: 'dato que nunca se conserva' }, setup_url: 'http://localhost/set-initial-password?token=secreto',
    }, { status: 201 }))
    await expect(createInstitutionAccount({ ...accountInput, ...{ password: 'no enviar', role: 'ADMIN' } })).resolves.toEqual(account)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/sanctum/csrf-cookie', '/api/institution-accounts'])
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual(accountInput)
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('X-XSRF-TOKEN')).toBe('renovado+=')
  })

  it.each([{ ...account, role: 'ADMIN' }, { ...account, institution: null }, { ...account, institution: { id: 8, name: 'Otra' } }])('rechaza una asociación o un rol incompatible en la respuesta', async (data) => {
    fetchMock.mockImplementationOnce(csrfResponse).mockResolvedValueOnce(Response.json({ data }, { status: 201 }))
    await expect(createInstitutionAccount(accountInput)).rejects.toMatchObject({ status: 502 })
  })

  it('no crea la cuenta si falla CSRF', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(createInstitutionAccount(accountInput)).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})


describe('entrega del enlace de cuentas pendientes', () => {
  const input = { email: 'titular@example.test', institution_id: 7 }

  it.each(['sent', 'pending', 'testing'] as const)('conserva el estado %s del alta sin conservar el enlace', async (delivery) => {
    const accountInput = { ...input, name: 'Titular' }
    const account = { id: 9, name: 'Titular', email: input.email, role: 'INSTITUTION', is_active: true, institution: { id: 7, name: 'Instituto' } }
    fetchMock.mockImplementationOnce(csrfResponse).mockResolvedValueOnce(Response.json({
      data: account, setup_delivery: delivery, setup_url: 'https://private.example.test?token=secret',
    }, { status: 201 }))
    await expect(createInstitutionAccount(accountInput)).resolves.toEqual({ ...account, setup_delivery: delivery })
  })

  it('reenvía únicamente correo e institución y descarta el enlace', async () => {
    fetchMock.mockImplementationOnce(csrfResponse).mockResolvedValueOnce(Response.json({
      setup_delivery: 'sent', setup_url: 'https://private.example.test?token=secret',
    }))
    await expect(resendInstitutionAccountSetup({ ...input, ...{ password: 'omitido', email_to: 'otro@example.test' } })).resolves.toBe('sent')
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/sanctum/csrf-cookie', '/api/institution-accounts/resend-setup'])
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual(input)
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('X-XSRF-TOKEN')).toBe('renovado+=')
  })

  it.each([{}, { setup_delivery: null }, { setup_delivery: 'delivered' }, { setup_delivery: 1 }])('rechaza un estado de reenvío inválido', async (body) => {
    fetchMock.mockImplementationOnce(csrfResponse).mockResolvedValueOnce(Response.json(body))
    await expect(resendInstitutionAccountSetup(input)).rejects.toMatchObject({ status: 502 })
  })

  it('no inicia el reenvío sin CSRF', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 419 }))
    await expect(resendInstitutionAccountSetup(input)).rejects.toMatchObject({ status: 419 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([401, 403, 422, 429, 500])('conserva el error %i y no reintenta automáticamente', async (status) => {
    fetchMock.mockImplementationOnce(csrfResponse).mockResolvedValueOnce(new Response(null, { status }))
    await expect(resendInstitutionAccountSetup(input)).rejects.toMatchObject({ status })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
