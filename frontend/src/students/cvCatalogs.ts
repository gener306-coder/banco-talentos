/**
 * Catálogos y reglas del CV normalizado (HU-S3-01). Deben coincidir con el backend: App\Enums\CvLanguage,
 * LanguageLevel, SkillKind, StudentLinkKind, config/cv.php y App\Support\ContactInformation.
 */
export type SkillKind = 'technical' | 'soft'
export type LinkKind = 'github' | 'linkedin' | 'behance' | 'portfolio' | 'other'

export const SKILL_KINDS: readonly { value: SkillKind; label: string; plural: string }[] = [
  { value: 'technical', label: 'Técnica', plural: 'Técnicas' },
  { value: 'soft', label: 'Blanda', plural: 'Blandas' },
]

export const CV_LANGUAGES: readonly { code: string; name: string }[] = [
  { code: 'en', name: 'Inglés' }, { code: 'es', name: 'Español' }, { code: 'fr', name: 'Francés' },
  { code: 'de', name: 'Alemán' }, { code: 'pt', name: 'Portugués' }, { code: 'it', name: 'Italiano' },
  { code: 'zh', name: 'Chino' }, { code: 'ja', name: 'Japonés' }, { code: 'ko', name: 'Coreano' },
  { code: 'ru', name: 'Ruso' }, { code: 'ar', name: 'Árabe' }, { code: 'hi', name: 'Hindi' },
  { code: 'nl', name: 'Neerlandés' }, { code: 'sv', name: 'Sueco' }, { code: 'no', name: 'Noruego' },
  { code: 'da', name: 'Danés' }, { code: 'fi', name: 'Finés' }, { code: 'pl', name: 'Polaco' },
  { code: 'tr', name: 'Turco' }, { code: 'el', name: 'Griego' }, { code: 'he', name: 'Hebreo' },
  { code: 'ca', name: 'Catalán' },
]

/** MCER como enteros (A1=1 … C2=6) más Nativo=7, para filtrar por rango. */
export const LANGUAGE_LEVELS: readonly { value: number; label: string }[] = [
  { value: 1, label: 'A1 · Principiante' }, { value: 2, label: 'A2 · Básico' }, { value: 3, label: 'B1 · Intermedio' },
  { value: 4, label: 'B2 · Intermedio alto' }, { value: 5, label: 'C1 · Avanzado' }, { value: 6, label: 'C2 · Dominio' },
  { value: 7, label: 'Nativo' },
]

export const LINK_KINDS: readonly { value: LinkKind; label: string; host: string | null }[] = [
  { value: 'github', label: 'GitHub', host: 'github.com' },
  { value: 'linkedin', label: 'LinkedIn', host: 'linkedin.com' },
  { value: 'behance', label: 'Behance', host: 'behance.net' },
  { value: 'portfolio', label: 'Portafolio', host: null },
  { value: 'other', label: 'Otro', host: null },
]

export const CV_LIMITS = { skills: 30, languages: 10, certifications: 20, projects: 10, links: 10 } as const

export const isSkillKind = (value: unknown): value is SkillKind => SKILL_KINDS.some((kind) => kind.value === value)
export const isLinkKind = (value: unknown): value is LinkKind => LINK_KINDS.some((kind) => kind.value === value)
export const isCvLanguage = (value: unknown): value is string => CV_LANGUAGES.some((language) => language.code === value)
export const isLanguageLevel = (value: unknown): value is number => LANGUAGE_LEVELS.some((level) => level.value === value)
export const languageName = (code: string) => CV_LANGUAGES.find((language) => language.code === code)?.name ?? code
export const levelLabel = (value: number) => LANGUAGE_LEVELS.find((level) => level.value === value)?.label ?? String(value)
export const linkKindLabel = (kind: LinkKind) => LINK_KINDS.find((item) => item.value === kind)?.label ?? kind

/** Igual que App\Support\CatalogSlug: minúsculas, sin acentos, espacios simples; conserva «#», «+» y «.». */
export function displayName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ')
}
export function catalogSlug(value: string): string {
  return displayName(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export const CONTACT_MESSAGE = 'Los enlaces y datos de contacto van en la sección protegida de enlaces.'
const CONTACT_PATTERNS = [
  /https?:\/\//i,
  /\bwww\./i,
  /[^\s@]+@[^\s@]+\.[^\s@]+/u,
  /(?:\d[\s().-]{0,2}){9}\d/,
  /\b[a-z0-9][a-z0-9-]*\.(?:com|mx|io|dev|org|app|me)\b/i,
]
/** URLs, correos, teléfonos o dominios en un texto público (CA-02); «Node.js» o «ASP.NET» no cuentan. */
export function hasContactInformation(text: string): boolean {
  return CONTACT_PATTERNS.some((pattern) => pattern.test(text))
}

export const UNSAFE_URL_MESSAGE = 'Escribe una dirección https:// pública y válida.'
const RESERVED_HOSTS = ['localhost', 'local', 'internal', 'lan', 'home', 'test', 'example', 'invalid']

/** Igual que App\Rules\SafeHttpsUrl: https público, sin IP, puertos ni credenciales. */
export function isSafeHttpsUrl(value: string): boolean {
  if (/[\s\p{Cc}]/u.test(value)) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  if (host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host)) return false
  if (RESERVED_HOSTS.some((reserved) => host === reserved || host.endsWith(`.${reserved}`))) return false
  return /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)
}

export function belongsTo(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === domain || host.endsWith(`.${domain}`)
  } catch {
    return false
  }
}

/** Error de una URL de enlace, o null si es válida para su tipo. */
export function linkUrlError(kind: LinkKind, url: string): string | null {
  if (!url.trim()) return 'Escribe la dirección del enlace.'
  if (!isSafeHttpsUrl(url.trim())) return UNSAFE_URL_MESSAGE
  const host = LINK_KINDS.find((item) => item.value === kind)?.host
  return host && !belongsTo(url.trim(), host) ? `El enlace debe ser de ${host}.` : null
}

/** Errores del servidor de una lista (`languages.2.level`) por posición y campo. */
export function itemErrors(errors: Record<string, string[]> | undefined, list: string, index: number, field: string): string[] | undefined {
  return errors?.[`${list}.${index}.${field}`]
}
