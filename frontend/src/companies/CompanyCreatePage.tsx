import { useState } from 'react'
import type { FocusEvent, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import type { DeliveryMethod } from '../institutions/api'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { DeliveryMethodField, ManualSetupLink } from '../institutions/SetupLinkDelivery'
import { useApiMutation } from '../lib/useApiRequest'
import { PendingLabel } from '../ui/forms'
import { ChevronRightIcon } from '../ui/icons'
import { emailErrorOnBlur, INVALID_EMAIL } from '../ui/validation'
import { companyMessages, inviteCompany } from './api'
import type { Company } from './api'
import { CompanyLayout } from './CompanyLayout'

type Field = 'email' | 'trade_name' | 'person_name'

/**
 * Invitación de una empresa (HU-S14-02 CA-01): solo el correo de la cuenta y, opcionales, un nombre de referencia de la
 * empresa y el de la persona. La empresa captura su perfil completo al entrar.
 */
export function CompanyCreatePage() {
  const navigate = useNavigate()
  const { pending, failure, submit } = useApiMutation(companyMessages)
  const [values, setValues] = useState<Record<Field, string>>({ email: '', trade_name: '', person_name: '' })
  const [method, setMethod] = useState<DeliveryMethod>('email')
  const [emailError, setEmailError] = useState<string | null>(null)
  // Entrega manual (HU-S2-01): el enlace vive solo en el estado de esta página, nunca en el historial del navegador.
  const [shared, setShared] = useState<{ company: Company; link: string } | null>(null)
  const errors: Partial<Record<string, string[]>> = { ...failure?.errors, ...(emailError ? { email: [emailError] } : {}) }

  if (shared) {
    return (
      <CompanyLayout title="Invitar empresa" back={{ to: '/companies', label: 'Volver a empresas' }}>
        <p className="institution-success" role="status">
          Invitación lista. Copia el enlace y compártelo con {shared.company.account_email} para que cree su contraseña y complete el perfil de su empresa.
        </p>
        <ManualSetupLink idPrefix="company" link={shared.link} />
        <p className="institution-back">
          <Link className="pill-link" to={`/companies/${shared.company.id}`}>Ver la empresa<ChevronRightIcon /></Link>
        </p>
      </CompanyLayout>
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
    void submit(() => inviteCompany({ email, trade_name: optional('trade_name'), person_name: optional('person_name') }, method), ({ company, setupDelivery, setupLink }) => {
      if (setupLink) {
        setShared({ company, link: setupLink })
        return
      }
      // La cuenta ya existe; el aviso dice si su enlace salió o hay que reenviarlo.
      const notice = setupDelivery === 'sent'
        ? `Invitación enviada. ${company.account_email} recibirá el enlace para crear su contraseña y completar el perfil de su empresa.`
        : 'Empresa invitada, pero no pudimos enviar el enlace. Usa “Reenviar enlace”.'
      void navigate(`/companies/${company.id}`, { replace: true, state: { notice } })
    })
  }

  const describedBy = (field: Field, help: boolean) =>
    [help ? `company-${field}-help` : null, errors[field]?.length ? `company-${field}-error` : null].filter(Boolean).join(' ') || undefined
  const fieldError = (field: Field) => errors[field]?.length
    ? <p className="field-error" id={`company-${field}-error`}>{errors[field].join(' ')}</p> : null

  return (
    <CompanyLayout title="Invitar empresa" back={{ to: '/companies', label: 'Volver a empresas' }}>
      <p>Solo necesitas el correo de quien gestionará la cuenta. La empresa queda ACTIVA y completa su perfil al entrar: nombre, datos fiscales, sector, ubicación y contacto.</p>
      {failure && failure.status !== 422 && <InstitutionRequestError failure={failure} />}
      <form className="company-form company-invite" onSubmit={send} aria-busy={pending} noValidate>
        <fieldset disabled={pending}>
          <legend>Cuenta de la empresa</legend>
          <label htmlFor="company-email">Correo de la cuenta</label>
          <p className="field-help" id="company-email-help">
            {method === 'email' ? 'Le enviaremos el enlace para crear su contraseña.' : 'Será el correo con el que inicie sesión. Recibirás un enlace para compartírselo.'}
          </p>
          <input id="company-email" name="email" type="email" autoComplete="off" maxLength={254} required value={values.email}
            aria-invalid={Boolean(errors.email?.length)} aria-describedby={describedBy('email', true)}
            onChange={(event) => set('email', event.target.value)} onBlur={checkEmail} />
          {fieldError('email')}
          <label htmlFor="company-trade_name">Nombre de la empresa (opcional)</label>
          <p className="field-help" id="company-trade_name-help">Solo como referencia; la empresa podrá cambiarlo.</p>
          <input id="company-trade_name" name="trade_name" type="text" autoComplete="off" maxLength={150} value={values.trade_name}
            aria-invalid={Boolean(errors.trade_name?.length)} aria-describedby={describedBy('trade_name', true)}
            onChange={(event) => set('trade_name', event.target.value)} />
          {fieldError('trade_name')}
          <label htmlFor="company-person_name">Nombre de la persona (opcional)</label>
          <input id="company-person_name" name="person_name" type="text" autoComplete="off" maxLength={120} value={values.person_name}
            aria-invalid={Boolean(errors.person_name?.length)} aria-describedby={describedBy('person_name', false)}
            onChange={(event) => set('person_name', event.target.value)} />
          {fieldError('person_name')}
        </fieldset>
        <DeliveryMethodField idPrefix="company" value={method} disabled={pending} onChange={setMethod} />
        {errors.delivery_method?.length ? <p className="field-error">{errors.delivery_method.join(' ')}</p> : null}
        <div className="actions">
          <button type="submit" disabled={pending}><PendingLabel pending={pending} label="Enviar invitación" pendingLabel="Enviando invitación…" /></button>
          <Link className="institution-button secondary" to="/companies">Cancelar</Link>
        </div>
      </form>
    </CompanyLayout>
  )
}
