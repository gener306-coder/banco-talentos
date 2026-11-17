import { useCallback } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { backState, useBackLink } from '../ui/backLink'
import { Callout } from '../ui/Callout'
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons'
import { LoadingState } from '../ui/StateMessage'
import { getLinkageRequest, linkageDetailMessages } from './api'
import type { LinkageStatus as Status } from './api'
import { introMessages } from './conversationApi'
import type { ConversationOpening, LinkageSide } from './conversationApi'
import { getReceivedLinkage, institutionLinkageMessages } from './institutionApi'
import { LinkageConversation } from './LinkageConversation'
import { LinkageStatus } from './LinkageStatus'
import './linkage.css'

/** Lo que la vista necesita de la solicitud, igual para los dos lados. */
interface ChatSummary extends ConversationOpening {
  id: number
  status: Status
  opportunityTitle: string
  companyName: string
  institutionName: string
}

const paths: Record<LinkageSide, { inbox: string; detail: (id: number) => string }> = {
  COMPANY: { inbox: '/linkage-requests', detail: (id) => `/linkage-requests/${id}` },
  INSTITUTION: { inbox: '/institution/linkage-requests', detail: (id) => `/institution/linkage-requests/${id}` },
}

function Chat({ side, data }: { side: LinkageSide; data: ChatSummary }) {
  const counterpartName = side === 'COMPANY' ? data.institutionName : data.companyName
  const detailPath = paths[side].detail(data.id)
  // El detalle regresa a esta conversación, que conserva su propio regreso (bandeja o detalle).
  const toChat = backState('Volver a la conversación', useLocation())
  const intro = introMessages(data, side, { company: data.companyName, institution: data.institutionName })
  const respond = side === 'INSTITUTION' && data.status === 'PENDIENTE_INSTITUCION'
    ? <Link className="pill-link" to={detailPath} state={toChat}>Responder solicitud<ChevronRightIcon /></Link>
    : undefined

  return (
    <>
      <div className="linkage-chat-heading">
        <h2 id="linkage-chat-title">Conversación con {counterpartName}</h2>
        <p className="linkage-chat-meta">
          <span className="linkage-title" title={data.opportunityTitle}>{data.opportunityTitle}</span>
          <LinkageStatus status={data.status} />
          <Link className="pill-link" to={detailPath} state={toChat}>Ver detalle<ChevronRightIcon /></Link>
        </p>
      </div>
      <Callout tone="info" label="Aviso de privacidad">
        <p>La empresa conoce al alumno solo por su perfil. No compartas datos personales del alumno por este medio.</p>
      </Callout>
      <LinkageConversation linkageRequestId={data.id} role={side} status={data.status} intro={intro} closedAction={respond} />
    </>
  )
}

function LinkageChat({ side, id }: { side: LinkageSide; id: string }) {
  const { user } = useAuth()
  const ownName = (side === 'COMPANY' ? user?.company?.name : user?.institution?.name) ?? ''
  const load = useCallback(async (signal: AbortSignal): Promise<ChatSummary> => {
    if (side === 'COMPANY') {
      const item = await getLinkageRequest(id, signal)
      return {
        id: item.id, status: item.status, message: item.message, created_at: item.created_at,
        response_message: item.response_message, responded_at: item.responded_at,
        opportunityTitle: item.opportunity.title, companyName: ownName, institutionName: item.institution.name,
      }
    }
    const detail = await getReceivedLinkage(id, signal)
    return {
      id: detail.id, status: detail.status, message: detail.message, created_at: detail.created_at,
      response_message: detail.response_message, responded_at: detail.responded_at,
      opportunityTitle: detail.opportunity.title, companyName: detail.company.name, institutionName: ownName,
    }
  }, [side, id, ownName])
  const { data, loading, failure, refresh } = useApiRequest(load, side === 'COMPANY' ? linkageDetailMessages : institutionLinkageMessages)
  const back = useBackLink({ to: paths[side].inbox, label: 'Volver a solicitudes' })

  return (
    <section className="card linkage-chat" aria-labelledby="linkage-chat-title">
      <nav className="linkage-chat-back" aria-label="Regreso">
        <Link className="plain" to={back.to} state={back.state}><ChevronLeftIcon />{back.label}</Link>
      </nav>
      {loading ? <><h2 id="linkage-chat-title" className="visually-hidden">Conversación</h2><LoadingState label="Cargando conversación…" variant="details" /></>
        : failure ? <><h2 id="linkage-chat-title">Conversación</h2><InstitutionRequestError failure={failure} retry={refresh} page notFoundTitle="No encontramos esta solicitud" /></>
        : data && <Chat side={side} data={data} />}
    </section>
  )
}

/**
 * Vista dedicada a la conversación de una solicitud (HU-S13-06): encabezado con la otra organización, la oportunidad y
 * el estado; aviso de privacidad; el hilo, que empieza con el mensaje de la solicitud; y el campo de texto abajo. Se
 * abre desde el ícono de mensaje de las bandejas, desde el detalle y desde el correo de HU-S13-05.
 */
export function LinkageChatPage({ side }: { side: LinkageSide }) {
  const { id = '' } = useParams()
  return <LinkageChat key={id} side={side} id={id} />
}
