import { randomInt } from 'node:crypto'

/**
 * Sesión INSTITUTION compartida por los escenarios de alumnos. La crea `institution.setup.ts`
 * con un único inicio de sesión, por el mismo límite de intentos que motivó `ADMIN_STATE`.
 */
export const INSTITUTION_STATE = 'playwright/.auth/institution.json'

/**
 * CCT aleatoria con el formato de la SEP (T-S14-15): entidad 28, 3 letras, 4 dígitos y 1 letra. Única entre corridas
 * con altísima probabilidad (unos 450 millones de combinaciones).
 */
export function randomCct(): string {
  const letter = () => String.fromCharCode(65 + randomInt(26))
  return `28${letter()}${letter()}${letter()}${String(randomInt(10000)).padStart(4, '0')}${letter()}`
}
