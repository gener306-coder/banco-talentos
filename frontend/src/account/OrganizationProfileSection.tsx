import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import type { FormEvent, ReactNode } from 'react'
import { sectorLabel } from '../companies/catalogs'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import type { FailureMessages } from '../lib/useApiRequest'
import { stateName } from '../students/catalogs'
import { PendingLabel } from '../ui/forms'
import { BuildingIcon, PencilIcon } from '../ui/icons'
import { prefersReducedMotion } from '../ui/modal'
import { LoadingState } from '../ui/StateMessage'
import { CompanyProfileForm } from './CompanyProfileForm'
import { ProfileProgress, ProfileScore } from './ProfileProgress'
import { PROFILE_FIELDS } from './profileGaps'
import { useSelfContact } from './useSelfContact'
import { cctError, normalizeCct } from '../institutions/cct'
import { getOrganizationProfile, updateOrganizationProfile } from './organizationApi'
import type { CompanyProfile, InstitutionProfile } from './organizationApi'

const profileMessages: FailureMessages = {
  429: 'Hiciste demasiados cambios seguidos. Espera un minuto antes de volver a intentarlo.',
}

type InstitutionField = 'name' | 'cct' | 'contact_name' | 'contact_position' | 'contact_email' | 'contact_phone'

const valuesOf = (profile: InstitutionProfile): Record<InstitutionField, string> => ({
  name: profile.name ?? '', cct: profile.cct ?? '',
  contact_name: profile.contact_name ?? '', contact_position: profile.contact_position ?? '',
  contact_email: profile.contact_email ?? '', contact_phone: profile.contact_phone ?? '',
})

const optional = (value: string) => value.trim() === '' ? null : value.trim()

/** Un dato de la ficha: vacío se lee como «Sin capturar», en tono secundario. */
function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="profile-fact">
      <dt>{label}</dt>
      <dd>{value || <span className="profile-fact-empty">Sin capturar</span>}</dd>
    </div>
  )
}

/**
 * Grupo de datos con su subtítulo discreto. Si ningún dato del grupo está capturado, una sola línea lo dice en lugar
 * de repetir «Sin capturar» en cada campo.
 */
function FactGroup({ title, empty, emptyText, children }: { title: string; empty?: boolean; emptyText?: string; children: ReactNode }) {
  return (
    <div className="profile-group">
      <h4>{title}</h4>
      {empty ? <p className="profile-group-empty">{emptyText}</p> : <dl className="profile-facts">{children}</dl>}
    </div>
  )
}

/** Perfil de empresa sin ningún dato: un estado vacío con la siguiente acción, no una ficha llena de huecos. */
function ProfileEmpty({ onStart }: { onStart: () => void }) {
  return (
    <div className="profile-empty">
      <span className="profile-empty-icon" aria-hidden="true"><BuildingIcon /></span>
      <div>
        <p className="profile-empty-title">Tu empresa aún no tiene perfil</p>
        <p className="profile-empty-text">Con su nombre y un contacto, las instituciones sabrán quién las busca y podrás publicar y vincular.</p>
      </div>
      <button type="button" onClick={onStart}>Completar perfil</button>
    </div>
  )
}

function CompanyFacts({ profile }: { profile: CompanyProfile }) {
  const location = profile.state_code ? [profile.municipality, stateName(profile.state_code)].filter(Boolean).join(', ') : null
  return (
    <>
      <FactGroup title="Datos generales">
        <Fact label="Nombre comercial" value={profile.trade_name} />
        <Fact label="Razón social" value={profile.legal_name} />
        <Fact label="RFC" value={profile.rfc} />
        <Fact label="Sector económico" value={profile.sector_code ? sectorLabel(profile.sector_code) : null} />
      </FactGroup>
      <FactGroup title="Ubicación" empty={location === null} emptyText="Aún sin ubicación. El municipio es el punto de partida para medir la distancia en la búsqueda de talento.">
        <Fact label="Municipio y estado" value={location} />
      </FactGroup>
      <ContactFacts title="Contacto para vinculación" profile={profile} />
    </>
  )
}

