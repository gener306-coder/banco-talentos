import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, currentUser, login, logout, setInitialPassword } from './api'

const user = { id: 1, name: 'Ana', email: 'ana@example.test', role: 'ADMIN', institution: null }
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
})

afterEach(() => vi.unstubAllGlobals())

describe('cliente de sesión', () => {
  it('recupera la sesión con cookies, Accept JSON y sin token de autorización', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ user }))
    await expect(currentUser()).resolves.toEqual(user)
    expect(fetchMock).toHaveBeenCalledWith('/api/me', expect.objectContaining({ credentials: 'include', referrerPolicy: 'origin' }))
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.has('Authorization')).toBe(false)
  })

  it('obtiene CSRF antes de login y envía la cookie decodificada junto a las credenciales', async () => {
    fetchMock.mockImplementationOnce(async () => {
      document.cookie = 'XSRF-TOKEN=token%2Bcon%2Fsignos%3D; Path=/'
      return new Response(null, { status: 204 })
    }).mockResolvedValueOnce(Response.json({ user }))

    await expect(login(user.email, 'contraseña-segura')).resolves.toEqual(user)
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/sanctum/csrf-cookie', '/api/login'])
    const options = fetchMock.mock.calls[1][1]
    expect(options).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(JSON.parse(options?.body as string)).toEqual({ email: user.email, password: 'contraseña-segura' })
    expect(new Headers(options?.headers).get('X-XSRF-TOKEN')).toBe('token+con/signos=')
    expect(new Headers(options?.headers).get('Content-Type')).toBe('application/json')
  })

  it('no envía contraseñas si falla la inicialización CSRF', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(login(user.email, 'secret')).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rechaza una inicialización CSRF sin cookie válida', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(login(user.email, 'secret')).rejects.toMatchObject({ status: 419 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('usa el token más reciente y acepta la respuesta vacía de logout', async () => {
    document.cookie = 'XSRF-TOKEN=renovado%3D; Path=/'
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(logout()).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/logout')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('X-XSRF-TOKEN')).toBe('renovado=')
  })

  it('renueva CSRF y reintenta logout una sola vez cuando recibe 419', async () => {
    document.cookie = 'XSRF-TOKEN=viejo; Path=/'
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 419 }))
      .mockImplementationOnce(async () => {
        document.cookie = 'XSRF-TOKEN=renovado%3D; Path=/'
        return new Response(null, { status: 204 })
      }).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(logout()).resolves.toBeUndefined()
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/api/logout', '/sanctum/csrf-cookie', '/api/logout'])
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get('X-XSRF-TOKEN')).toBe('renovado=')
  })

  it('propaga un segundo 419 sin bucles de reintento', async () => {
    document.cookie = 'XSRF-TOKEN=csrf; Path=/'
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 419 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 419 }))
    await expect(logout()).rejects.toMatchObject({ status: 419 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('inicializa CSRF si falta al cerrar sesión', async () => {
    fetchMock.mockImplementationOnce(async () => {
      document.cookie = 'XSRF-TOKEN=nuevo; Path=/'
      return new Response(null, { status: 204 })
    }).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await logout()
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/sanctum/csrf-cookie', '/api/logout'])
  })

  it.each([401, 403, 419, 422, 429, 500])('conserva el código HTTP %i para tratarlo en la interfaz', async (status) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }))
    await expect(currentUser()).rejects.toMatchObject({ status })
  })

  it('normaliza un error de red', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(currentUser()).rejects.toMatchObject({ status: 0 })
  })

  it('permite cancelar la recuperación de sesión', async () => {
    const controller = new AbortController()
    const error = new DOMException('Aborted', 'AbortError')
    fetchMock.mockRejectedValueOnce(error)
    await expect(currentUser(controller.signal)).rejects.toBe(error)
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal)
  })

  it('rechaza un rol desconocido y una respuesta malformada', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ user: { ...user, role: 'OTHER' } }))
    await expect(currentUser()).rejects.toMatchObject({ status: 403 })
    fetchMock.mockResolvedValueOnce(new Response('<html>error</html>', { status: 200 }))
    await expect(currentUser()).rejects.toEqual(expect.any(ApiError))
  })
})

describe('contraseña inicial e institución en la sesión', () => {
  it('conserva únicamente el identificador y nombre de la institución vinculada', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ user: { ...user, role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual', private: 'omitido' }, password: 'nunca mostrar' } }))
    await expect(currentUser()).resolves.toEqual({ ...user, role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } })
  })

  it('mantiene compatibilidad con sesiones sin institución y rechaza relaciones malformadas', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ user: { id: 1, name: user.name, email: user.email, role: user.role } }))
      .mockResolvedValueOnce(Response.json({ user: { ...user, institution: { id: 0, name: 'Inválida' } } }))
    await expect(currentUser()).resolves.toEqual(user)
    await expect(currentUser()).rejects.toMatchObject({ status: 502 })
  })

  it('establece la contraseña con CSRF y los cuatro campos exactos', async () => {
    const input = { email: 'cuenta@example.test', token: 'token-seguro', password: 'Nueva-clave-2026', password_confirmation: 'Nueva-clave-2026' }
    fetchMock.mockImplementationOnce(async () => {
      document.cookie = 'XSRF-TOKEN=csrf%3D; Path=/'
      return new Response(null, { status: 204 })
    }).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(setInitialPassword({ ...input, ...{ role: 'ADMIN' } })).resolves.toBeUndefined()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/sanctum/csrf-cookie', '/api/institution-accounts/password-setup'])
    for (const [, init] of fetchMock.mock.calls) expect(init?.referrerPolicy).toBe('no-referrer')
    const options = fetchMock.mock.calls[1][1]
    expect(options).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(JSON.parse(options?.body as string)).toEqual(input)
    expect(new Headers(options?.headers).get('X-XSRF-TOKEN')).toBe('csrf=')
  })

  it('conserva solo códigos conocidos e ignora mensajes arbitrarios del servidor', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: 'INSTITUTION_INACTIVE', message: 'Mensaje arbitrario' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ code: 'UNRECOGNIZED', message: 'Mensaje arbitrario' }, { status: 403 }))
    await expect(currentUser()).rejects.toMatchObject({ status: 401, code: 'INSTITUTION_INACTIVE' })
    await expect(currentUser()).rejects.toMatchObject({ status: 403, code: undefined })
  })
})
