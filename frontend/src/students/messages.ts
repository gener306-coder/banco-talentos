import type { FailureMessages } from '../lib/useApiRequest'

// Mensajes propios del módulo de alumnos; los demás códigos usan los generales.
export const studentMessages: FailureMessages = {
  403: 'No tienes permiso para gestionar alumnos.',
  404: 'El alumno no existe.',
}
