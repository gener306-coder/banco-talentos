import { PendingLabel } from '../ui/forms'
import { useRef, useState } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import { hasContactInformation } from '../students/cvCatalogs'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { isFull, placesLabel } from '../opportunities/api'
import { LINKAGE_MESSAGE_LIMIT } from './api'
import { decideLinkage, institutionLinkageMessages } from './institutionApi'
import type { LinkageDecision, ReceivedLinkageDetail } from './institutionApi'
import { LinkageStatus } from './LinkageStatus'

const CONTACT_MESSAGE = 'No incluyas enlaces, correos ni teléfonos: la empresa ya tiene el contacto de tu institución.'
const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' })

const decisions: Record<LinkageDecision, { label: string; title: string; description: string; done: string }> = {
  ACEPTADA: {
    label: 'Aceptar solicitud', title: '¿Aceptar la solicitud?', done: 'Solicitud aceptada correctamente.',
    description: 'La empresa verá que aceptaste, la fecha y tu mensaje. La coordinación continúa en la conversación de esta solicitud o con su contacto del programa dual. No podrás cambiar la respuesta.',
  },
  RECHAZADA: {
    label: 'Rechazar solicitud', title: '¿Rechazar la solicitud?', done: 'Solicitud rechazada correctamente.',
    description: 'La empresa verá que rechazaste, la fecha y tu mensaje. No podrás cambiar la respuesta.',
  },
}

/**
 * Respuesta institucional (HU-S6-02 CA-05): mientras la solicitud está pendiente, aceptar o rechazar con un mensaje
 * opcional y confirmación; después, el estado final, la fecha, quién respondió (solo para la institución) y el mensaje.
 */
