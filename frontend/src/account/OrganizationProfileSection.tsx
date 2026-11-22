import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { sessionInstitution } from '../auth/api'
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
import { INSTITUTION_PROFILE_FIELDS, PROFILE_FIELDS } from './profileGaps'
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

/** Perfil sin ningún dato: un estado vacío con la siguiente acción, no una ficha llena de huecos. */
function ProfileEmpty({ kind = 'company', onStart }: { kind?: 'company' | 'institution'; onStart: () => void }) {
  return (
    <div className="profile-empty">
      <span className="profile-empty-icon" aria-hidden="true"><BuildingIcon /></span>
      <div>
        {kind === 'institution' ? (
          <>
            <p className="profile-empty-title">Tu institución aún no tiene perfil</p>
            <p className="profile-empty-text">Con su nombre oficial, su CCT y un responsable, las empresas sabrán con quién vincularse y tus alumnos aparecerán en la búsqueda de talento.</p>
          </>
        ) : (
          <>
            <p className="profile-empty-title">Tu empresa aún no tiene perfil</p>
            <p className="profile-empty-text">Con su nombre y un contacto, las instituciones sabrán quién las busca y podrás publicar y vincular.</p>
          </>
        )}
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
    <FactGroup title={title} emptyText={profile.type === 'institution'
      ? 'Aún no hay responsable. Las empresas lo necesitan para vincularse con tus alumnos.'
      : 'Aún no hay contacto. Las instituciones lo necesitan para responder a tus solicitudes.'}
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
 * el nombre de su cuenta (T-S14-09). HU-S16-07: todo es opcional y lo usa también el onboarding (`/welcome`).
 */
export function InstitutionProfileForm({ profile, submitLabel = 'Guardar cambios', pendingLabel = 'Guardando cambios…', suggestSelf = false, secondary, onSaved }: {
  profile: InstitutionProfile
  submitLabel?: string
  pendingLabel?: string
  /**
   * Solo en el onboarding: con el contacto vacío, propone a la persona de la sesión («Soy yo» marcado y sus datos
   * precargados). En Mi cuenta, un contacto vacío se respeta tal cual (T-S14-02).
   */
  suggestSelf?: boolean
  /** Acción secundaria junto al botón principal: «Cancelar» o «Completar más tarde». */
  secondary: ReactNode
  onSaved: (profile: InstitutionProfile) => void
}) {
  const { user, updateUser } = useAuth()
  const emptyContact = profile.contact_name === null && profile.contact_email === null
  const suggest = suggestSelf && emptyContact
  const [values, setValues] = useState(() => {
    const initial = valuesOf(profile)
    // M3: el nombre provisional de la cuenta es su correo; no se propone como nombre de nadie.
    if (suggest && user) return { ...initial, contact_name: user.name !== user.email ? user.name : '', contact_email: user.email }
    return initial
  })
  const [localErrors, setLocalErrors] = useState<Partial<Record<InstitutionField, string>>>({})
  const contact = useSelfContact({
    savedEmail: profile.contact_email, initialName: values.contact_name, currentName: values.contact_name, suggest,
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
    // HU-S16-07: guardado parcial; solo se valida el formato de lo capturado.
    const found: Partial<Record<InstitutionField, string>> = {}
    const cctMessage = values.cct.trim() ? cctError(values.cct, profile.cct) : null
    if (cctMessage) found.cct = cctMessage
    setLocalErrors(found)
    if (Object.keys(found).length) return
    const contactName = optional(values.contact_name)
    const accountRename = contact.accountNameFor(contactName)
    const payload = {
      name: optional(values.name), cct: values.cct.trim() ? normalizeCct(values.cct) : null,
      contact_name: contactName, contact_position: optional(values.contact_position),
      contact_email: optional(values.contact_email)?.toLowerCase() ?? null, contact_phone: optional(values.contact_phone),
      // Con «Soy yo», corregir aquí el nombre del responsable corrige el de la cuenta.
      ...(accountRename ? { account_name: accountRename } : {}),
    }
    void mutation.submit(() => updateOrganizationProfile(payload), (updated) => {
      if (updated.type !== 'institution') return
      contact.saved({ name: updated.contact_name, email: updated.contact_email })
      // La sesión refleja el nombre, lo que falta y, si cambió, el nombre de la cuenta, sin volver a cargarse. Guardar,
      // aunque sea en parcial, termina el onboarding (HU-S16-07).
      if (user?.institution) {
        updateUser({ ...user, name: accountRename ?? user.name, institution: sessionInstitution(user.institution.id, updated.name, updated.missing, 'done') })
      }
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
          <button type="submit" disabled={mutation.pending}><PendingLabel pending={mutation.pending} label={submitLabel} pendingLabel={pendingLabel} /></button>
          {secondary}
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
  // null: aún sin decidir. Con #organization y un perfil incompleto, se abre en edición (HU-S16-07: también la institución).
  const [chosen, setChosen] = useState<boolean | null>(null)
  const editing = chosen ?? (hash === '#organization' && data !== null && data.missing.length > 0)
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
  const institution = data?.type === 'institution' ? data : null
  const title = company ? 'Perfil de la empresa' : data ? 'Perfil de la institución' : 'Perfil de la organización'

  return (
    <section ref={section} className="account-card account-organization" id="organization" aria-labelledby="account-organization-title">
      <div className="account-card-head">
        <div className="account-card-title">
          <h3 id="account-organization-title">{title}</h3>
          {/* T-S14-04: la barra de avance vuelve a la vista, en la cabecera y siempre a la mano. */}
          {company && <ProfileScore missing={company.missing} />}
          {institution && <ProfileScore kind="institution" missing={institution.missing} />}
        </div>
        {/* Con el perfil vacío, «Completar perfil» del estado vacío es la acción: no se duplica. */}
        {data && !editing && !(company && company.missing.length === PROFILE_FIELDS) && !(institution && institution.missing.length === INSTITUTION_PROFILE_FIELDS) && (
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
        : institution && (
          editing ? (
            <div className="content-enter" key="edit">
              {/* HU-S16-07: lo que falta del mínimo, a la vista mientras se completa. */}
              <ProfileProgress kind="institution" missing={institution.missing} compact />
              <InstitutionProfileForm profile={institution} onSaved={(saved) => close(saved)}
                secondary={<button type="button" className="secondary" onClick={() => close()}>Cancelar</button>} />
            </div>
          ) : (
            <div className="content-enter" key="read">
              {institution.missing.length > 0 && institution.missing.length < INSTITUTION_PROFILE_FIELDS && <ProfileProgress kind="institution" missing={institution.missing} compact />}
              {institution.missing.length === INSTITUTION_PROFILE_FIELDS
                ? <ProfileEmpty kind="institution" onStart={open} />
                : (
                  <>
                    {/* T-S14-15: la institución corrige sus datos oficiales desde «Editar», como la empresa. */}
                    <FactGroup title="Datos de la institución">
                      <Fact label="Nombre oficial" value={institution.name} />
                      <Fact label="Clave de Centro de Trabajo" value={institution.cct} />
                    </FactGroup>
                    <ContactFacts title="Contacto del programa dual" profile={institution} />
                  </>
                )}
            </div>
          )
        )}
    </section>
  )
}
