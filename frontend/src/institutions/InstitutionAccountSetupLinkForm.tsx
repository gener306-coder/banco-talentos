import { useState } from 'react'
import type { FormEvent } from 'react'
import { resendInstitutionAccountSetup } from './api'
import type { DeliveryMethod, SetupResult } from './api'
import { InstitutionRequestError } from './InstitutionLayout'
import { DeliveryMethodField, ManualSetupLink } from './SetupLinkDelivery'
import { useInstitutionMutation } from './useInstitutionRequest'

export function InstitutionAccountSetupLinkForm({ institutionId, disabled = false }: { institutionId: number; disabled?: boolean }) {
  const [email, setEmail] = useState('')
  const [method, setMethod] = useState<DeliveryMethod>('email')
  const [result, setResult] = useState<SetupResult | null>(null)
  const [requiredError, setRequiredError] = useState<string | null>(null)
  const mutation = useInstitutionMutation()
  const pending = mutation.pending || disabled
  const emailErrors = requiredError ? [requiredError] : mutation.failure?.errors.email

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setResult(null)
    const recipient = email.trim()
    setRequiredError(recipient ? null : 'El correo de la cuenta pendiente es obligatorio.')
    if (!recipient || !event.currentTarget.reportValidity()) return
    await mutation.submit(() => resendInstitutionAccountSetup({ email: recipient, institution_id: institutionId, delivery_method: method }), setResult)
  }

  return (
    <section className="institution-account" aria-labelledby="institution-account-setup-link-title">
      <h3 id="institution-account-setup-link-title">Reenviar enlace de configuración</h3>
      <p>Si la persona titular no recibió el correo o el enlace caducó, puedes reenviarlo mientras siga pendiente su primera contraseña. El nuevo enlace sustituye al anterior y se envía al correo registrado de la cuenta, o se genera para que lo compartas.</p>
      {result && <p className="institution-success" role="status">{result.delivery === 'pending'
        ? 'El envío del correo sigue sin confirmarse. La cuenta continúa pendiente. Espera un minuto y vuelve a intentar el reenvío.'
        : result.delivery === 'manual'
          ? 'Nuevo enlace de configuración generado; el anterior ya no es válido. Cópialo y compártelo con la persona titular.'
          : 'Enlace de configuración solicitado. La persona titular debe abrir el correo más reciente para completar su alta.'}</p>}
      {result?.setupLink && <ManualSetupLink idPrefix="pending-account" link={result.setupLink} />}
      {mutation.failure && <InstitutionRequestError failure={mutation.failure} />}
      {mutation.failure?.errors.institution_id?.length && <p className="notice" role="alert">{mutation.failure.errors.institution_id.join(' ')}</p>}
      <form onSubmit={(event) => { void submit(event) }} aria-busy={pending}>
        <label htmlFor="pending-account-email">Correo de la cuenta pendiente</label>
        <input id="pending-account-email" name="email" type="email" autoComplete="email" required maxLength={254}
          value={email} disabled={pending} aria-invalid={Boolean(emailErrors?.length)}
          aria-describedby={emailErrors?.length ? 'pending-account-email-error' : undefined}
          onChange={(event) => setEmail(event.target.value)} />
        {emailErrors?.length && <p id="pending-account-email-error" className="field-error">{emailErrors.join(' ')}</p>}
        <DeliveryMethodField idPrefix="pending-account" value={method} disabled={pending} onChange={setMethod} />
        {mutation.failure?.errors.delivery_method?.length && <p className="field-error">{mutation.failure.errors.delivery_method.join(' ')}</p>}
        <div className="actions">
          <button type="submit" disabled={pending}>{mutation.pending ? 'Reenviando enlace…' : 'Reenviar enlace de configuración'}</button>
        </div>
      </form>
    </section>
  )
}
