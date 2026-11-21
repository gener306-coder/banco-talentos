import { Link, useLocation } from 'react-router'
import { footerOwner, formatLegalDate, legalConfig } from '../legal/legalConfig'
import type { LegalConfig } from '../legal/legalConfig'
import { isLegalPath, LEGAL_LINKS } from '../legal/links'
import { backState } from './backLink'

/**
 * Footer de la aplicación (HU-S15-03): los documentos legales y el responsable, discretos y al mismo ancho que el
 * contenido. Desde una vista cualquiera, el documento regresa a ella; desde otro documento, conserva el regreso original.
 */
export function AppFooter({ wide, config = legalConfig }: { wide: boolean; config?: LegalConfig }) {
  const location = useLocation()
  const label = location.pathname === '/login' ? 'Volver al inicio de sesión' : 'Volver'
  const state = isLegalPath(location.pathname) ? location.state : backState(label, location)
  const year = config.lastUpdated.slice(0, 4)

  return (
    <footer className={`app-footer${wide ? ' wide' : ''}`}>
      <nav aria-label="Información legal">
        <ul className="app-footer-links">
          {LEGAL_LINKS.map((link) => (
            <li key={link.slug}><Link to={link.path} state={state}>{link.label}</Link></li>
          ))}
        </ul>
      </nav>
      <p className="app-footer-meta">
        {/* T-S15-02: el nombre del programa una sola vez, salvo que el responsable tenga un nombre corto distinto. */}
        <span>© {year} {footerOwner(config)}</span>
        <span>Actualizado el {formatLegalDate(config.lastUpdated)}</span>
      </p>
    </footer>
  )
}
