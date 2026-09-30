import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import type { InstitutionInput } from './api'
import { InstitutionRequestError } from './InstitutionLayout'
import type { InstitutionFailure } from './useInstitutionRequest'

interface InstitutionFormProps {
  initialValue?: InstitutionInput
  submitLabel: string
  cancelTo: string
  pending: boolean
  failure: InstitutionFailure | null
  onSubmit: (input: InstitutionInput) => Promise<void>
}

const emptyInstitution: InstitutionInput = { name: '', cct: '', contact_email: '' }

export function InstitutionForm({ initialValue = emptyInstitution, submitLabel, cancelTo, pending, failure, onSubmit }: InstitutionFormProps) {
  const [values, setValues] = useState<InstitutionInput>(() => ({ ...initialValue }))
  const [localErrors, setLocalErrors] = useState<Record<string, string[]>>({})
  const errors = { ...failure?.errors, ...localErrors }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const input = {
      name: values.name.trim(),
      cct: values.cct.trim(),
      contact_email: values.contact_email.trim(),
    }
    const requiredErrors: Record<string, string[]> = {}
    if (!input.name) requiredErrors.name = ['El nombre es obligatorio.']
    if (!input.cct) requiredErrors.cct = ['La Clave de Centro de Trabajo es obligatoria.']
    if (!input.contact_email) requiredErrors.contact_email = ['El correo de contacto es obligatorio.']
    setLocalErrors(requiredErrors)
    if (Object.keys(requiredErrors).length > 0 || !event.currentTarget.reportValidity()) return
    await onSubmit(input)
  }

  return (
    <>
      <p>Todos los campos son obligatorios.</p>
      {failure && <InstitutionRequestError failure={failure} />}
      {Object.keys(localErrors).length > 0 && <p className="notice" role="alert">Revisa los campos indicados.</p>}
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

        <label htmlFor="institution-contact-email">Correo de contacto</label>
        <input id="institution-contact-email" name="contact_email" type="email" autoComplete="email"
          required maxLength={254} value={values.contact_email} disabled={pending}
          aria-invalid={Boolean(errors.contact_email?.length)} aria-describedby={errors.contact_email?.length ? 'institution-email-error' : undefined}
          onChange={(event) => setValues({ ...values, contact_email: event.target.value })} />
        {errors.contact_email?.length > 0 && <p className="field-error" id="institution-email-error">{errors.contact_email.join(' ')}</p>}

        <div className="actions">
          <button type="submit" disabled={pending}>{pending ? 'Guardando…' : submitLabel}</button>
          <Link className="institution-button secondary" to={cancelTo}>Cancelar</Link>
        </div>
      </form>
    </>
  )
}
