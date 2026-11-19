import type { ReactNode } from 'react'
import type { BackTarget } from '../ui/backLink'
import { NavBackLink } from '../ui/NavBackLink'
import '../institutions/institutions.css'
import './companies.css'

/** Marco de las vistas de empresas (HU-S4-02), con la misma estructura que las de instituciones. */
export function CompanyLayout({ title, back, children }: { title: string; back?: BackTarget; children: ReactNode }) {
  return (
    <section className="card institutions" aria-labelledby="companies-title">
      {/* T-S13-17: un solo regreso, arriba (ver InstitutionLayout). */}
      <nav className="institution-navigation" aria-label="Navegación de empresas">
        <NavBackLink back={back} />
      </nav>
      <h2 id="companies-title">{title}</h2>
      {children}
    </section>
  )
}
