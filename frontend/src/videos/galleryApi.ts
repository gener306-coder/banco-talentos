import type { Role } from '../auth/api'
import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'

/** Historias del Dual (HU-S9-03, HU-S9-04): testimonios en video para COMPANY, SECRETARY y ADMIN. */
export const GALLERY_VIEWERS: readonly Role[] = ['COMPANY', 'SECRETARY', 'ADMIN']

export interface PromotionalVideo {
  public_id: string
  title: string
  description: string | null
  duration_seconds: number
  width: number
  height: number
  institution: { public_id: string; name: string }
  poster_url: string
  video_url: string
}

export interface PromotionalVideoPage {
  videos: PromotionalVideo[]
  page: number
  lastPage: number
  total: number
}

export const galleryMessages: FailureMessages = {
  403: 'No tienes permiso para consultar las Historias del Dual.',
  404: 'El video no existe.',
}

const isText = (value: unknown): value is string => typeof value === 'string'
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

function promotionalVideo(item: unknown): PromotionalVideo {
  if (typeof item !== 'object' || item === null) throw new ApiError(502)
  const data = item as Record<string, unknown>
  const institution = data.institution as Record<string, unknown> | null
  if (!isText(data.public_id) || !isText(data.title) || (data.description !== null && !isText(data.description)) ||
      !isCount(data.duration_seconds) || !isCount(data.width) || !isCount(data.height) || typeof institution !== 'object' || institution === null ||
      !isText(institution.public_id) || !isText(institution.name) || !isText(data.poster_url) || !isText(data.video_url)) throw new ApiError(502)
  // Solo se conservan los campos del contrato.
  return {
    public_id: data.public_id, title: data.title, description: data.description, duration_seconds: data.duration_seconds,
    width: data.width, height: data.height, institution: { public_id: institution.public_id, name: institution.name }, poster_url: data.poster_url, video_url: data.video_url,
  }
}

export async function listPromotionalVideos(page: number, signal?: AbortSignal): Promise<PromotionalVideoPage> {
  const response = await request(`/api/promotional-videos?page=${page}`, { signal })
  if (typeof response !== 'object' || response === null || !('data' in response) || !Array.isArray(response.data) ||
      !('meta' in response) || typeof response.meta !== 'object' || response.meta === null) throw new ApiError(502)
  const meta = response.meta as Record<string, unknown>
  if (!isCount(meta.current_page) || !isCount(meta.last_page) || !isCount(meta.total)) throw new ApiError(502)
  return { videos: response.data.map(promotionalVideo), page: meta.current_page, lastPage: Math.max(1, meta.last_page), total: meta.total }
}

/** Moderación mínima del Administrador (HU-S9-03 CA-05): solo inactiva; reactivar le corresponde a la institución. */
export async function deactivatePromotionalVideo(publicId: string): Promise<void> {
  await request('/sanctum/csrf-cookie')
  await request(`/api/promotional-videos/${encodeURIComponent(publicId)}/status`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) })
}
