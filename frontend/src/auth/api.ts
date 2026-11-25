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
export type CompanyGap = 'name' | 'contact_name' | 'contact_email' | 'legal_name' | 'rfc' | 'sector_code' | 'location'
const COMPANY_GAPS: readonly string[] = ['name', 'contact_name', 'contact_email', 'legal_name', 'rfc', 'sector_code', 'location']
export const isCompanyGap = (value: unknown): value is CompanyGap => typeof value === 'string' && COMPANY_GAPS.includes(value)

/** HU-S14-03 (M1): lo mínimo para publicar oportunidades y enviar solicitudes. */
export const OPERATING_MINIMUM: readonly CompanyGap[] = ['name', 'contact_name', 'contact_email']

export interface SessionCompany {
  id: number
  name: string | null
  missing: CompanyGap[]
  /** El onboarding termina al guardar o posponer el perfil, o si ya está completo. */
  onboarding: 'pending' | 'done'
  canOperate: boolean
}

/** La empresa de la sesión con lo que falta: deriva si ya puede operar (M1). */
export function sessionCompany(id: number, name: string | null, missing: CompanyGap[], onboarding: SessionCompany['onboarding']): SessionCompany {
  return { id, name, missing, onboarding, canOperate: !missing.some((gap) => OPERATING_MINIMUM.includes(gap)) }
}

/** HU-S16-07: los 4 datos mínimos de la institución (D6); sin ellos no opera (HU-S16-08). */
export type InstitutionGap = 'name' | 'cct' | 'contact_name' | 'contact_email'
const INSTITUTION_GAPS: readonly string[] = ['name', 'cct', 'contact_name', 'contact_email']
export const isInstitutionGap = (value: unknown): value is InstitutionGap => typeof value === 'string' && INSTITUTION_GAPS.includes(value)

export interface SessionInstitution {
  id: number
  /** HU-S16-05: null mientras la institución invitada no capture su nombre oficial. */
  name: string | null
  missing: InstitutionGap[]
  onboarding: 'pending' | 'done'
  canOperate: boolean
}

/** La institución de la sesión con lo que falta: todos sus datos son el mínimo, así que opera con el perfil completo. */
export function sessionInstitution(id: number, name: string | null, missing: InstitutionGap[], onboarding: SessionInstitution['onboarding']): SessionInstitution {
  return { id, name, missing, onboarding, canOperate: missing.length === 0 }
}

export interface User {
  id: number
  name: string
  email: string
  role: Role
  institution: SessionInstitution | null
  /**
   * Empresa vinculada a una cuenta COMPANY (HU-S4-03 CA-05): solo su nombre visible, null mientras la empresa
   * invitada no capture ninguno (HU-S14-02).
   */
  company: SessionCompany | null
  /** T-S19-01: correo de acceso probado. Si la respuesta no lo trae, se trata como verificado (sin avisos). */
  emailVerified: boolean
  /** T-S19-03: correo nuevo por confirmar; el actual sigue activo mientras tanto. */
  pendingEmail: string | null
  /** T-S19-03 y T-S19-04: envío del enlace vigente (vence a los 60 minutos y se reenvía tras 60 segundos). */
  emailLinkSentAt: string | null
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

  const institution = (): User['institution'] => {
    if (!('institution' in user)) return null
    const linked: unknown = user.institution
    if (linked === null || linked === undefined) return null
    if (typeof linked !== 'object' || !('id' in linked) || typeof linked.id !== 'number' ||
        !Number.isSafeInteger(linked.id) || linked.id <= 0 ||
        !('name' in linked) || (linked.name !== null && typeof linked.name !== 'string')) throw new ApiError(502)
    // HU-S16-07: sin estos datos (respuestas anteriores), la institución se trata como completa y con el onboarding hecho.
    const missing = 'missing' in linked ? linked.missing : []
    if (!Array.isArray(missing) || !missing.every(isInstitutionGap)) throw new ApiError(502)
    const onboarding = 'onboarding' in linked ? linked.onboarding : 'done'
    if (onboarding !== 'pending' && onboarding !== 'done') throw new ApiError(502)
    return sessionInstitution(linked.id, linked.name as string | null, missing, onboarding)
  }

