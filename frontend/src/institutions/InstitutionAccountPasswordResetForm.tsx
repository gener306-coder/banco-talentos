import { useState } from 'react'
import type { FormEvent } from 'react'
import { startInstitutionPasswordReset } from './api'
import type { ResetDelivery } from './api'
import { InstitutionRequestError } from './InstitutionLayout'
import { useInstitutionMutation } from './useInstitutionRequest'

// El ADMIN solo identifica la cuenta: este formulario nunca incluye campos de contraseña.
export function InstitutionAccountPasswordResetForm({ institutionId, disabled = false }: { institutionId: number; disabled?: boolean }) {
  const [email, setEmail] = useState('')
  const [delivery, setDelivery] = useState<ResetDelivery | null>(null)
  const [requiredError, setRequiredError] = useState<string | null>(null)
  const mutation = useInstitutionMutation()
  const pending = mutation.pending || disabled
  const emailErrors = requiredError ? [requiredError] : mutation.failure?.errors.email

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setDelivery(null)
    const account = email.trim()
    setRequiredError(account ? null : 'El correo de la cuenta institucional es obligatorio.')
    if (!account || !event.currentTarget.reportValidity()) return
    await mutation.submit(() => startInstitutionPasswordReset({ email: account, institution_id: institutionId }), setDelivery)
  }

  return (
    <section className="institution-account" aria-labelledby="institution-account-password-reset-title">
      <h3 id="institution-account-password-reset-title">Restablecer contraseña de una cuenta</h3>
      <p>Envía al correo registrado de la cuenta un enlace temporal para que la persona titular establezca una nueva contraseña. La contraseña actual sigue vigente hasta entonces y nunca se muestra ni se establece desde aquí.</p>
      {delivery && <p className="institution-success" role="status">{delivery === 'pending'
        ? 'El envío del correo sigue sin confirmarse. Espera un minuto y vuelve a iniciar el restablecimiento.'
        : 'Se envió el enlace de restablecimiento al correo registrado de la cuenta. La contraseña actual sigue vigente hasta que la persona titular establezca una nueva.'}</p>}
      {mutation.failure && <InstitutionRequestError failure={mutation.failure} />}
      {mutation.failure?.errors.institution_id?.length && <p className="notice" role="alert">{mutation.failure.errors.institution_id.join(' ')}</p>}
      <form onSubmit={(event) => { void submit(event) }} aria-busy={pending}>
        <label htmlFor="password-reset-account-email">Correo de la cuenta institucional</label>
        <input id="password-reset-account-email" name="email" type="email" autoComplete="email" required maxLength={254}
          value={email} disabled={pending} aria-invalid={Boolean(emailErrors?.length)}
          aria-describedby={emailErrors?.length ? 'password-reset-account-email-error' : undefined}
          onChange={(event) => setEmail(event.target.value)} />
        {emailErrors?.length && <p id="password-reset-account-email-error" className="field-error">{emailErrors.join(' ')}</p>}
        <div className="actions">
          <button type="submit" disabled={pending}>{mutation.pending ? 'Iniciando restablecimiento…' : 'Iniciar restablecimiento de contraseña'}</button>
        </div>
      </form>
    </section>
  )
}
