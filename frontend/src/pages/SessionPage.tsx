import { useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { roleLabels } from '../auth/api'
import type { User } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { organizationOf } from '../auth/user'
import { BriefcaseIcon, BuildingIcon, ChevronRightIcon, IdCardIcon, PlusIcon, SearchIcon, UsersIcon } from '../ui/icons'

interface Section {
  to: string
  title: string
  description: string
  icon: ReactNode
}

interface Home {
  /** Nombre accesible de la navegación de secciones. */
  label: string
  primary?: { to: string; label: string; state?: unknown }
  sections: Section[]
}

const secretaryAccounts: Section = {
  to: '/secretary-accounts', title: 'Cuentas de la Secretaría', icon: <IdCardIcon />,
  description: 'Crea las cuentas del personal de la Secretaría de Economía y reenvía sus enlaces.',
}

/** Acción principal y secciones de cada rol. Una cuenta sin su organización vinculada no tiene secciones. */
function homeFor(user: User): Home | null {
  switch (user.role) {
    case 'ADMIN':
      return {
        label: 'Administración',
        primary: { to: '/institutions/new', label: 'Nueva institución' },
        sections: [
          { to: '/institutions', title: 'Instituciones', icon: <BuildingIcon />, description: 'Registra instituciones educativas y administra sus cuentas.' },
          secretaryAccounts,
        ],
      }
    case 'SECRETARY':
      return {
        label: 'Secretaría de Economía',
        primary: { to: '/companies/new', label: 'Registrar empresa' },
        sections: [
          { to: '/companies', title: 'Empresas', icon: <BriefcaseIcon />, description: 'Registra las empresas validadas y crea sus cuentas de acceso.' },
          secretaryAccounts,
        ],
      }
    case 'INSTITUTION':
      return user.institution ? {
        label: 'Institución',
        primary: { to: '/students', label: 'Registrar alumno', state: { register: true } },
        sections: [
          { to: '/students', title: 'Alumnos', icon: <UsersIcon />, description: 'Administra el padrón, el expediente y el CV de tus alumnos.' },
        ],
      } : null
    case 'COMPANY':
      return user.company ? {
        label: 'Empresa',
        sections: [
          { to: '/talent', title: 'Buscar talento', icon: <SearchIcon />, description: 'Explora perfiles anónimos por habilidades, idiomas y distancia.' },
        ],
      } : null
  }
}

/** Atajo de la empresa: abre el buscador con la habilidad ya filtrada. */
function TalentShortcut() {
  const navigate = useNavigate()
  const [skill, setSkill] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = skill.trim().replace(/\s+/g, ' ').slice(0, 80)
    void navigate('/talent', { state: value ? { skill: value } : undefined })
  }

  return (
    <form className="home-search" role="search" aria-label="Buscar talento" onSubmit={submit}>
      <label htmlFor="home-skill">Buscar talento por habilidad</label>
      <div>
        <input id="home-skill" type="text" maxLength={80} autoComplete="off" placeholder="Ej. React, Contabilidad, Soldadura"
          value={skill} onChange={(event) => setSkill(event.target.value)} />
        <button type="submit"><SearchIcon />Buscar</button>
      </div>
    </form>
  )
}

/**
 * Inicio por rol (tarea transversal del Sprint 4): saludo, acción principal y tarjetas de acceso a las secciones
 * del rol. La identidad completa y «Cerrar sesión» están en el menú de cuenta del encabezado (ui/AccountMenu).
 */
export function SessionPage() {
  const { user } = useAuth()
  const titleId = useId()
  if (!user) return null
  const home = homeFor(user)
  const organization = organizationOf(user)

  return (
    <section className="card home" aria-labelledby={titleId}>
      <div className="home-greeting">
        <h2 id={titleId}>Hola, {user.name}</h2>
        <p className="home-meta">
          <span className="home-role">{roleLabels[user.role]}</span>
          {organization && <span>{organization}</span>}
          <span>{user.email}</span>
        </p>
      </div>

      {home?.primary && (
        <div className="home-primary">
          <Link className="home-action" to={home.primary.to} state={home.primary.state}><PlusIcon />{home.primary.label}</Link>
        </div>
      )}
      {user.role === 'COMPANY' && home && <TalentShortcut />}

      {home
        ? (
          <nav aria-label={home.label}>
            <ul className="home-cards">
              {home.sections.map((section, index) => (
                <li key={section.to}>
                  <Link className="home-card" to={section.to}
                    aria-labelledby={`${titleId}-section-${index}`} aria-describedby={`${titleId}-section-${index}-description`}>
                    <span className="home-card-icon" aria-hidden="true">{section.icon}</span>
                    <span className="home-card-text">
                      <span className="home-card-title" id={`${titleId}-section-${index}`}>{section.title}</span>
                      <span className="home-card-description" id={`${titleId}-section-${index}-description`}>{section.description}</span>
                    </span>
                    <ChevronRightIcon />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )
        : (
          <p className="notice-muted">
            Tu cuenta aún no tiene secciones disponibles porque no está vinculada a una organización.
            Pide a la administración del Banco de Talentos que revise tu cuenta.
          </p>
        )}
    </section>
  )
}
