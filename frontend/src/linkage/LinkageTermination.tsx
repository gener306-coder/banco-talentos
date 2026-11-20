import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import type { FailureMessages } from '../lib/useApiRequest'
import { hasContactInformation } from '../students/cvCatalogs'
import { PendingLabel } from '../ui/forms'
import { Sheet } from '../ui/Sheet'
import { TERMINATION_REASON_LIMIT } from './api'
import type { LinkageStatus, LinkageTermination } from './api'

const CONTACT_MESSAGE = 'No incluyas enlaces, correos ni teléfonos: el motivo lo ve la otra organización en la plataforma.'
const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' })
const registered = {
  COMPANY: { own: 'Tu empresa', other: 'La empresa' },
  INSTITUTION: { own: 'Tu institución', other: 'La institución' },
} as const

/**
 * Baja de una vinculación aceptada (T-S14-13), para la institución y para la empresa. Con la solicitud ACEPTADA ofrece
 * «Dar de baja», que abre una hoja con el motivo obligatorio; dada de baja, muestra qué lado la registró, cuándo y por
 * qué (la cuenta solo para el lado que la registró). La baja libera el lugar y deja la conversación en solo lectura.
 */
export function LinkageTerminationSection<T>({ viewer, status, termination, messages, submit, onTerminated }: {
  viewer: 'COMPANY' | 'INSTITUTION'
  status: LinkageStatus
  termination: LinkageTermination | null
  messages: FailureMessages
  submit: (reason: string) => Promise<T>
  onTerminated: (updated: T) => void
}) {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const mutation = useApiMutation(messages)
  const reasonError = localError ?? mutation.failure?.errors.reason?.join(' ')
  const statusError = mutation.failure?.errors.status?.join(' ')
  const other = viewer === 'COMPANY' ? 'La institución' : 'La empresa'

  if (status === 'BAJA' && termination) {
    const own = termination.party === viewer
    return (
      <section className="student-section linkage-termination" aria-labelledby={titleId}>
        <h3 id={titleId}>Baja de la vinculación</h3>
        <dl className="student-identity">
          <dt>Registrada por</dt>
          <dd>{own ? registered[viewer].own : registered[termination.party].other}{own && termination.by ? ` (${termination.by.name})` : ''}</dd>
          <dt>Fecha</dt><dd>{dateFormat.format(new Date(termination.at))}</dd>
          <dt>Motivo</dt><dd className="opportunity-description">{termination.reason}</dd>
        </dl>
        <p className="notice-muted">El lugar de la oportunidad quedó libre y la conversación se conserva en solo lectura.</p>
      </section>
    )
  }
  if (status !== 'ACEPTADA') return null

  function close() {
    if (mutation.pending) return
    setOpen(false)
  }

  async function confirm(event: FormEvent) {
    event.preventDefault()
    const text = reason.trim()
    if (!text) return setLocalError('Escribe el motivo de la baja.')
    if (hasContactInformation(text)) return setLocalError(CONTACT_MESSAGE)
    await mutation.submit(() => submit(text), (updated) => {
      setOpen(false)
      setReason('')
      onTerminated(updated)
    })
  }

  return (
    <section className="student-section linkage-termination" aria-labelledby={titleId}>
      <h3 id={titleId}>Baja de la vinculación</h3>
      <p>Si el alumno abandona, no se presenta o la estancia termina antes, da de baja la vinculación. Libera el lugar de la oportunidad y {other.toLowerCase()} verá la fecha y el motivo.</p>
      <div className="actions">
        <button type="button" className="account-action danger" onClick={() => { setLocalError(null); setOpen(true) }}>Dar de baja</button>
      </div>
      <Sheet open={open} onClose={close} labelledBy={`${titleId}-sheet`}>
        <h3 id={`${titleId}-sheet`} className="linkage-inbox-sheet-title">Dar de baja la vinculación</h3>
        <p>La baja es definitiva: libera el lugar de la oportunidad y la conversación queda en solo lectura. {other} verá la fecha y el motivo.</p>
        {statusError && <p className="notice" role="alert">{statusError}</p>}
        {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
        <form className="linkage-termination-form" onSubmit={(event) => { void confirm(event) }} aria-busy={mutation.pending} noValidate>
          <fieldset disabled={mutation.pending}>
            <label htmlFor={`${titleId}-reason`}>Motivo de la baja</label>
            <textarea id={`${titleId}-reason`} name="reason" rows={4} maxLength={TERMINATION_REASON_LIMIT} required value={reason}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={[`${titleId}-count`, reasonError ? `${titleId}-error` : null].filter(Boolean).join(' ')}
              onChange={(event) => { setReason(event.target.value); setLocalError(null) }}
              onBlur={() => { if (hasContactInformation(reason)) setLocalError(CONTACT_MESSAGE) }} />
            <p className="field-hint" id={`${titleId}-count`}>{reason.length} de {TERMINATION_REASON_LIMIT} caracteres · sin enlaces, correos ni teléfonos</p>
            {reasonError && <p className="field-error" id={`${titleId}-error`}>{reasonError}</p>}
            <div className="actions">
              <button type="submit"><PendingLabel pending={mutation.pending} label="Dar de baja" pendingLabel="Dando de baja…" /></button>
              <button type="button" className="secondary" onClick={close}>Cancelar</button>
            </div>
          </fieldset>
        </form>
      </Sheet>
    </section>
  )
}
