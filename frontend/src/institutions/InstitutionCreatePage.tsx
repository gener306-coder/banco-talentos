import { useState } from 'react'
import type { FocusEvent, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { createInstitution, UNNAMED_INSTITUTION } from './api'
import type { DeliveryMethod, Institution } from './api'
import { InstitutionLayout, InstitutionRequestError } from './InstitutionLayout'
import { DeliveryMethodField, ManualSetupLink } from './SetupLinkDelivery'
import { useInstitutionMutation } from './useInstitutionRequest'
import { PendingLabel } from '../ui/forms'
import { ChevronRightIcon } from '../ui/icons'
import { emailErrorOnBlur, INVALID_EMAIL } from '../ui/validation'

type Field = 'email' | 'name' | 'person_name'

/**
 * Invitación de una institución (HU-S16-06): solo el correo de la cuenta y, opcionales, un nombre de referencia y el de
 * la persona. La institución captura su perfil al entrar (HU-S16-07), como las empresas invitadas (HU-S14-02).
 */
export function InstitutionCreatePage() {
  const navigate = useNavigate()
  const { pending, failure, submit } = useInstitutionMutation()
  const [values, setValues] = useState<Record<Field, string>>({ email: '', name: '', person_name: '' })
  const [method, setMethod] = useState<DeliveryMethod>('email')
  const [emailError, setEmailError] = useState<string | null>(null)
  // Entrega manual (HU-S2-01): el enlace vive solo en el estado de esta página, nunca en el historial del navegador.
  const [shared, setShared] = useState<{ institution: Institution; email: string; link: string } | null>(null)
  const errors: Partial<Record<string, string[]>> = { ...failure?.errors, ...(emailError ? { email: [emailError] } : {}) }

  if (shared) {
    return (
      <InstitutionLayout title="Invitar institución" back={{ to: '/institutions', label: 'Volver a instituciones' }}>
        <p className="institution-success" role="status">
          Invitación lista. Copia el enlace y compártelo con {shared.email} para que cree su contraseña y complete el perfil de su institución.
        </p>
        <ManualSetupLink idPrefix="institution" link={shared.link} />
        <p className="institution-back">
          <Link className="pill-link" to={`/institutions/${shared.institution.id}`}>Ver la institución<ChevronRightIcon /></Link>
        </p>
      </InstitutionLayout>
    )
  }

  function set(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    if (field === 'email') setEmailError(null)
  }

  function checkEmail(event: FocusEvent<HTMLInputElement>) {
    setEmailError(emailErrorOnBlur(event))
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const email = values.email.trim()
    if (!email) return setEmailError('El correo de la cuenta es obligatorio.')
    if (emailError === INVALID_EMAIL) return
    const optional = (field: Field) => values[field].trim() || null
    void submit(() => createInstitution({ email, name: optional('name'), person_name: optional('person_name'), delivery_method: method }),
      ({ institution, setupDelivery, setupLink }) => {
        if (setupLink) {
          setShared({ institution, email, link: setupLink })
          return
        }
        // La cuenta ya existe; el aviso dice si su enlace salió o hay que reenviarlo.
        const notice = setupDelivery === 'sent'
          ? `Invitación enviada. ${email} recibirá el enlace para crear su contraseña y completar el perfil de ${institution.name ?? 'su institución'}.`
          : 'Institución invitada, pero no pudimos enviar el enlace. Usa “Reenviar enlace”.'
        void navigate(`/institutions/${institution.id}`, { replace: true, state: { notice } })
      })
  }

  const describedBy = (field: Field, help: boolean) =>
    [help ? `institution-${field}-help` : null, errors[field]?.length ? `institution-${field}-error` : null].filter(Boolean).join(' ') || undefined
  const fieldError = (field: Field) => errors[field]?.length
    ? <p className="field-error" id={`institution-${field}-error`}>{errors[field].join(' ')}</p> : null

  return (
    <InstitutionLayout title="Invitar institución" back={{ to: '/institutions', label: 'Volver a instituciones' }}>
      <p>Solo necesitas el correo de quien gestionará la cuenta. La institución queda ACTIVA y completa su perfil al entrar: nombre, CCT y persona de contacto.</p>
      {failure && failure.status !== 422 && <InstitutionRequestError failure={failure} />}
      <form className="institution-form" onSubmit={send} aria-busy={pending} noValidate>
        <fieldset disabled={pending}>
          <legend className="visually-hidden">Cuenta de la institución</legend>
          <label htmlFor="institution-email">Correo de la cuenta</label>
          <p className="field-help" id="institution-email-help">
            {method === 'email' ? 'Le enviaremos el enlace para crear su contraseña.' : 'Será el correo con el que inicie sesión. Recibirás un enlace para compartírselo.'}
          </p>
          <input id="institution-email" name="email" type="email" autoComplete="off" maxLength={254} required value={values.email}
            aria-invalid={Boolean(errors.email?.length)} aria-describedby={describedBy('email', true)}
            onChange={(event) => set('email', event.target.value)} onBlur={checkEmail} />
          {fieldError('email')}
          <label htmlFor="institution-name">Nombre de la institución (opcional)</label>
          <p className="field-help" id="institution-name-help">Solo como referencia; la institución podrá cambiarlo. Sin él, se mostrará como “{UNNAMED_INSTITUTION}”.</p>
          <input id="institution-name" name="name" type="text" autoComplete="off" maxLength={255} value={values.name}
            aria-invalid={Boolean(errors.name?.length)} aria-describedby={describedBy('name', true)}
            onChange={(event) => set('name', event.target.value)} />
          {fieldError('name')}
          <label htmlFor="institution-person_name">Nombre de la persona (opcional)</label>
          <input id="institution-person_name" name="person_name" type="text" autoComplete="off" maxLength={120} value={values.person_name}
            aria-invalid={Boolean(errors.person_name?.length)} aria-describedby={describedBy('person_name', false)}
            onChange={(event) => set('person_name', event.target.value)} />
          {fieldError('person_name')}
        </fieldset>
        <DeliveryMethodField idPrefix="institution" value={method} disabled={pending} onChange={setMethod} />
        {errors.delivery_method?.length ? <p className="field-error">{errors.delivery_method.join(' ')}</p> : null}
        <div className="actions">
          <button type="submit" disabled={pending}><PendingLabel pending={pending} label="Enviar invitación" pendingLabel="Enviando invitación…" /></button>
          <Link className="institution-button secondary" to="/institutions">Cancelar</Link>
        </div>
      </form>
    </InstitutionLayout>
  )
}