export function LinkageDecisionSection({ data, onDecided, refresh }: {
  data: ReceivedLinkageDetail
  onDecided: (updated: ReceivedLinkageDetail) => void
  refresh: () => Promise<void>
}) {
  const mutation = useApiMutation(institutionLinkageMessages)
  const [message, setMessage] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<LinkageDecision | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const origin = useRef<HTMLButtonElement | null>(null)

  // T-S14-11: con el cupo lleno ya no se puede aceptar; rechazar sigue disponible. El servidor decide de forma atómica.
  const full = isFull(data.opportunity)
  // Auditoría QA (#6): la empresa inactivó la oportunidad; tampoco se puede aceptar. Tiene prioridad sobre el cupo.
  const inactive = !data.opportunity.is_active
  const blockedNote = inactive ? 'linkage-inactive-note' : full ? 'linkage-full-note' : undefined
  const messageError = localError ?? mutation.failure?.errors.response_message?.join(' ')
  const statusError = mutation.failure?.errors.status?.join(' ')

  function request(decision: LinkageDecision, button: HTMLButtonElement) {
    if (mutation.pending) return
    if (hasContactInformation(message)) {
      setLocalError(CONTACT_MESSAGE)
      return
    }
    origin.current = button
    setConfirming(decision)
  }

  async function decide() {
    const decision = confirming
    setConfirming(null)
    if (!decision || mutation.pending) return
    const text = message.trim()
    await mutation.submit(() => decideLinkage(data.id, decision, text || null), (updated) => {
      setNotice(decisions[decision].done)
      onDecided(updated)
    })
  }

  return (
    <section className="student-section" aria-labelledby="linkage-decision-title">
      {data.status === 'PENDIENTE_INSTITUCION'
        ? (
          <>
            <h3 id="linkage-decision-title">Responder solicitud</h3>
            <p>Revisa el expediente y el seguro facultativo del alumno antes de responder. La empresa verá tu decisión, la fecha y tu mensaje, pero no quién respondió.</p>
            {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
            {statusError && (
              <div>
                <p className="notice" role="alert">{statusError}</p>
                <button type="button" className="secondary" onClick={() => { void refresh() }}>Actualizar solicitud</button>
              </div>
            )}
            {/* T-S14-12: el alumno ya tiene otras vinculaciones aceptadas. La institución decide; puede tener sentido. */}
            {data.student_accepted_elsewhere.length > 0 && (
              <div className="callout-lite" role="note" aria-label="Otras vinculaciones aceptadas del alumno">
                <p>{data.student_accepted_elsewhere.length === 1 ? 'Este alumno ya tiene una vinculación aceptada:' : `Este alumno ya tiene ${data.student_accepted_elsewhere.length} vinculaciones aceptadas:`}</p>
                <ul>
                  {data.student_accepted_elsewhere.map((other) => (
                    <li key={other.id}><strong className="notice-subject">{other.company}</strong> · {other.opportunity}</li>
                  ))}
                </ul>
                <p>Considera su disponibilidad antes de aceptar otra.</p>
              </div>
            )}
            {inactive && !statusError && (
              <p className="notice-muted" id="linkage-inactive-note">La empresa inactivó esta oportunidad. Ya no puedes aceptar esta solicitud; puedes rechazarla con un mensaje para la empresa.</p>
            )}
            {!inactive && full && !statusError && (
              <p className="notice-muted" id="linkage-full-note">La oportunidad ya cubrió sus lugares ({placesLabel(data.opportunity)}). Ya no puedes aceptar esta solicitud; puedes rechazarla con un mensaje para la empresa.</p>
            )}
            <form className="linkage-decision" onSubmit={(event) => event.preventDefault()} aria-busy={mutation.pending} noValidate>
              <fieldset disabled={mutation.pending}>
                <label htmlFor="linkage-response-message">Mensaje para la empresa (opcional)</label>
                <textarea id="linkage-response-message" name="response_message" rows={3} maxLength={LINKAGE_MESSAGE_LIMIT} value={message}
                  aria-invalid={Boolean(messageError)}
                  aria-describedby={['linkage-response-count', messageError ? 'linkage-response-error' : null].filter(Boolean).join(' ')}
                  onChange={(event) => { setMessage(event.target.value); setLocalError(null) }}
                  onBlur={() => { if (hasContactInformation(message)) setLocalError(CONTACT_MESSAGE) }} />
                <p className="field-hint" id="linkage-response-count">{message.length} de {LINKAGE_MESSAGE_LIMIT} caracteres · sin enlaces, correos ni teléfonos</p>
                {messageError && <p className="field-error" id="linkage-response-error">{messageError}</p>}
                <div className="actions">
                  <button type="button" disabled={blockedNote !== undefined} aria-describedby={blockedNote}
                    onClick={(event) => request('ACEPTADA', event.currentTarget)}>
                    <PendingLabel pending={mutation.pending} label={decisions.ACEPTADA.label} pendingLabel="Guardando respuesta…" />
                  </button>
                  <button type="button" className="secondary" onClick={(event) => request('RECHAZADA', event.currentTarget)}>
                    {decisions.RECHAZADA.label}
                  </button>
                </div>
              </fieldset>
            </form>
          </>
        )
        : (
          <>
            <h3 id="linkage-decision-title">Respuesta</h3>
            {notice && <p className="institution-success" role="status">{notice}</p>}
            {data.responded_at
              ? (
                <dl className="student-identity">
                  <dt>Estado final</dt><dd><LinkageStatus status={data.status} /></dd>
                  <dt>Fecha de respuesta</dt><dd>{dateFormat.format(new Date(data.responded_at))}</dd>
                  <dt>Respondió</dt><dd>{data.responded_by?.name ?? 'Sin registro'}</dd>
                </dl>
              )
              : (
                <p>{data.status === 'CANCELADA'
                  ? 'La empresa canceló la solicitud antes de que se respondiera.'
                  : 'La solicitud ya no está pendiente.'}</p>
              )}
          </>
        )}
      <ConfirmDialog open={confirming !== null} origin={origin}
        title={confirming ? decisions[confirming].title : ''}
        description={confirming ? decisions[confirming].description : ''}
        confirmLabel={confirming ? decisions[confirming].label : ''}
        onConfirm={() => { void decide() }} onCancel={() => setConfirming(null)} />
    </section>
  )
}
