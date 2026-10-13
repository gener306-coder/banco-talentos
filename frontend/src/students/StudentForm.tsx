import { useRef, useState } from 'react'
import type { FocusEvent, FormEvent } from 'react'
import { useApiMutation } from '../lib/useApiRequest'
import { PendingLabel } from '../ui/forms'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { createStudent, fullName, updateStudentIdentity } from './api'
import type { Student, StudentDetail, StudentInput } from './api'
import { studentMessages } from './messages'

const emptyStudent = { enrollment_number: '', given_names: '', first_surname: '', second_surname: '' }
const ENROLLMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9./-]*$/
const ENROLLMENT_FORMAT = 'La matrícula solo admite letras, números, guion, punto y diagonal, sin espacios.'

type StudentFormProps =
  | { student?: undefined; onCreated: (student: Student) => void }
  | { student: StudentDetail; onUpdated: (student: StudentDetail) => void }

/**
 * Identidad interna del alumno. Sin `student`, da de alta y queda listo para capturar el siguiente
 * (HU-S2-02); con `student`, corrige su matrícula y nombre (HU-S2-03 CA-07).
 * La institución la asigna el servidor (HU-S2-02 CA-03); el formulario no la envía.
 */
export function StudentForm(props: StudentFormProps) {
  const editing = props.student
  const [values, setValues] = useState(() => editing
    ? {
        enrollment_number: editing.enrollment_number, given_names: editing.given_names,
        first_surname: editing.first_surname, second_surname: editing.second_surname ?? '',
      }
    : emptyStudent)
  const [localErrors, setLocalErrors] = useState<Record<string, string[]>>({})
  const [created, setCreated] = useState<Student | null>(null)
  const mutation = useApiMutation(studentMessages)
  const errors = { ...mutation.failure?.errors, ...localErrors }
  const enrollment = useRef<HTMLInputElement>(null)

  function set(field: keyof typeof emptyStudent, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function checkEnrollment(event: FocusEvent<HTMLInputElement>) {
    const value = event.currentTarget.value.trim()
    setLocalErrors((current) => {
      const next = { ...current }
      if (value && !ENROLLMENT_PATTERN.test(value)) next.enrollment_number = [ENROLLMENT_FORMAT]
      else if (current.enrollment_number?.[0] === ENROLLMENT_FORMAT) delete next.enrollment_number
      return next
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    setCreated(null)
    const input: StudentInput = {
      enrollment_number: values.enrollment_number.trim(),
      given_names: values.given_names.trim(),
      first_surname: values.first_surname.trim(),
      second_surname: values.second_surname.trim() || null,
    }
    const required: Record<string, string[]> = {}
    if (!input.enrollment_number) required.enrollment_number = ['La matrícula es obligatoria.']
    else if (input.enrollment_number.length > 30) required.enrollment_number = ['La matrícula no debe superar 30 caracteres.']
    else if (!ENROLLMENT_PATTERN.test(input.enrollment_number)) required.enrollment_number = [ENROLLMENT_FORMAT]
    if (!input.given_names) required.given_names = ['El nombre es obligatorio.']
    if (!input.first_surname) required.first_surname = ['El primer apellido es obligatorio.']
    setLocalErrors(required)
    if (Object.keys(required).length) return

    if (props.student) {
      const { id } = props.student
      await mutation.submit(() => updateStudentIdentity(id, input), props.onUpdated)
      return
    }
    const { onCreated } = props
    await mutation.submit(() => createStudent(input), (student) => {
      setCreated(student)
      setValues(emptyStudent)
      onCreated(student)
      enrollment.current?.focus()
    })
  }

  const describedBy = (field: string, extra?: string) =>
    [extra, errors[field]?.length ? `student-${field}-error` : undefined].filter(Boolean).join(' ') || undefined
  const fieldError = (field: string) => errors[field]?.length
    ? <p className="field-error" id={`student-${field}-error`}>{errors[field].join(' ')}</p> : null

  return (
    <section className="institution-account" aria-labelledby="student-form-title">
      <h3 id="student-form-title">{editing ? 'Corregir identidad' : 'Registrar alumno'}</h3>
      <p className="privacy-note" id="student-privacy">La matrícula y el nombre son de uso exclusivo de tu institución y no se mostrarán a las empresas.</p>
      {created && <p className="institution-success" role="status">
        Alumno registrado: {fullName(created)}. Puedes registrar el siguiente.
      </p>}
      {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
      <form onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
        <label htmlFor="student-enrollment_number">Matrícula o control interno</label>
        <input id="student-enrollment_number" ref={enrollment} name="enrollment_number" type="text" autoComplete="off" required maxLength={30}
          value={values.enrollment_number} disabled={mutation.pending} aria-invalid={Boolean(errors.enrollment_number?.length)}
          aria-describedby={describedBy('enrollment_number', 'student-privacy')}
          onBlur={checkEnrollment} onChange={(event) => set('enrollment_number', event.target.value)} />
        {fieldError('enrollment_number')}
        <label htmlFor="student-given_names">Nombre(s)</label>
        <input id="student-given_names" name="given_names" type="text" autoComplete="off" required maxLength={120}
          value={values.given_names} disabled={mutation.pending} aria-invalid={Boolean(errors.given_names?.length)}
          aria-describedby={describedBy('given_names')} onChange={(event) => set('given_names', event.target.value)} />
        {fieldError('given_names')}
        <label htmlFor="student-first_surname">Primer apellido</label>
        <input id="student-first_surname" name="first_surname" type="text" autoComplete="off" required maxLength={120}
          value={values.first_surname} disabled={mutation.pending} aria-invalid={Boolean(errors.first_surname?.length)}
          aria-describedby={describedBy('first_surname')} onChange={(event) => set('first_surname', event.target.value)} />
        {fieldError('first_surname')}
        <label htmlFor="student-second_surname">Segundo apellido (opcional)</label>
        <input id="student-second_surname" name="second_surname" type="text" autoComplete="off" maxLength={120}
          value={values.second_surname} disabled={mutation.pending} aria-invalid={Boolean(errors.second_surname?.length)}
          aria-describedby={describedBy('second_surname')} onChange={(event) => set('second_surname', event.target.value)} />
        {fieldError('second_surname')}
        <div className="actions">
          <button type="submit" disabled={mutation.pending}>
            {editing
              ? <PendingLabel pending={mutation.pending} label="Guardar identidad" pendingLabel="Guardando identidad…" />
              : <PendingLabel pending={mutation.pending} label="Registrar alumno" pendingLabel="Registrando alumno…" />}
          </button>
        </div>
      </form>
    </section>
  )
}
