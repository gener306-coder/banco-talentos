import { useCallback, useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { roleLabels } from '../auth/api'
import type { Role, User } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { organizationOf } from '../auth/user'
import { getDashboard, metricKeys, metricLabels } from '../dashboard/api'
import { useApiRequest } from '../lib/useApiRequest'
import { DualStoriesSpotlight } from '../videos/DualStoriesSpotlight'
import { BriefcaseIcon, BuildingIcon, ChartIcon, ChevronRightIcon, ClipboardIcon, IdCardIcon, PlusIcon, SearchIcon, UsersIcon, VideoIcon } from '../ui/icons'

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

// HU-S9-03 CA-04: testimonios en video para ADMIN, SECRETARY y COMPANY.
const promotion: Section = {
  to: '/promocion', title: 'Historias del Dual', icon: <VideoIcon />,
  description: 'Mira cómo les fue a los alumnos que vivieron el programa dual en una empresa.',
}

// HU-S7-01 CA-03: reporte ejecutivo para ADMIN y SECRETARY.
const reports: Section = {
  to: '/reports', title: 'Reporte ejecutivo', icon: <ChartIcon />,
  description: 'Consulta el avance del programa dual por estado de solicitud, institución y sector SCIAN.',
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
          reports,
          // HU-S7-03 CA-01: solo ADMIN.
          { to: '/audit-events', title: 'Bitácora', icon: <ClipboardIcon />, description: 'Revisa quién creó cuentas, empresas, oportunidades y solicitudes de vinculación, y cuándo.' },
          promotion,
        ],
      }
    case 'SECRETARY':
      return {
        label: 'Secretaría de Economía',
        primary: { to: '/companies/new', label: 'Registrar empresa' },
        sections: [
          { to: '/companies', title: 'Empresas', icon: <BriefcaseIcon />, description: 'Registra las empresas validadas y crea sus cuentas de acceso.' },
          secretaryAccounts,
          reports,
          promotion,
        ],
      }
    case 'INSTITUTION':
      return user.institution ? {
        label: 'Institución',
        primary: { to: '/students', label: 'Registrar alumno', state: { register: true } },
        sections: [
          { to: '/students', title: 'Alumnos', icon: <UsersIcon />, description: 'Administra el padrón, el expediente y el CV de tus alumnos.' },
          { to: '/institution/linkage-requests', title: 'Solicitudes de vinculación', icon: <IdCardIcon />, description: 'Revisa las solicitudes de las empresas para tus alumnos y el contacto de cada empresa.' },
          { to: '/institution/videos', title: 'Historias del Dual', icon: <VideoIcon />, description: 'Comparte en video la experiencia de tus alumnos para animar a las empresas a recibirlos.' },
        ],
      } : null
    case 'COMPANY':
      return user.company ? {
        label: 'Empresa',
        sections: [
          { to: '/talent', title: 'Buscar talento', icon: <SearchIcon />, description: 'Explora perfiles anónimos por habilidades, idiomas y distancia.' },
          // HU-S9-05: en segundo lugar, para que no pase desapercibida.
          promotion,
          { to: '/opportunities', title: 'Oportunidades Duales', icon: <BriefcaseIcon />, description: 'Registra los proyectos, perfiles y lugares de tu empresa para alumnos de Educación Dual.' },
          { to: '/linkage-requests', title: 'Solicitudes de vinculación', icon: <IdCardIcon />, description: 'Da seguimiento a las solicitudes enviadas y consulta el contacto de cada institución.' },
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

const count = new Intl.NumberFormat('es-MX')

/**
 * Pendiente del inicio (T-S8-10): conteo, motivo y acción juntos. Toda la tarjeta es clicable, pero el enlace conserva
 * como nombre accesible solo su acción.
 */
function HomeTask({ kind, icon, title, description, to, action }: {
  kind: 'linkage' | 'missing'
  icon: ReactNode
  title: string
  description: string
  to: string
  action: string
}) {
  return (
    <li className={`home-task home-task-${kind}`}>
      <span className="home-task-icon" aria-hidden="true">{icon}</span>
      <div className="home-task-text">
        <p className="home-task-title">{title}</p>
        <p className="home-task-description">{description}</p>
        <Link className="home-task-action" to={to}>{action}<ChevronRightIcon /></Link>
      </div>
    </li>
  )
}

/**
 * Indicadores del rol (HU-S5-01 CA-07, HU-S6-03 CA-02). No bloquean el inicio: mientras cargan no se muestra nada y,
 * si fallan, un aviso discreto deja las tarjetas de acceso intactas.
 */
function HomeIndicators({ role }: { role: Role }) {
  const load = useCallback((signal: AbortSignal) => getDashboard(role, signal), [role])
  const { data, failure } = useApiRequest(load)

  if (failure) {
    return <p className="notice-muted home-stats-failure">No pudimos cargar los indicadores. Puedes seguir usando las secciones de tu inicio.</p>
  }
  const metrics = data?.metrics
  if (!metrics) return null
  const missing = metrics.missing_data_students ?? 0
  // HU-S6-03 CA-02: solo la institución responde solicitudes; a la empresa le basta el contador.
  const linkages = role === 'INSTITUTION' ? metrics.pending_linkage_requests ?? 0 : 0

  return (
    <section className="home-indicators" aria-label="Indicadores">
      {(linkages > 0 || missing > 0) && (
        <ul className="home-tasks" aria-label="Por atender">
          {linkages > 0 && (
            <HomeTask kind="linkage" icon={<IdCardIcon />} to="/institution/linkage-requests?status=PENDIENTE_INSTITUCION" action="Revisar solicitudes"
              title={linkages === 1 ? '1 solicitud de vinculación pendiente' : `${count.format(linkages)} solicitudes de vinculación pendientes`}
              description="Las empresas esperan tu respuesta para continuar." />
          )}
          {missing > 0 && (
            <HomeTask kind="missing" icon={<UsersIcon />} to="/students?data=missing&status=active" action="Revisar el padrón"
              title={missing === 1 ? '1 alumno con datos faltantes' : `${count.format(missing)} alumnos con datos faltantes`}
              description="Completa su expediente y su seguro para que puedan participar." />
          )}
        </ul>
      )}
      <dl className="home-stats">
        {metricKeys[role].map((key) => (
          <div className="home-stat" key={key}>
            <dt>{metricLabels[key]}</dt>
            <dd>{count.format(metrics[key] ?? 0)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * Inicio por rol (tarea transversal del Sprint 4): saludo, acción principal y tarjetas de acceso a las secciones
 * del rol, con sus indicadores (HU-S5-01). La identidad completa y «Cerrar sesión» están en el menú de cuenta del encabezado (ui/AccountMenu).
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
        </p>
      </div>

      {home?.primary && (
        <div className="home-primary">
          <Link className="home-action" to={home.primary.to} state={home.primary.state}><PlusIcon />{home.primary.label}</Link>
        </div>
      )}
      {user.role === 'COMPANY' && home && <TalentShortcut />}
      {user.role === 'COMPANY' && home && <DualStoriesSpotlight />}
      {home && <HomeIndicators role={user.role} />}

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
