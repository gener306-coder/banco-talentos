/**
 * HU-S15-01: único archivo con datos jurídicos. El área jurídica lo completa antes de producción; los documentos
 * (Aviso de Privacidad, Términos y Condiciones, Cookies), el footer y el aviso simplificado lo leen de aquí.
 *
 * Mientras un campo valga PENDING (o el régimen sea null), cada documento muestra un aviso de borrador y el marcador se
 * ve en el texto. Esto no bloquea el desarrollo ni el despliegue (docs/sprint-15.md, D1).
 *
 * Régimen:
 * - `public_entity`: el responsable es un sujeto obligado del sector público (Ley General de Protección de Datos
 *   Personales en Posesión de Sujetos Obligados). Los derechos se ejercen ante su Unidad de Transparencia.
 * - `private_entity`: el responsable es un particular (Ley Federal de Protección de Datos Personales en Posesión de los
 *   Particulares de 2025). La autoridad es la Secretaría Anticorrupción y Buen Gobierno.
 * Los plazos y artículos no se fijan en código: los redacta el área jurídica en `responseTerm`.
 */

export type LegalRegime = 'public_entity' | 'private_entity'

/** Marcador de un dato jurídico pendiente. Se muestra tal cual en los documentos. */
export const PENDING = 'Pendiente de definir'

export interface LegalProcessor {
  /** Proveedor o categoría (por ejemplo, el servicio de correo). */
  name: string
  purpose: string
  location: string
}

export interface LegalConfig {
  /** null mientras el cliente lo define. */
  regime: LegalRegime | null
  controller: {
    /** Nombre o denominación del responsable. */
    name: string
    /** Nombre corto para el footer. */
    shortName: string
    address: string
    website: string | null
  }
  /** Unidad de Transparencia (público) o área de datos personales (particular). */
  dataProtection: {
    channelName: string
    email: string
    phone: string | null
    /** Solo si es distinto del domicilio del responsable. */
    address: string | null
    hours: string | null
    /** Plazo de respuesta a una solicitud de derechos, redactado por el área jurídica. */
    responseTerm: string
  }
  /** Autoridad garante vigente: Secretaría Anticorrupción y Buen Gobierno u órgano garante estatal. */
  authority: { name: string; website: string | null }
  jurisdiction: {
    governingLaw: string
    /** Tribunales competentes para los Términos y Condiciones. */
    courts: string
  }
  /** Encargados que tratan datos por cuenta del responsable. */
  processors: readonly LegalProcessor[]
  version: string
  /** Fecha ISO (AAAA-MM-DD) de la última actualización de los documentos. */
  lastUpdated: string
}

export const legalConfig: LegalConfig = {
  regime: null,
  controller: {
    name: PENDING,
    shortName: 'Banco de Talentos',
    address: PENDING,
    website: null,
  },
  dataProtection: {
    channelName: PENDING,
    email: PENDING,
    phone: null,
    address: null,
    hours: null,
    responseTerm: PENDING,
  },
  authority: { name: PENDING, website: null },
  jurisdiction: { governingLaw: PENDING, courts: PENDING },
  processors: [
    { name: 'Proveedor del servicio de correo electrónico', purpose: 'Enviar los avisos de la plataforma (acceso, contraseña y mensajes nuevos).', location: PENDING },
    { name: 'Proveedor de hospedaje', purpose: 'Alojar la aplicación, la base de datos y los archivos.', location: PENDING },
  ],
  version: '1.0',
  lastUpdated: '2026-11-20',
}

/** Rutas de los datos jurídicos aún pendientes (vacía cuando la configuración está completa). */
export function missingLegalFields(config: LegalConfig = legalConfig): string[] {
  const missing: string[] = []
  if (config.regime === null) missing.push('regime')
  const visit = (value: unknown, path: string) => {
    if (value === PENDING) missing.push(path)
    else if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${path}[${index}]`))
    else if (typeof value === 'object' && value !== null) {
      for (const [key, item] of Object.entries(value)) visit(item, path ? `${path}.${key}` : key)
    }
  }
  for (const [key, value] of Object.entries(config)) if (key !== 'regime') visit(value, key)
  return missing
}

/** Elige el texto según el régimen; `pending` mientras el cliente no lo define. */
export function byRegime<T>(config: Pick<LegalConfig, 'regime'>, variants: Record<LegalRegime | 'pending', T>): T {
  return variants[config.regime ?? 'pending']
}

/** Nombre de la ley aplicable a los datos personales según el régimen. */
export function dataProtectionLaw(config: Pick<LegalConfig, 'regime'> = legalConfig): string {
  return byRegime(config, {
    public_entity: 'Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados',
    private_entity: 'Ley Federal de Protección de Datos Personales en Posesión de los Particulares',
    pending: 'ley de protección de datos personales aplicable (pendiente de definir)',
  })
}

/** Fecha de la última actualización en español, por ejemplo, 20 de noviembre de 2026. */
export function formatLegalDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)))
}
