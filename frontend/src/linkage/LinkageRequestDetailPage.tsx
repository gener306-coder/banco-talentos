import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { periodLabel } from '../students/catalogs'
import { backState, useBackLink, useContextualBack } from '../ui/backLink'
import { NavBackLink } from '../ui/NavBackLink'
import { Callout } from '../ui/Callout'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmailMenu } from '../ui/EmailMenu'
import { ChevronRightIcon, MessageIcon } from '../ui/icons'
import { LoadingState } from '../ui/StateMessage'
import { cancelLinkageRequest, getLinkageRequest, linkageDetailMessages, terminateLinkageRequest } from './api'
import type { LinkageInboxItem } from './api'
import { LinkageStatus } from './LinkageStatus'
import { LinkageTerminationSection } from './LinkageTermination'
import { UnreadTag } from './UnreadBadge'
import '../institutions/institutions.css'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

/** Lo que significa el estado para la empresa y lo que sigue. Solo los estados con un paso pendiente llevan aviso. */
function StatusCallout({ data, toRequest }: { data: LinkageInboxItem; toRequest: ReturnType<typeof backState> }) {
  // T-S15-03: con la oportunidad inactiva, la institución no puede aceptar la solicitud (auditoría QA #6). La empresa lo
  // sabe aquí y puede reactivarla desde su detalle o cancelar la solicitud.
  if (data.status === 'PENDIENTE_INSTITUCION' && !data.opportunity.is_active) {
    return (
      <Callout tone="pending" label="Estado de la solicitud"
        action={<Link className="pill-link" to={`/opportunities/${data.opportunity.id}`} state={toRequest}>Ver oportunidad<ChevronRightIcon /></Link>}>
        <p>
          Tu oportunidad <strong>{data.opportunity.title}</strong> está inactiva: mientras siga así, la institución no puede aceptar esta
          solicitud. Reactívala para que pueda responderla, o cancela la solicitud.
        </p>
      </Callout>
    )
  }
  if (data.status === 'PENDIENTE_INSTITUCION') {
    return (
      <Callout tone="pending" label="Estado de la solicitud">
        <p>La institución aún no responde. Mientras siga pendiente, puedes cancelarla.</p>
      </Callout>
    )
  }
  if (data.status === 'ACEPTADA') {
    return (
      <Callout tone="info" label="Estado de la solicitud">
        <p>{data.institution.name} aceptó la solicitud. Coordina la vinculación en la conversación o con su contacto.</p>
      </Callout>
    )
  }
  return null
}

