import { OPERATING_MINIMUM } from '../auth/api'
import type { CompanyGap } from '../auth/api'

/** Lo que falta del perfil, en palabras de la empresa (HU-S14-03). */
export const GAP_LABELS: Record<CompanyGap, string> = {
  name: 'Nombre de la empresa', contact_name: 'Nombre del contacto', contact_email: 'Correo del contacto',
  legal_name: 'Razón social', rfc: 'RFC', sector_code: 'Sector económico', location: 'Ubicación',
}

/** Datos que cuentan para el perfil completo (el puesto y el teléfono son opcionales). */
export const PROFILE_FIELDS = Object.keys(GAP_LABELS).length

export const isOperatingGap = (gap: CompanyGap) => OPERATING_MINIMUM.includes(gap)

/** Datos completos del perfil, de 0 a PROFILE_FIELDS. */
export const completedFields = (missing: readonly CompanyGap[]) => PROFILE_FIELDS - missing.length
