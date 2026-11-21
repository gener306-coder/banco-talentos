import type { LegalSlug } from './types'

/** Documentos legales públicos (HU-S15-03), en el orden del selector y del footer. */
export const LEGAL_LINKS: readonly { slug: LegalSlug; path: string; label: string }[] = [
  { slug: 'privacidad', path: '/legal/privacidad', label: 'Aviso de Privacidad' },
  { slug: 'terminos', path: '/legal/terminos', label: 'Términos y Condiciones' },
  { slug: 'cookies', path: '/legal/cookies', label: 'Cookies' },
]

export const isLegalPath = (pathname: string) => pathname.startsWith('/legal/')
