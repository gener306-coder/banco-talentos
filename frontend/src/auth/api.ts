import { ApiError, csrfToken, request } from '../lib/http'

export { ApiError } from '../lib/http'

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
  institution: { id: number; name: string } | null
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

  let institution: User['institution'] = null
  if ('institution' in user && user.institution !== null && user.institution !== undefined) {
    const linked = user.institution
    if (typeof linked !== 'object' || !('id' in linked) || typeof linked.id !== 'number' ||
        !Number.isSafeInteger(linked.id) || linked.id <= 0 ||
        !('name' in linked) || typeof linked.name !== 'string') throw new ApiError(502)
    institution = { id: linked.id, name: linked.name }
  }

  return { id: user.id, name: user.name, email: user.email, role: user.role as Role, institution }
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

export interface InitialPasswordInput {
  email: string
  token: string
  password: string
  password_confirmation: string
}

export async function setInitialPassword(input: InitialPasswordInput): Promise<void> {
  await request('/sanctum/csrf-cookie', { referrerPolicy: 'no-referrer' })
  await request('/api/institution-accounts/password-setup', {
    method: 'POST',
    referrerPolicy: 'no-referrer',
    body: JSON.stringify({
      email: input.email, token: input.token,
      password: input.password, password_confirmation: input.password_confirmation,
    }),
  })
}
