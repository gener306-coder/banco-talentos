import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { ChevronLeftIcon } from '../ui/icons'
import '../institutions/institutions.css'
import './companies.css'

/** Marco de las vistas de empresas (HU-S4-02), con la misma estructura que las de instituciones. */
export function CompanyLayout({ title, children }: { title: string; children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <section className="card institutions" aria-labelledby="companies-title">
      <nav className="institution-navigation" aria-label="Navegación de empresas">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
        <Link className="plain" to="/companies" aria-current={pathname === '/companies' ? 'page' : undefined}>Empresas</Link>
      </nav>
      <h2 id="companies-title">{title}</h2>
      {children}
    </section>
  )
}
