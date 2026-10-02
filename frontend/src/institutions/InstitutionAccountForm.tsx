import { useState } from 'react'
import type { FormEvent } from 'react'
import { createInstitutionAccount } from './api'
import type { SetupDelivery } from './api'
import { InstitutionRequestError } from './InstitutionLayout'
import { useInstitutionMutation } from './useInstitutionRequest'

export function InstitutionAccountForm({ institutionId, disabled = false }: { institutionId: number; disabled?: boolean }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [created, setCreated] = useState<SetupDelivery | 'unknown' | null>(null)
  const [localErrors, setLocalErrors] = useState<Record<string, string[]>>({})
  const mutation = useInstitutionMutation()
  const errors = { ...mutation.failure?.errors, ...localErrors }
  const pending = mutation.pending || disabled

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setCreated(null)
    const input = { name: name.trim(), email: email.trim(), institution_id: institutionId }
    const requiredErrors: Record<string, string[]> = {}
    if (!input.name) requiredErrors.name = ['El nombre de la cuenta es obligatorio.']
    if (!input.email) requiredErrors.email = ['El correo de acceso es obligatorio.']
    setLocalErrors(requiredErrors)
    if (Object.keys(requiredErrors).length || !event.currentTarget.reportValidity()) return
    await mutation.submit(() => createInstitutionAccount(input), (account) => {
      setCreated(account.setup_delivery ?? 'unknown')
      setName('')
      setEmail('')
    })
  }

  return (
    <section className="institution-account" aria-labelledby="institution-account-title">
      <h3 id="institution-account-title">Crear cuenta institucional</h3>
      <p>La cuenta se vinculará a esta institución. La persona titular establecerá su propia contraseña mediante un enlace de configuración.</p>
      <p>Todos los campos son obligatorios.</p>
      {created && <p className="institution-success" role="status">{created === 'pending'
        ? 'Cuenta creada. No se confirmó el envío del correo. Puedes reenviar el enlace de configuración para completar el alta.'
        : 'Cuenta creada. La persona titular debe establecer su contraseña desde el enlace de configuración.'}</p>}
      {mutation.failure && <InstitutionRequestError failure={mutation.failure} />}
      {errors.institution_id?.length > 0 && <p className="notice" role="alert">{errors.institution_id.join(' ')}</p>}
      {Object.keys(localErrors).length > 0 && <p className="notice" role="alert">Revisa los campos indicados.</p>}
      <form onSubmit={(event) => { void submit(event) }} aria-busy={pending}>
        <label htmlFor="account-name">Nombre de la cuenta</label>
        <input id="account-name" name="name" type="text" autoComplete="name" required maxLength={120}
          value={name} disabled={pending} aria-invalid={Boolean(errors.name?.length)}
          aria-describedby={errors.name?.length ? 'account-name-error' : undefined}
          onChange={(event) => setName(event.target.value)} />
        {errors.name?.length > 0 && <p id="account-name-error" className="field-error">{errors.name.join(' ')}</p>}
        <label htmlFor="account-email">Correo de acceso</label>
        <input id="account-email" name="email" type="email" autoComplete="email" required maxLength={254}
          value={email} disabled={pending} aria-invalid={Boolean(errors.email?.length)}
          aria-describedby={errors.email?.length ? 'account-email-error' : undefined}
          onChange={(event) => setEmail(event.target.value)} />
        {errors.email?.length > 0 && <p id="account-email-error" className="field-error">{errors.email.join(' ')}</p>}
        <div className="actions">
          <button type="submit" disabled={pending}>{mutation.pending ? 'Creando cuenta…' : 'Crear cuenta institucional'}</button>
        </div>
      </form>
    </section>
  )
}
