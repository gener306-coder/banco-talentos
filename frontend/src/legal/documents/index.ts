import type { LegalDocument, LegalSlug } from '../types'
import { cookiesDocument } from './cookies'
import { privacyDocument } from './privacy'
import { termsDocument } from './terms'

export const legalDocuments: Record<LegalSlug, () => LegalDocument> = {
  privacidad: () => privacyDocument(),
  terminos: () => termsDocument(),
  cookies: () => cookiesDocument(),
}

export const isLegalSlug = (value: string | undefined): value is LegalSlug =>
  value !== undefined && Object.hasOwn(legalDocuments, value)
