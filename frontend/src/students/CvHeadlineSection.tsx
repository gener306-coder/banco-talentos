import { useState } from 'react'
import type { FormEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import { updateHeadline } from './cv'
import type { StudentCv } from './cv'
import { CONTACT_MESSAGE, displayName, hasContactInformation } from './cvCatalogs'
import { FieldError, SaveBar } from './CvShared'
import { studentMessages } from './messages'

const MAX = 120

export function CvHeadlineSection({ studentId, cv, onSaved }: { studentId: number; cv: StudentCv; onSaved: (cv: StudentCv) => void }) {
  const [value, setValue] = useState(cv.public.headline ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const mutation = useApiMutation(studentMessages)
  const error = localError ?? mutation.failure?.errors.headline?.join(' ') ?? null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    setSaved(false)
    const headline = displayName(value)
    const message = headline.length > MAX ? `El titular profesional no debe superar ${MAX} caracteres.`
      : hasContactInformation(headline) ? CONTACT_MESSAGE : null
    setLocalError(message)
    if (message) return
    await mutation.submit(() => updateHeadline(studentId, headline || null), (updated) => {
      setValue(updated.public.headline ?? '')
      setSaved(true)
      onSaved(updated)
    })
  }

  return (
    <section className="student-section cv-section" aria-labelledby="cv-headline-title">
      <h3 id="cv-headline-title">Titular profesional</h3>
      <p>Una línea que resuma el perfil, en cualquier disciplina: «Desarrolladora Backend Junior», «Auxiliar Contable» o «Enfermero General».</p>
      <form onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
        {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
        <label htmlFor="cv-headline">Titular</label>
        <input id="cv-headline" name="headline" type="text" autoComplete="off" maxLength={MAX} disabled={mutation.pending}
          value={value} aria-invalid={Boolean(error)}
          aria-describedby={error ? 'cv-headline-count cv-headline-error' : 'cv-headline-count'}
          onChange={(event) => { setValue(event.target.value); setLocalError(null); setSaved(false) }} />
        <p className="field-hint" id="cv-headline-count">{value.length} de {MAX} caracteres</p>
        <FieldError id="cv-headline-error" messages={error} />
        <SaveBar pending={mutation.pending} saved={saved} label="Guardar titular" pendingLabel="Guardando titular…" savedLabel="Titular guardado correctamente." />
      </form>
    </section>
  )
}
