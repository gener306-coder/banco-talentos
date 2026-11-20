/**
 * Clave de Centro de Trabajo de la SEP (T-S14-15), igual que App\Rules\WorkCenterKey: 2 dígitos de la entidad (01 a 32),
 * 3 letras, 4 dígitos y 1 letra. Se compara en mayúsculas y sin espacios ni guiones.
 */
export const INVALID_CCT = 'La CCT debe tener 10 caracteres: 2 dígitos de la entidad, 3 letras, 4 dígitos y 1 letra, p. ej. 28EUT0001A.'

export const normalizeCct = (value: string) => value.replace(/[\s-]+/g, '').toUpperCase()

export const isValidCct = (value: string) => /^(0[1-9]|[12]\d|3[0-2])[A-Z]{3}\d{4}[A-Z]$/.test(normalizeCct(value))

/** Un CCT anterior a la regla que no cambia sigue siendo válido; solo uno nuevo debe cumplir el formato. */
export function cctError(value: string, current: string | null): string | null {
  if (current !== null && normalizeCct(value) === normalizeCct(current)) return null
  return isValidCct(value) ? null : INVALID_CCT
}
