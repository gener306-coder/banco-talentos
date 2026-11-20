import { useState } from 'react'
import type { FocusEvent, FormEvent, ReactNode } from 'react'
import { sessionCompany } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { ECONOMIC_SECTORS, INVALID_PHONE, INVALID_RFC, isSectorCode, isValidPhone, isValidRfc, normalizeRfc } from '../companies/catalogs'
import { useApiMutation } from '../lib/useApiRequest'
import type { FailureMessages } from '../lib/useApiRequest'
import { MEXICAN_STATES } from '../students/catalogs'
import { MunicipalityCombobox } from '../students/MunicipalityCombobox'
import { PendingLabel } from '../ui/forms'
import { emailErrorOnBlur, INVALID_EMAIL } from '../ui/validation'
import { updateOrganizationProfile } from './organizationApi'
import { useSelfContact } from './useSelfContact'
import type { CompanyProfile } from './organizationApi'

const profileMessages: FailureMessages = {
  429: 'Hiciste demasiados cambios seguidos. Espera un minuto antes de volver a intentarlo.',
}

type Field = 'trade_name' | 'legal_name' | 'rfc' | 'sector_code' | 'state_code' | 'municipality_code' | 'contact_name' | 'contact_position' | 'contact_email' | 'contact_phone'
type Values = Record<Field, string>

const valuesOf = (profile: CompanyProfile): Values => ({
  trade_name: profile.trade_name ?? '', legal_name: profile.legal_name ?? '', rfc: profile.rfc ?? '', sector_code: profile.sector_code ?? '',
  state_code: profile.state_code ?? '', municipality_code: profile.municipality_code ?? '', contact_name: profile.contact_name ?? '',
  contact_position: profile.contact_position ?? '', contact_email: profile.contact_email ?? '', contact_phone: profile.contact_phone ?? '',
})

const optional = (value: string) => value.trim() === '' ? null : value.trim()

/** Marca de guía (no un bloqueo): sin estos datos la empresa no puede publicar ni solicitar (M1). */
function Needed() {
  return <span className="profile-needed">Necesario para operar</span>
}

/**
 * Perfil de la empresa (HU-S14-03), el mismo en el onboarding (`/welcome`) y en Mi cuenta. Todo es opcional: guarda en
 * parcial y solo valida el formato de lo capturado. Con «Soy yo», el contacto para vinculación es la persona de la
 * sesión: se precarga con su nombre y correo (sin el nombre provisional) y el nombre corrige también el de la cuenta.
 */
