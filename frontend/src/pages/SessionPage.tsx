import { useCallback, useEffect, useId, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { roleLabels } from '../auth/api'
import type { Role, SessionCompany, User } from '../auth/api'
import { ProfileMeter } from '../account/ProfileProgress'
import { useAuth } from '../auth/useAuth'
import { organizationOf } from '../auth/user'
import { getDashboard, metricKeys, metricLabels } from '../dashboard/api'
import { useApiRequest } from '../lib/useApiRequest'
import { useCountUp } from '../ui/useCountUp'
import { useReveal } from '../ui/useReveal'
import { useSkeletonDelay } from '../ui/useSkeletonDelay'
import { PendingLabel } from '../ui/forms'
import { firstViewInSession } from './homeCountUp'
import { displayName } from '../students/cvCatalogs'
import { SkillPicker } from '../students/SkillPicker'
import { emptyFilters, MAX_SKILL_FILTERS, talentViewParams } from '../talent/api'
import { UnreadBadge } from '../linkage/UnreadBadge'
import { DualStoriesSpotlight } from '../videos/DualStoriesSpotlight'
import { BriefcaseIcon, BuildingIcon, ChartIcon, ChevronRightIcon, ClipboardIcon, IdCardIcon, PlusIcon, SearchIcon, UsersIcon, VideoIcon } from '../ui/icons'

interface Section {
  to: string
  title: string
  /** Aviso junto al título, dentro del nombre del enlace (HU-S13-04: conversaciones sin leer). */
  badge?: ReactNode
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
          { to: '/institution/linkage-requests', title: 'Solicitudes de vinculación', badge: <UnreadBadge side="INSTITUTION" />, icon: <IdCardIcon />, description: 'Revisa las solicitudes de las empresas para tus alumnos y el contacto de cada empresa.' },
          { to: '/institution/videos', title: 'Historias del Dual', icon: <VideoIcon />, description: 'Comparte en video la experiencia de tus alumnos para animar a las empresas a recibirlos.' },
        ],
      } : null
    case 'COMPANY':
      return user.company ? {
        label: 'Empresa',
        sections: [
          { to: '/talent', title: 'Buscar talento', icon: <SearchIcon />, description: 'Explora perfiles anónimos por habilidades, idiomas y distancia.' },
          // T-S9-02: sin tarjeta de Historias del Dual; el módulo del inicio ya lleva a todas.
          { to: '/opportunities', title: 'Oportunidades Duales', icon: <BriefcaseIcon />, description: 'Registra los proyectos, perfiles y lugares de tu empresa para alumnos de Educación Dual.' },
          { to: '/linkage-requests', title: 'Solicitudes de vinculación', badge: <UnreadBadge side="COMPANY" />, icon: <IdCardIcon />, description: 'Da seguimiento a las solicitudes enviadas y consulta el contacto de cada institución.' },
        ],
      } : null
  }
}

/**
 * Atajo de la empresa (T-S12-07): el mismo selector del catálogo que el buscador (HU-S11-01), así «pyhton» se corrige
 * eligiendo la sugerencia antes de buscar. Enter solo agrega la habilidad elegida; «Buscar» abre /talent con las
 * habilidades en la URL (no se cambia de vista al elegir una opción: WCAG 3.2.2). Lo escrito sin elegir no se
 * descarta en silencio.
 */
function TalentShortcut() {
  const navigate = useNavigate()
  const [skills, setSkills] = useState<string[]>([])
  const [pendingText, setPendingText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (displayName(pendingText)) {
      setError('Elige una sugerencia del catálogo o borra el texto.')
      return
    }
    const params = talentViewParams({ ...emptyFilters, skills }, 1).toString()
    void navigate(params ? `/talent?${params}` : '/talent')
  }

  return (
    <form className="home-search home-panel" role="search" aria-label="Buscar talento" onSubmit={submit} noValidate>
      <SkillPicker idPrefix="home" catalogOnly label="Buscar talento por habilidad" placeholder="Ej. React, Contabilidad, Soldadura"
        skills={skills.map((name) => ({ name, kind: 'technical' }))} max={MAX_SKILL_FILTERS} disabled={false} serverError={null}
        onChange={(next) => { setSkills(next.map((skill) => skill.name)); setError(null) }}
        onQueryChange={(text) => { setPendingText(text); setError(null) }} />
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit"><SearchIcon />Buscar</button>
      </div>
    </form>
  )
}

const count = new Intl.NumberFormat('es-MX')
const dateFormat = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

