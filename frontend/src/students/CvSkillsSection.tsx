import { useState } from 'react'
import type { FormEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import { updateSkills } from './cv'
import type { SkillInput, StudentCv } from './cv'
import { CONTACT_MESSAGE, CV_LIMITS } from './cvCatalogs'
import { SaveBar } from './CvShared'
import { studentMessages } from './messages'
import { SkillPicker } from './SkillPicker'

/** Habilidades del CV (HU-S3-01 CA-01): el selector compartido más el guardado de la sección. */
export function CvSkillsSection({ studentId, cv, onSaved }: { studentId: number; cv: StudentCv; onSaved: (cv: StudentCv) => void }) {
  const [skills, setSkills] = useState<SkillInput[]>(() => cv.public.skills.map(({ name, kind }) => ({ name, kind })))
  const [saved, setSaved] = useState(false)
  const mutation = useApiMutation(studentMessages)
  const serverErrors = Object.entries(mutation.failure?.errors ?? {}).filter(([key]) => key.startsWith('skills')).flatMap(([, messages]) => messages)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    setSaved(false)
    await mutation.submit(() => updateSkills(studentId, skills), (updated) => {
      setSkills(updated.public.skills.map(({ name, kind }) => ({ name, kind })))
      setSaved(true)
      onSaved(updated)
    })
  }

  return (
    <section className="student-section cv-section" aria-labelledby="cv-skills-title">
      <h3 id="cv-skills-title">Habilidades</h3>
      <p>Técnicas y blandas. Escribe para buscar en el catálogo compartido; si no existe, agrégala como nueva.</p>
      <form onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
        {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
        <SkillPicker idPrefix="cv" skills={skills} max={CV_LIMITS.skills} disabled={mutation.pending}
          serverError={serverErrors.length ? [...new Set(serverErrors)].join(' ') : null} contactMessage={CONTACT_MESSAGE}
          placeholder="Ej. React, Contabilidad de costos, Trabajo en equipo"
          onChange={(next) => { setSkills(next); setSaved(false) }} />
        <SaveBar pending={mutation.pending} saved={saved} label="Guardar habilidades" pendingLabel="Guardando habilidades…" savedLabel="Habilidades guardadas correctamente." />
      </form>
    </section>
  )
}
