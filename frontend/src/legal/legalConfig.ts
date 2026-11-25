/**
 * HU-S15-01 y T-S15-02: único archivo con datos jurídicos. Los documentos (Aviso de Privacidad, Términos y Condiciones,
 * Cookies), el footer y el aviso simplificado lo leen de aquí.
 *
 * Con los valores predeterminados la plataforma ya es publicable: el responsable operativo es la Administración del
 * Banco de Talentos, y cada dato jurídico opcional que falta (null o lista vacía) se omite o se sustituye por una
 * redacción operativa, sin marcadores ni avisos de borrador. Completarlos con el área jurídica es una ampliación.
 *
 * Régimen:
 * - `public_entity`: el responsable es un sujeto obligado del sector público (Ley General de Protección de Datos
 *   Personales en Posesión de Sujetos Obligados). Los derechos se ejercen ante su Unidad de Transparencia.
 * - `private_entity`: el responsable es un particular (Ley Federal de Protección de Datos Personales en Posesión de los
 *   Particulares de 2025). La autoridad es la Secretaría Anticorrupción y Buen Gobierno.
 * - `null`: los documentos remiten a los principios y la legislación vigentes de protección de datos en México.
 * Los plazos y artículos no se fijan en código: los redacta el área jurídica en `responseTerm`.
 */

export type LegalRegime = 'public_entity' | 'private_entity'

export interface LegalProcessor {
  /** Proveedor o categoría (por ejemplo, el servicio de correo). */
  name: string
  purpose: string
  /** País o región donde trata los datos, si se conoce. */
  location: string | null
}

export interface LegalConfig {
  /** null mientras el cliente lo define. */
  regime: LegalRegime | null
  /** Nombre del programa, para el footer y los textos. */
  programName: string
  controller: {
    /** Nombre o denominación del responsable. */
    name: string
    /** Nombre corto para el footer, solo si es distinto del programa. */
    shortName: string | null
    address: string | null
    website: string | null
  }
  /** Canal ARCO dedicado: Unidad de Transparencia (público) o área de datos personales (particular). */
  dataProtection: {
    channelName: string | null
    email: string | null
    phone: string | null
    /** Solo si es distinto del domicilio del responsable. */
    address: string | null
    hours: string | null
    /** Plazo de respuesta a una solicitud de derechos, redactado por el área jurídica. */
    responseTerm: string | null
  }
  /** Autoridad garante vigente: Secretaría Anticorrupción y Buen Gobierno u órgano garante estatal. */
  authority: { name: string | null; website: string | null }
  jurisdiction: {
    governingLaw: string | null
    /** Tribunales competentes para los Términos y Condiciones. */
    courts: string | null
  }
  /** Encargados que tratan datos por cuenta del responsable; vacía, los documentos los mencionan en general. */
  processors: readonly LegalProcessor[]
  version: string
  /** Fecha ISO (AAAA-MM-DD) de la última actualización de los documentos. */
  lastUpdated: string
}

export const legalConfig: LegalConfig = {
  regime: null,
  programName: 'Banco de Talentos – Educación Dual',
  controller: {
    name: 'Administración del Banco de Talentos',
    shortName: null,
    address: null,
    website: null,
  },
  dataProtection: {
    channelName: null,
    email: null,
    phone: null,
    address: null,
    hours: null,
    responseTerm: null,
  },
  authority: { name: null, website: null },
  jurisdiction: { governingLaw: null, courts: null },
  processors: [],
  // Sprint 19 (D1): ficha compartida con la empresa tras aceptar la vinculación.
  version: '1.1',
  lastUpdated: '2026-11-24',
}

/** Datos jurídicos que, al completarse con el área jurídica, amplían los documentos. */
const LEGAL_FIELDS = [
  'regime', 'controller.address', 'dataProtection.channelName', 'dataProtection.email', 'dataProtection.responseTerm',
  'authority.name', 'jurisdiction.governingLaw', 'jurisdiction.courts', 'processors',
] as const

/**
 * Utilidad interna para revisiones con el área jurídica: los datos jurídicos aún vacíos. No dispara avisos ni bloqueos
 * en la interfaz (T-S15-02).
 */
export function missingLegalFields(config: LegalConfig = legalConfig): string[] {
  return LEGAL_FIELDS.filter((path) => {
    const value = path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | null)?.[key], config)
    return value === null || value === '' || (Array.isArray(value) && value.length === 0)
  })
}

/** Elige el texto según el régimen; `pending` mientras el cliente no lo define. */
export function byRegime<T>(config: Pick<LegalConfig, 'regime'>, variants: Record<LegalRegime | 'pending', T>): T {
  return variants[config.regime ?? 'pending']
}

/** Marco aplicable a los datos personales según el régimen, con su artículo («conforme a …»). */
export function dataProtectionLaw(config: Pick<LegalConfig, 'regime'> = legalConfig): string {
  return byRegime(config, {
    public_entity: 'la Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados',
    private_entity: 'la Ley Federal de Protección de Datos Personales en Posesión de los Particulares',
    pending: 'los principios y la legislación vigentes en México en materia de protección de datos personales',
  })
}

/** Nombre del titular para el footer: el nombre corto solo si se distingue del programa. */
export function footerOwner(config: LegalConfig = legalConfig): string {
  const { shortName } = config.controller
  return shortName && shortName !== config.programName ? `${shortName} · ${config.programName}` : config.programName
}

/** Fecha de la última actualización en español, por ejemplo, 20 de noviembre de 2026. */
export function formatLegalDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)))
}
