import { useState } from 'react'
import type { FormEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import { PendingLabel } from '../ui/forms'
import { updateStudentProfile } from './api'
import type { StudentDetail, StudentProfileInput } from './api'
import { isPeriodType, MAX_PERIOD, MEXICAN_STATES, PERIOD_TYPES } from './catalogs'
import { studentMessages } from './messages'

type Field = keyof StudentProfileInput
type YesNo = '' | 'yes' | 'no'

const toYesNo = (value: boolean | null): YesNo => value === null ? '' : value ? 'yes' : 'no'
const periods = Array.from({ length: MAX_PERIOD }, (_, index) => index + 1)

/**
 * Expediente público del alumno (HU-S2-03 CA-02 a CA-04): lo que podrán filtrar las empresas
 * sin conocer su identidad. Todos los campos son obligatorios para guardarlo.
 */
export function StudentProfileForm({ student, onSaved }: { student: StudentDetail; onSaved: (student: StudentDetail) => void }) {
  const { profile } = student
  const [values, setValues] = useState({
    program: profile.program ?? '',
    period_type: profile.period_type ?? '',
    period_number: profile.period_number === null ? '' : String(profile.period_number),
    dual_available: toYesNo(profile.dual_available),
    state_code: profile.state_code ?? '',
    municipality: profile.municipality ?? '',
    can_relocate: toYesNo(profile.can_relocate),
  })
  const [localErrors, setLocalErrors] = useState<Partial<Record<Field, string[]>>>({})
  const mutation = useApiMutation(studentMessages)
  // El aviso va junto al botón: tras un formulario largo, un aviso arriba quedaría fuera de la vista.
  const [saved, setSaved] = useState(false)
  const errors: Partial<Record<string, string[]>> = { ...mutation.failure?.errors, ...localErrors }

  function set(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setSaved(false)
    // Corregir un campo retira su error local; los del servidor se renuevan al enviar.
    setLocalErrors((current) => {
      if (!(field in current)) return current
      const next = { ...current }
      delete next[field as Field]
      return next
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    setSaved(false)
    const program = values.program.trim()
    const municipality = values.municipality.trim()
    const required: Partial<Record<Field, string[]>> = {}
    if (!program) required.program = ['La carrera o programa educativo es obligatorio.']
    if (!values.period_type) required.period_type = ['Indica si el periodo es semestre o cuatrimestre.']
    if (!values.period_number) required.period_number = ['El periodo actual es obligatorio.']
    if (!values.dual_available) required.dual_available = ['Indica la disponibilidad para el programa dual.']
    if (!values.state_code) required.state_code = ['El estado es obligatorio.']
    if (!municipality) required.municipality = ['El municipio es obligatorio.']
    if (!values.can_relocate) required.can_relocate = ['Indica si puede reubicarse.']
    setLocalErrors(required)
    if (Object.keys(required).length || !isPeriodType(values.period_type)) return

    const input: StudentProfileInput = {
      program,
      period_type: values.period_type,
      period_number: Number(values.period_number),
      dual_available: values.dual_available === 'yes',
      state_code: values.state_code,
      municipality,
      can_relocate: values.can_relocate === 'yes',
    }
    await mutation.submit(() => updateStudentProfile(student.id, input), (updated) => {
      setSaved(true)
      onSaved(updated)
    })
  }

  const errorId = (field: Field) => `student-profile-${field}-error`
  const describedBy = (...fields: Field[]) =>
    fields.filter((field) => errors[field]?.length).map(errorId).join(' ') || undefined
  const fieldError = (field: Field) => errors[field]?.length
    ? <p className="field-error" id={errorId(field)}>{errors[field].join(' ')}</p> : null

  const yesNo = (field: 'dual_available' | 'can_relocate', legend: string, yes: string, no: string) => (
    <fieldset className="choice-group" aria-describedby={describedBy(field)}>
      <legend>{legend}</legend>
      {([['yes', yes], ['no', no]] as const).map(([value, label]) => (
        <div key={value}>
          <input id={`student-profile-${field}-${value}`} type="radio" name={field} value={value}
            checked={values[field] === value} onChange={() => set(field, value)} />
          <label htmlFor={`student-profile-${field}-${value}`}>{label}</label>
        </div>
      ))}
    </fieldset>
  )

  return (
    <form className="student-profile" onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
      {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
      <fieldset disabled={mutation.pending}>
        <legend className="visually-hidden">Expediente público</legend>
        <h4>Académico</h4>
        <label htmlFor="student-profile-program">Carrera o programa educativo</label>
        <input id="student-profile-program" name="program" type="text" autoComplete="off" required maxLength={150}
          value={values.program} aria-invalid={Boolean(errors.program?.length)} aria-describedby={describedBy('program')}
          onChange={(event) => set('program', event.target.value)} />
        {fieldError('program')}

        <div className="field-row">
          <div>
            <label htmlFor="student-profile-period_type">Tipo de periodo</label>
            <select id="student-profile-period_type" name="period_type" required value={values.period_type}
              aria-invalid={Boolean(errors.period_type?.length)} aria-describedby={describedBy('period_type')}
              onChange={(event) => set('period_type', event.target.value)}>
              <option value="">Selecciona…</option>
              {PERIOD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
            {fieldError('period_type')}
          </div>
          <div>
            <label htmlFor="student-profile-period_number">Periodo actual</label>
            <select id="student-profile-period_number" name="period_number" required value={values.period_number}
              aria-invalid={Boolean(errors.period_number?.length)} aria-describedby={describedBy('period_number')}
              onChange={(event) => set('period_number', event.target.value)}>
              <option value="">Selecciona…</option>
              {periods.map((number) => <option key={number} value={number}>{number}.º</option>)}
            </select>
            {fieldError('period_number')}
          </div>
        </div>

        {yesNo('dual_available', 'Disponibilidad para el programa dual', 'Disponible', 'No disponible')}
        {fieldError('dual_available')}

        <h4>Ubicación aproximada</h4>
        <p className="privacy-note">Solo estado y municipio; no registres direcciones.</p>
        <div className="field-row">
          <div>
            <label htmlFor="student-profile-state_code">Estado</label>
            <select id="student-profile-state_code" name="state_code" required value={values.state_code}
              aria-invalid={Boolean(errors.state_code?.length)} aria-describedby={describedBy('state_code')}
              onChange={(event) => set('state_code', event.target.value)}>
              <option value="">Selecciona…</option>
              {MEXICAN_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
            </select>
            {fieldError('state_code')}
          </div>
          <div>
            <label htmlFor="student-profile-municipality">Municipio</label>
            <input id="student-profile-municipality" name="municipality" type="text" autoComplete="off" required maxLength={120}
              value={values.municipality} aria-invalid={Boolean(errors.municipality?.length)} aria-describedby={describedBy('municipality')}
              onChange={(event) => set('municipality', event.target.value)} />
            {fieldError('municipality')}
          </div>
        </div>

        <h4>Movilidad</h4>
        {yesNo('can_relocate', 'Disponibilidad para reubicarse', 'Sí', 'No')}
        {fieldError('can_relocate')}
      </fieldset>
      {saved && <p className="institution-success" role="status">Expediente guardado correctamente.</p>}
      <div className="actions">
        <button type="submit" disabled={mutation.pending}>
          <PendingLabel pending={mutation.pending} label="Guardar expediente" pendingLabel="Guardando expediente…" />
        </button>
      </div>
    </form>
  )
}