function ContactFacts({ title, profile }: { title: string; profile: CompanyProfile | InstitutionProfile }) {
  return (
    <FactGroup title={title} emptyText="Aún no hay contacto. Las instituciones lo necesitan para responder a tus solicitudes."
      empty={!profile.contact_name && !profile.contact_position && !profile.contact_email && !profile.contact_phone}>
      <Fact label="Nombre" value={profile.contact_name} />
      <Fact label="Puesto" value={profile.contact_position} />
      <Fact label="Correo" value={profile.contact_email} />
      <Fact label="Teléfono" value={profile.contact_phone} />
    </FactGroup>
  )
}

function Field({ id, label, error, children }: { id: string; label: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="account-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  )
}

/**
 * T-S14-15: la institución controla sus datos con las mismas reglas que la empresa. Corrige su nombre oficial y su CCT
 * (el formato solo se exige a un CCT nuevo) y el responsable de su programa dual, con «Soy yo» y la sincronización con
 * el nombre de su cuenta (T-S14-09).
 */
function InstitutionProfileForm({ profile, onSaved, onCancel }: { profile: InstitutionProfile; onSaved: (profile: InstitutionProfile) => void; onCancel: () => void }) {
  const { user, updateUser } = useAuth()
  const [values, setValues] = useState(() => valuesOf(profile))
  const [localErrors, setLocalErrors] = useState<Partial<Record<InstitutionField, string>>>({})
  const contact = useSelfContact({
    savedEmail: profile.contact_email, initialName: values.contact_name, currentName: values.contact_name,
    fill: ({ name, email }) => setValues((current) => ({ ...current, ...(name !== undefined ? { contact_name: name } : {}), ...(email !== undefined ? { contact_email: email } : {}) })),
  })
  const mutation = useApiMutation(profileMessages)
  const errors = mutation.failure?.errors ?? {}
  const general = mutation.failure && Object.keys(mutation.failure.errors).length === 0 ? mutation.failure.message : null
  const error = (field: InstitutionField) => localErrors[field] ?? errors[field]?.join(' ')
  const set = (field: InstitutionField) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setLocalErrors((current) => ({ ...current, [field]: undefined }))
  }
  const input = (field: InstitutionField, label: ReactNode, props: { type: string; maxLength: number; help?: string; autoComplete?: string; onBlur?: () => void }) => {
    const help = props.help ? `profile-${field}-help` : null
    const describedBy = [help, error(field) ? `profile-${field}-error` : null].filter(Boolean).join(' ') || undefined
    return (
      <Field id={`profile-${field}`} label={label} error={error(field)}>
        {props.help && <p className="field-help" id={`profile-${field}-help`}>{props.help}</p>}
        <input id={`profile-${field}`} type={props.type} maxLength={props.maxLength} value={values[field]} autoComplete={props.autoComplete ?? 'off'}
          disabled={mutation.pending} aria-invalid={Boolean(error(field))} aria-describedby={describedBy}
          onChange={(event) => set(field)(event.target.value)} onBlur={props.onBlur} />
      </Field>
    )
  }

  function checkCct() {
    const message = values.cct.trim() ? cctError(values.cct, profile.cct) : null
    setLocalErrors((current) => ({ ...current, cct: message ?? undefined }))
    if (!message && values.cct.trim()) setValues((current) => ({ ...current, cct: normalizeCct(current.cct) }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (mutation.pending) return
    const found: Partial<Record<InstitutionField, string>> = {}
    if (!values.name.trim()) found.name = 'El nombre oficial es obligatorio.'
    if (!values.cct.trim()) found.cct = 'La Clave de Centro de Trabajo es obligatoria.'
    else { const message = cctError(values.cct, profile.cct); if (message) found.cct = message }
    setLocalErrors(found)
    if (Object.keys(found).length) return
    const contactName = values.contact_name.trim()
    const accountRename = contact.accountNameFor(contactName || null)
    const payload = {
      name: values.name.trim(), cct: normalizeCct(values.cct),
      contact_name: contactName, contact_position: optional(values.contact_position),
      contact_email: values.contact_email.trim(), contact_phone: optional(values.contact_phone),
      // Con «Soy yo», corregir aquí el nombre del responsable corrige el de la cuenta.
      ...(accountRename ? { account_name: accountRename } : {}),
    }
    void mutation.submit(() => updateOrganizationProfile(payload), (updated) => {
      if (updated.type !== 'institution') return
      contact.saved({ name: updated.contact_name, email: updated.contact_email })
      // La sesión refleja el nombre de la institución y, si cambió, el de la cuenta, sin volver a cargarse.
      if (user?.institution) updateUser({ ...user, name: accountRename ?? user.name, institution: { ...user.institution, name: updated.name } })
      onSaved(updated)
    })
  }

  return (
    <>
      {general && <p className="notice" role="alert">{general}</p>}
      <form className="account-profile-form" onSubmit={submit} aria-busy={mutation.pending} noValidate>
        <fieldset className="account-contact" disabled={mutation.pending}>
          <legend>Datos de la institución</legend>
          <div className="account-fields">
            {input('name', 'Nombre oficial', { type: 'text', maxLength: 255, autoComplete: 'organization' })}
            {input('cct', 'Clave de Centro de Trabajo (CCT)', { type: 'text', maxLength: 14, help: '10 caracteres, por ejemplo 28EUT0001A.', onBlur: checkCct })}
          </div>
        </fieldset>
        <fieldset className="account-contact" disabled={mutation.pending}>
          <legend>Responsable del programa dual</legend>
          <div className="profile-self">
            <input id="profile-self" type="checkbox" checked={contact.self} onChange={(event) => {
              contact.toggle(event.target.checked)
              setLocalErrors((current) => ({ ...current, contact_name: undefined, contact_email: undefined }))
            }} />
            <label htmlFor="profile-self">Soy yo</label>
            <p className="field-help" id="profile-self-help">Usa tu nombre y el correo de tu cuenta. Desmárcalo para asignar a otra persona.</p>
          </div>
          <div className="account-fields">
            {input('contact_name', contact.self ? 'Tu nombre' : 'Nombre del responsable', {
              type: 'text', maxLength: 120, autoComplete: contact.self ? 'name' : 'off', help: contact.self ? 'También corrige el nombre de tu cuenta.' : undefined,
            })}
            {input('contact_position', 'Puesto o departamento (opcional)', { type: 'text', maxLength: 120, autoComplete: 'organization-title' })}
            {input('contact_email', 'Correo de contacto', { type: 'email', maxLength: 254, autoComplete: contact.self ? 'email' : 'off' })}
            {input('contact_phone', 'Teléfono de contacto (opcional)', { type: 'tel', maxLength: 20, autoComplete: 'tel' })}
          </div>
        </fieldset>
        <div className="profile-actions">
          <button type="submit" disabled={mutation.pending}><PendingLabel pending={mutation.pending} label="Guardar cambios" pendingLabel="Guardando cambios…" /></button>
          <button type="button" className="secondary" disabled={mutation.pending} onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </>
  )
}

/**
 * Perfil de la organización en Mi cuenta (HU-S14-02, HU-S14-03; rediseño T-S14-03): ficha de lectura con «Editar» en la
 * cabecera; la edición ocurre en la misma tarjeta, sin modal. La empresa usa el formulario del onboarding; la
 * institución, solo el contacto de su programa dual. Al llegar por #organization con datos faltantes, la empresa entra
 * directo a la edición.
 */
export function OrganizationProfileSection({ notify }: { notify: (message: string) => void }) {
  const load = useCallback((signal: AbortSignal) => getOrganizationProfile(signal), [])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, profileMessages)
  const { hash } = useLocation()
  const section = useRef<HTMLElement>(null)
  const edit = useRef<HTMLButtonElement>(null)
  // null: aún sin decidir. Con #organization y un perfil de empresa incompleto, se abre en edición.
  const [chosen, setChosen] = useState<boolean | null>(null)
  const editing = chosen ?? (hash === '#organization' && data?.type === 'company' && data.missing.length > 0)
  const ready = data !== null

  // T-S14-09: al renombrarse en Tu perfil, el servidor también renombra el contacto si es la misma persona («Soy yo»).
  // La ficha se vuelve a leer para no mostrar ni editar el nombre anterior.
  const accountName = useAuth().user?.name
  const seenName = useRef(accountName)
  useEffect(() => {
    if (seenName.current === accountName) return
    seenName.current = accountName
    void refresh()
  }, [accountName, refresh])

  useEffect(() => {
    if (!ready || hash !== '#organization') return
    section.current?.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [ready, hash])

  function open() {
    setChosen(true)
  }

  function close(saved?: CompanyProfile | InstitutionProfile) {
    if (saved) {
      setData(saved)
      notify('Perfil actualizado.')
    }
    setChosen(false)
    requestAnimationFrame(() => edit.current?.focus())
  }

  const company = data?.type === 'company' ? data : null
  const title = company ? 'Perfil de la empresa' : data ? 'Perfil de la institución' : 'Perfil de la organización'

  return (
    <section ref={section} className="account-card account-organization" id="organization" aria-labelledby="account-organization-title">
      <div className="account-card-head">
        <div className="account-card-title">
          <h3 id="account-organization-title">{title}</h3>
          {/* T-S14-04: la barra de avance vuelve a la vista, en la cabecera y siempre a la mano. */}
          {company && <ProfileScore missing={company.missing} />}
        </div>
        {/* Con el perfil vacío, «Completar perfil» del estado vacío es la acción: no se duplica. */}
        {data && !editing && !(company && company.missing.length === PROFILE_FIELDS) && (
          <button ref={edit} type="button" className="secondary account-card-edit" onClick={open}><PencilIcon />Editar</button>
        )}
      </div>
      {loading && !data ? <LoadingState label="Cargando el perfil…" variant="facts" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} />
        : company ? (
          editing ? (
            <div className="content-enter" key="edit">
              <ProfileProgress missing={company.missing} compact />
              <CompanyProfileForm profile={company} submitLabel="Guardar cambios" pendingLabel="Guardando cambios…" onSaved={(saved) => close(saved)}
                secondary={<button type="button" className="secondary" onClick={() => close()}>Cancelar</button>} />
            </div>
          ) : (
            <div className="content-enter" key="read">
              {/* T-S14-01: el detalle de lo que falta, que el inicio ya no repite. */}
              {/* Con el perfil vacío, el estado vacío ya lo explica: la lista de pendientes sobraría. */}
              {company.missing.length < PROFILE_FIELDS && <ProfileProgress missing={company.missing} compact />}
              {company.missing.length === PROFILE_FIELDS
                ? <ProfileEmpty onStart={open} />
                : <CompanyFacts profile={company} />}
            </div>
          )
        )
        : data?.type === 'institution' && (
          editing ? (
            <div className="content-enter" key="edit">
              <InstitutionProfileForm profile={data} onSaved={(saved) => close(saved)} onCancel={() => close()} />
            </div>
          ) : (
            <div className="content-enter" key="read">
              {/* T-S14-15: la institución corrige sus datos oficiales desde «Editar», como la empresa. */}
              <FactGroup title="Datos de la institución">
                <Fact label="Nombre oficial" value={data.name} />
                <Fact label="Clave de Centro de Trabajo" value={data.cct} />
              </FactGroup>
              <ContactFacts title="Contacto del programa dual" profile={data} />
            </div>
          )
        )}
    </section>
  )
}
