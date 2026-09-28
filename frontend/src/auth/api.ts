export const roleLabels = {
  ADMIN: 'Administrador',
  INSTITUTION: 'Institución',
  COMPANY: 'Empresa',
  SECRETARY: 'Secretaría de Economía',
} as const

export type Role = keyof typeof roleLabels

export interface User {
  id: number
  name: string
  email: string
  role: Role
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(status === 0 ? 'No pudimos conectar con el servidor.' : `Error HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
  }
}

function csrfToken(): string | undefined {
  const cookie = document.cookie.split('; ').find((value) => value.startsWith('XSRF-TOKEN='))

  if (!cookie) return undefined

  try {
    return decodeURIComponent(cookie.slice('XSRF-TOKEN='.length))
  } catch {
    return undefined
  }
}

async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')

  if (options.method === 'POST') {
    const token = csrfToken()
    if (!token) throw new ApiError(419)
    headers.set('X-XSRF-TOKEN', token)
    if (options.body) headers.set('Content-Type', 'application/json')
  }

  let response: Response

  try {
    response = await fetch(path, { ...options, headers, credentials: 'include' })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0)
  }

  if (!response.ok) throw new ApiError(response.status)
  if (response.status === 204) return undefined

  try {
    return await response.json()
  } catch {
    throw new ApiError(502)
  }
}

function sessionUser(data: unknown): User {
  if (typeof data !== 'object' || data === null || !('user' in data)) {
    throw new ApiError(502)
  }

  const user = data.user
  if (typeof user !== 'object' || user === null || !('role' in user)) {
    throw new ApiError(502)
  }

  if (typeof user.role !== 'string' || !Object.hasOwn(roleLabels, user.role)) {
    throw new ApiError(403)
  }

  if (!('id' in user) || typeof user.id !== 'number' ||
      !('name' in user) || typeof user.name !== 'string' ||
      !('email' in user) || typeof user.email !== 'string') {
    throw new ApiError(502)
  }

  return { id: user.id, name: user.name, email: user.email, role: user.role as Role }
}

export async function currentUser(signal?: AbortSignal): Promise<User> {
  return sessionUser(await request('/api/me', { signal }))
}

export async function login(email: string, password: string): Promise<User> {
  await request('/sanctum/csrf-cookie')
  return sessionUser(await request('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }))
}

export async function logout(): Promise<void> {
  if (!csrfToken()) await request('/sanctum/csrf-cookie')
  try {
    await request('/api/logout', { method: 'POST' })
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 419) throw error
    // CSRF vencido no significa que la sesión haya sido revocada.
    await request('/sanctum/csrf-cookie')
    await request('/api/logout', { method: 'POST' })
  }
}
