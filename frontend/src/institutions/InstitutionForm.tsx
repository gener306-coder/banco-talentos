import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import type { Institution, InstitutionInput } from './api'
import { InstitutionRequestError } from './InstitutionLayout'
import type { InstitutionFailure } from './useInstitutionRequest'
import { PendingLabel } from '../ui/forms'
import { emailErrorOnBlur, INVALID_EMAIL } from '../ui/validation'
import { normalizeCct } from './cct'

/** Edición de Administración (HU-S16-06): el alta es la invitación ligera de `InstitutionCreatePage`. */
type InstitutionFormProps = {
  submitLabel: string
  cancelTo: string
  pending: boolean
  failure: InstitutionFailure | null
  initialValue: Institution
  onSubmit: (input: InstitutionInput) => Promise<void>
}

interface FormValues {
  name: string
  cct: string
  contact_name: string
  contact_position: string
  contact_email: string
  contact_phone: string
}

export function InstitutionForm({ initialValue, submitLabel, cancelTo, pending, failure, onSubmit }: InstitutionFormProps) {
  const [values, setValues] = useState<FormValues>(() => ({
    name: initialValue.name ?? '', cct: initialValue.cct ?? '',
    contact_name: initialValue.contact_name ?? '', contact_position: initialValue.contact_position ?? '',
    contact_email: initialValue.contact_email ?? '', contact_phone: initialValue.contact_phone ?? '',
  }))
  const [localErrors, setLocalErrors] = useState<Record<string, string[]>>({})
  const errors = { ...failure?.errors, ...localErrors }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    // HU-S16-06: todo es opcional; un campo vacío se envía como dato faltante.
    const input: InstitutionInput = {
      name: values.name.trim() || null,
      // T-S14-15: mayúsculas, sin espacios ni guiones; el servidor valida el formato SEP de un CCT nuevo.
      cct: normalizeCct(values.cct) || null,
      contact_name: values.contact_name.trim() || null,
      contact_position: values.contact_position.trim() || null,
      contact_email: values.contact_email.trim() || null,
      contact_phone: values.contact_phone.trim() || null,
    }
    if (localErrors.contact_email?.[0] === INVALID_EMAIL || !event.currentTarget.reportValidity()) return
    await onSubmit(input)
  }

  return (
    <>
      <p>Todos los datos son opcionales: la institución puede completarlos desde su perfil. El nombre, el CCT, la persona responsable y su correo le permiten operar en el Banco de Talentos.</p>
      {failure && <InstitutionRequestError failure={failure} />}
      <form className="institution-form" onSubmit={(event) => { void submit(event) }} aria-busy={pending}>
        <label htmlFor="institution-name">Nombre</label>
        <input id="institution-name" name="name" type="text" autoComplete="organization"
          maxLength={255} value={values.name} disabled={pending}
          aria-invalid={Boolean(errors.name?.length)} aria-describedby={errors.name?.length ? 'institution-name-error' : undefined}
          onChange={(event) => setValues({ ...values, name: event.target.value })} />
        {errors.name?.length > 0 && <p className="field-error" id="institution-name-error">{errors.name.join(' ')}</p>}

        <label htmlFor="institution-cct">CCT</label>
        <p className="field-help" id="institution-cct-help">Clave de Centro de Trabajo.</p>
        <input id="institution-cct" name="cct" type="text" maxLength={255}
          value={values.cct} disabled={pending} aria-invalid={Boolean(errors.cct?.length)}
          aria-describedby={`institution-cct-help${errors.cct?.length ? ' institution-cct-error' : ''}`}
          onChange={(event) => setValues({ ...values, cct: event.target.value })} />
        {errors.cct?.length > 0 && <p className="field-error" id="institution-cct-error">{errors.cct.join(' ')}</p>}

        <label htmlFor="institution-contact-name">Nombre de la persona responsable</label>
        <input id="institution-contact-name" name="contact_name" type="text" autoComplete="name"
          maxLength={120} value={values.contact_name} disabled={pending}
          aria-invalid={Boolean(errors.contact_name?.length)}
          aria-describedby={errors.contact_name?.length ? 'institution-contact-name-error' : undefined}
          onChange={(event) => setValues({ ...values, contact_name: event.target.value })} />
        {errors.contact_name?.length > 0 && <p className="field-error" id="institution-contact-name-error">{errors.contact_name.join(' ')}</p>}

        <label htmlFor="institution-contact-position">Puesto o departamento (opcional)</label>
        <input id="institution-contact-position" name="contact_position" type="text" autoComplete="organization-title"
          maxLength={120} value={values.contact_position} disabled={pending} placeholder="Ej. Jefatura de Vinculación"
          aria-invalid={Boolean(errors.contact_position?.length)} aria-describedby={errors.contact_position?.length ? 'institution-contact-position-error' : undefined}
          onChange={(event) => setValues({ ...values, contact_position: event.target.value })} />
        {errors.contact_position?.length > 0 && <p className="field-error" id="institution-contact-position-error">{errors.contact_position.join(' ')}</p>}

        <label htmlFor="institution-contact-email">Correo de contacto</label>
        <p className="field-help" id="institution-email-help">Cambiarlo no modifica el correo con el que la cuenta inicia sesión.</p>
        <input id="institution-contact-email" name="contact_email" type="email" autoComplete="email"
          maxLength={254} value={values.contact_email} disabled={pending}
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

        <div className="actions">
          <button type="submit" disabled={pending}><PendingLabel pending={pending} label={submitLabel} pendingLabel="Guardando…" /></button>
          <Link className="institution-button secondary" to={cancelTo}>Cancelar</Link>
        </div>
      </form>
    </>
  )
}
