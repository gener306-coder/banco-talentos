import { OPERATING_MINIMUM } from '../auth/api'
import type { CompanyGap, InstitutionGap } from '../auth/api'

/** Lo que falta del perfil, en palabras de la empresa (HU-S14-03). */
export const GAP_LABELS: Record<CompanyGap, string> = {
  name: 'Nombre de la empresa', contact_name: 'Nombre del contacto', contact_email: 'Correo del contacto',
  legal_name: 'Razón social', rfc: 'RFC', sector_code: 'Sector económico', location: 'Ubicación',
}

/** HU-S16-07: los 4 datos mínimos de la institución (D6), en sus palabras. */
export const INSTITUTION_GAP_LABELS: Record<InstitutionGap, string> = {
  name: 'Nombre oficial', cct: 'Clave de Centro de Trabajo (CCT)', contact_name: 'Nombre del responsable', contact_email: 'Correo de contacto',
}

/** Datos que cuentan para el perfil completo (el puesto y el teléfono son opcionales). */
export const PROFILE_FIELDS = Object.keys(GAP_LABELS).length

/** HU-S16-07: el perfil de la institución se mide con sus 4 datos mínimos. */
export const INSTITUTION_PROFILE_FIELDS = Object.keys(INSTITUTION_GAP_LABELS).length

export const isOperatingGap = (gap: CompanyGap) => OPERATING_MINIMUM.includes(gap)

/** Datos completos del perfil, de 0 a `total`. */
export const completedFields = (missing: readonly string[], total = PROFILE_FIELDS) => total - missing.length
