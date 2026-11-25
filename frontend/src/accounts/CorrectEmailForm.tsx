import { useState } from 'react'
import type { FormEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import type { FailureMessages } from '../lib/useApiRequest'
import { PendingLabel } from '../ui/forms'
import { emailErrorOnBlur, INVALID_EMAIL } from '../ui/validation'
import { correctPendingEmail } from './api'
import type { SetupAccount } from './api'

interface CorrectEmailFormProps {
  idPrefix: string
  account: SetupAccount
  /** Ruta PATCH de la cuenta: /api/…/accounts/{id}/email. */
  path: string
  messages: FailureMessages
  onCorrected: (account: SetupAccount) => void
}

/**
 * T-S19-02: corrige el correo de una cuenta pendiente de activar (un error de dedo al invitarla). El enlace anterior deja
 * de servir y se envía uno nuevo, de un solo uso, a la dirección corregida.
 */
export function CorrectEmailForm({ idPrefix, account, path, messages, onCorrected }: CorrectEmailFormProps) {
  const [email, setEmail] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ email: string; delivery: 'sent' | 'pending' } | null>(null)
  const mutation = useApiMutation(messages)
  const errors = localError ? [localError] : mutation.failure?.errors.email
  const general = mutation.failure && mutation.failure.status !== 422 ? mutation.failure : null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    const value = email.trim()
    setLocalError(value ? null : 'Escribe el correo correcto.')
    if (!value || !event.currentTarget.reportValidity()) return
    await mutation.submit(() => correctPendingEmail(path, value), (result) => {
      setSent({ email: result.account.email, delivery: result.delivery })
      setEmail('')
      onCorrected(result.account)
    })
  }

  return (
    <section className="institution-account" aria-labelledby={`${idPrefix}-title`}>
      <h3 id={`${idPrefix}-title`}>Corregir correo de acceso</h3>
      <p>Al guardar, el enlace que se envió antes deja de funcionar y enviamos uno nuevo, de un solo uso, al correo corregido. Al correo anterior no le enviamos nada.</p>
      {sent && <p className="institution-success" role="status">{sent.delivery === 'sent'
        ? `Correo corregido. Enviamos un enlace nuevo a ${sent.email}.`
        : `Correo corregido, pero el envío del enlace sigue sin confirmarse. Usa “Reenviar enlace” en un minuto.`}</p>}
      {general && <InstitutionRequestError failure={general} />}
      <form onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
        <label htmlFor={`${idPrefix}-current`}>Correo actual</label>
        <input id={`${idPrefix}-current`} type="email" value={account.email} readOnly aria-readonly="true" />
        <label htmlFor={`${idPrefix}-email`}>Correo nuevo</label>
        <input id={`${idPrefix}-email`} name="email" type="email" autoComplete="off" required maxLength={254}
          value={email} disabled={mutation.pending} aria-invalid={Boolean(errors?.length)}
          aria-describedby={errors?.length ? `${idPrefix}-email-error` : undefined}
          onBlur={(event) => {
            const error = emailErrorOnBlur(event)
            setLocalError((current) => error ?? (current === INVALID_EMAIL ? null : current))
          }}
          onChange={(event) => setEmail(event.target.value)} />
        {errors?.length ? <p id={`${idPrefix}-email-error`} className="field-error">{errors.join(' ')}</p> : null}
        <div className="actions">
          <button type="submit" disabled={mutation.pending}>
            <PendingLabel pending={mutation.pending} label="Guardar y enviar enlace" pendingLabel="Guardando…" />
          </button>
        </div>
      </form>
    </section>
  )
}
