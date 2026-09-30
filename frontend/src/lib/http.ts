export type ValidationErrors = Record<string, string[]>

export class ApiError extends Error {
  readonly status: number
  readonly errors: ValidationErrors

  constructor(status: number, errors: ValidationErrors = {}) {
    super(status === 0 ? 'No pudimos conectar con el servidor.' : `Error HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
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

async function validationErrors(response: Response): Promise<ValidationErrors> {
  try {
    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null || !('errors' in body) ||
        typeof body.errors !== 'object' || body.errors === null || Array.isArray(body.errors)) return {}

    return Object.fromEntries(Object.entries(body.errors).filter((entry): entry is [string, string[]] =>
      Array.isArray(entry[1]) && entry[1].every((message: unknown) => typeof message === 'string'),
    ))
  } catch {
    return {}
  }
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
    response = await fetch(path, { ...options, headers, credentials: 'include' })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0)
  }

  if (!response.ok) {
    throw new ApiError(response.status, response.status === 422 ? await validationErrors(response) : {})
  }
  if (response.status === 204) return undefined

  try {
    return await response.json()
  } catch {
    throw new ApiError(502)
  }
}
