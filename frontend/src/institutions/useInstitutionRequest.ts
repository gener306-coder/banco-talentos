import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import type { ApiFailure, FailureMessages } from '../lib/useApiRequest'

export type InstitutionFailure = ApiFailure

// Mensajes propios del módulo de instituciones; los demás códigos usan los generales.
const institutionMessages: FailureMessages = {
  403: 'No tienes permiso para gestionar instituciones.',
  404: 'La institución no existe.',
}

export function useInstitutionRequest<T>(load: (signal: AbortSignal) => Promise<T>) {
  return useApiRequest(load, institutionMessages)
}

export function useInstitutionMutation() {
  return useApiMutation(institutionMessages)
}
