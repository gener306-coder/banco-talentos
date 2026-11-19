import type { ReactNode } from 'react'
import { AlertIcon, SearchIcon } from '../ui/icons'
import type { BackTarget } from '../ui/backLink'
import { NavBackLink } from '../ui/NavBackLink'
import { StateMessage } from '../ui/StateMessage'
import type { InstitutionFailure } from './useInstitutionRequest'
import './institutions.css'

/**
 * T-S13-17: un solo regreso, arriba. El listado vuelve al inicio; el detalle, la edición y el alta, a donde
 * corresponde (`back`), sin repetir un enlace a la propia sección ni otro regreso al final de la página.
 */
export function InstitutionLayout({ title, back, children }: { title: string; back?: BackTarget; children: ReactNode }) {
  return (
    <section className="card institutions" aria-labelledby="institutions-title">
      <nav className="institution-navigation" aria-label="Navegación de instituciones">
        <NavBackLink back={back} />
      </nav>
      <h2 id="institutions-title">{title}</h2>
      {children}
    </section>
  )
}

export function InstitutionStatus({ active }: { active: boolean }) {
  return <span className={`institution-status ${active ? 'active' : 'inactive'}`}>{active ? 'ACTIVA' : 'INACTIVA'}</span>
}

const pageErrorTitles: Record<number, string> = {
  403: 'Acceso denegado',
  404: 'No encontramos esta institución',
}

/**
 * Error de una solicitud. `page` presenta el fallo de carga de una vista completa como estado;
 * sin él, es el aviso compacto que acompaña a una acción dentro de la vista.
 */
export function InstitutionRequestError({ failure, retry, page = false, notFoundTitle }: {
  failure: InstitutionFailure
  retry?: () => Promise<void>
  page?: boolean
  /** Título del 404 de una vista completa en otros módulos (por ejemplo, oportunidades). */
  notFoundTitle?: string
}) {
  const canRetry = retry && ![401, 403, 404].includes(failure.status)
  const retryButton = canRetry && (
    <button type="button" className={page ? 'secondary' : undefined} onClick={() => { void retry() }}>Reintentar</button>
  )

  if (page) {
    return (
      <StateMessage kind="error" icon={failure.status === 404 ? <SearchIcon /> : <AlertIcon />}
        title={(failure.status === 404 && notFoundTitle) || pageErrorTitles[failure.status] || 'No pudimos cargar la información'}
        description={failure.message} action={retryButton} />
    )
  }

  return (
    <div>
      <p className="notice" role="alert">{failure.message}</p>
      {retryButton}
    </div>
  )
}
