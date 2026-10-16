import { ApiError, request, requestBlob } from '../lib/http'

/** Seguro facultativo (HU-S3-02): resguardo exclusivo de la institución, nunca del perfil público. */
export interface SocialSecurityDocument {
  name: string
  size: number
  uploaded_at: string
}

export interface SocialSecurity {
  nss: string | null
  document: SocialSecurityDocument | null
}

export const NSS_LENGTH = 11
/** Igual que StoreStudentSocialSecurityDocumentRequest::MAX_KILOBYTES. */
export const MAX_DOCUMENT_BYTES = 2048 * 1024

const isText = (value: unknown): value is string => typeof value === 'string'

function document(data: unknown): SocialSecurityDocument | null {
  if (data === null) return null
  if (typeof data !== 'object' ||
      !('name' in data) || !isText(data.name) ||
      !('size' in data) || typeof data.size !== 'number' || !Number.isSafeInteger(data.size) || data.size < 0 ||
      !('uploaded_at' in data) || !isText(data.uploaded_at)) throw new ApiError(502)
  return { name: data.name, size: data.size, uploaded_at: data.uploaded_at }
}

function socialSecurity(response: unknown): SocialSecurity {
  if (typeof response !== 'object' || response === null || !('data' in response) ||
      typeof response.data !== 'object' || response.data === null) throw new ApiError(502)
  const data = response.data
  if (!('nss' in data) || (data.nss !== null && !isText(data.nss)) || !('document' in data)) throw new ApiError(502)
  // Solo se conservan los campos del contrato.
  return { nss: data.nss, document: document(data.document) }
}

const securityPath = (id: number | string) => `/api/students/${encodeURIComponent(String(id))}/social-security`

export async function getSocialSecurity(id: number | string, signal?: AbortSignal): Promise<SocialSecurity> {
  return socialSecurity(await request(securityPath(id), { signal }))
}

export async function updateSocialSecurity(id: number, nss: string): Promise<SocialSecurity> {
  await request('/sanctum/csrf-cookie')
  return socialSecurity(await request(securityPath(id), { method: 'PUT', body: JSON.stringify({ nss }) }))
}

export async function uploadSocialSecurityDocument(id: number, file: File): Promise<SocialSecurity> {
  await request('/sanctum/csrf-cookie')
  const body = new FormData()
  body.append('document', file)
  return socialSecurity(await request(`${securityPath(id)}/document`, { method: 'POST', body }))
}

export function downloadSocialSecurityDocument(id: number): Promise<Blob> {
  return requestBlob(`${securityPath(id)}/document`)
}

/** Solo dígitos, como máximo 11: lo que se escribe o pega con espacios o guiones queda limpio. */
export function nssDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, NSS_LENGTH)
}

/** «1234 5678 903»: agrupado para leerlo, sin cambiar lo que se envía. */
export function formatNss(digits: string): string {
  return [digits.slice(0, 4), digits.slice(4, 8), digits.slice(8)].filter(Boolean).join(' ')
}

/** 11 dígitos con dígito verificador de Luhn, igual que App\Support\SocialSecurityNumber. */
export function isValidNss(nss: string): boolean {
  if (!/^\d{11}$/.test(nss)) return false
  const sum = [...nss].reverse().reduce((total, digit, position) => {
    const value = Number(digit) * (position % 2 === 1 ? 2 : 1)
    return total + (value > 9 ? value - 9 : value)
  }, 0)
  return sum % 10 === 0
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || (file.type === '' && file.name.toLowerCase().endsWith('.pdf'))
}

export function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
