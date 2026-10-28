import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'

export const linkageMessages: FailureMessages = {
  403: 'No tienes permiso para enviar solicitudes de vinculación.',
  404: 'El perfil no existe.',
  429: 'Enviaste demasiadas solicitudes seguidas. Espera un minuto antes de enviar otra.',
}

export const LINKAGE_MESSAGE_LIMIT = 500

export type LinkageStatus = 'PENDIENTE_INSTITUCION' | 'ACEPTADA' | 'RECHAZADA'

/** Solicitud tal como la ve la empresa: el alumno solo por su public_id (HU-S5-04 CA-05). */
export interface LinkageRequest {
  id: number
  status: LinkageStatus
  student_public_id: string
  opportunity: { id: number; title: string }
  message: string | null
  created_at: string
}

export interface LinkageInput {
  student_public_id: string
  opportunity_id: number
  message: string | null
}

const STATUSES: readonly LinkageStatus[] = ['PENDIENTE_INSTITUCION', 'ACEPTADA', 'RECHAZADA']
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isPositiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

export function linkageRequest(data: unknown): LinkageRequest {
  if (!isObject(data) || !isPositiveInt(data.id) || !STATUSES.includes(data.status as LinkageStatus) ||
      typeof data.student_public_id !== 'string' || !isObject(data.opportunity) || !isPositiveInt(data.opportunity.id) ||
      typeof data.opportunity.title !== 'string' || (data.message !== null && typeof data.message !== 'string') ||
      typeof data.created_at !== 'string') throw new ApiError(502)
  // Solo se conservan los campos del contrato.
  return {
    id: data.id, status: data.status as LinkageStatus, student_public_id: data.student_public_id,
    opportunity: { id: data.opportunity.id, title: data.opportunity.title }, message: data.message, created_at: data.created_at,
  }
}

/** Solicitud directa a la institución del alumno, sin la Secretaría (HU-S5-04 CA-04). */
export async function createLinkageRequest(input: LinkageInput): Promise<LinkageRequest> {
  await request('/sanctum/csrf-cookie')
  const response = await request('/api/linkage-requests', {
    method: 'POST',
    body: JSON.stringify({ student_public_id: input.student_public_id, opportunity_id: input.opportunity_id, message: input.message }),
  })
  if (!isObject(response)) throw new ApiError(502)
  return linkageRequest(response.data)
}
