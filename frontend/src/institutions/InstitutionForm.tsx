import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import type { DeliveryMethod, Institution, InstitutionInput, NewInstitutionInput } from './api'
import { InstitutionRequestError } from './InstitutionLayout'
import { DeliveryMethodField } from './SetupLinkDelivery'
import type { InstitutionFailure } from './useInstitutionRequest'
import { PendingLabel } from '../ui/forms'
import { emailErrorOnBlur, INVALID_EMAIL } from '../ui/validation'

type InstitutionFormProps = {
  submitLabel: string
  cancelTo: string
  pending: boolean
  failure: InstitutionFailure | null
} & (
  /** Alta (T-S8-11): crea la cuenta del responsable con el correo de contacto y elige cómo entregarle su enlace. */
  | { initialValue?: undefined; onSubmit: (input: NewInstitutionInput) => Promise<void> }
  | { initialValue: Institution; onSubmit: (input: InstitutionInput) => Promise<void> }
)

interface FormValues {
  name: string
  cct: string
  contact_name: string
  contact_position: string
  contact_email: string
  contact_phone: string
}

export function InstitutionForm({ initialValue, submitLabel, cancelTo, pending, failure, onSubmit }: InstitutionFormProps) {
  const creating = initialValue === undefined
  const [values, setValues] = useState<FormValues>(() => ({
    name: initialValue?.name ?? '', cct: initialValue?.cct ?? '',
    contact_name: initialValue?.contact_name ?? '', contact_position: initialValue?.contact_position ?? '',
    contact_email: initialValue?.contact_email ?? '', contact_phone: initialValue?.contact_phone ?? '',
  }))
  const [method, setMethod] = useState<DeliveryMethod>('email')
  const [localErrors, setLocalErrors] = useState<Record<string, string[]>>({})
  const errors = { ...failure?.errors, ...localErrors }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const input: InstitutionInput = {
      name: values.name.trim(),
      cct: values.cct.trim(),
      contact_name: values.contact_name.trim(),
      contact_position: values.contact_position.trim() || null,
      contact_email: values.contact_email.trim(),
      contact_phone: values.contact_phone.trim() || null,
    }
    const requiredErrors: Record<string, string[]> = {}
    if (!input.name) requiredErrors.name = ['El nombre es obligatorio.']
    if (!input.cct) requiredErrors.cct = ['La Clave de Centro de Trabajo es obligatoria.']
    if (!input.contact_name) requiredErrors.contact_name = ['El nombre de la persona responsable es obligatorio.']
    if (!input.contact_email) requiredErrors.contact_email = ['El correo de contacto es obligatorio.']
    setLocalErrors(requiredErrors)
    if (Object.keys(requiredErrors).length > 0 || !event.currentTarget.reportValidity()) return
    if (initialValue === undefined) await onSubmit({ ...input, delivery_method: method })
    else await onSubmit(input)
  }

  return (
    <>
      <p>Todos los campos son obligatorios, salvo el puesto y el teléfono.</p>
      {failure && <InstitutionRequestError failure={failure} />}
      {Object.values(localErrors).some((messages) => messages[0] !== INVALID_EMAIL) && <p className="notice" role="alert">Revisa los campos indicados.</p>}
      <form onSubmit={(event) => { void submit(event) }} aria-busy={pending}>
        <label htmlFor="institution-name">Nombre</label>
        <input id="institution-name" name="name" type="text" autoComplete="organization"
          required maxLength={255} value={values.name} disabled={pending}
          aria-invalid={Boolean(errors.name?.length)} aria-describedby={errors.name?.length ? 'institution-name-error' : undefined}
          onChange={(event) => setValues({ ...values, name: event.target.value })} />
        {errors.name?.length > 0 && <p className="field-error" id="institution-name-error">{errors.name.join(' ')}</p>}

        <label htmlFor="institution-cct">CCT</label>
        <p className="field-help" id="institution-cct-help">Clave de Centro de Trabajo.</p>
        <input id="institution-cct" name="cct" type="text" required maxLength={255}
          value={values.cct} disabled={pending} aria-invalid={Boolean(errors.cct?.length)}
          aria-describedby={`institution-cct-help${errors.cct?.length ? ' institution-cct-error' : ''}`}
          onChange={(event) => setValues({ ...values, cct: event.target.value })} />
        {errors.cct?.length > 0 && <p className="field-error" id="institution-cct-error">{errors.cct.join(' ')}</p>}

        <label htmlFor="institution-contact-name">Nombre de la persona responsable</label>
        {creating && <p className="field-help" id="institution-contact-name-help">También será el nombre de su cuenta en el Banco de Talentos.</p>}
        <input id="institution-contact-name" name="contact_name" type="text" autoComplete="name"
          required maxLength={120} value={values.contact_name} disabled={pending}
          aria-invalid={Boolean(errors.contact_name?.length)}
          aria-describedby={[creating && 'institution-contact-name-help', errors.contact_name?.length && 'institution-contact-name-error'].filter(Boolean).join(' ') || undefined}
          onChange={(event) => setValues({ ...values, contact_name: event.target.value })} />
        {errors.contact_name?.length > 0 && <p className="field-error" id="institution-contact-name-error">{errors.contact_name.join(' ')}</p>}

        <label htmlFor="institution-contact-position">Puesto o departamento (opcional)</label>
        <input id="institution-contact-position" name="contact_position" type="text" autoComplete="organization-title"
          maxLength={120} value={values.contact_position} disabled={pending} placeholder="Ej. Jefatura de Vinculación"
          aria-invalid={Boolean(errors.contact_position?.length)} aria-describedby={errors.contact_position?.length ? 'institution-contact-position-error' : undefined}
          onChange={(event) => setValues({ ...values, contact_position: event.target.value })} />
        {errors.contact_position?.length > 0 && <p className="field-error" id="institution-contact-position-error">{errors.contact_position.join(' ')}</p>}

        <label htmlFor="institution-contact-email">{creating ? 'Correo de la persona responsable' : 'Correo de contacto'}</label>
        <p className="field-help" id="institution-email-help">
          {!creating ? 'Cambiarlo no modifica el correo con el que la cuenta inicia sesión.'
            : method === 'email' ? 'Le enviaremos un enlace para establecer su contraseña y entrar al Banco de Talentos.'
            : 'Será el correo con el que inicie sesión. Recibirás un enlace para compartírselo.'}
        </p>
        <input id="institution-contact-email" name="contact_email" type="email" autoComplete="email"
          required maxLength={254} value={values.contact_email} disabled={pending}
          aria-invalid={Boolean(errors.contact_email?.length)}
          aria-describedby={`institution-email-help${errors.contact_email?.length ? ' institution-email-error' : ''}`}
          onBlur={(event) => {
            const error = emailErrorOnBlur(event)
            setLocalErrors((current) => {
              const next = { ...current }
              if (error) next.contact_email = [error]
              else if (current.contact_email?.[0] === INVALID_EMAIL) delete next.contact_email
              return next
            })
          }}
          onChange={(event) => setValues({ ...values, contact_email: event.target.value })} />
        {errors.contact_email?.length > 0 && <p className="field-error" id="institution-email-error">{errors.contact_email.join(' ')}</p>}

        <label htmlFor="institution-contact-phone">Teléfono (opcional)</label>
        <input id="institution-contact-phone" name="contact_phone" type="tel" autoComplete="tel" inputMode="tel"
          maxLength={20} value={values.contact_phone} disabled={pending} placeholder="Ej. 834 123 4567"
          aria-invalid={Boolean(errors.contact_phone?.length)} aria-describedby={errors.contact_phone?.length ? 'institution-phone-error' : undefined}
          onChange={(event) => setValues({ ...values, contact_phone: event.target.value })} />
        {errors.contact_phone?.length > 0 && <p className="field-error" id="institution-phone-error">{errors.contact_phone.join(' ')}</p>}

        {creating && (
          <>
            <DeliveryMethodField idPrefix="institution" value={method} disabled={pending} onChange={setMethod} />
            {errors.delivery_method?.length > 0 && <p className="field-error">{errors.delivery_method.join(' ')}</p>}
          </>
        )}

        <div className="actions">
          <button type="submit" disabled={pending}><PendingLabel pending={pending} label={submitLabel} pendingLabel="Guardando…" /></button>
          <Link className="institution-button secondary" to={cancelTo}>Cancelar</Link>
        </div>
      </form>
    </>
  )
}
