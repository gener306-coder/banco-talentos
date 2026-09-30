import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { InstitutionFailure } from './useInstitutionRequest'
import './institutions.css'

export function InstitutionLayout({ title, children }: { title: string, children: ReactNode }) {
  return (
    <section className="card institutions" aria-labelledby="institutions-title">
      <nav className="institution-navigation" aria-label="Navegación de instituciones">
        <Link to="/">Volver al inicio</Link>
        <Link to="/institutions">Instituciones</Link>
      </nav>
      <h2 id="institutions-title">{title}</h2>
      {children}
    </section>
  )
}

export function InstitutionStatus({ active }: { active: boolean }) {
  return <span className={`institution-status ${active ? 'active' : 'inactive'}`}>{active ? 'ACTIVA' : 'INACTIVA'}</span>
}

export function InstitutionRequestError({ failure, retry }: {
  failure: InstitutionFailure
  retry?: () => Promise<void>
}) {
  return (
    <div>
      <p className="notice" role="alert">{failure.message}</p>
      {retry && ![401, 403, 404].includes(failure.status) && (
        <button type="button" onClick={() => { void retry() }}>Reintentar</button>
      )}
    </div>
  )
}