export function CompanyProfileForm({ profile, submitLabel, pendingLabel, secondary, suggestSelf = false, onSaved }: {
  profile: CompanyProfile
  submitLabel: string
  pendingLabel: string
  /**
   * Solo en el onboarding: con el contacto vacío, propone a la persona de la sesión («Soy yo» marcado y sus datos
   * precargados). En Mi cuenta, un contacto vacío es una decisión de la empresa y se respeta tal cual.
   */
  suggestSelf?: boolean
  /** Acción secundaria junto al botón principal (por ejemplo, «Completar más tarde»). */
  secondary?: ReactNode
  onSaved: (profile: CompanyProfile) => void
}) {
  const { user, updateUser } = useAuth()
  const accountEmail = user?.email ?? ''
  // M3: el nombre provisional de una invitada es su correo; no se propone como nombre de nadie.
  const accountName = user && user.name !== user.email ? user.name : ''
  const emptyContact = profile.contact_name === null && profile.contact_email === null
  const [values, setValues] = useState<Values>(() => {
    const initial = valuesOf(profile)
    if (suggestSelf && emptyContact) return { ...initial, contact_name: accountName, contact_email: accountEmail }
    return initial
  })
  // «Soy yo» y la sincronización con el nombre de la cuenta (T-S14-09), compartidos con la institución (T-S14-15).
  const contact = useSelfContact({
    savedEmail: profile.contact_email, initialName: values.contact_name, currentName: values.contact_name, suggest: suggestSelf && emptyContact,
    fill: ({ name, email }) => setValues((current) => ({ ...current, ...(name !== undefined ? { contact_name: name } : {}), ...(email !== undefined ? { contact_email: email } : {}) })),
  })
  const self = contact.self
  const [localErrors, setLocalErrors] = useState<Partial<Record<Field, string>>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const mutation = useApiMutation(profileMessages)
  const serverErrors = mutation.failure?.errors ?? {}
  const general = mutation.failure && Object.keys(mutation.failure.errors).length === 0 ? mutation.failure.message : null
  const error = (field: Field) => localErrors[field] ?? serverErrors[field]?.join(' ')

  function set(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setLocalErrors((current) => ({ ...current, [field]: undefined }))
    setNotice(null)
  }

  function toggleSelf(checked: boolean) {
    // Soy yo: los datos de la cuenta; otra persona: se capturan desde cero.
    contact.toggle(checked)
    setLocalErrors((current) => ({ ...current, contact_name: undefined, contact_email: undefined }))
  }

  function check(field: Field, message: string | null) {
    setLocalErrors((current) => ({ ...current, [field]: message ?? undefined }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    const found: Partial<Record<Field, string>> = {}
    const rfc = normalizeRfc(values.rfc)
    if (rfc && !isValidRfc(rfc)) found.rfc = INVALID_RFC
    if (values.contact_email.trim() && localErrors.contact_email === INVALID_EMAIL) found.contact_email = INVALID_EMAIL
    if (values.contact_phone.trim() && !isValidPhone(values.contact_phone.trim())) found.contact_phone = INVALID_PHONE
    if (values.state_code && !values.municipality_code) found.municipality_code = 'Elige el municipio del estado o deja la ubicación vacía.'
    setLocalErrors(found)
    if (Object.keys(found).length) return

    const contactName = optional(values.contact_name)
    const accountRename = contact.accountNameFor(contactName)
    const input = {
      trade_name: optional(values.trade_name), legal_name: optional(values.legal_name), rfc: rfc || null,
      sector_code: isSectorCode(values.sector_code) ? values.sector_code : null,
      state_code: values.state_code || null, municipality_code: values.municipality_code || null,
      contact_name: contactName, contact_position: optional(values.contact_position),
      contact_email: optional(values.contact_email)?.toLowerCase() ?? null, contact_phone: optional(values.contact_phone),
      // Con «Soy yo», corregir aquí el nombre del contacto corrige el de la cuenta; vacío no lo borra.
      ...(accountRename ? { account_name: accountRename } : {}),
    }
    void mutation.submit(() => updateOrganizationProfile(input), (updated) => {
      if (updated.type !== 'company') return
      setValues(valuesOf(updated))
      // Tras guardar, la casilla sigue al contacto guardado (p. ej. vaciarlo la desmarca).
      contact.saved({ name: updated.contact_name, email: updated.contact_email })
      setNotice('Perfil actualizado correctamente.')
      // La sesión refleja el nombre de la empresa, lo que falta y el nombre de la cuenta sin volver a cargarse.
      if (user?.company) {
        updateUser({
          ...user, name: accountRename ?? user.name,
          company: sessionCompany(user.company.id, updated.name, updated.missing, 'done'),
        })
      }
      onSaved(updated)
    })
  }

  const describedBy = (field: Field, help = false) =>
    [help ? `profile-${field}-help` : null, error(field) ? `profile-${field}-error` : null].filter(Boolean).join(' ') || undefined
  const fieldError = (field: Field) => error(field) ? <p className="field-error" id={`profile-${field}-error`}>{error(field)}</p> : null
  const text = (field: Field, label: ReactNode, props: { maxLength: number; type?: string; autoComplete?: string; help?: string; onBlur?: (event: FocusEvent<HTMLInputElement>) => void }) => (
    <div className="account-field">
      <label htmlFor={`profile-${field}`}>{label}</label>
      {props.help && <p className="field-help" id={`profile-${field}-help`}>{props.help}</p>}
      <input id={`profile-${field}`} type={props.type ?? 'text'} autoComplete={props.autoComplete ?? 'off'} maxLength={props.maxLength}
        value={values[field]} aria-invalid={Boolean(error(field))} aria-describedby={describedBy(field, Boolean(props.help))}
        onChange={(event) => set(field, event.target.value)} onBlur={props.onBlur} />
      {fieldError(field)}
    </div>
  )

  return (
    <>
      {general && <p className="notice" role="alert">{general}</p>}
      <form className="account-profile-form" onSubmit={submit} aria-busy={mutation.pending} noValidate>
        <fieldset className="account-contact" disabled={mutation.pending}>
          <legend>Tu empresa</legend>
          <div className="account-fields">
            {text('trade_name', <>Nombre comercial <Needed /></>, {
              maxLength: 150, autoComplete: 'organization', help: 'Es el nombre que ven las instituciones. Basta este o la razón social.',
            })}
            {text('legal_name', 'Razón social', { maxLength: 200 })}
            {text('rfc', 'RFC', {
              maxLength: 13, help: '12 caracteres para persona moral o 13 para persona física.',
              onBlur: (event) => { const rfc = normalizeRfc(event.target.value); check('rfc', rfc && !isValidRfc(rfc) ? INVALID_RFC : null) },
            })}
            <div className="account-field">
              <label htmlFor="profile-sector_code">Sector económico (SCIAN)</label>
              <select id="profile-sector_code" value={values.sector_code} aria-invalid={Boolean(error('sector_code'))}
                aria-describedby={describedBy('sector_code')} onChange={(event) => set('sector_code', event.target.value)}>
                <option value="">Sin sector por ahora</option>
                {ECONOMIC_SECTORS.map((sector) => <option key={sector.code} value={sector.code}>{sector.code} · {sector.name}</option>)}
              </select>
              {fieldError('sector_code')}
            </div>
          </div>
        </fieldset>

        <fieldset className="account-contact" disabled={mutation.pending}>
          <legend>Ubicación</legend>
          <p className="field-help">El municipio es el punto de partida para medir la distancia en la búsqueda de talento.</p>
          <div className="account-fields">
            <div className="account-field">
              <label htmlFor="profile-state_code">Estado</label>
              <select id="profile-state_code" value={values.state_code} aria-invalid={Boolean(error('state_code'))} aria-describedby={describedBy('state_code')}
                onChange={(event) => { setValues((current) => ({ ...current, state_code: event.target.value, municipality_code: '' })); setLocalErrors({}) }}>
                <option value="">Sin ubicación</option>
                {MEXICAN_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
              </select>
              {fieldError('state_code')}
            </div>
            <div className="account-field">
              <label htmlFor="profile-municipality_code">Municipio</label>
              <MunicipalityCombobox key={values.state_code} id="profile-municipality_code" state={values.state_code} code={values.municipality_code}
                initialName={values.state_code === profile.state_code && values.municipality_code === profile.municipality_code ? profile.municipality ?? '' : ''}
                invalid={Boolean(error('municipality_code'))} describedBy={describedBy('municipality_code')} disabled={mutation.pending}
                onSelect={(municipality) => set('municipality_code', municipality?.code ?? '')} />
              {fieldError('municipality_code')}
            </div>
          </div>
        </fieldset>

        <fieldset className="account-contact" disabled={mutation.pending}>
          <legend>Contacto para vinculación</legend>
          <p className="field-help">Las instituciones lo ven en cada solicitud para acercarse a tu empresa.</p>
          <div className="profile-self">
            <input id="profile-self" type="checkbox" checked={self} onChange={(event) => toggleSelf(event.target.checked)} />
            <label htmlFor="profile-self">Soy yo</label>
            <p className="field-help" id="profile-self-help">Usa tu nombre y el correo de tu cuenta. Desmárcalo para asignar a otra persona.</p>
          </div>
          <div className="account-fields">
            {text('contact_name', <>{self ? 'Tu nombre' : 'Nombre del contacto'} <Needed /></>, {
              maxLength: 120, autoComplete: self ? 'name' : 'off', help: self ? 'También corrige el nombre de tu cuenta.' : undefined,
            })}
            {text('contact_position', 'Puesto en la empresa (opcional)', { maxLength: 120, autoComplete: 'organization-title' })}
            {text('contact_email', <>Correo de contacto <Needed /></>, {
              maxLength: 254, type: 'email', autoComplete: self ? 'email' : 'off', onBlur: (event) => check('contact_email', emailErrorOnBlur(event)),
            })}
            {text('contact_phone', 'Teléfono de contacto (opcional)', {
              maxLength: 20, type: 'tel', autoComplete: 'tel',
              onBlur: (event) => { const phone = event.target.value.trim(); check('contact_phone', phone && !isValidPhone(phone) ? INVALID_PHONE : null) },
            })}
          </div>
        </fieldset>

        <div className="profile-actions">
          <button type="submit" disabled={mutation.pending}><PendingLabel pending={mutation.pending} label={submitLabel} pendingLabel={pendingLabel} /></button>
          {secondary}
        </div>
        {notice && <p className="institution-success" role="status">{notice}</p>}
      </form>
    </>
  )
}
