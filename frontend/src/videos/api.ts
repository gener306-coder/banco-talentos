import { accessErrorMessages, ApiError, csrfToken, request } from '../lib/http'
import type { AccessErrorCode, ValidationErrors } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'

/** Video promocional de la institución (HU-S9-01). Nace PROCESSING; el worker lo deja READY o FAILED. */
export type VideoStatus = 'PROCESSING' | 'READY' | 'FAILED'

export interface InstitutionVideo {
  public_id: string
  title: string
  description: string | null
  status: VideoStatus
  is_active: boolean
  duration_seconds: number | null
  width: number | null
  height: number | null
  original_bytes: number
  output_bytes: number | null
  failure_reason: string | null
  created_at: string
  /** URLs firmadas y temporales (HU-S9-02); solo existen cuando el video está READY. */
  poster_url: string | null
  video_url: string | null
}

export interface VideoInput {
  title: string
  description: string
  consent: boolean
  file: File
}

/** Igual que StoreInstitutionVideoRequest: 250 MB, MP4, MOV o WebM; título ≤ 120 y descripción ≤ 1000. */
export const MAX_VIDEO_BYTES = 250 * 1024 * 1024
export const VIDEO_LIMITS = { title: 120, description: 1000 } as const
export const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm'
export const VIDEO_CONTACT_MESSAGE = 'No incluyas enlaces, correos ni teléfonos: las empresas contactan a tu institución desde la plataforma.'

export const videoMessages: FailureMessages = {
  403: 'No tienes permiso para gestionar los videos de tu institución.',
  404: 'El video no existe.',
  // Un proxy o el servidor rechazan el cuerpo antes de validarlo.
  413: 'El video no debe superar 250 MB.',
}

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm']
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

/** Filtro previo, igual que el del servidor; el contenido real lo revisa ffprobe al procesarlo. */
export function isVideoFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return VIDEO_EXTENSIONS.includes(extension) && (file.type === '' || VIDEO_TYPES.includes(file.type))
}

const isText = (value: unknown): value is string => typeof value === 'string'
const isCount = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)

function video(response: unknown): InstitutionVideo {
  if (typeof response !== 'object' || response === null || !('data' in response) ||
      typeof response.data !== 'object' || response.data === null) throw new ApiError(502)
  const data = response.data as Record<string, unknown>
  if (!isText(data.public_id) || !isText(data.title) || (data.description !== null && !isText(data.description)) ||
      !['PROCESSING', 'READY', 'FAILED'].includes(data.status as string) || typeof data.is_active !== 'boolean' ||
      !isCount(data.duration_seconds) || !isCount(data.width) || !isCount(data.height) ||
      typeof data.original_bytes !== 'number' || !isCount(data.output_bytes) ||
      (data.failure_reason !== null && !isText(data.failure_reason)) || !isText(data.created_at) ||
      (data.poster_url !== null && !isText(data.poster_url)) || (data.video_url !== null && !isText(data.video_url))) throw new ApiError(502)
  // Solo se conservan los campos del contrato.
  return {
    public_id: data.public_id, title: data.title, description: data.description, status: data.status as VideoStatus,
    is_active: data.is_active, duration_seconds: data.duration_seconds, width: data.width, height: data.height,
    original_bytes: data.original_bytes, output_bytes: data.output_bytes, failure_reason: data.failure_reason,
    created_at: data.created_at, poster_url: data.poster_url, video_url: data.video_url,
  }
}

function videos(response: unknown): InstitutionVideo[] {
  if (typeof response !== 'object' || response === null || !('data' in response) || !Array.isArray(response.data)) throw new ApiError(502)
  return response.data.map((item: unknown) => video({ data: item }))
}

const videoPath = (publicId: string) => `/api/institution/videos/${encodeURIComponent(publicId)}`

/** Videos de la institución de la sesión, del más reciente al más antiguo (HU-S9-02 CA-01). */
export async function listVideos(signal?: AbortSignal): Promise<InstitutionVideo[]> {
  return videos(await request('/api/institution/videos', { signal }))
}

export async function updateVideo(publicId: string, input: { title: string; description: string }): Promise<InstitutionVideo> {
  await request('/sanctum/csrf-cookie')
  return video(await request(videoPath(publicId), { method: 'PUT', body: JSON.stringify(input) }))
}

export async function updateVideoStatus(publicId: string, isActive: boolean): Promise<InstitutionVideo> {
  await request('/sanctum/csrf-cookie')
  return video(await request(`${videoPath(publicId)}/status`, { method: 'PATCH', body: JSON.stringify({ is_active: isActive }) }))
}

/** «1:32»: duración legible de un video. */
export function duration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Misma lectura de errores que request(): campos del 422 y código de acceso (por ejemplo, INSTITUTION_INACTIVE). */
function xhrError(xhr: XMLHttpRequest): ApiError {
  let errors: ValidationErrors = {}
  let code: AccessErrorCode | undefined
  try {
    const body: unknown = JSON.parse(xhr.responseText)
    if (typeof body === 'object' && body !== null) {
      if ('code' in body && typeof body.code === 'string' && Object.hasOwn(accessErrorMessages, body.code)) {
        code = body.code as AccessErrorCode
      }
      if (xhr.status === 422 && 'errors' in body && typeof body.errors === 'object' && body.errors !== null && !Array.isArray(body.errors)) {
        errors = Object.fromEntries(Object.entries(body.errors).filter((entry): entry is [string, string[]] =>
          Array.isArray(entry[1]) && entry[1].every((message: unknown) => typeof message === 'string')))
      }
    }
  } catch {
    // Un cuerpo vacío o inválido conserva el código HTTP.
  }
  return new ApiError(xhr.status, errors, code)
}

/**
 * Sube el video con su progreso (HU-S9-01 CA-07). fetch no informa el avance de la subida, así que se usa
 * XMLHttpRequest con la misma sesión, CSRF y forma de errores que request(). `signal` cancela la subida.
 */
export async function uploadVideo(input: VideoInput, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<InstitutionVideo> {
  await request('/sanctum/csrf-cookie', { signal })
  const token = csrfToken()
  if (!token) throw new ApiError(419)

  const body = new FormData()
  body.append('title', input.title)
  body.append('description', input.description)
  body.append('consent', input.consent ? '1' : '0')
  body.append('video', input.file)

  const response = await new Promise<unknown>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Subida cancelada.', 'AbortError'))
      return
    }
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    xhr.open('POST', '/api/institution/videos')
    xhr.withCredentials = true
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('X-XSRF-TOKEN', token)
    xhr.upload.onprogress = (event) => { if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total) }
    xhr.onload = () => {
      signal?.removeEventListener('abort', abort)
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(xhrError(xhr))
        return
      }
      try {
        resolve(JSON.parse(xhr.responseText))
      } catch {
        reject(new ApiError(502))
      }
    }
    xhr.onerror = () => { signal?.removeEventListener('abort', abort); reject(new ApiError(0)) }
    xhr.onabort = () => { signal?.removeEventListener('abort', abort); reject(new DOMException('Subida cancelada.', 'AbortError')) }
    signal?.addEventListener('abort', abort, { once: true })
    xhr.send(body)
  })
  return video(response)
}

export function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
