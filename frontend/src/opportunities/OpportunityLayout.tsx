import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { ChevronLeftIcon } from '../ui/icons'
import '../institutions/institutions.css'
import './opportunities.css'

/** Marco de las vistas de oportunidades (HU-S5-02), con la misma estructura que las de empresas. */
export function OpportunityLayout({ title, children }: { title: string; children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <section className="card institutions" aria-labelledby="opportunities-title">
      <nav className="institution-navigation" aria-label="Navegación de oportunidades">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
        <Link className="plain" to="/opportunities" aria-current={pathname === '/opportunities' ? 'page' : undefined}>Oportunidades Duales</Link>
      </nav>
      <h2 id="opportunities-title">{title}</h2>
      {children}
    </section>
  )
}

/** Habilidades como etiquetas de solo lectura. */
export function SkillTags({ skills, label }: { skills: { name: string; kind: string }[]; label: string }) {
  return (
    <ul className="opportunity-skills" aria-label={label}>
      {skills.map((skill) => <li key={skill.name} className={`chip ${skill.kind}`}>{skill.name}</li>)}
    </ul>
  )
}
