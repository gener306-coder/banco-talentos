import { ApiError, csrfToken, request } from '../lib/http'

export { ApiError } from '../lib/http'

export const roleLabels = {
  ADMIN: 'Administrador',
  INSTITUTION: 'Institución',
  COMPANY: 'Empresa',
  SECRETARY: 'Secretaría de Economía',
} as const

export type Role = keyof typeof roleLabels

/** HU-S14-02: claves de lo que le falta al perfil de la empresa, sin valores. */
export type CompanyGap = 'name' | 'contact_name' | 'contact_position' | 'contact_email' | 'legal_name' | 'rfc' | 'sector_code' | 'location'
const COMPANY_GAPS: readonly string[] = ['name', 'contact_name', 'contact_position', 'contact_email', 'legal_name', 'rfc', 'sector_code', 'location']
const isCompanyGap = (value: unknown): value is CompanyGap => typeof value === 'string' && COMPANY_GAPS.includes(value)

export interface User {
  id: number
  name: string
  email: string
  role: Role
  institution: { id: number; name: string } | null
  /**
   * Empresa vinculada a una cuenta COMPANY (HU-S4-03 CA-05): solo su nombre visible, null mientras la empresa
   * invitada no capture ninguno (HU-S14-02).
   */
  company: { id: number; name: string | null; missing: CompanyGap[] } | null
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

  const organization = (key: 'institution'): { id: number; name: string } | null => {
    if (!(key in user)) return null
    const linked: unknown = (user as Record<string, unknown>)[key]
    if (linked === null || linked === undefined) return null
    if (typeof linked !== 'object' || !('id' in linked) || typeof linked.id !== 'number' ||
        !Number.isSafeInteger(linked.id) || linked.id <= 0 ||
        !('name' in linked) || typeof linked.name !== 'string') throw new ApiError(502)
    return { id: linked.id, name: linked.name }
  }

  // HU-S14-02: la empresa invitada puede no tener nombre todavía.
  const company = (): User['company'] => {
    if (!('company' in user) || user.company === null || user.company === undefined) return null
    const linked: unknown = user.company
    if (typeof linked !== 'object' || linked === null || !('id' in linked) || typeof linked.id !== 'number' ||
        !Number.isSafeInteger(linked.id) || linked.id <= 0 ||
        !('name' in linked) || (linked.name !== null && typeof linked.name !== 'string')) throw new ApiError(502)
    if (!('missing' in linked) || !Array.isArray(linked.missing) || !linked.missing.every(isCompanyGap)) throw new ApiError(502)
    return { id: linked.id, name: linked.name as string | null, missing: linked.missing as CompanyGap[] }
  }

  return {
    id: user.id, name: user.name, email: user.email, role: user.role as Role,
    institution: organization('institution'), company: company(),
  }
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

// Ni la cookie CSRF ni el envío exponen la página del enlace (con su token) como Referer.
async function submitNewPassword(path: string, input: InitialPasswordInput): Promise<void> {
  await request('/sanctum/csrf-cookie', { referrerPolicy: 'no-referrer' })
  await request(path, {
    method: 'POST',
    referrerPolicy: 'no-referrer',
    body: JSON.stringify({
      email: input.email, token: input.token,
      password: input.password, password_confirmation: input.password_confirmation,
    }),
  })
}

export function setInitialPassword(input: InitialPasswordInput): Promise<void> {
  return submitNewPassword('/api/institution-accounts/password-setup', input)
}

export function resetPassword(input: InitialPasswordInput): Promise<void> {
  return submitNewPassword('/api/institution-accounts/password-reset', input)
}

/** Datos de la cuenta propia (HU-S14-01): solo el nombre. Devuelve la identidad actualizada de la sesión. */
export async function updateAccount(name: string): Promise<User> {
  if (!csrfToken()) await request('/sanctum/csrf-cookie')
  return sessionUser(await request('/api/me', { method: 'PATCH', body: JSON.stringify({ name }) }))
}

export interface PasswordChangeInput {
  current_password: string
  password: string
  password_confirmation: string
}

/** Cambio de la contraseña propia (HU-S14-01): la sesión actual sigue abierta; las demás se cierran. */
export async function changePassword(input: PasswordChangeInput): Promise<void> {
  if (!csrfToken()) await request('/sanctum/csrf-cookie')
  await request('/api/me/password', {
    method: 'PUT',
    body: JSON.stringify({ current_password: input.current_password, password: input.password, password_confirmation: input.password_confirmation }),
  })
}

