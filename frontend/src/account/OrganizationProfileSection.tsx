import { useCallback, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { ECONOMIC_SECTORS, isSectorCode, NOT_CAPTURED, sectorLabel } from '../companies/catalogs'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import type { FailureMessages } from '../lib/useApiRequest'
import { MEXICAN_STATES } from '../students/catalogs'
import { MunicipalityCombobox } from '../students/MunicipalityCombobox'
import { Callout } from '../ui/Callout'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { PendingLabel } from '../ui/forms'
import { LoadingState } from '../ui/StateMessage'
import { companyGaps, getOrganizationProfile, updateOrganizationProfile } from './organizationApi'
import type { CompanyProfile, OrganizationProfile } from './organizationApi'

const profileMessages: FailureMessages = {
  429: 'Hiciste demasiados cambios seguidos. Espera un minuto antes de volver a intentarlo.',
}

type Values = Record<'trade_name' | 'state_code' | 'municipality_code' | 'sector_code' | 'contact_name' | 'contact_position' | 'contact_email' | 'contact_phone', string>

const valuesOf = (profile: OrganizationProfile): Values => ({
  trade_name: profile.type === 'company' ? profile.trade_name ?? '' : '',
  state_code: profile.type === 'company' ? profile.state_code ?? '' : '',
  municipality_code: profile.type === 'company' ? profile.municipality_code ?? '' : '',
  sector_code: '',
  contact_name: profile.contact_name ?? '',
  contact_position: profile.contact_position ?? '',
  contact_email: profile.contact_email ?? '',
  contact_phone: profile.contact_phone ?? '',
})

const optional = (value: string) => value.trim() === '' ? null : value.trim()

/** Un campo del formulario con su etiqueta, ayuda y error junto al campo. */
function Field({ id, label, error, help, children }: { id: string; label: string; error?: string; help?: string; children: ReactNode }) {
  return (
    <div className="account-field">
      <label htmlFor={id}>{label}</label>
      {help && <p className="field-help" id={`${id}-help`}>{help}</p>}
      {children}
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  )
}

function ProfileForm({ profile, onSaved }: { profile: OrganizationProfile; onSaved: (profile: OrganizationProfile) => void }) {
  const { user, updateUser } = useAuth()
  const [values, setValues] = useState<Values>(() => valuesOf(profile))
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const submitButton = useRef<HTMLButtonElement>(null)
  const mutation = useApiMutation(profileMessages)
  const errors = mutation.failure?.errors ?? {}
  const general = mutation.failure && Object.keys(mutation.failure.errors).length === 0 ? mutation.failure.message : null
  const company = profile.type === 'company' ? profile : null
  const settingSector = company !== null && company.sector_code === null && values.sector_code !== ''
  const set = (name: keyof Values) => (value: string) => { setValues((current) => ({ ...current, [name]: value })); setNotice(null) }
  const error = (name: keyof Values) => errors[name]?.join(' ')
  const describedBy = (name: keyof Values, help = false) =>
    [help ? `profile-${name}-help` : null, error(name) ? `profile-${name}-error` : null].filter(Boolean).join(' ') || undefined

  function save() {
    const contact = {
      contact_name: values.contact_name.trim(), contact_position: optional(values.contact_position),
      contact_email: values.contact_email.trim(), contact_phone: optional(values.contact_phone),
    }
    const input = company
      ? { ...contact, trade_name: optional(values.trade_name), state_code: values.state_code || null, municipality_code: values.municipality_code || null,
        ...(settingSector && isSectorCode(values.sector_code) ? { sector_code: values.sector_code } : {}) }
      : contact
    void mutation.submit(() => updateOrganizationProfile(input), (updated) => {
      setValues(valuesOf(updated))
      setNotice('Perfil actualizado correctamente.')
      onSaved(updated)
      // El nombre visible de la empresa y el aviso del sector se reflejan en la sesión sin volver a cargarla.
      if (updated.type === 'company' && user?.company) {
        updateUser({ ...user, company: { id: user.company.id, name: updated.name, missing: companyGaps(updated) } })
      }
    })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    // D2: fijar el sector es definitivo para la empresa; se confirma antes de enviarlo.
    if (settingSector) setConfirming(true)
    else save()
  }

  return (
    <>
      {general && <p className="notice" role="alert">{general}</p>}
      <form className="account-profile-form" onSubmit={submit} aria-busy={mutation.pending} noValidate>
        {company && company.sector_code === null && (
          <Field id="profile-sector_code" label="Sector económico (SCIAN)" error={error('sector_code')}
            help="Elígelo con cuidado: una vez guardado, solo la Secretaría de Economía podrá cambiarlo.">
            <select id="profile-sector_code" value={values.sector_code} disabled={mutation.pending}
              aria-invalid={Boolean(error('sector_code'))} aria-describedby={describedBy('sector_code', true)}
              onChange={(event) => set('sector_code')(event.target.value)}>
              <option value="">Sin establecer</option>
              {ECONOMIC_SECTORS.map((sector) => <option key={sector.code} value={sector.code}>{sector.code} · {sector.name}</option>)}
            </select>
          </Field>
        )}
        {company && (
          <>
            <Field id="profile-trade_name" label="Nombre comercial (opcional)" error={error('trade_name')}
              help="Es el nombre que ven las instituciones en solicitudes y conversaciones.">
              <input id="profile-trade_name" type="text" maxLength={150} autoComplete="organization" value={values.trade_name} disabled={mutation.pending}
                aria-invalid={Boolean(error('trade_name'))} aria-describedby={describedBy('trade_name', true)}
                onChange={(event) => set('trade_name')(event.target.value)} />
            </Field>
            <div className="account-fields">
              <Field id="profile-state_code" label="Estado" error={error('state_code')}>
                <select id="profile-state_code" value={values.state_code} disabled={mutation.pending}
                  aria-invalid={Boolean(error('state_code'))} aria-describedby={describedBy('state_code')}
                  onChange={(event) => setValues((current) => ({ ...current, state_code: event.target.value, municipality_code: '' }))}>
                  <option value="">Selecciona…</option>
                  {MEXICAN_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
                </select>
              </Field>
              <Field id="profile-municipality_code" label="Municipio" error={error('municipality_code')}>
                <MunicipalityCombobox key={values.state_code} id="profile-municipality_code" state={values.state_code} code={values.municipality_code}
                  initialName={values.state_code === company.state_code && values.municipality_code === company.municipality_code ? company.municipality ?? '' : ''}
                  invalid={Boolean(error('municipality_code'))} describedBy={describedBy('municipality_code')} disabled={mutation.pending}
                  onSelect={(municipality) => set('municipality_code')(municipality?.code ?? '')} />
              </Field>
            </div>
          </>
        )}
        <fieldset className="account-contact">
          <legend>{company ? 'Contacto de la empresa' : 'Responsable del programa dual'}</legend>
          <div className="account-fields">
            <Field id="profile-contact_name" label={company ? 'Nombre del contacto' : 'Nombre del responsable'} error={error('contact_name')}>
              <input id="profile-contact_name" type="text" maxLength={120} required value={values.contact_name} disabled={mutation.pending}
                aria-invalid={Boolean(error('contact_name'))} aria-describedby={describedBy('contact_name')} onChange={(event) => set('contact_name')(event.target.value)} />
            </Field>
            <Field id="profile-contact_position" label="Puesto o departamento (opcional)" error={error('contact_position')}>
              <input id="profile-contact_position" type="text" maxLength={120} value={values.contact_position} disabled={mutation.pending}
                aria-invalid={Boolean(error('contact_position'))} aria-describedby={describedBy('contact_position')} onChange={(event) => set('contact_position')(event.target.value)} />
            </Field>
            <Field id="profile-contact_email" label="Correo de contacto" error={error('contact_email')}>
              <input id="profile-contact_email" type="email" maxLength={254} required value={values.contact_email} disabled={mutation.pending}
                aria-invalid={Boolean(error('contact_email'))} aria-describedby={describedBy('contact_email')} onChange={(event) => set('contact_email')(event.target.value)} />
            </Field>
            <Field id="profile-contact_phone" label="Teléfono de contacto (opcional)" error={error('contact_phone')}>
              <input id="profile-contact_phone" type="tel" maxLength={20} value={values.contact_phone} disabled={mutation.pending}
                aria-invalid={Boolean(error('contact_phone'))} aria-describedby={describedBy('contact_phone')} onChange={(event) => set('contact_phone')(event.target.value)} />
            </Field>
          </div>
        </fieldset>
        <button ref={submitButton} type="submit" disabled={mutation.pending}>
          <PendingLabel pending={mutation.pending} label="Guardar cambios" pendingLabel="Guardando cambios…" />
        </button>
        {notice && <p className="institution-success" role="status">{notice}</p>}
      </form>
      <ConfirmDialog open={confirming} origin={submitButton} title="¿Establecer el sector económico?"
        description={<>El sector <strong>{sectorLabel(values.sector_code || null)}</strong> quedará fijo. Después, solo la Secretaría de Economía podrá cambiarlo.</>}
        confirmLabel="Establecer sector" onConfirm={() => { setConfirming(false); save() }} onCancel={() => setConfirming(false)} />
    </>
  )
}

/**
 * Perfil de la organización (HU-S14-02): datos legales u oficiales en solo lectura, con a quién pedir un cambio, y el
 * formulario de los datos operativos. Solo para empresas e instituciones.
 */
export function OrganizationProfileSection() {
  const load = useCallback((signal: AbortSignal) => getOrganizationProfile(signal), [])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, profileMessages)
  const company: CompanyProfile | null = data?.type === 'company' ? data : null
  const title = company ? 'Perfil de la empresa' : 'Perfil de la institución'

  return (
    <section className="student-section" aria-labelledby="account-organization-title">
      <h3 id="account-organization-title">{data ? title : 'Perfil de la organización'}</h3>
      {loading && !data ? <LoadingState label="Cargando el perfil…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} />
        : data && (
          <div className="content-enter">
            <dl className="student-identity">
              {company ? (
                <>
                  <dt>Razón social</dt><dd>{company.legal_name ?? NOT_CAPTURED}</dd>
                  <dt>RFC</dt><dd className="mono">{company.rfc ?? NOT_CAPTURED}</dd>
                  {company.sector_code && <><dt>Sector económico</dt><dd>{sectorLabel(company.sector_code)}</dd></>}
                </>
              ) : data.type === 'institution' && (
                <>
                  <dt>Nombre oficial</dt><dd>{data.name}</dd>
                  <dt>Clave de Centro de Trabajo</dt><dd className="mono">{data.cct}</dd>
                </>
              )}
            </dl>
            <Callout tone="info">
              {company
                ? <p>La razón social, el RFC y el sector los mantiene la <strong>Secretaría de Economía</strong>. Para corregirlos, escríbele.</p>
                : <p>El nombre oficial y la clave los mantiene la <strong>Administración del Banco de Talentos</strong>. Para corregirlos, escríbele.</p>}
            </Callout>
            <ProfileForm profile={data} onSaved={setData} />
          </div>
        )}
    </section>
  )
}
