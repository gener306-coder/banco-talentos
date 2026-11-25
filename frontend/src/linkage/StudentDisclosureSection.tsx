import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import type { FailureMessages } from '../lib/useApiRequest'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { PendingLabel } from '../ui/forms'
import { Sheet } from '../ui/Sheet'
import type { LinkageStatus } from './api'
import { DISCLOSURE_FIELDS, disclosureFieldLabels, shareStudentProfile, stopSharingStudentProfile } from './disclosureApi'
import type { DisclosureField, DisclosureView } from './disclosureApi'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

/**
 * T-S19-06: ficha que la institución comparte con la empresa (D1 a D4), en el detalle de la vinculación.
 *
 * - Pendiente: sin botón, con una nota de que podrá compartirse tras aceptar.
 * - Aceptada sin compartir: «Ficha privada» y «Compartir ficha con la empresa» (grupos y consentimiento en una hoja).
 * - Aceptada y compartida: «Ficha compartida» con la fecha y «Dejar de compartir», que se confirma.
 * - Rechazada, cancelada o dada de baja: nada (la baja deja de compartirla sola).
 */
export function StudentDisclosureSection({ linkageId, status, disclosure, messages, onChanged }: {
  linkageId: number
  status: LinkageStatus
  disclosure: DisclosureView | null
  messages: FailureMessages
  onChanged: (disclosure: DisclosureView | null, notice: string) => void
}) {
  const titleId = useId()
  const sheetTitleId = useId()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [fields, setFields] = useState<DisclosureField[]>([])
  const [consent, setConsent] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const stopButton = useRef<HTMLButtonElement>(null)
  const share = useApiMutation(messages)
  const stop = useApiMutation(messages)
  const errors = share.failure?.errors
  const fieldsError = localError ?? errors?.fields?.join(' ') ?? errors?.status?.join(' ')
  const consentError = errors?.consent?.join(' ')

  if (status === 'PENDIENTE_INSTITUCION') {
    return (
      <section className="student-section" aria-labelledby={titleId}>
        <h3 id={titleId}>Ficha compartida con la empresa</h3>
        <p className="notice-muted">Cuando aceptes la solicitud podrás compartir con la empresa una ficha ampliada del alumno, si cuentas con su consentimiento.</p>
      </section>
    )
  }
  if (status !== 'ACEPTADA') return null

  function toggle(field: DisclosureField, checked: boolean) {
    setFields((current) => DISCLOSURE_FIELDS.filter((candidate) => candidate === field ? checked : current.includes(candidate)))
  }

  function close() {
    if (share.pending) return
    setOpen(false)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (share.pending) return
    if (fields.length === 0) {
      setLocalError('Elige al menos un grupo de datos para compartir.')
      return
    }
    setLocalError(null)
    if (!consent) return
    void share.submit(() => shareStudentProfile(linkageId, fields), (view) => {
      setOpen(false)
      setFields([])
      setConsent(false)
      onChanged(view, 'Compartiste la ficha con la empresa. Le avisamos por correo.')
    })
  }

  function stopSharing() {
    setConfirming(false)
    void stop.submit(() => stopSharingStudentProfile(linkageId), () => onChanged(null, 'Dejaste de compartir la ficha. La empresa ya no tiene acceso.'))
  }

  return (
    <section className="student-section" aria-labelledby={titleId}>
      <h3 id={titleId}>Ficha compartida con la empresa</h3>
      {disclosure ? <>
        <p><span className="disclosure-badge shared">Ficha compartida</span> desde el {dateFormat.format(new Date(disclosure.disclosed_at))}{disclosure.disclosed_by ? ` por ${disclosure.disclosed_by.name}` : ''}.</p>
        <dl className="student-identity">
          <dt>Datos compartidos</dt><dd>{disclosure.fields.map((field) => disclosureFieldLabels[field]).join(', ')}</dd>
        </dl>
        {stop.failure && <InstitutionRequestError failure={stop.failure} />}
        <p>
          <button ref={stopButton} type="button" className="secondary" disabled={stop.pending} onClick={() => setConfirming(true)}>
            <PendingLabel pending={stop.pending} label="Dejar de compartir" pendingLabel="Dejando de compartir…" />
          </button>
        </p>
      </> : <>
        <p><span className="disclosure-badge private">Ficha privada</span> La empresa solo ve el perfil anónimo del alumno.</p>
        <p><button type="button" onClick={() => setOpen(true)}>Compartir ficha con la empresa</button></p>
      </>}

      <ConfirmDialog open={confirming} origin={stopButton} title="¿Dejar de compartir la ficha?"
        description="La empresa pierde el acceso a la ficha de inmediato. La vinculación aceptada y los mensajes siguen activos."
        confirmLabel="Dejar de compartir" onConfirm={stopSharing} onCancel={() => setConfirming(false)} />

      <Sheet open={open} onClose={close} labelledBy={sheetTitleId}>
        <h3 id={sheetTitleId}>Compartir ficha con la empresa</h3>
        <p>Elige qué datos verá la empresa de esta vinculación. La matrícula, los datos y el comprobante del seguro (IMSS u otro) y los campos internos del expediente siguen siendo privados. Puedes dejar de compartir la ficha en cualquier momento.</p>
        {share.failure && Object.keys(share.failure.errors).length === 0 && <InstitutionRequestError failure={share.failure} />}
        <form onSubmit={submit} aria-busy={share.pending} noValidate>
          <fieldset className="choice-group" aria-describedby={fieldsError ? `${sheetTitleId}-fields-error` : undefined}>
            <legend>Datos que se compartirán</legend>
            {DISCLOSURE_FIELDS.map((field) => (
              <div key={field}>
                <input id={`${sheetTitleId}-${field}`} type="checkbox" checked={fields.includes(field)} disabled={share.pending}
                  onChange={(event) => toggle(field, event.target.checked)} />
                <label htmlFor={`${sheetTitleId}-${field}`}>{disclosureFieldLabels[field]}</label>
              </div>
            ))}
            {fieldsError && <p className="field-error" id={`${sheetTitleId}-fields-error`}>{fieldsError}</p>}
          </fieldset>
          <div className="disclosure-consent">
            <input id={`${sheetTitleId}-consent`} type="checkbox" checked={consent} disabled={share.pending} required aria-invalid={Boolean(consentError)}
              aria-describedby={consentError ? `${sheetTitleId}-consent-error` : undefined} onChange={(event) => setConsent(event.target.checked)} />
            <label htmlFor={`${sheetTitleId}-consent`}>Cuento con el consentimiento del alumno o de su tutor para compartir estos datos con la empresa.</label>
          </div>
          {consentError && <p className="field-error" id={`${sheetTitleId}-consent-error`}>{consentError}</p>}
          <div className="actions">
            <button type="submit" disabled={share.pending || !consent || fields.length === 0}>
              <PendingLabel pending={share.pending} label="Compartir ficha" pendingLabel="Compartiendo…" />
            </button>
            <button type="button" className="secondary" disabled={share.pending} onClick={close}>Cancelar</button>
          </div>
        </form>
      </Sheet>
    </section>
  )
}
