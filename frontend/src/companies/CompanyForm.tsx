import { useState } from 'react'
import type { FocusEvent, FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import type { ApiFailure } from '../lib/useApiRequest'
import { MEXICAN_STATES } from '../students/catalogs'
import { MunicipalityCombobox } from '../students/MunicipalityCombobox'
import { PendingLabel } from '../ui/forms'
import { emailErrorOnBlur, INVALID_EMAIL } from '../ui/validation'
import type { Company, CompanyInput } from './api'
import { ECONOMIC_SECTORS, INVALID_PHONE, INVALID_RFC, isSectorCode, isValidPhone, isValidRfc, normalizeRfc } from './catalogs'

type Field = keyof CompanyInput
type Values = Record<Field, string>

const emptyValues: Values = {
  legal_name: '', trade_name: '', rfc: '', sector_code: '', state_code: '', municipality_code: '',
  contact_name: '', contact_email: '', contact_phone: '', validation_reference: '',
}

const valuesOf = (company: Company): Values => ({
  legal_name: company.legal_name, trade_name: company.trade_name ?? '', rfc: company.rfc, sector_code: company.sector_code,
  state_code: company.state_code, municipality_code: company.municipality_code, contact_name: company.contact_name,
  contact_email: company.contact_email, contact_phone: company.contact_phone ?? '', validation_reference: company.validation_reference ?? '',
})

interface CompanyFormProps {
  company?: Company
  submitLabel: string
  cancelTo: string
  pending: boolean
  failure: ApiFailure | null
  onSubmit: (input: CompanyInput) => Promise<void>
}

/**
 * Alta y edición de una empresa validada (HU-S4-02 CA-02 a CA-05, CA-09). Sin domicilio ni documentos: el municipio
 * del catálogo INEGI basta para ubicarla.
 */
export function CompanyForm({ company, submitLabel, cancelTo, pending, failure, onSubmit }: CompanyFormProps) {
  const [values, setValues] = useState<Values>(() => company ? valuesOf(company) : emptyValues)
  const [localErrors, setLocalErrors] = useState<Partial<Record<Field, string[]>>>({})
  const [municipalityTyped, setMunicipalityTyped] = useState(false)
  const errors: Partial<Record<string, string[]>> = { ...failure?.errors, ...localErrors }

  function set(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    // Corregir un campo retira su error local; los del servidor se renuevan al enviar.
    setLocalErrors((current) => {
      if (!(field in current)) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function setError(field: Field, message: string | null) {
    setLocalErrors((current) => {
      const next = { ...current }
      if (message) next[field] = [message]
      else delete next[field]
      return next
    })
  }

  // Validación en línea al salir de los campos con formato (CA-09).
  function checkRfc(event: FocusEvent<HTMLInputElement>) {
    const rfc = normalizeRfc(event.target.value)
    if (rfc) setError('rfc', isValidRfc(rfc) ? null : INVALID_RFC)
  }
  function checkPhone(event: FocusEvent<HTMLInputElement>) {
    const phone = event.target.value.trim()
    setError('contact_phone', !phone || isValidPhone(phone) ? null : INVALID_PHONE)
  }
  function checkEmail(event: FocusEvent<HTMLInputElement>) {
    const error = emailErrorOnBlur(event)
    setLocalErrors((current) => {
      const next = { ...current }
      if (error) next.contact_email = [error]
      else if (current.contact_email?.[0] === INVALID_EMAIL) delete next.contact_email
      return next
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const text = (field: Field) => values[field].trim()
    const optional = (field: Field) => text(field) || null
    const rfc = normalizeRfc(values.rfc)
    const found: Partial<Record<Field, string[]>> = {}
    if (!text('legal_name')) found.legal_name = ['La razón social es obligatoria.']
    if (!rfc) found.rfc = ['El RFC es obligatorio.']
    else if (!isValidRfc(rfc)) found.rfc = [INVALID_RFC]
    if (!values.sector_code) found.sector_code = ['El sector económico es obligatorio.']
    if (!values.state_code) found.state_code = ['El estado es obligatorio.']
    if (!values.municipality_code) found.municipality_code = [municipalityTyped ? 'Elige un municipio de la lista.' : 'El municipio es obligatorio.']
    if (!text('contact_name')) found.contact_name = ['El nombre del contacto es obligatorio.']
    if (!text('contact_email')) found.contact_email = ['El correo del contacto es obligatorio.']
    else if (localErrors.contact_email?.[0] === INVALID_EMAIL) found.contact_email = [INVALID_EMAIL]
    if (text('contact_phone') && !isValidPhone(text('contact_phone'))) found.contact_phone = [INVALID_PHONE]
    setLocalErrors(found)
    if (Object.keys(found).length || !isSectorCode(values.sector_code)) return

    await onSubmit({
      legal_name: text('legal_name'), trade_name: optional('trade_name'), rfc, sector_code: values.sector_code,
      state_code: values.state_code, municipality_code: values.municipality_code, contact_name: text('contact_name'),
      contact_email: text('contact_email'), contact_phone: optional('contact_phone'), validation_reference: optional('validation_reference'),
    })
  }

  const errorId = (field: Field) => `company-${field}-error`
  const describedBy = (field: Field, help?: string) =>
    [help, errors[field]?.length ? errorId(field) : null].filter(Boolean).join(' ') || undefined
  const fieldError = (field: Field) => errors[field]?.length
    ? <p className="field-error" id={errorId(field)}>{errors[field].join(' ')}</p> : null
  const input = (field: Field, label: ReactNode, props: { maxLength: number; type?: string; autoComplete?: string; help?: string; required?: boolean; onBlur?: (event: FocusEvent<HTMLInputElement>) => void }) => (
    <>
      <label htmlFor={`company-${field}`}>{label}</label>
      {props.help && <p className="field-help" id={`company-${field}-help`}>{props.help}</p>}
      <input id={`company-${field}`} name={field} type={props.type ?? 'text'} autoComplete={props.autoComplete ?? 'off'}
        required={props.required ?? false} maxLength={props.maxLength} value={values[field]} disabled={pending}
        aria-invalid={Boolean(errors[field]?.length)} aria-describedby={describedBy(field, props.help ? `company-${field}-help` : undefined)}
        onChange={(event) => set(field, event.target.value)} onBlur={props.onBlur} />
      {fieldError(field)}
    </>
  )

  return (
    <>
      <p>Los campos marcados como opcionales pueden quedar vacíos. No se pide domicilio ni documentos: la evidencia de la validación queda en los expedientes de la Secretaría.</p>
      {failure && failure.status !== 422 && <InstitutionRequestError failure={failure} />}
      <form className="company-form" onSubmit={(event) => { void submit(event) }} aria-busy={pending} noValidate>
        <fieldset disabled={pending}>
          <legend>Identificación</legend>
          {input('legal_name', 'Razón social', { maxLength: 200, autoComplete: 'organization', required: true })}
          {input('trade_name', 'Nombre comercial (opcional)', { maxLength: 150 })}
          {input('rfc', 'RFC', { maxLength: 13, required: true, help: '12 caracteres para persona moral o 13 para persona física.', onBlur: checkRfc })}
          <label htmlFor="company-sector_code">Sector económico (SCIAN)</label>
          <select id="company-sector_code" name="sector_code" required value={values.sector_code}
            aria-invalid={Boolean(errors.sector_code?.length)} aria-describedby={describedBy('sector_code')}
            onChange={(event) => set('sector_code', event.target.value)}>
            <option value="">Selecciona…</option>
            {ECONOMIC_SECTORS.map((sector) => <option key={sector.code} value={sector.code}>{sector.code} · {sector.name}</option>)}
          </select>
          {fieldError('sector_code')}
          {input('validation_reference', 'Folio u oficio de validación (opcional)', { maxLength: 60 })}
        </fieldset>

        <fieldset disabled={pending}>
          <legend>Ubicación</legend>
          <p className="privacy-note">Solo estado y municipio: es el punto de partida de la búsqueda por distancia.</p>
          <div className="field-row">
            <div>
              <label htmlFor="company-state_code">Estado</label>
              <select id="company-state_code" name="state_code" required value={values.state_code}
                aria-invalid={Boolean(errors.state_code?.length)} aria-describedby={describedBy('state_code')}
                onChange={(event) => {
                  // Cambiar de estado limpia el municipio.
                  setValues((current) => ({ ...current, municipality_code: '' }))
                  setMunicipalityTyped(false)
                  set('state_code', event.target.value)
                }}>
                <option value="">Selecciona…</option>
                {MEXICAN_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
              </select>
              {fieldError('state_code')}
            </div>
            <div>
              <label htmlFor="company-municipality_code">Municipio</label>
              <MunicipalityCombobox key={values.state_code} id="company-municipality_code" state={values.state_code}
                code={values.municipality_code}
                initialName={company && values.state_code === company.state_code && values.municipality_code === company.municipality_code ? company.municipality ?? '' : ''}
                invalid={Boolean(errors.municipality_code?.length)} describedBy={describedBy('municipality_code')} disabled={pending}
                onSelect={(municipality) => {
                  setMunicipalityTyped(municipality === null)
                  set('municipality_code', municipality?.code ?? '')
                }} />
              {fieldError('municipality_code')}
            </div>
          </div>
        </fieldset>

        <fieldset disabled={pending}>
          <legend>Contacto del programa dual</legend>
          {input('contact_name', 'Nombre del contacto', { maxLength: 120, autoComplete: 'name', required: true })}
          {input('contact_email', 'Correo del contacto', { maxLength: 254, type: 'email', autoComplete: 'email', required: true, onBlur: checkEmail })}
          {input('contact_phone', 'Teléfono del contacto (opcional)', { maxLength: 20, type: 'tel', autoComplete: 'tel', onBlur: checkPhone })}
        </fieldset>

        <div className="actions">
          <button type="submit" disabled={pending}><PendingLabel pending={pending} label={submitLabel} pendingLabel="Guardando…" /></button>
          <Link className="institution-button secondary" to={cancelTo}>Cancelar</Link>
        </div>
      </form>
    </>
  )
}
