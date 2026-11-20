import { useCallback, useLayoutEffect, useRef } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { backState, useBackLink } from '../ui/backLink'
import type { ReactNode } from 'react'
import { fullName } from '../students/api'
import { periodLabel } from '../students/catalogs'
import { BriefcaseIcon, ChevronLeftIcon, ChevronRightIcon, IdCardIcon } from '../ui/icons'
import { LoadingState } from '../ui/StateMessage'
import { getLinkageRequest, linkageDetailMessages, linkageStatusLabel } from './api'
import type { LinkageStatus as Status } from './api'
import { initials } from './chatLayout'
import { introMessages } from './conversationApi'
import type { ConversationOpening, LinkageSide } from './conversationApi'
import { getReceivedLinkage, institutionLinkageMessages } from './institutionApi'
import { LinkageConversation } from './LinkageConversation'
import './linkage.css'

/** Una tarjeta de contexto: qué alumno y qué oportunidad son el tema de la conversación (T-S13-07). */
interface ContextItem {
  title: string
  detail: string
  href: string
  action: string
  /** Nombre accesible del enlace, específico de esta conversación. */
  linkLabel: string
}

/** Lo que la vista necesita de la solicitud, igual para los dos lados. */
interface ChatSummary extends ConversationOpening {
  id: number
  status: Status
  companyName: string
  institutionName: string
  student: ContextItem
  opportunity: ContextItem
}

const paths: Record<LinkageSide, { inbox: string; detail: (id: number) => string }> = {
  COMPANY: { inbox: '/linkage-requests', detail: (id) => `/linkage-requests/${id}` },
  INSTITUTION: { inbox: '/institution/linkage-requests', detail: (id) => `/institution/linkage-requests/${id}` },
}

/** Regreso contextual de la vista: a la bandeja filtrada o al detalle de donde se abrió. */
function BackLink({ side, compact = false }: { side: LinkageSide; compact?: boolean }) {
  const back = useBackLink({ to: paths[side].inbox, label: 'Volver a solicitudes' })
  // En el encabezado del chat es un botón-ícono; su texto queda como nombre accesible.
  if (compact) {
    return <Link className="linkage-icon-button" to={back.to} state={back.state} aria-label={back.label} title={back.label}><ChevronLeftIcon /></Link>
  }
  return (
    <nav className="linkage-chat-back" aria-label="Regreso">
      <Link className="plain" to={back.to} state={back.state}><ChevronLeftIcon />{back.label}</Link>
    </nav>
  )
}

const statusTone: Record<Status, string> = {
  PENDIENTE_INSTITUCION: 'pending', ACEPTADA: 'accepted', RECHAZADA: 'rejected', CANCELADA: 'cancelled', BAJA: 'terminated',
}

function ContextCard({ icon, kicker, item, state }: { icon: ReactNode; kicker: string; item: ContextItem; state: unknown }) {
  return (
    <li className="linkage-context-card">
      <span className="linkage-context-icon" aria-hidden="true">{icon}</span>
      <span className="linkage-context-text">
        <span className="linkage-context-kicker">{kicker}</span>
        <strong className="linkage-context-title" title={item.title}>{item.title}</strong>
        {item.detail && <span className="linkage-context-detail">{item.detail}</span>}
      </span>
      <Link className="pill-link linkage-context-action" to={item.href} state={state} aria-label={item.linkLabel}>
        {item.action}<ChevronRightIcon />
      </Link>
    </li>
  )
}

const shortDate = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
const joined = (...parts: (string | number | null | false | undefined)[]) => parts.filter(Boolean).join(' · ')

function Chat({ side, data }: { side: LinkageSide; data: ChatSummary }) {
  const counterpartName = side === 'COMPANY' ? data.institutionName : data.companyName
  const detailPath = paths[side].detail(data.id)
  // El detalle regresa a esta conversación, que conserva su propio regreso (bandeja o detalle).
  const toChat = backState('Volver a la conversación', useLocation())
  const intro = introMessages(data, side, { company: data.companyName, institution: data.institutionName })
  const respond = side === 'INSTITUTION' && data.status === 'PENDIENTE_INSTITUCION'
    ? <Link className="pill-link" to={detailPath} state={toChat}>Responder solicitud<ChevronRightIcon /></Link>
    : undefined

  // T-S13-07: barra compacta (regreso, la otra organización con el estado y la solicitud) y, debajo, dos tarjetas que
  // dicen de qué alumno y de qué oportunidad trata la conversación, cada una con su acceso.
  const header = (
    <>
      <div className="linkage-chat-topbar">
        <BackLink side={side} compact />
        <span className="linkage-avatar" aria-hidden="true">{initials(counterpartName)}</span>
        <div className="linkage-chat-identity">
          <h2 id="linkage-chat-title"><span className="visually-hidden">Conversación con</span> {counterpartName}</h2>
          <p className="linkage-chat-subtitle">
            <span className={`linkage-status-dot ${statusTone[data.status]}`} aria-hidden="true" />
            <span>Solicitud {linkageStatusLabel(data.status).toLowerCase()}</span>
          </p>
        </div>
        <Link className="pill-link linkage-chat-request" to={detailPath} state={toChat} aria-label="Ver solicitud" title="Ver solicitud">
          <span className="linkage-chat-request-text">Ver solicitud</span><ChevronRightIcon />
        </Link>
      </div>
      <ul className="linkage-chat-cards" aria-label="Tema de la conversación">
        <ContextCard icon={<IdCardIcon />} kicker={side === 'COMPANY' ? 'Perfil del alumno' : 'Alumno'} item={data.student} state={toChat} />
        <ContextCard icon={<BriefcaseIcon />} kicker="Oportunidad" item={data.opportunity} state={toChat} />
      </ul>
    </>
  )

  return <LinkageConversation linkageRequestId={data.id} role={side} status={data.status} intro={intro} closedAction={respond} header={header} />
}

