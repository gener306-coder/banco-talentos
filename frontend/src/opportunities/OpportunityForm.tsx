import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import type { ApiFailure } from '../lib/useApiRequest'
import { isPeriodType, MAX_PERIOD, MEXICAN_STATES, PERIOD_TYPES } from '../students/catalogs'
import type { SkillInput } from '../students/cv'
import { CV_LANGUAGES, hasContactInformation, LANGUAGE_LEVELS } from '../students/cvCatalogs'
import { MunicipalityCombobox } from '../students/MunicipalityCombobox'
import { SkillPicker } from '../students/SkillPicker'
import { PendingLabel } from '../ui/forms'
import { OPPORTUNITY_LIMITS } from './api'
import type { Opportunity, OpportunityDefaults, OpportunityInput } from './api'

/** Igual que ContactInformation::OPPORTUNITY_MESSAGE del backend (CA-04). */
export const OPPORTUNITY_CONTACT_MESSAGE = 'No incluyas enlaces, correos ni teléfonos: el contacto con el alumno se coordina con su institución.'

type Field = 'title' | 'program' | 'period_type' | 'period_number' | 'vacancies' | 'can_relocate' | 'state_code' |
  'municipality_code' | 'description' | 'language_code' | 'min_level'
type Values = Record<Field, string>

const periods = Array.from({ length: MAX_PERIOD }, (_, index) => String(index + 1))

function valuesOf(opportunity: Opportunity | undefined, defaults: OpportunityDefaults | null): Values {
  if (opportunity) {
    return {
      title: opportunity.title, program: opportunity.program, period_type: opportunity.period_type,
      period_number: String(opportunity.period_number), vacancies: String(opportunity.vacancies),
      can_relocate: opportunity.can_relocate ? 'yes' : 'no', state_code: opportunity.state_code,
      municipality_code: opportunity.municipality_code, description: opportunity.description,
      language_code: opportunity.language_code ?? '', min_level: opportunity.min_level === null ? '' : String(opportunity.min_level),
    }
  }
  return {
    title: '', program: '', period_type: '', period_number: '', vacancies: '1', can_relocate: '',
    // CA-05: por defecto, la ubicación de la empresa.
    state_code: defaults?.state_code ?? '', municipality_code: defaults?.municipality_code ?? '',
    description: '', language_code: '', min_level: '',
  }
}

interface OpportunityFormProps {
  opportunity?: Opportunity
  defaults?: OpportunityDefaults | null
  submitLabel: string
  cancelTo: string
  pending: boolean
  failure: ApiFailure | null
  onSubmit: (input: OpportunityInput) => Promise<void>
}

