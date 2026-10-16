import { useCallback, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { PendingLabel } from '../ui/forms'
import { PlusIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { updateProjects } from './cv'
import type { CvProject, ProjectInput, StudentCv } from './cv'
import { CONTACT_MESSAGE, CV_LIMITS, displayName, hasContactInformation } from './cvCatalogs'
import { FieldError } from './CvShared'
import { studentMessages } from './messages'

const FIRST_YEAR = 1950
const DESCRIPTION_MAX = 1000
type Field = 'title' | 'description' | 'role' | 'year'

const toInput = ({ title, description, role, year }: CvProject): ProjectInput => ({ title, description, role, year })

function ProjectForm({ initial, pending, serverErrors, onSubmit }: {
  initial: CvProject | null
  pending: boolean
  serverErrors: Partial<Record<Field, string[]>>
  onSubmit: (value: ProjectInput) => void
}) {
  const [values, setValues] = useState({
    title: initial?.title ?? '', description: initial?.description ?? '', role: initial?.role ?? '', year: initial?.year ? String(initial.year) : '',
  })
  const [localErrors, setLocalErrors] = useState<Partial<Record<Field, string>>>({})
  const currentYear = new Date().getFullYear()
  const errorFor = (field: Field) => localErrors[field] ?? serverErrors[field]?.join(' ')

  function set(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setLocalErrors((current) => ({ ...current, [field]: undefined }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const title = displayName(values.title)
    const description = values.description.trim()
    const role = displayName(values.role)
    const year = values.year ? Number(values.year) : null
    const errors: Partial<Record<Field, string>> = {}
    if (!title) errors.title = 'Escribe el nombre del proyecto.'
    else if (hasContactInformation(title)) errors.title = CONTACT_MESSAGE
    if (!description) errors.description = 'Describe el proyecto.'
    else if (description.length > DESCRIPTION_MAX) errors.description = `La descripción no debe superar ${DESCRIPTION_MAX} caracteres.`
    else if (hasContactInformation(description)) errors.description = CONTACT_MESSAGE
    if (role && hasContactInformation(role)) errors.role = CONTACT_MESSAGE
    if (year !== null && (!Number.isInteger(year) || year < FIRST_YEAR || year > currentYear)) errors.year = `El año debe estar entre ${FIRST_YEAR} y el año actual.`
    setLocalErrors(errors)
    if (Object.keys(errors).length) return
    onSubmit({ title, description, role: role || null, year })
  }

  const describedBy = (field: Field, extra?: string) => [extra, errorFor(field) ? `cv-project-${field}-error` : null].filter(Boolean).join(' ') || undefined

  return (
    <form onSubmit={submit} aria-busy={pending} noValidate>
      <h2 id="cv-project-form-title">{initial ? 'Editar proyecto' : 'Agregar proyecto'}</h2>
      <p className="privacy-note">Sin enlaces ni datos de contacto: el repositorio o el sitio del proyecto van en «Enlaces externos», que es protegido.</p>
      <fieldset disabled={pending}>
        <legend className="visually-hidden">Datos del proyecto</legend>
        <label htmlFor="cv-project-title">Nombre del proyecto</label>
        <input id="cv-project-title" type="text" autoComplete="off" maxLength={120} value={values.title}
          aria-invalid={Boolean(errorFor('title'))} aria-describedby={describedBy('title')} onChange={(event) => set('title', event.target.value)} />
        <FieldError id="cv-project-title-error" messages={errorFor('title')} />
        <label htmlFor="cv-project-description">Descripción</label>
        <textarea id="cv-project-description" rows={5} maxLength={DESCRIPTION_MAX} value={values.description}
          aria-invalid={Boolean(errorFor('description'))} aria-describedby={describedBy('description', 'cv-project-description-count')}
          onChange={(event) => set('description', event.target.value)} />
        <p className="field-hint" id="cv-project-description-count">{values.description.length} de {DESCRIPTION_MAX} caracteres</p>
        <FieldError id="cv-project-description-error" messages={errorFor('description')} />
        <div className="field-row">
          <div>
            <label htmlFor="cv-project-role">Rol (opcional)</label>
            <input id="cv-project-role" type="text" autoComplete="off" maxLength={80} value={values.role}
              aria-invalid={Boolean(errorFor('role'))} aria-describedby={describedBy('role')} onChange={(event) => set('role', event.target.value)} />
            <FieldError id="cv-project-role-error" messages={errorFor('role')} />
          </div>
          <div>
            <label htmlFor="cv-project-year">Año (opcional)</label>
            <input id="cv-project-year" type="number" inputMode="numeric" min={FIRST_YEAR} max={currentYear} value={values.year}
              aria-invalid={Boolean(errorFor('year'))} aria-describedby={describedBy('year')} onChange={(event) => set('year', event.target.value)} />
            <FieldError id="cv-project-year-error" messages={errorFor('year')} />
          </div>
        </div>
      </fieldset>
      <div className="actions">
        <button type="submit" disabled={pending}>
          <PendingLabel pending={pending} label={initial ? 'Guardar proyecto' : 'Agregar proyecto'} pendingLabel="Guardando proyecto…" />
        </button>
      </div>
    </form>
  )
}

/** Proyectos del CV (HU-S3-01 CA-01), editados en una hoja. */
export function CvProjectsSection({ studentId, cv, onSaved }: { studentId: number; cv: StudentCv; onSaved: (cv: StudentCv) => void }) {
  const { projects } = cv.public
  const save = useApiMutation(studentMessages)
  const [target, setTarget] = useState<CvProject | 'new'>('new')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [openings, setOpenings] = useState(0)
  const [removing, setRemoving] = useState<CvProject | null>(null)
  const removeButton = useRef<HTMLButtonElement | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheetOpen(false), [])
  const editingIndex = target === 'new' ? projects.length : projects.findIndex((item) => item.id === target.id)
  const sheetErrors = Object.fromEntries(Object.entries(save.failure?.errors ?? {})
    .filter(([key]) => key.startsWith(`projects.${editingIndex}.`))
    .map(([key, messages]) => [key.split('.')[2], messages]))

  function open(next: CvProject | 'new') {
    setNotice(null)
    setOpenings((count) => count + 1)
    setTarget(next)
    setSheetOpen(true)
  }

  async function persist(next: ProjectInput[], message: string, onDone?: () => void) {
    setNotice(null)
    await save.submit(() => updateProjects(studentId, next), (updated) => {
      onSaved(updated)
      setNotice(message)
      onDone?.()
    })
  }

  function submitForm(value: ProjectInput) {
    const next = target === 'new' ? [...projects.map(toInput), value] : projects.map((item) => item.id === target.id ? value : toInput(item))
    void persist(next, target === 'new' ? 'Proyecto agregado correctamente.' : 'Proyecto guardado correctamente.', () => setSheetOpen(false))
  }

  return (
    <section className="student-section cv-section" aria-labelledby="cv-projects-title">
      <h3 id="cv-projects-title">Proyectos</h3>
      <p>Trabajos escolares, prácticas o proyectos personales, de cualquier disciplina.</p>
      {save.failure && save.failure.status !== 422 && <InstitutionRequestError failure={save.failure} />}
      {projects.length === 0
        ? <p className="notice-muted">Aún no hay proyectos.</p>
        : (
          <ul className="cv-cards" aria-label="Proyectos registrados">
            {projects.map((project) => (
              <li key={project.id} className="cv-card">
                <p className="cv-card-title">{project.title}</p>
                {(project.role || project.year) && <p className="cv-card-meta">{[project.role, project.year].filter(Boolean).join(' · ')}</p>}
                <p className="cv-card-description">{project.description}</p>
                <div className="actions">
                  <button type="button" className="secondary" disabled={save.pending} aria-label={`Editar ${project.title}`} onClick={() => open(project)}>Editar</button>
                  <button type="button" className="plain" disabled={save.pending} aria-label={`Eliminar ${project.title}`}
                    onClick={(event) => { removeButton.current = event.currentTarget; setRemoving(project) }}>Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      {notice && <p className="institution-success" role="status">{notice}</p>}
      <div className="actions">
        <button type="button" className="secondary" disabled={save.pending || projects.length >= CV_LIMITS.projects}
          onClick={() => open('new')}><PlusIcon />Agregar proyecto</button>
      </div>

      <Sheet open={sheetOpen} onClose={close} labelledBy="cv-project-form-title">
        <ProjectForm key={openings} pending={save.pending} serverErrors={sheetOpen ? sheetErrors : {}}
          initial={target === 'new' ? null : target} onSubmit={submitForm} />
      </Sheet>
      <ConfirmDialog open={removing !== null} origin={removeButton}
        title="¿Eliminar el proyecto?"
        description={removing ? `«${removing.title}» se eliminará del CV.` : ''}
        confirmLabel="Eliminar"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const removed = removing
          setRemoving(null)
          if (removed) void persist(projects.filter((item) => item.id !== removed.id).map(toInput), 'Proyecto eliminado.')
        }} />
    </section>
  )
}
