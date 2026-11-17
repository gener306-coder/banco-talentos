import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { periodLabel } from '../students/catalogs'
import { backState, useBackLink } from '../ui/backLink'
import { Callout } from '../ui/Callout'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmailMenu } from '../ui/EmailMenu'
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons'
import { LoadingState } from '../ui/StateMessage'
import { cancelLinkageRequest, getLinkageRequest, linkageDetailMessages } from './api'
import type { LinkageInboxItem } from './api'
import { LinkageConversation } from './LinkageConversation'
import { LinkageStatus } from './LinkageStatus'
import '../institutions/institutions.css'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

/** Lo que significa el estado para la empresa y lo que sigue. Solo los estados con un paso pendiente llevan aviso. */
function StatusCallout({ data }: { data: LinkageInboxItem }) {
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
        <p>{data.institution.name} aceptó la solicitud. Coordina la vinculación en la conversación de abajo o con su contacto.</p>
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
      <StatusCallout data={data} />

      <dl className="student-identity">
        <dt>Estado de la solicitud</dt><dd><LinkageStatus status={data.status} /></dd>
        <dt>Enviada</dt><dd>{dateFormat.format(new Date(data.created_at))}</dd>
        <dt>Mensaje de tu empresa</dt><dd className="opportunity-description">{data.message ?? 'Sin mensaje'}</dd>
        {data.responded_at && <><dt>Respondida</dt><dd>{dateFormat.format(new Date(data.responded_at))}</dd></>}
        {data.response_message && (
          <><dt>Mensaje de la institución</dt><dd><blockquote className="linkage-message-text">{data.response_message}</blockquote></dd></>
        )}
      </dl>
      {data.status === 'PENDIENTE_INSTITUCION' && (
        <p>
          <button type="button" className="account-action danger" disabled={mutation.pending}
            onClick={(event) => { origin.current = event.currentTarget; setConfirming(true) }}>Cancelar solicitud</button>
        </p>
      )}

      <section className="student-section" aria-labelledby="linkage-profile-title">
        <h3 id="linkage-profile-title">Perfil solicitado</h3>
        <p className="privacy-note">Conoces al alumno solo por su perfil anónimo; su identidad la resguarda su institución.</p>
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
          <dt>Correo</dt><dd><span className="cell-meta">{institution.contact_email}<span className="cell-actions"><EmailMenu email={institution.contact_email} /></span></span></dd>
          <dt>Teléfono</dt><dd>{institution.contact_phone ? <a href={`tel:${institution.contact_phone.replace(/[^\d+]/g, '')}`}>{institution.contact_phone}</a> : 'Sin teléfono'}</dd>
        </dl>
      </section>

      {/* HU-S13-03: conversación con la institución, solo en solicitudes aceptadas. */}
      {data.status === 'ACEPTADA' && <LinkageConversation linkageRequestId={data.id} role="COMPANY" />}

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
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
        <Link className="plain" to="/linkage-requests">Solicitudes de vinculación</Link>
        <Link className="plain" to="/talent">Buscar talento</Link>
      </nav>
      <h2 id="linkage-request-title">Detalle de solicitud</h2>
      {loading ? <LoadingState label="Cargando solicitud…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page notFoundTitle="No encontramos esta solicitud" />
        : data && <Detail data={data} onCancelled={setData} />}
      <p className="institution-back"><Link className="plain" to={back.to} state={back.state}><ChevronLeftIcon />{back.label}</Link></p>
    </section>
  )
}

/** Detalle de una solicitud enviada por la empresa (HU-S13-02 CA-02). */
export function LinkageRequestDetailPage() {
  const { id = '' } = useParams()
  return <LinkageRequestDetail key={id} id={id} />
}