  // HU-S14-02: la empresa invitada puede no tener nombre todavía.
  const company = (): User['company'] => {
    if (!('company' in user) || user.company === null || user.company === undefined) return null
    const linked: unknown = user.company
    if (typeof linked !== 'object' || linked === null || !('id' in linked) || typeof linked.id !== 'number' ||
        !Number.isSafeInteger(linked.id) || linked.id <= 0 ||
        !('name' in linked) || (linked.name !== null && typeof linked.name !== 'string')) throw new ApiError(502)
    if (!('missing' in linked) || !Array.isArray(linked.missing) || !linked.missing.every(isCompanyGap)) throw new ApiError(502)
    const onboarding = 'onboarding' in linked ? linked.onboarding : 'done'
    if (onboarding !== 'pending' && onboarding !== 'done') throw new ApiError(502)
    return sessionCompany(linked.id, linked.name as string | null, linked.missing as CompanyGap[], onboarding)
  }

  const emailVerified = 'email_verified' in user && typeof user.email_verified === 'boolean' ? user.email_verified : true
  const pendingEmail = 'pending_email' in user && typeof user.pending_email === 'string' ? user.pending_email : null
  const emailLinkSentAt = 'email_link_sent_at' in user && typeof user.email_link_sent_at === 'string' ? user.email_link_sent_at : null

  return {
    id: user.id, name: user.name, email: user.email, role: user.role as Role,
    institution: institution(), company: company(), emailVerified, pendingEmail, emailLinkSentAt,
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
/**
 * HU-S16-03: pide el enlace de restablecimiento. El servidor responde siempre igual (202), exista o no la cuenta; se
 * devuelve su mensaje neutro para mostrarlo tal cual.
 */
export async function requestPasswordReset(email: string): Promise<string> {
  await request('/sanctum/csrf-cookie', { referrerPolicy: 'no-referrer' })
  const response = await request('/api/password/forgot', { method: 'POST', referrerPolicy: 'no-referrer', body: JSON.stringify({ email }) })
  if (typeof response !== 'object' || response === null || !('message' in response) || typeof response.message !== 'string') throw new ApiError(502)
  return response.message
}

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

/** T-S19-03 y T-S19-04: resultado de enviar un enlace de correo; 'pending' si el transporte no lo aceptó. */
export type EmailLinkDelivery = 'sent' | 'pending'

async function emailLinkRequest(path: string, body?: object): Promise<{ user: User; delivery: EmailLinkDelivery }> {
  if (!csrfToken()) await request('/sanctum/csrf-cookie')
  const response = await request(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) })
  const delivery = typeof response === 'object' && response !== null && 'email_link_delivery' in response ? response.email_link_delivery : undefined
  if (delivery !== 'sent' && delivery !== 'pending') throw new ApiError(502)
  return { user: sessionUser(response), delivery }
}

/** T-S19-03: pide cambiar el correo de acceso; el enlace va a la dirección nueva y la actual sigue activa hasta confirmarlo. */
export function requestEmailChange(input: { email: string; current_password: string }) {
  return emailLinkRequest('/api/me/email', { email: input.email, current_password: input.current_password })
}

/** Reenvía el enlace vigente (cambio o verificación) con uno nuevo; el anterior deja de servir. */
export function resendEmailLink() {
  return emailLinkRequest('/api/me/email/resend')
}

/** T-S19-04: enlace para verificar el correo actual. */
export function requestEmailVerification() {
  return emailLinkRequest('/api/me/email/verification')
}

/** T-S19-03: cancela el cambio pendiente; el enlace enviado deja de servir. */
export async function cancelEmailChange(): Promise<User> {
  if (!csrfToken()) await request('/sanctum/csrf-cookie')
  return sessionUser(await request('/api/me/email/cancel', { method: 'POST' }))
}

export type EmailConfirmation = { result: 'changed' | 'verified'; email: string }

/** T-S19-03 y T-S19-04: confirmación pública con el token del enlace, con o sin sesión. */
export async function confirmAccessEmail(token: string): Promise<EmailConfirmation> {
  if (!csrfToken()) await request('/sanctum/csrf-cookie')
  const response = await request('/api/account-email/confirm', { method: 'POST', referrerPolicy: 'no-referrer', body: JSON.stringify({ token }) })
  if (typeof response !== 'object' || response === null || !('result' in response) || !('email' in response) ||
      (response.result !== 'changed' && response.result !== 'verified') || typeof response.email !== 'string') throw new ApiError(502)
  return { result: response.result, email: response.email }
}
