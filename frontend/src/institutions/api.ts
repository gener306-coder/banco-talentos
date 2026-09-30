import { ApiError, request } from '../lib/http'

export interface InstitutionInput {
  name: string
  cct: string
  contact_email: string
}

export interface Institution extends InstitutionInput {
  id: number
  is_active: boolean
  created_at: string
  updated_at: string
}

function responseData(response: unknown): unknown {
  if (typeof response !== 'object' || response === null || !('data' in response)) {
    throw new ApiError(502)
  }
  return response.data
}

function institution(data: unknown): Institution {
  if (typeof data !== 'object' || data === null ||
      !('id' in data) || typeof data.id !== 'number' || !Number.isSafeInteger(data.id) || data.id <= 0 ||
      !('name' in data) || typeof data.name !== 'string' ||
      !('cct' in data) || typeof data.cct !== 'string' ||
      !('contact_email' in data) || typeof data.contact_email !== 'string' ||
      !('is_active' in data) || typeof data.is_active !== 'boolean' ||
      !('created_at' in data) || typeof data.created_at !== 'string' ||
      !('updated_at' in data) || typeof data.updated_at !== 'string') {
    throw new ApiError(502)
  }

  return {
    id: data.id, name: data.name, cct: data.cct, contact_email: data.contact_email,
    is_active: data.is_active, created_at: data.created_at, updated_at: data.updated_at,
  }
}

function institutionPath(id: string): string {
  return `/api/institutions/${encodeURIComponent(id)}`
}

export async function listInstitutions(signal?: AbortSignal): Promise<Institution[]> {
  const data = responseData(await request('/api/institutions', { signal }))
  if (!Array.isArray(data)) throw new ApiError(502)
  return data.map(institution)
}

export async function getInstitution(id: string, signal?: AbortSignal): Promise<Institution> {
  return institution(responseData(await request(institutionPath(id), { signal })))
}

async function writeInstitution(path: string, method: string, body: InstitutionInput | { is_active: boolean }): Promise<Institution> {
  // Preparar CSRF antes de cada envío permite reintentar manualmente un 419.
  // Las escrituras nunca se repiten automáticamente ante fallos de red.
  await request('/sanctum/csrf-cookie')
  return institution(responseData(await request(path, { method, body: JSON.stringify(body) })))
}

function fields(input: InstitutionInput): InstitutionInput {
  return { name: input.name, cct: input.cct, contact_email: input.contact_email }
}

export function createInstitution(input: InstitutionInput): Promise<Institution> {
  return writeInstitution('/api/institutions', 'POST', fields(input))
}

export function updateInstitution(id: string, input: InstitutionInput): Promise<Institution> {
  return writeInstitution(institutionPath(id), 'PUT', fields(input))
}

export function setInstitutionStatus(id: string, isActive: boolean): Promise<Institution> {
  return writeInstitution(`${institutionPath(id)}/status`, 'PATCH', { is_active: isActive })
}
