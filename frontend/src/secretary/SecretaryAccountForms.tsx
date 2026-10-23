import { useState } from 'react'
import type { FormEvent } from 'react'
import type { DeliveryMethod, SetupDelivery, SetupResult } from '../institutions/api'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { DeliveryMethodField, ManualSetupLink } from '../institutions/SetupLinkDelivery'
import { useApiMutation } from '../lib/useApiRequest'
import { PendingLabel } from '../ui/forms'
import { emailErrorOnBlur, INVALID_EMAIL } from '../ui/validation'
import { createSecretaryAccount, resendSecretaryAccountSetup, secretaryMessages } from './api'

/** Alta de una cuenta SECRETARY (HU-S4-01 CA-01, CA-03): nombre, correo y entrega del enlace. */
export function SecretaryAccountForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [method, setMethod] = useState<DeliveryMethod>('email')
  const [created, setCreated] = useState<SetupDelivery | null>(null)
  const [setupLink, setSetupLink] = useState<string | null>(null)
  const [localErrors, setLocalErrors] = useState<Record<string, string[]>>({})
  const mutation = useApiMutation(secretaryMessages)
  const errors: Record<string, string[] | undefined> = { ...mutation.failure?.errors, ...localErrors }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    setCreated(null)
    setSetupLink(null)
    const input = { name: name.trim(), email: email.trim(), delivery_method: method }
    const required: Record<string, string[]> = {}
    if (!input.name) required.name = ['El nombre de la cuenta es obligatorio.']
    if (!input.email) required.email = ['El correo de acceso es obligatorio.']
    setLocalErrors(required)
    if (Object.keys(required).length || !event.currentTarget.reportValidity()) return
    await mutation.submit(() => createSecretaryAccount(input), (result) => {
      setCreated(result.delivery)
      setSetupLink(result.setupLink ?? null)
      setName('')
      setEmail('')
      onCreated()
    })
  }

  return (
    <section className="institution-account" aria-labelledby="secretary-account-title">
      <h3 id="secretary-account-title">Nueva cuenta de la Secretaría</h3>
      <p>La persona titular establecerá su propia contraseña mediante un enlace de configuración. Nadie más la define ni la ve.</p>
      {created && <p className="institution-success" role="status">{created === 'pending'
        ? 'Cuenta creada. No se confirmó el envío del correo. Puedes reenviar el enlace de configuración para completar el alta.'
        : created === 'manual'
          ? 'Cuenta creada. Copia el enlace de configuración y compártelo con la persona titular.'
          : 'Cuenta creada. La persona titular debe establecer su contraseña desde el enlace de configuración.'}</p>}
      {setupLink && <ManualSetupLink idPrefix="secretary-account" link={setupLink} />}
      {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
      <form onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
        <label htmlFor="secretary-account-name">Nombre de la cuenta</label>
        <input id="secretary-account-name" name="name" type="text" autoComplete="name" required maxLength={120}
          value={name} disabled={mutation.pending} aria-invalid={Boolean(errors.name?.length)}
          aria-describedby={errors.name?.length ? 'secretary-account-name-error' : undefined}
          onChange={(event) => setName(event.target.value)} />
        {errors.name?.length ? <p id="secretary-account-name-error" className="field-error">{errors.name.join(' ')}</p> : null}
        <label htmlFor="secretary-account-email">Correo de acceso</label>
        <input id="secretary-account-email" name="email" type="email" autoComplete="email" required maxLength={254}
          value={email} disabled={mutation.pending} aria-invalid={Boolean(errors.email?.length)}
          aria-describedby={errors.email?.length ? 'secretary-account-email-error' : undefined}
          onBlur={(event) => {
            const error = emailErrorOnBlur(event)
            setLocalErrors((current) => {
              const next = { ...current }
              if (error) next.email = [error]
              else if (current.email?.[0] === INVALID_EMAIL) delete next.email
              return next
            })
          }}
          onChange={(event) => setEmail(event.target.value)} />
        {errors.email?.length ? <p id="secretary-account-email-error" className="field-error">{errors.email.join(' ')}</p> : null}
        <DeliveryMethodField idPrefix="secretary-account" value={method} disabled={mutation.pending} onChange={setMethod} />
        {errors.delivery_method?.length ? <p className="field-error">{errors.delivery_method.join(' ')}</p> : null}
        <div className="actions">
          <button type="submit" disabled={mutation.pending}>
            <PendingLabel pending={mutation.pending} label="Crear cuenta de la Secretaría" pendingLabel="Creando cuenta…" />
          </button>
        </div>
      </form>
    </section>
  )
}

/** Reenvío del enlace de una cuenta SECRETARY pendiente (HU-S4-01 CA-04). */
export function SecretarySetupLinkForm({ initialEmail = '' }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [method, setMethod] = useState<DeliveryMethod>('email')
  const [result, setResult] = useState<SetupResult | null>(null)
  const [requiredError, setRequiredError] = useState<string | null>(null)
  const mutation = useApiMutation(secretaryMessages)
  const emailErrors = requiredError ? [requiredError] : mutation.failure?.errors.email

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    setResult(null)
    const recipient = email.trim()
    setRequiredError(recipient ? null : 'El correo de la cuenta pendiente es obligatorio.')
    if (!recipient || !event.currentTarget.reportValidity()) return
    await mutation.submit(() => resendSecretaryAccountSetup({ email: recipient, delivery_method: method }), setResult)
  }

  return (
    <section className="institution-account" aria-labelledby="secretary-setup-link-title">
      <h3 id="secretary-setup-link-title">Reenviar enlace de configuración</h3>
      <p>Mientras la cuenta siga pendiente de su primera contraseña puedes reenviar el enlace. El nuevo enlace sustituye al anterior.</p>
      {result && <p className="institution-success" role="status">{result.delivery === 'pending'
        ? 'El envío del correo sigue sin confirmarse. La cuenta continúa pendiente. Espera un minuto y vuelve a intentar el reenvío.'
        : result.delivery === 'manual'
          ? 'Nuevo enlace de configuración generado; el anterior ya no es válido. Cópialo y compártelo con la persona titular.'
          : 'Enlace de configuración solicitado. La persona titular debe abrir el correo más reciente para completar su alta.'}</p>}
      {result?.setupLink && <ManualSetupLink idPrefix="secretary-pending" link={result.setupLink} />}
      {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
      <form onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
        <label htmlFor="secretary-pending-email">Correo de la cuenta pendiente</label>
        <input id="secretary-pending-email" name="email" type="email" autoComplete="email" required maxLength={254}
          value={email} disabled={mutation.pending} aria-invalid={Boolean(emailErrors?.length)}
          aria-describedby={emailErrors?.length ? 'secretary-pending-email-error' : undefined}
          onBlur={(event) => {
            const error = emailErrorOnBlur(event)
            setRequiredError((current) => error ?? (current === INVALID_EMAIL ? null : current))
          }}
          onChange={(event) => setEmail(event.target.value)} />
        {emailErrors?.length ? <p id="secretary-pending-email-error" className="field-error">{emailErrors.join(' ')}</p> : null}
        <DeliveryMethodField idPrefix="secretary-pending" value={method} disabled={mutation.pending} onChange={setMethod} />
        <div className="actions">
          <button type="submit" disabled={mutation.pending}>
            <PendingLabel pending={mutation.pending} label="Reenviar enlace de configuración" pendingLabel="Reenviando enlace…" />
          </button>
        </div>
      </form>
    </section>
  )
}
