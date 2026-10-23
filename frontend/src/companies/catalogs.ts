/**
 * Sectores SCIAN México a 2 dígitos (HU-S4-02 CA-04). Copia del enum EconomicSector del backend: si cambia aquel,
 * cambia también este catálogo.
 */
export const ECONOMIC_SECTORS = [
  { code: '11', name: 'Agricultura, cría y explotación de animales, aprovechamiento forestal, pesca y caza' },
  { code: '21', name: 'Minería' },
  { code: '22', name: 'Generación, transmisión, distribución y comercialización de energía eléctrica, suministro de agua y de gas natural por ductos al consumidor final' },
  { code: '23', name: 'Construcción' },
  { code: '31-33', name: 'Industrias manufactureras' },
  { code: '43', name: 'Comercio al por mayor' },
  { code: '46', name: 'Comercio al por menor' },
  { code: '48-49', name: 'Transportes, correos y almacenamiento' },
  { code: '51', name: 'Información en medios masivos' },
  { code: '52', name: 'Servicios financieros y de seguros' },
  { code: '53', name: 'Servicios inmobiliarios y de alquiler de bienes muebles e intangibles' },
  { code: '54', name: 'Servicios profesionales, científicos y técnicos' },
  { code: '55', name: 'Corporativos' },
  { code: '56', name: 'Servicios de apoyo a los negocios y manejo de residuos, y servicios de remediación' },
  { code: '61', name: 'Servicios educativos' },
  { code: '62', name: 'Servicios de salud y de asistencia social' },
  { code: '71', name: 'Servicios de esparcimiento culturales y deportivos, y otros servicios recreativos' },
  { code: '72', name: 'Servicios de alojamiento temporal y de preparación de alimentos y bebidas' },
  { code: '81', name: 'Otros servicios excepto actividades gubernamentales' },
  { code: '93', name: 'Actividades legislativas, gubernamentales, de impartición de justicia y de organismos internacionales y extraterritoriales' },
] as const

export type SectorCode = (typeof ECONOMIC_SECTORS)[number]['code']

export const isSectorCode = (value: unknown): value is SectorCode => ECONOMIC_SECTORS.some((sector) => sector.code === value)

export const sectorName = (code: string): string => ECONOMIC_SECTORS.find((sector) => sector.code === code)?.name ?? code

const RFC_PATTERN = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z\d]{3})$/u
const GENERIC_RFCS = ['XAXX010101000', 'XEXX010101000']
export const INVALID_RFC = 'El RFC no es válido: 12 caracteres para persona moral o 13 para persona física.'

/** Misma regla que el backend (App\Rules\Rfc): formato, fecha AAMMDD real y sin RFC genéricos. */
export function isValidRfc(value: string): boolean {
  const match = RFC_PATTERN.exec(value)
  if (!match || GENERIC_RFCS.includes(value)) return false
  const [year, month, day] = [2000 + Number(match[2]), Number(match[3]), Number(match[4])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const normalizeRfc = (value: string): string => value.trim().toUpperCase()

export const INVALID_PHONE = 'El teléfono debe tener entre 10 y 15 dígitos; admite espacios, paréntesis, guiones y un «+» inicial.'

export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '').length
  return /^\+?[\d\s().-]+$/.test(value) && digits >= 10 && digits <= 15
}
