import { PENDING } from './legalConfig'

/**
 * Dato de la configuración legal dentro de un documento (T-S15-01). Un dato pendiente se distingue del texto con el
 * tono de estado inactivo, para que nadie lo lea como el nombre del responsable o su domicilio.
 */
export function LegalValue({ value }: { value: string }) {
  return value === PENDING ? <mark className="legal-pending">{PENDING}</mark> : <>{value}</>
}