/** Fecha del día para el encabezado del inicio: «Jueves 19 de noviembre». */
function todayLabel(): string {
  const text = dateFormat.format(new Date()).replace(',', '')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Indicador con conteo (T-S12-11). El texto del `dd` es siempre el valor real (lo leen el lector de pantalla y las
 * pruebas); la cifra intermedia se pinta encima con `::before` desde `data-count`, sin texto alternativo.
 */
function HomeStat({ label, value, animate }: { label: string; value: number; animate: boolean }) {
  const current = useCountUp(value, animate)
  return (
    <div className="home-stat">
      <dt>{label}</dt>
      <dd data-count={current === null ? undefined : count.format(current)}>{count.format(value)}</dd>
    </div>
  )
}

/**
 * Pendiente del inicio (T-S8-10): conteo, motivo y acción juntos. Toda la tarjeta es clicable, pero el enlace conserva
 * como nombre accesible solo su acción.
 */
/**
 * Aviso de algo por atender (T-S14-16): una línea discreta y toda tocable, como el recordatorio del perfil de la empresa
 * (T-S14-01). El enlace se anuncia por su acción («Revisar solicitudes») y el conteo es su descripción; el detalle vive
 * en la bandeja o en el padrón.
 */
function HomeTask({ kind, icon, title, to, action }: {
  kind: 'linkage' | 'missing'
  icon: ReactNode
  title: string
  to: string
  action: string
}) {
  const id = useId()
  return (
    <li>
      <Link className={`home-task home-task-${kind}`} to={to} aria-label={action} aria-describedby={id}>
        <span className="home-task-icon" aria-hidden="true">{icon}</span>
        <span className="home-task-title" id={id}>{title}</span>
        <span className="home-task-action" aria-hidden="true">Revisar<ChevronRightIcon /></span>
      </Link>
    </li>
  )
}

/**
 * Esqueleto del resumen (T-S14-07): una tarjeta por indicador del rol, con la misma retícula. Reserva el alto desde el
 * primer pintado; los huesos solo se ven si la espera supera el retardo del esqueleto.
 */
function HomeStatsSkeleton({ count: tiles }: { count: number }) {
  const shown = useSkeletonDelay()
  return (
    <div className={`home-stats home-stats-skeleton${shown ? '' : ' is-waiting'}`} aria-hidden="true" data-testid="home-stats-skeleton">
      {Array.from({ length: tiles }, (_, tile) => (
        <div className="home-stat" key={tile}><span className="bone value" /><span className="bone label" /></div>
      ))}
    </div>
  )
}

/**
 * Indicadores del rol (HU-S5-01 CA-07, HU-S6-03 CA-02). No bloquean el inicio: mientras cargan, un esqueleto reserva su
 * lugar (T-S14-07) y, si fallan, un aviso discreto con «Reintentar» deja las tarjetas de acceso intactas.
 */
function HomeIndicators({ role, onSettled }: { role: Role; onSettled: () => void }) {
  const load = useCallback((signal: AbortSignal) => getDashboard(role, signal), [role])
  const { data, failure, refresh, pending } = useApiRequest(load)
  // T-S12-11: avisa cuando ya tiene su altura final, para que las tarjetas se revelen en su lugar definitivo.
  const settled = Boolean(data || failure)
  useEffect(() => { if (settled) onSettled() }, [settled, onSettled])
  const [animate] = useState(firstViewInSession)
  const metrics = data?.metrics
  if (data && !metrics) return null
  const missing = metrics?.missing_data_students ?? 0
  // HU-S6-03 CA-02: solo la institución responde solicitudes; a la empresa le basta el contador.
  const linkages = role === 'INSTITUTION' ? metrics?.pending_linkage_requests ?? 0 : 0

  return (
    <section className="home-indicators" aria-labelledby="home-summary-title" aria-busy={!settled || pending}>
      <h3 className="home-section-title" id="home-summary-title">Indicadores</h3>
      {failure ? (
        <div className="home-stats-failure" role="status">
          <p>No pudimos cargar los indicadores. Puedes seguir usando las secciones de tu inicio.</p>
          <button type="button" className="secondary" disabled={pending} onClick={() => { void refresh() }}>
            <PendingLabel pending={pending} label="Reintentar" pendingLabel="Reintentando…" />
          </button>
        </div>
      ) : !metrics ? (
        <>
          <p className="visually-hidden" role="status">Cargando indicadores…</p>
          <HomeStatsSkeleton count={metricKeys[role].length} />
        </>
      ) : (
        <div className="content-enter">
          {(linkages > 0 || missing > 0) && (
            <ul className="home-tasks" aria-label="Por atender">
              {linkages > 0 && (
                <HomeTask kind="linkage" icon={<IdCardIcon />} to="/institution/linkage-requests?status=PENDIENTE_INSTITUCION" action="Revisar solicitudes"
                  title={linkages === 1 ? '1 solicitud espera tu respuesta' : `${count.format(linkages)} solicitudes esperan tu respuesta`} />
              )}
              {missing > 0 && (
                <HomeTask kind="missing" icon={<UsersIcon />} to="/students?data=missing&status=active" action="Revisar el padrón"
                  title={missing === 1 ? '1 alumno con datos por completar' : `${count.format(missing)} alumnos con datos por completar`} />
              )}
            </ul>
          )}
          <dl className="home-stats">
            {metricKeys[role].map((key) => (
              <HomeStat key={key} label={metricLabels[key]} value={metrics[key] ?? 0} animate={animate} />
            ))}
          </dl>
        </div>
      )}
    </section>
  )
}

/**
 * Inicio por rol (tarea transversal del Sprint 4): saludo, acción principal y tarjetas de acceso a las secciones
 * del rol, con sus indicadores (HU-S5-01). La identidad completa y «Cerrar sesión» están en el menú de cuenta del encabezado (ui/AccountMenu).
 */
/**
 * T-S14-01: recordatorio discreto del perfil (sustituye al aviso extenso de HU-S14-03 CA-04). Una sola línea con el
 * avance y un enlace al perfil; el detalle de lo que falta vive en Mi cuenta. Sin el mínimo (M1) dice qué habilita.
 */
function ProfileNudge({ company }: { company: SessionCompany }) {
  const text = company.canOperate
    ? `Tu perfil está casi listo: ${company.missing.length === 1 ? 'falta 1 dato' : `faltan ${company.missing.length} datos`}.`
    : 'Completa tu perfil para publicar oportunidades y enviar solicitudes.'
  return (
    <Link className="profile-nudge" to="/account#organization">
      <ProfileMeter missing={company.missing} />
      <span className="profile-nudge-text">{text}</span>
      <span className="profile-nudge-action">Completar<ChevronRightIcon /></span>
    </Link>
  )
}

export function SessionPage() {
  const { user } = useAuth()
  const titleId = useId()
  // T-S12-11: las tarjetas suelen quedar bajo el pliegue; la cascada empieza cuando la lista entra en pantalla, ya con
  // los indicadores (y el carrusel de la empresa) cargados, que las empujan hacia abajo.
  const markIndicators = useCallback(() => undefined, [])
  const markSpotlight = useCallback(() => undefined, [])
  // T-S14-07: el resumen y el carrusel reservan su alto con sus esqueletos, así que las tarjetas no esperan a los datos:
  // se revelan en cascada al entrar en pantalla.
  const [cards, reveal] = useReveal<HTMLUListElement>()
  if (!user) return null
  // HU-S14-03 CA-02: solo el inicio lleva al onboarding pendiente; los enlaces directos no se interceptan.
  if (user.company?.onboarding === 'pending') return <Navigate to="/welcome" replace />
  const home = homeFor(user)
  const organization = organizationOf(user)

  return (
    <section className="card home" aria-labelledby={titleId}>
      {/* T-S14-07: encabezado con la fecha, el saludo y la acción principal a la derecha en pantallas anchas. */}
      <div className="home-header">
        <div className="home-greeting">
          <p className="home-date">{todayLabel()}</p>
          <h2 id={titleId}>Hola, {user.name}</h2>
          <p className="home-meta">
            <span className="home-role">{roleLabels[user.role]}</span>
            {organization && <span>{organization}</span>}
          </p>
        </div>
        {home?.primary && (
          <Link className="home-action" to={home.primary.to} state={home.primary.state}><PlusIcon />{home.primary.label}</Link>
        )}
      </div>

      {user.company && user.company.missing.length > 0 && <ProfileNudge company={user.company} />}

      {user.role === 'COMPANY' && home && <TalentShortcut />}
      {/* Lo accionable antes que lo inspiracional: el resumen va antes que las Historias. */}
      {home && <HomeIndicators role={user.role} onSettled={markIndicators} />}
      {user.role === 'COMPANY' && home && <DualStoriesSpotlight onSettled={markSpotlight} />}

      {home
        ? (
          <nav aria-label={home.label}>
            <h3 className="home-section-title">Accesos</h3>
            <ul ref={cards} className="home-cards" data-reveal={reveal}>
              {home.sections.map((section, index) => (
                // T-S12-11: entrada escalonada al llegar a la lista.
                <li key={section.to} style={{ '--enter-index': index } as CSSProperties}>
                  <Link className="home-card" to={section.to}
                    aria-labelledby={`${titleId}-section-${index}`} aria-describedby={`${titleId}-section-${index}-description`}>
                    <span className="home-card-icon" aria-hidden="true">{section.icon}</span>
                    <span className="home-card-text">
                      <span className="home-card-title" id={`${titleId}-section-${index}`}>{section.title}{section.badge}</span>
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
