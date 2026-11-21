import { useEffect, useRef, useState } from 'react'
import type { MouseEvent, RefObject } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { useContextualBack } from '../ui/backLink'
import { Callout } from '../ui/Callout'
import { NavBackLink } from '../ui/NavBackLink'
import { prefersReducedMotion } from '../ui/modal'
import { useMediaQuery } from '../ui/useMediaQuery'
import { isLegalSlug, legalDocuments } from './documents'
import { formatLegalDate, legalConfig, missingLegalFields } from './legalConfig'
import type { LegalSection, LegalSlug } from './types'
import './legal.css'

const DOCUMENT_ORDER: readonly LegalSlug[] = ['privacidad', 'terminos', 'cookies']

/**
 * Sección en lectura (T-S15-01): la última cuyo título ya pasó el primer tercio de la zona visible.
 * Al llegar al final de la página, la última sección. Se recalcula al desplazar, una vez por cuadro.
 */
function useActiveSection(ids: readonly string[]): string {
  const [active, setActive] = useState(ids[0])
  const key = ids.join(' ')
  useEffect(() => {
    const list = key.split(' ')
    let frame = 0
    const update = () => {
      frame = 0
      const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-bar-height')) || 80
      // Una sección está en lectura cuando su título pasa el primer tercio de la zona visible bajo la barra.
      const offset = bar + (window.innerHeight - bar) / 3
      const atEnd = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      let current = list[0]
      for (const id of list) {
        const section = document.getElementById(id)
        if (section && section.getBoundingClientRect().top <= offset) current = id
      }
      setActive(atEnd ? list[list.length - 1] : current)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [key])
  return active
}

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

/** El índice desplegado del celular se cierra con Esc (devolviendo el foco a su resumen) o al tocar fuera de él. */
function useDismissableDetails(): RefObject<HTMLDetailsElement | null> {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = () => ref.current?.removeAttribute('open')
    const onPointer = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !ref.current?.open) return
      close()
      ref.current.querySelector('summary')?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
  return ref
}

function TableOfContents({ sections, wide }: { sections: readonly LegalSection[]; wide: boolean }) {
  const active = useActiveSection(sections.map((section) => section.id))
  const details = useDismissableDetails()
  const current = sections.find((section) => section.id === active) ?? sections[0]
  const links = (
    <ol className="legal-toc-list">
      {sections.map((section) => (
        <li key={section.id}>
          <a href={`#${section.id}`} aria-current={section.id === active ? 'location' : undefined} onClick={(event) => jumpTo(event, section.id)}>
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  )
  // Desde 960 px, índice fijo junto al artículo. En pantallas estrechas, una barra fija bajo el encabezado que dice en
  // qué sección vas y se despliega para saltar a otra.
  return wide
    ? <nav className="legal-toc" aria-label="En esta página"><p className="legal-toc-title" aria-hidden="true">En esta página</p>{links}</nav>
    : (
      <details ref={details} className="legal-toc-collapsible">
        <summary>
          <span className="legal-toc-summary-label">En esta página</span>
          <span className="legal-toc-current">{current.title}</span>
        </summary>
        <nav aria-label="En esta página">{links}</nav>
      </details>
    )
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
  const draft = legal.usesConfig && missingLegalFields().length > 0

  return (
    <section className="card legal-page" aria-labelledby="legal-title">
      <div className="legal-topbar">
        <nav className="page-navigation" aria-label="Regreso">
          <NavBackLink back={back} />
        </nav>
        {/* Control segmentado con los nombres cortos: los tres caben en una fila también a 390 px. */}
        <nav className="legal-switcher" aria-label="Documentos legales">
          {DOCUMENT_ORDER.map((item) => (
            <Link key={item} to={`/legal/${item}`} state={location.state} aria-current={item === slug ? 'page' : undefined}>
              {legalDocuments[item]().shortTitle}
            </Link>
          ))}
        </nav>
      </div>
      <div className="legal-layout">
        <div className="legal-header">
          <h2 id="legal-title">{legal.title}</h2>
          <p className="legal-updated"><span>Actualizado el {formatLegalDate(legalConfig.lastUpdated)}</span> <span>Versión {legalConfig.version}</span></p>
          <p className="legal-lead">{legal.lead}</p>
          {draft && (
            <Callout tone="pending" label="Documento en borrador">
              <p>Borrador: el área jurídica aún debe completar los datos marcados como pendientes de definir.</p>
            </Callout>
          )}
        </div>
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
