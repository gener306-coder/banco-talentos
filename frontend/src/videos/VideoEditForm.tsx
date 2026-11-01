import { useState } from 'react'
import type { FormEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import { hasContactInformation } from '../students/cvCatalogs'
import { PendingLabel } from '../ui/forms'
import { updateVideo, VIDEO_CONTACT_MESSAGE, VIDEO_LIMITS, videoMessages } from './api'
import type { InstitutionVideo } from './api'

/** Corrige el título y la descripción de un video propio (HU-S9-02 CA-02), con las mismas reglas que la subida. */
export function VideoEditForm({ video, onSaved }: { video: InstitutionVideo; onSaved: (video: InstitutionVideo) => void }) {
  const [title, setTitle] = useState(video.title)
  const [description, setDescription] = useState(video.description ?? '')
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})
  const mutation = useApiMutation(videoMessages)
  const error = (field: string) => localErrors[field] ?? mutation.failure?.errors[field]?.join(' ')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    const input = { title: title.trim(), description: description.trim() }
    const found: Record<string, string> = {}
    if (!input.title) found.title = 'El título es obligatorio.'
    else if (hasContactInformation(input.title)) found.title = VIDEO_CONTACT_MESSAGE
    if (hasContactInformation(input.description)) found.description = VIDEO_CONTACT_MESSAGE
    setLocalErrors(found)
    if (Object.keys(found).length) return
    await mutation.submit(() => updateVideo(video.public_id, input), onSaved)
  }

  const describedBy = (field: string, hint?: string) =>
    [hint, error(field) ? `video-edit-${field}-error` : undefined].filter(Boolean).join(' ') || undefined
  const fieldError = (field: string) => error(field) ? <p className="field-error" id={`video-edit-${field}-error`}>{error(field)}</p> : null

  return (
    <section className="institution-account" aria-labelledby="video-edit-title">
      <h3 id="video-edit-title">Editar video</h3>
      {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
      <form onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
        <fieldset disabled={mutation.pending}>
          <legend className="visually-hidden">Textos del video</legend>
          <label htmlFor="video-edit-title-input">Título</label>
          <input id="video-edit-title-input" name="title" type="text" autoComplete="off" required maxLength={VIDEO_LIMITS.title}
            value={title} aria-invalid={Boolean(error('title'))} aria-describedby={describedBy('title')}
            onChange={(event) => { setTitle(event.target.value); setLocalErrors({}) }} />
          {fieldError('title')}
          <label htmlFor="video-edit-description">Descripción (opcional)</label>
          <textarea id="video-edit-description" name="description" rows={4} maxLength={VIDEO_LIMITS.description} value={description}
            aria-invalid={Boolean(error('description'))} aria-describedby={describedBy('description', 'video-edit-description-count')}
            onChange={(event) => { setDescription(event.target.value); setLocalErrors({}) }} />
          <p className="field-hint" id="video-edit-description-count">{description.length} de {VIDEO_LIMITS.description} caracteres · sin enlaces, correos ni teléfonos</p>
          {fieldError('description')}
        </fieldset>
        <div className="actions">
          <button type="submit" disabled={mutation.pending}>
            <PendingLabel pending={mutation.pending} label="Guardar cambios" pendingLabel="Guardando…" />
          </button>
        </div>
      </form>
    </section>
  )
}