function Detail({ data, onCancelled }: { data: LinkageInboxItem; onCancelled: (updated: LinkageInboxItem) => void }) {
  const { profile, opportunity, institution } = data
  const headline = profile.headline ?? 'Perfil sin titular'
  // T-S12-04: el perfil y la oportunidad regresan a esta solicitud, que a su vez conserva el regreso a la bandeja.
  const toRequest = backState('Volver a la solicitud', useLocation())
  const chatPath = `/linkage-requests/${data.id}/chat`
  // T-S13-07: si se llegó desde la conversación, «Volver a la conversación» ya lleva a ella; no se repite el botón.
  const fromChat = useContextualBack()?.to === chatPath
  const mutation = useApiMutation(linkageDetailMessages)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<ReactNode>(null)
  const origin = useRef<HTMLButtonElement | null>(null)

  async function cancel() {
    setConfirming(false)
    if (mutation.pending) return
    setNotice(null)
    await mutation.submit(() => cancelLinkageRequest(data.id), (updated) => {
      onCancelled(updated)
      setNotice(<>Solicitud para <strong className="notice-subject">{updated.opportunity.title}</strong> cancelada correctamente.</>)
    })
  }

  const cancelError = mutation.failure && (mutation.failure.errors.status?.join(' ') ?? mutation.failure.message)

  return (
    <>
      {notice && <p className="institution-success" role="status">{notice}</p>}
      {cancelError && <p className="notice" role="alert">{cancelError}</p>}
      <StatusCallout data={data} toRequest={toRequest} />
      {/* HU-S13-06: la conversación vive en su propia vista; en una pendiente muestra solo el mensaje de la solicitud. */}
      {!fromChat && (
        <p>
          <Link className="institution-button" to={chatPath} state={toRequest}>
            <MessageIcon />Abrir conversación{data.unread_count > 0 && <> <UnreadTag count={data.unread_count} /></>}
          </Link>
        </p>
      )}

      <dl className="student-identity">
        <dt>Estado de la solicitud</dt><dd><LinkageStatus status={data.status} /></dd>
        <dt>Enviada</dt><dd>{dateFormat.format(new Date(data.created_at))}</dd>
        {/* T-S13-14: el mensaje de la solicitud y la respuesta de la institución se leen en la conversación. */}
        {data.responded_at && <><dt>Respondida</dt><dd>{dateFormat.format(new Date(data.responded_at))}</dd></>}
      </dl>
      {data.status === 'PENDIENTE_INSTITUCION' && (
        <p>
          <button type="button" className="account-action danger" disabled={mutation.pending}
            onClick={(event) => { origin.current = event.currentTarget; setConfirming(true) }}>Cancelar solicitud</button>
        </p>
      )}

      <section className="student-section" aria-labelledby="linkage-profile-title">
        <h3 id="linkage-profile-title">Perfil solicitado</h3>
        {/* HU-S15-04: tras la aceptación, la institución puede compartir datos necesarios por la conversación. */}
        <p className="privacy-note">
          {data.status === 'ACEPTADA' || data.status === 'BAJA'
            ? 'La plataforma te muestra solo el perfil anónimo. La institución puede compartirte en la conversación los datos necesarios para la vinculación: trátalos con confidencialidad y solo para este fin.'
            : 'Conoces al alumno solo por su perfil anónimo; su identidad la resguarda su institución.'}
        </p>
        <dl className="student-identity">
          <dt>Titular</dt><dd>{headline}</dd>
          <dt>Carrera o programa</dt><dd>{profile.program ?? 'Sin capturar'}</dd>
          <dt>Periodo actual</dt><dd>{profile.period_type && profile.period_number ? periodLabel(profile.period_type, profile.period_number) : 'Sin capturar'}</dd>
        </dl>
        <p><Link className="pill-link" to={`/talent/${profile.public_id}`} state={toRequest}>Ver perfil<ChevronRightIcon /></Link></p>
      </section>

      <section className="student-section" aria-labelledby="linkage-opportunity-title">
        <h3 id="linkage-opportunity-title">Oportunidad</h3>
        <dl className="student-identity">
          <dt>Título</dt><dd>{opportunity.title}</dd>
        </dl>
        <p><Link className="pill-link" to={`/opportunities/${opportunity.id}`} state={toRequest}>Ver oportunidad<ChevronRightIcon /></Link></p>
      </section>

      <section className="student-section" aria-labelledby="linkage-institution-title">
        <h3 id="linkage-institution-title">Institución y contacto del programa dual</h3>
        <dl className="student-identity">
          <dt>Institución</dt><dd>{institution.name}</dd>
          {institution.contact_name && <><dt>Contacto</dt><dd>{institution.contact_name}</dd></>}
          {institution.contact_position && <><dt>Puesto o departamento</dt><dd>{institution.contact_position}</dd></>}
          {/* T-S12-06: el correo queda visible y seleccionable; su ícono ofrece copiarlo, webmail o la app del sistema. */}
          <dt>Correo</dt><dd>{institution.contact_email
            ? <span className="cell-meta">{institution.contact_email}<span className="cell-actions"><EmailMenu email={institution.contact_email} /></span></span>
            : 'Sin correo'}</dd>
          <dt>Teléfono</dt><dd>{institution.contact_phone ? <a href={`tel:${institution.contact_phone.replace(/[^\d+]/g, '')}`}>{institution.contact_phone}</a> : 'Sin teléfono'}</dd>
        </dl>
      </section>

      {/* T-S14-13: la empresa da de baja una vinculación aceptada (p. ej., el alumno no se presentó); libera el lugar. */}
      <LinkageTerminationSection viewer="COMPANY" status={data.status} termination={data.termination} messages={linkageDetailMessages}
        submit={(reason) => terminateLinkageRequest(data.id, reason)} onTerminated={onCancelled} />

      <ConfirmDialog open={confirming} origin={origin}
        title="¿Cancelar la solicitud?"
        description="La institución ya no podrá responderla. Podrás enviar una nueva solicitud para el mismo perfil y oportunidad más adelante."
        confirmLabel="Cancelar solicitud" onConfirm={() => { void cancel() }} onCancel={() => setConfirming(false)} />
    </>
  )
}

function LinkageRequestDetail({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => getLinkageRequest(id, signal), [id])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, linkageDetailMessages)
  // T-S12-05: regresa a la bandeja con el filtro y la página de origen.
  const back = useBackLink({ to: '/linkage-requests', label: 'Volver a solicitudes' })

  return (
    <section className="card institutions" aria-labelledby="linkage-request-title">
      <nav className="institution-navigation" aria-label="Navegación de solicitudes">
        {/* T-S13-17: un solo regreso, arriba: a la bandeja de origen, a la conversación o, sin origen, a la bandeja. */}
        <NavBackLink back={back} />
      </nav>
      <h2 id="linkage-request-title">Detalle de solicitud</h2>
      {loading ? <LoadingState label="Cargando solicitud…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page notFoundTitle="No encontramos esta solicitud" />
        : data && <div className="content-enter"><Detail data={data} onCancelled={setData} /></div>}
    </section>
  )
}

/** Detalle de una solicitud enviada por la empresa (HU-S13-02 CA-02). */
export function LinkageRequestDetailPage() {
  const { id = '' } = useParams()
  return <LinkageRequestDetail key={id} id={id} />
}