/** Distancia desde el inicio del documento, sin contar transformaciones (la transición de ruta desplaza la vista). */
function documentTop(element: HTMLElement): number {
  let top = 0
  for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop
  return top
}

/**
 * T-S13-07: la conversación ocupa todo el alto disponible bajo la barra de la aplicación, sin espacio sobrante
 * abajo. Se mide su posición real (la barra cambia de alto con el coemblema y el ancho) al abrir y al redimensionar.
 */
function useFillViewport(ready: boolean) {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const section = ref.current
    if (!ready || !section) return
    const fit = () => section.style.setProperty('--chat-offset', `${documentTop(section)}px`)
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [ready])
  return ref
}

function LinkageChat({ side, id }: { side: LinkageSide; id: string }) {
  const { user } = useAuth()
  const ownName = (side === 'COMPANY' ? user?.company?.name : user?.institution?.name) ?? ''
  const load = useCallback(async (signal: AbortSignal): Promise<ChatSummary> => {
    if (side === 'COMPANY') {
      const item = await getLinkageRequest(id, signal)
      const headline = item.profile.headline ?? 'Perfil sin titular'
      return {
        id: item.id, status: item.status, message: item.message, created_at: item.created_at,
        response_message: item.response_message, responded_at: item.responded_at,
        companyName: ownName, institutionName: item.institution.name,
        student: {
          title: headline, href: `/talent/${item.profile.public_id}`, action: 'Ver perfil', linkLabel: `Ver perfil: ${headline}`,
          detail: joined(item.profile.program, item.profile.period_type && item.profile.period_number && periodLabel(item.profile.period_type, item.profile.period_number)),
        },
        opportunity: {
          title: item.opportunity.title, href: `/opportunities/${item.opportunity.id}`, action: 'Ver oportunidad',
          linkLabel: `Ver la oportunidad ${item.opportunity.title}`, detail: `Solicitud del ${shortDate.format(new Date(item.created_at))}`,
        },
      }
    }
    const detail = await getReceivedLinkage(id, signal)
    return {
      id: detail.id, status: detail.status, message: detail.message, created_at: detail.created_at,
      response_message: detail.response_message, responded_at: detail.responded_at,
      companyName: detail.company.name, institutionName: ownName,
      student: {
        title: fullName(detail.student), href: `/students/${detail.student.id}`, action: 'Ver expediente',
        linkLabel: `Ver expediente de ${fullName(detail.student)}`, detail: joined(detail.student.enrollment_number, detail.student.program),
      },
      // La institución no tiene ruta de oportunidades: la ficha completa vive en el detalle de la solicitud.
      opportunity: {
        title: detail.opportunity.title, href: paths.INSTITUTION.detail(detail.id), action: 'Ver oportunidad',
        linkLabel: `Ver la oportunidad ${detail.opportunity.title}`,
        detail: joined(detail.opportunity.program, `${detail.opportunity.vacancies} ${detail.opportunity.vacancies === 1 ? 'vacante' : 'vacantes'}`),
      },
    }
  }, [side, id, ownName])
  const { data, loading, failure, refresh } = useApiRequest(load, side === 'COMPANY' ? linkageDetailMessages : institutionLinkageMessages)
  const frame = useFillViewport(Boolean(data))

  return (
    <section ref={frame} className={`card linkage-chat${data ? ' is-ready' : ''}`} aria-labelledby="linkage-chat-title">
      {loading ? <><BackLink side={side} /><h2 id="linkage-chat-title" className="visually-hidden">Conversación</h2><LoadingState label="Cargando conversación…" variant="details" /></>
        : failure ? <><BackLink side={side} /><h2 id="linkage-chat-title">Conversación</h2><InstitutionRequestError failure={failure} retry={refresh} page notFoundTitle="No encontramos esta solicitud" /></>
        : data && <Chat side={side} data={data} />}
    </section>
  )
}

/**
 * Vista dedicada a la conversación de una solicitud (HU-S13-06): encabezado con la otra organización y el estado, las
 * tarjetas del alumno y la oportunidad (T-S13-07); el hilo, que empieza con el mensaje de la solicitud; y el campo de texto abajo. Se
 * abre desde el ícono de mensaje de las bandejas, desde el detalle y desde el correo de HU-S13-05.
 */
export function LinkageChatPage({ side }: { side: LinkageSide }) {
  const { id = '' } = useParams()
  return <LinkageChat key={id} side={side} id={id} />
}
