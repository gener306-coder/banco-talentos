export type ValidationErrors = Record<string, string[]>

export const accessErrorMessages = {
  ACCOUNT_INACTIVE: 'La cuenta está inactiva. No puedes acceder al sistema.',
  INSTITUTION_INACTIVE: 'La institución está inactiva. No puedes acceder al sistema.',
  PASSWORD_SETUP_REQUIRED: 'Debes establecer tu contraseña antes de iniciar sesión.',
} as const

export type AccessErrorCode = keyof typeof accessErrorMessages

export class ApiError extends Error {
  readonly status: number
  readonly errors: ValidationErrors
  readonly code?: AccessErrorCode

  constructor(status: number, errors: ValidationErrors = {}, code?: AccessErrorCode) {
    super(status === 0 ? 'No pudimos conectar con el servidor.' : `Error HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
    this.code = code
  }
}

export function csrfToken(): string | undefined {
  const cookie = document.cookie.split('; ').find((value) => value.startsWith('XSRF-TOKEN='))
  if (!cookie) return undefined

  try {
    return decodeURIComponent(cookie.slice('XSRF-TOKEN='.length)) || undefined
  } catch {
    return undefined
  }
}

async function responseError(response: Response): Promise<ApiError> {
  let errors: ValidationErrors = {}
  let code: AccessErrorCode | undefined
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null) {
      if ('code' in body && typeof body.code === 'string' && Object.hasOwn(accessErrorMessages, body.code)) {
        code = body.code as AccessErrorCode
      }
      if (response.status === 422 && 'errors' in body && typeof body.errors === 'object' &&
          body.errors !== null && !Array.isArray(body.errors)) {
        errors = Object.fromEntries(Object.entries(body.errors).filter((entry): entry is [string, string[]] =>
          Array.isArray(entry[1]) && entry[1].every((message: unknown) => typeof message === 'string'),
        ))
      }
    }
  } catch {
    // Un cuerpo vacío o inválido conserva el código HTTP original.
  }
  return new ApiError(response.status, errors, code)
}

export async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')

  if (['POST', 'PUT', 'PATCH'].includes(options.method?.toUpperCase() ?? 'GET')) {
    const token = csrfToken()
    if (!token) throw new ApiError(419)
    headers.set('X-XSRF-TOKEN', token)
    if (options.body) headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(path, { referrerPolicy: 'origin', ...options, headers, credentials: 'include' })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0)
  }

  if (!response.ok) {
    throw await responseError(response)
  }
  if (response.status === 204) return undefined

  try {
    return await response.json()
  } catch {
    throw new ApiError(502)
  }
}
