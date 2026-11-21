import type { MouseEvent } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { useContextualBack } from '../ui/backLink'
import { Callout } from '../ui/Callout'
import { NavBackLink } from '../ui/NavBackLink'
import { prefersReducedMotion } from '../ui/modal'
import { useMediaQuery } from '../ui/useMediaQuery'
import { isLegalSlug, legalDocuments } from './documents'
import { formatLegalDate, legalConfig, missingLegalFields } from './legalConfig'
import { LEGAL_LINKS } from './links'
import type { LegalSection } from './types'
import './legal.css'

/**
 * El salto se hace sin cambiar la URL: una navegación por fragmento crea una entrada nueva del historial sin estado y
 * Volver perdería la vista de origen. `scroll-margin-top` (legal.css) deja el título bajo la barra fija.
 */
function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id)
  if (!target) return
  event.preventDefault()
  // En pantallas estrechas, el índice se cierra para dejar ver la sección.
  event.currentTarget.closest('details')?.removeAttribute('open')
  target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  target.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true })
}

function TableOfContents({ sections, wide }: { sections: readonly LegalSection[]; wide: boolean }) {
  const links = (
    <ol className="legal-toc-list">
      {sections.map((section) => (
        <li key={section.id}><a href={`#${section.id}`} onClick={(event) => jumpTo(event, section.id)}>{section.title}</a></li>
      ))}
    </ol>
  )
  // Desde 960 px, índice fijo junto al artículo; en pantallas estrechas, colapsable sobre él.
  return wide
    ? <nav className="legal-toc" aria-label="En esta página"><p className="legal-toc-title" aria-hidden="true">En esta página</p>{links}</nav>
    : <details className="legal-toc-collapsible"><summary>En esta página</summary><nav aria-label="En esta página">{links}</nav></details>
}

/**
 * Documentos legales públicos (HU-S15-03): se leen con y sin sesión. El regreso lleva a la vista de origen; cambiar de
 * documento conserva ese origen, para que Volver no recorra los documentos uno por uno.
 */
export function LegalPage() {
  const { document: slug } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  const wide = useMediaQuery('(min-width: 960px)')
  // Sin vista de origen: con sesión, el Inicio de siempre (NavBackLink sin `back`); sin ella, el inicio de sesión.
  const back = useContextualBack() ?? (user ? undefined : { to: '/login', label: 'Ir al inicio de sesión' })

  if (!isLegalSlug(slug)) return <Navigate to="/legal/privacidad" replace state={location.state} />

  const legal = legalDocuments[slug]()
  const missing = missingLegalFields()

  return (
    <section className="card legal-page" aria-labelledby="legal-title">
      <nav className="page-navigation" aria-label="Regreso">
        <NavBackLink back={back} />
      </nav>
      <nav className="legal-switcher" aria-label="Documentos legales">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.slug} to={link.path} state={location.state} aria-current={link.slug === slug ? 'page' : undefined}>
            {link.label}
          </Link>
        ))}
      </nav>
      <h2 id="legal-title">{legal.title}</h2>
      <p className="legal-updated">Última actualización: {formatLegalDate(legalConfig.lastUpdated)} · Versión {legalConfig.version}</p>
      <p className="legal-lead">{legal.lead}</p>
      {missing.length > 0 && (
        <Callout tone="pending" label="Documento en borrador">
          <p>Borrador: el área jurídica aún debe completar los datos marcados como pendientes de definir.</p>
        </Callout>
      )}
      <div className="legal-layout">
        <TableOfContents sections={legal.sections} wide={wide} />
        <article className="legal-article">
          {legal.intro}
          {legal.sections.map((section) => (
            <section key={section.id} id={section.id} className="legal-section" aria-labelledby={`${section.id}-title`}>
              <h3 id={`${section.id}-title`} tabIndex={-1}>{section.title}</h3>
              {section.body}
            </section>
          ))}
        </article>
      </div>
    </section>
  )
}
