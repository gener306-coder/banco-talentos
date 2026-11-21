import type { ReactNode } from 'react'

export type LegalSlug = 'privacidad' | 'terminos' | 'cookies'

export interface LegalSection {
  /** Ancla de la sección (#id). */
  id: string
  title: string
  body: ReactNode
}

export interface LegalDocument {
  slug: LegalSlug
  title: string
  /** Nombre corto para el selector y el footer. */
  shortTitle: string
  lead: ReactNode
  /** Contenido previo a las secciones (por ejemplo, el resumen del Aviso de Privacidad). */
  intro?: ReactNode
  sections: readonly LegalSection[]
}
