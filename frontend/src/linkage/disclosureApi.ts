import { ApiError, request } from '../lib/http'

/**
 * Ficha compartida con la empresa (T-S19-05 y T-S19-06). Los grupos son la lista blanca del servidor
 * (StudentDisclosure::SHAREABLE): nombre completo, enlaces y credenciales. Nada más puede compartirse.
 */
export type DisclosureField = 'full_name' | 'links' | 'credentials'
export const DISCLOSURE_FIELDS: readonly DisclosureField[] = ['full_name', 'links', 'credentials']
export const disclosureFieldLabels: Record<DisclosureField, string> = {
  full_name: 'Nombre completo',
  links: 'Enlaces y portafolio',
  credentials: 'Credenciales de certificaciones',
}
const isField = (value: unknown): value is DisclosureField => typeof value === 'string' && (DISCLOSURE_FIELDS as readonly string[]).includes(value)
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Lo que ve la institución de su ficha vigente. */
export interface DisclosureView {
  fields: DisclosureField[]
  disclosed_at: string
  disclosed_by: { name: string } | null
}

export function parseDisclosureView(data: unknown): DisclosureView | null | undefined {
  if (data === null || data === undefined) return null
  if (!isObject(data) || !Array.isArray(data.fields) || !data.fields.every(isField) || typeof data.disclosed_at !== 'string' ||
      (data.disclosed_by !== null && (!isObject(data.disclosed_by) || typeof data.disclosed_by.name !== 'string'))) return undefined
  return { fields: data.fields, disclosed_at: data.disclosed_at, disclosed_by: isObject(data.disclosed_by) ? { name: data.disclosed_by.name as string } : null }
}

/** T-S19-05: la institución comparte los grupos elegidos, con el consentimiento confirmado (D3). */
export async function shareStudentProfile(linkageId: number, fields: DisclosureField[]): Promise<DisclosureView> {
  await request('/sanctum/csrf-cookie')
  const response = await request(`/api/institution/linkage-requests/${linkageId}/disclosure`, { method: 'POST', body: JSON.stringify({ fields, consent: true }) })
  const view = isObject(response) ? parseDisclosureView(response.data) : undefined
  if (!view) throw new ApiError(502)
  return view
}

/** T-S19-05: deja de compartir la ficha; la empresa pierde el acceso de inmediato. */
export async function stopSharingStudentProfile(linkageId: number): Promise<void> {
  await request('/sanctum/csrf-cookie')
  await request(`/api/institution/linkage-requests/${linkageId}/disclosure/revoke`, { method: 'PATCH' })
}

/** Ficha que recibe la empresa: solo los grupos compartidos. */
export interface SharedProfile {
  fields: DisclosureField[]
  disclosed_at: string
  full_name?: string | null
  links?: { kind: string; url: string }[]
  credentials?: { name: string; issuer: string; credential_id: string | null; credential_url: string | null }[]
}

const isWebUrl = (value: unknown): value is string => typeof value === 'string' && /^https?:\/\//i.test(value)

/** Lectura de la empresa; null si no está disponible (404: no compartida, retirada o vinculación no aceptada). */
export async function getSharedProfile(linkageId: number, signal?: AbortSignal): Promise<SharedProfile | null> {
  let response: unknown
  try {
    response = await request(`/api/linkage-requests/${linkageId}/disclosure`, { signal })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
  const data = isObject(response) ? response.data : undefined
  if (!isObject(data) || !Array.isArray(data.fields) || !data.fields.every(isField) || typeof data.disclosed_at !== 'string') throw new ApiError(502)
  const profile: SharedProfile = { fields: data.fields, disclosed_at: data.disclosed_at }
  if (data.fields.includes('full_name')) profile.full_name = typeof data.full_name === 'string' ? data.full_name : null
  if (data.fields.includes('links')) {
    // Solo http(s), aunque el servidor ya lo filtra.
    profile.links = Array.isArray(data.links)
      ? data.links.filter((link): link is { kind: string; url: string } => isObject(link) && typeof link.kind === 'string' && isWebUrl(link.url))
        .map((link) => ({ kind: link.kind, url: link.url }))
      : []
  }
  if (data.fields.includes('credentials')) {
    profile.credentials = Array.isArray(data.credentials)
      ? data.credentials.filter((item) => isObject(item) && typeof item.name === 'string' && typeof item.issuer === 'string')
        .map((item) => {
          const credential = item as Record<string, unknown>
          return {
            name: credential.name as string, issuer: credential.issuer as string,
            credential_id: typeof credential.credential_id === 'string' ? credential.credential_id : null,
            credential_url: isWebUrl(credential.credential_url) ? credential.credential_url : null,
          }
        })
      : []
  }
  return profile
}
