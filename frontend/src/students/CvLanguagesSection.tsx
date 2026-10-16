import { useState } from 'react'
import type { FormEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import { CloseIcon, PlusIcon } from '../ui/icons'
import { updateLanguages } from './cv'
import type { StudentCv } from './cv'
import { CV_LANGUAGES, CV_LIMITS, itemErrors, LANGUAGE_LEVELS } from './cvCatalogs'
import { FieldError, SaveBar } from './CvShared'
import { studentMessages } from './messages'

type Row = { key: number; language_code: string; level: string }
let nextKey = 0

/** Idiomas con nivel MCER o Nativo (HU-S3-01 CA-01); el nivel es un entero para filtrar por rango (CA-03). */
export function CvLanguagesSection({ studentId, cv, onSaved }: { studentId: number; cv: StudentCv; onSaved: (cv: StudentCv) => void }) {
  const toRows = (source: StudentCv) => source.public.languages.map((item) => ({ key: nextKey++, language_code: item.language_code, level: String(item.level) }))
  const [rows, setRows] = useState<Row[]>(() => toRows(cv))
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const mutation = useApiMutation(studentMessages)

  function update(key: number, field: 'language_code' | 'level', value: string) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row))
    setLocalErrors({})
    setSaved(false)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    setSaved(false)
    const errors: Record<string, string> = {}
    const seen = new Set<string>()
    rows.forEach((row, index) => {
      if (!row.language_code) errors[`${index}.language_code`] = 'Selecciona el idioma.'
      else if (seen.has(row.language_code)) errors[`${index}.language_code`] = 'Este idioma ya está en la lista.'
      seen.add(row.language_code)
      if (!row.level) errors[`${index}.level`] = 'Selecciona el nivel.'
    })
    setLocalErrors(errors)
    if (Object.keys(errors).length) return
    await mutation.submit(() => updateLanguages(studentId, rows.map((row) => ({ language_code: row.language_code, level: Number(row.level) }))), (updated) => {
      setRows(toRows(updated))
      setSaved(true)
      onSaved(updated)
    })
  }

  const errorFor = (index: number, field: string) => {
    const local = localErrors[`${index}.${field}`]
    return local ? [local] : itemErrors(mutation.failure?.errors, 'languages', index, field)
  }

  return (
    <section className="student-section cv-section" aria-labelledby="cv-languages-title">
      <h3 id="cv-languages-title">Idiomas</h3>
      <p>Nivel según el Marco Común Europeo (A1 a C2) o Nativo.</p>
      <form onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
        {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
        {rows.length === 0 && <p className="notice-muted">Aún no hay idiomas.</p>}
        <fieldset className="cv-rows" disabled={mutation.pending}>
          <legend className="visually-hidden">Idiomas</legend>
          {rows.map((row, index) => {
            const name = CV_LANGUAGES.find((language) => language.code === row.language_code)?.name ?? `idioma ${index + 1}`
            const codeError = errorFor(index, 'language_code')
            const levelError = errorFor(index, 'level')
            return (
              <div key={row.key} className="cv-row">
                <div>
                  <label htmlFor={`cv-language-${row.key}`}>Idioma {index + 1}</label>
                  <select id={`cv-language-${row.key}`} value={row.language_code} aria-invalid={Boolean(codeError)}
                    aria-describedby={codeError ? `cv-language-${row.key}-error` : undefined}
                    onChange={(event) => update(row.key, 'language_code', event.target.value)}>
                    <option value="">Selecciona…</option>
                    {CV_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}
                  </select>
                  <FieldError id={`cv-language-${row.key}-error`} messages={codeError} />
                </div>
                <div>
                  <label htmlFor={`cv-level-${row.key}`}>Nivel de {name}</label>
                  <select id={`cv-level-${row.key}`} value={row.level} aria-invalid={Boolean(levelError)}
                    aria-describedby={levelError ? `cv-level-${row.key}-error` : undefined}
                    onChange={(event) => update(row.key, 'level', event.target.value)}>
                    <option value="">Selecciona…</option>
                    {LANGUAGE_LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                  </select>
                  <FieldError id={`cv-level-${row.key}-error`} messages={levelError} />
                </div>
                <button type="button" className="plain row-remove" aria-label={`Quitar ${name}`}
                  onClick={() => { setRows(rows.filter((item) => item.key !== row.key)); setLocalErrors({}); setSaved(false) }}>
                  <CloseIcon />
                </button>
              </div>
            )
          })}
        </fieldset>
        <FieldError id="cv-languages-error" messages={mutation.failure?.errors.languages} />
        <button type="button" className="secondary" disabled={mutation.pending || rows.length >= CV_LIMITS.languages}
          onClick={() => { setRows([...rows, { key: nextKey++, language_code: '', level: '' }]); setSaved(false) }}>
          <PlusIcon />Agregar idioma
        </button>
        <SaveBar pending={mutation.pending} saved={saved} label="Guardar idiomas" pendingLabel="Guardando idiomas…" savedLabel="Idiomas guardados correctamente." />
      </form>
    </section>
  )
}
