import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import type { FormEvent, ReactNode } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import type { FailureMessages } from '../lib/useApiRequest'
import { Callout } from '../ui/Callout'
import { PendingLabel } from '../ui/forms'
import { LoadingState } from '../ui/StateMessage'
import { CompanyProfileForm } from './CompanyProfileForm'
import { getOrganizationProfile, updateOrganizationProfile } from './organizationApi'
import type { InstitutionProfile } from './organizationApi'

const profileMessages: FailureMessages = {
  429: 'Hiciste demasiados cambios seguidos. Espera un minuto antes de volver a intentarlo.',
}

type ContactField = 'contact_name' | 'contact_position' | 'contact_email' | 'contact_phone'

const contactOf = (profile: InstitutionProfile): Record<ContactField, string> => ({
  contact_name: profile.contact_name ?? '', contact_position: profile.contact_position ?? '',
  contact_email: profile.contact_email ?? '', contact_phone: profile.contact_phone ?? '',
})

const optional = (value: string) => value.trim() === '' ? null : value.trim()

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="account-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  )
}

/** HU-S14-02, sin cambios de alcance: la institución mantiene solo el responsable de su programa dual. */
function InstitutionContactForm({ profile, onSaved }: { profile: InstitutionProfile; onSaved: (profile: InstitutionProfile) => void }) {
  const [values, setValues] = useState(() => contactOf(profile))
  const [notice, setNotice] = useState<string | null>(null)
  const mutation = useApiMutation(profileMessages)
  const errors = mutation.failure?.errors ?? {}
  const general = mutation.failure && Object.keys(mutation.failure.errors).length === 0 ? mutation.failure.message : null
  const error = (field: ContactField) => errors[field]?.join(' ')
  const set = (field: ContactField) => (value: string) => { setValues((current) => ({ ...current, [field]: value })); setNotice(null) }
  const input = (field: ContactField, label: string, props: { type: string; maxLength: number; autoComplete?: string }) => (
    <Field id={`profile-${field}`} label={label} error={error(field)}>
      <input id={`profile-${field}`} type={props.type} maxLength={props.maxLength} autoComplete={props.autoComplete} value={values[field]}
        disabled={mutation.pending} aria-invalid={Boolean(error(field))} aria-describedby={error(field) ? `profile-${field}-error` : undefined}
        onChange={(event) => set(field)(event.target.value)} />
    </Field>
  )

  function submit(event: FormEvent) {
    event.preventDefault()
    const input = {
      contact_name: values.contact_name.trim(), contact_position: optional(values.contact_position),
      contact_email: values.contact_email.trim(), contact_phone: optional(values.contact_phone),
    }
    void mutation.submit(() => updateOrganizationProfile(input), (updated) => {
      if (updated.type !== 'institution') return
      setValues(contactOf(updated))
      setNotice('Perfil actualizado correctamente.')
      onSaved(updated)
    })
  }

  return (
    <>
      {general && <p className="notice" role="alert">{general}</p>}
      <form className="account-profile-form" onSubmit={submit} aria-busy={mutation.pending} noValidate>
        <fieldset className="account-contact">
          <legend>Responsable del programa dual</legend>
          <div className="account-fields">
            {input('contact_name', 'Nombre del responsable', { type: 'text', maxLength: 120 })}
            {input('contact_position', 'Puesto o departamento (opcional)', { type: 'text', maxLength: 120 })}
            {input('contact_email', 'Correo de contacto', { type: 'email', maxLength: 254 })}
            {input('contact_phone', 'Teléfono de contacto (opcional)', { type: 'tel', maxLength: 20 })}
          </div>
        </fieldset>
        <div className="profile-actions">
          <button type="submit" disabled={mutation.pending}><PendingLabel pending={mutation.pending} label="Guardar cambios" pendingLabel="Guardando cambios…" /></button>
        </div>
        {notice && <p className="institution-success" role="status">{notice}</p>}
      </form>
    </>
  )
}

/**
 * Perfil de la organización en Mi cuenta (HU-S14-02, HU-S14-03). La empresa captura y mantiene todo su perfil con el
 * mismo formulario del onboarding; la institución, el contacto de su programa dual, con su nombre oficial y su CCT en
 * solo lectura. Solo para empresas e instituciones.
 */
export function OrganizationProfileSection() {
  const load = useCallback((signal: AbortSignal) => getOrganizationProfile(signal), [])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, profileMessages)
  // El recordatorio y los avisos de M1 llevan a /account#organization: con el perfil cargado, la sección se trae a la vista.
  const { hash } = useLocation()
  const ready = data !== null
  useEffect(() => {
    if (ready && hash === '#organization') document.getElementById('organization')?.scrollIntoView?.({ block: 'start' })
  }, [ready, hash])
  const title = data?.type === 'company' ? 'Perfil de la empresa' : data ? 'Perfil de la institución' : 'Perfil de la organización'

  return (
    <section className="student-section" id="organization" aria-labelledby="account-organization-title">
      <h3 id="account-organization-title">{title}</h3>
      {loading && !data ? <LoadingState label="Cargando el perfil…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} />
        : data?.type === 'company' ? (
          <div className="content-enter">
            <Callout tone="info">
              <p>Mantén tus datos al día: las instituciones ven el nombre y el contacto de tu empresa en cada solicitud.</p>
            </Callout>
            <CompanyProfileForm profile={data} submitLabel="Guardar cambios" pendingLabel="Guardando cambios…" onSaved={setData} />
          </div>
        )
        : data?.type === 'institution' && (
          <div className="content-enter">
            <dl className="student-identity">
              <dt>Nombre oficial</dt><dd>{data.name}</dd>
              <dt>Clave de Centro de Trabajo</dt><dd className="mono">{data.cct}</dd>
            </dl>
            <Callout tone="info">
              <p>El nombre oficial y la clave los mantiene la <strong>Administración del Banco de Talentos</strong>. Para corregirlos, escríbele.</p>
            </Callout>
            <InstitutionContactForm profile={data} onSaved={setData} />
          </div>
        )}
    </section>
  )
}