/** Alta y edición de una oportunidad dual (HU-S5-02 CA-03 a CA-05, CA-07), con validación en línea. */
export function OpportunityForm({ opportunity, defaults = null, submitLabel, cancelTo, pending, failure, onSubmit }: OpportunityFormProps) {
  const [values, setValues] = useState<Values>(() => valuesOf(opportunity, defaults))
  const [skills, setSkills] = useState<SkillInput[]>(() => opportunity?.skills.map(({ name, kind }) => ({ name, kind })) ?? [])
  const [localErrors, setLocalErrors] = useState<Partial<Record<Field, string[]>>>({})
  const [municipalityTyped, setMunicipalityTyped] = useState(false)
  const errors: Partial<Record<string, string[]>> = { ...failure?.errors, ...localErrors }
  const skillErrors = Object.entries(failure?.errors ?? {}).filter(([key]) => key.startsWith('skills')).flatMap(([, messages]) => messages)
  // El nombre del municipio guardado o el de la empresa, mientras no se cambie la ubicación.
  const known = opportunity ?? defaults
  const initialMunicipality = known && values.state_code === known.state_code && values.municipality_code === known.municipality_code
    ? known.municipality ?? '' : ''

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

  // Validación en línea de los textos públicos al salir del campo (CA-04).
  function checkContact(field: 'title' | 'program' | 'description') {
    if (!hasContactInformation(values[field])) return
    setLocalErrors((current) => ({ ...current, [field]: [OPPORTUNITY_CONTACT_MESSAGE] }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const text = (field: Field) => values[field].trim()
    const found: Partial<Record<Field, string[]>> = {}
    const required = (field: Field, message: string) => { if (!text(field)) found[field] = [message] }
    required('title', 'El título de la oportunidad es obligatorio.')
    required('program', 'La carrera o programa requerido es obligatorio.')
    required('period_type', 'Indica si el periodo mínimo es semestre o cuatrimestre.')
    required('period_number', 'El periodo mínimo es obligatorio.')
    required('can_relocate', 'Indica si la oportunidad requiere reubicarse.')
    required('state_code', 'El estado es obligatorio.')
    if (!values.municipality_code) found.municipality_code = [municipalityTyped ? 'Elige un municipio de la lista.' : 'El municipio es obligatorio.']
    required('description', 'La descripción de actividades es obligatoria.')
    for (const field of ['title', 'program', 'description'] as const) {
      if (!found[field] && hasContactInformation(values[field])) found[field] = [OPPORTUNITY_CONTACT_MESSAGE]
    }
    const vacancies = Number(text('vacancies'))
    if (!Number.isInteger(vacancies) || vacancies < 1 || vacancies > OPPORTUNITY_LIMITS.vacancies || !text('vacancies')) {
      found.vacancies = [`El número de lugares debe ser un entero del 1 al ${OPPORTUNITY_LIMITS.vacancies}.`]
    }
    if (values.language_code && !values.min_level) found.min_level = ['Selecciona el nivel mínimo del idioma.']
    if (!values.language_code && values.min_level) found.language_code = ['Selecciona el idioma del nivel mínimo.']
    setLocalErrors(found)
    if (Object.keys(found).length || !isPeriodType(values.period_type)) return

    await onSubmit({
      title: text('title'), program: text('program'), period_type: values.period_type, period_number: Number(values.period_number),
      vacancies, can_relocate: values.can_relocate === 'yes', state_code: values.state_code,
      municipality_code: values.municipality_code, description: text('description'), skills,
      language_code: values.language_code || null, min_level: values.min_level ? Number(values.min_level) : null,
    })
  }

  const errorId = (field: Field) => `opportunity-${field}-error`
  const describedBy = (field: Field, help?: string) =>
    [help, errors[field]?.length ? errorId(field) : null].filter(Boolean).join(' ') || undefined
  const fieldError = (field: Field) => errors[field]?.length
    ? <p className="field-error" id={errorId(field)}>{errors[field].join(' ')}</p> : null
  const select = (field: Field, label: string, options: ReactNode) => (
    <>
      <label htmlFor={`opportunity-${field}`}>{label}</label>
      <select id={`opportunity-${field}`} name={field} value={values[field]}
        aria-invalid={Boolean(errors[field]?.length)} aria-describedby={describedBy(field)}
        onChange={(event) => set(field, event.target.value)}>
        {options}
      </select>
      {fieldError(field)}
    </>
  )

  return (
    <>
      <p>Todos los campos son obligatorios salvo las habilidades y el idioma. No incluyas datos de contacto: la vinculación con el alumno se coordina con su institución.</p>
      {failure && failure.status !== 422 && <InstitutionRequestError failure={failure} />}
      <form className="opportunity-form" onSubmit={(event) => { void submit(event) }} aria-busy={pending} noValidate>
        <fieldset disabled={pending}>
          <legend>Proyecto</legend>
          <label htmlFor="opportunity-title">Título de la oportunidad</label>
          <input id="opportunity-title" name="title" type="text" autoComplete="off" required maxLength={OPPORTUNITY_LIMITS.title}
            value={values.title} aria-invalid={Boolean(errors.title?.length)} aria-describedby={describedBy('title')}
            onChange={(event) => set('title', event.target.value)} onBlur={() => checkContact('title')} />
          {fieldError('title')}
          <label htmlFor="opportunity-description">Actividades y objetivos</label>
          <textarea id="opportunity-description" name="description" required rows={6} maxLength={OPPORTUNITY_LIMITS.description}
            value={values.description} aria-invalid={Boolean(errors.description?.length)}
            aria-describedby={describedBy('description', 'opportunity-description-count')}
            onChange={(event) => set('description', event.target.value)} onBlur={() => checkContact('description')} />
          <p className="field-hint" id="opportunity-description-count">{values.description.length} de {OPPORTUNITY_LIMITS.description} caracteres</p>
          {fieldError('description')}
          <label htmlFor="opportunity-vacancies">Lugares disponibles</label>
          <input id="opportunity-vacancies" name="vacancies" type="number" inputMode="numeric" required min={1} max={OPPORTUNITY_LIMITS.vacancies} step={1}
            value={values.vacancies} aria-invalid={Boolean(errors.vacancies?.length)} aria-describedby={describedBy('vacancies')}
            onChange={(event) => set('vacancies', event.target.value)} />
          {fieldError('vacancies')}
        </fieldset>

        <fieldset disabled={pending}>
          <legend>Perfil requerido</legend>
          <label htmlFor="opportunity-program">Carrera o programa requerido</label>
          <input id="opportunity-program" name="program" type="text" autoComplete="off" required maxLength={OPPORTUNITY_LIMITS.program}
            value={values.program} aria-invalid={Boolean(errors.program?.length)} aria-describedby={describedBy('program')}
            onChange={(event) => set('program', event.target.value)} onBlur={() => checkContact('program')} />
          {fieldError('program')}
          <div className="field-row">
            <div>{select('period_type', 'Tipo de periodo', <><option value="">Selecciona…</option>{PERIOD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</>)}</div>
            <div>{select('period_number', 'Periodo mínimo', <><option value="">Selecciona…</option>{periods.map((number) => <option key={number} value={number}>{number}.º</option>)}</>)}</div>
          </div>
          <div className="field-row">
            <div>{select('language_code', 'Idioma (opcional)', <><option value="">Sin idioma requerido</option>{CV_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}</>)}</div>
            <div>{select('min_level', 'Nivel mínimo', <><option value="">Selecciona…</option>{LANGUAGE_LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}</>)}</div>
          </div>
        </fieldset>

        <fieldset disabled={pending}>
          <legend>Habilidades requeridas (opcional)</legend>
          <SkillPicker idPrefix="opportunity" skills={skills} max={OPPORTUNITY_LIMITS.skills} disabled={pending}
            serverError={skillErrors.length ? [...new Set(skillErrors)].join(' ') : null} contactMessage={OPPORTUNITY_CONTACT_MESSAGE}
            placeholder="Ej. PLC, AutoCAD, Trabajo en equipo" onChange={setSkills} />
        </fieldset>

        <fieldset disabled={pending}>
          <legend>Lugar de la oportunidad</legend>
          <p className="privacy-note">Solo estado y municipio: la ubicación aproximada es la cabecera municipal.</p>
          <div className="field-row">
            <div>
              {select('state_code', 'Estado', <><option value="">Selecciona…</option>{MEXICAN_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</>)}
            </div>
            <div>
              <label htmlFor="opportunity-municipality_code">Municipio</label>
              {/* key: al cambiar de estado se vuelve a montar vacío y carga los municipios del nuevo estado. */}
              <MunicipalityCombobox key={values.state_code} id="opportunity-municipality_code" state={values.state_code}
                code={values.municipality_code} initialName={initialMunicipality}
                invalid={Boolean(errors.municipality_code?.length)} describedBy={describedBy('municipality_code')} disabled={pending}
                onSelect={(municipality) => {
                  setMunicipalityTyped(municipality === null)
                  set('municipality_code', municipality?.code ?? '')
                }} />
              {fieldError('municipality_code')}
            </div>
          </div>
          <fieldset className="choice-group" aria-describedby={describedBy('can_relocate')}>
            <legend>¿Requiere que el alumno se reubique?</legend>
            {([['yes', 'Sí'], ['no', 'No']] as const).map(([value, label]) => (
              <div key={value}>
                <input id={`opportunity-can_relocate-${value}`} type="radio" name="can_relocate" value={value}
                  checked={values.can_relocate === value} onChange={() => set('can_relocate', value)} />
                <label htmlFor={`opportunity-can_relocate-${value}`}>{label}</label>
              </div>
            ))}
          </fieldset>
          {fieldError('can_relocate')}
        </fieldset>

        <div className="actions">
          <button type="submit" disabled={pending}><PendingLabel pending={pending} label={submitLabel} pendingLabel="Guardando…" /></button>
          <Link className="institution-button secondary" to={cancelTo}>Cancelar</Link>
        </div>
      </form>
    </>
  )
}
