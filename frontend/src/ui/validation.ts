import type { FocusEvent } from 'react'

export const INVALID_EMAIL = 'Ingresa un correo electrónico válido.'

/**
 * Validación en línea del correo al salir del campo: devuelve el error si el formato es inválido,
 * o null si es válido o está vacío (la obligatoriedad se sigue comprobando al enviar).
 */
export function emailErrorOnBlur(event: FocusEvent<HTMLInputElement>): string | null {
  const input = event.currentTarget
  return input.value.trim() !== '' && input.validity.typeMismatch ? INVALID_EMAIL : null
}
