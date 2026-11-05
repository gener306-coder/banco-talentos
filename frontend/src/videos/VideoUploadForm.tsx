import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import { hasContactInformation } from '../students/cvCatalogs'
import { PendingLabel } from '../ui/forms'
import { isVideoFile, MAX_VIDEO_BYTES, uploadVideo, VIDEO_CONTACT_MESSAGE, VIDEO_LIMITS, videoMessages } from './api'
import type { InstitutionVideo } from './api'
import { VideoDropzone } from './VideoDropzone'
import './videos.css'

const emptyValues = { title: '', description: '' }
const TOO_LONG = 'El video dura más de 5 minutos. Recórtalo y vuelve a subirlo.'

/** Copia de los errores sin el del campo indicado. */
function without(errors: Record<string, string>, field: string): Record<string, string> {
  const rest = { ...errors }
  delete rest[field]
  return rest
}

/** Igual que App\Support\Video\VideoProcessor::MAX_SECONDS, que sigue siendo quien decide. */
const MAX_VIDEO_SECONDS = 300

/** Avance anunciado a lectores de pantalla solo cada 25 %, para no saturarlos durante una subida de minutos. */
const announced = (fraction: number) => Math.floor(fraction * 4) * 25

/**
 * Subida de una historia (HU-S9-01 CA-07, HU-S9-07): el video con su vista previa local a un lado, título y descripción
 * al otro, y debajo el consentimiento, el progreso y la opción de cancelar. Al recibirlo, el servidor lo deja
 * «Procesando…» y lo procesa en segundo plano.
 */
export function VideoUploadForm({ open, onUploaded }: { open: boolean; onUploaded: (video: InstitutionVideo) => void }) {
  const [values, setValues] = useState(emptyValues)
  const [consent, setConsent] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<number | null>(null)
  const [cancelled, setCancelled] = useState(false)
  // Cambiar la key vacía el selector de archivo tras una subida.
  const [inputKey, setInputKey] = useState(0)
  const controller = useRef<AbortController | null>(null)
  const mutation = useApiMutation(videoMessages)
  const serverErrors = cancelled ? {} : mutation.failure?.errors ?? {}
  const error = (field: string) => localErrors[field] ?? serverErrors[field]?.join(' ')
  const failure = !cancelled && mutation.failure && mutation.failure.status !== 422 ? mutation.failure : null

  function set(field: keyof typeof emptyValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setLocalErrors((current) => without(current, field))
  }

  function choose(selected: File | null) {
    setFile(selected)
    setLocalErrors((current) => {
      const rest = without(current, 'video')
      const message = selected === null ? null
        : !isVideoFile(selected) ? 'El video debe ser MP4, MOV o WebM.'
        : selected.size > MAX_VIDEO_BYTES ? 'El video no debe superar 250 MB.'
        : null
      return message ? { ...rest, video: message } : rest
    })
  }

  function validate(): Record<string, string> {
    const found: Record<string, string> = {}
    const title = values.title.trim()
    if (!file) found.video = 'Selecciona el video.'
    else if (localErrors.video) found.video = localErrors.video
    if (!title) found.title = 'El título es obligatorio.'
    else if (hasContactInformation(title)) found.title = VIDEO_CONTACT_MESSAGE
    if (hasContactInformation(values.description)) found.description = VIDEO_CONTACT_MESSAGE
    if (!consent) found.consent = 'Confirma que cuentas con la autorización de las personas y empresas que aparecen o se mencionan en el video.'
    return found
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    const found = validate()
    setLocalErrors(found)
    if (Object.keys(found).length || !file) return

    setCancelled(false)
    setProgress(0)
    controller.current = new AbortController()
    const input = { title: values.title.trim(), description: values.description.trim(), consent, file }
    await mutation.submit(() => uploadVideo(input, setProgress, controller.current?.signal), (video) => {
      setValues(emptyValues)
      setConsent(false)
      setFile(null)
      setInputKey((key) => key + 1)
      onUploaded(video)
    })
    controller.current = null
    setProgress(null)
  }

  function cancel() {
    setCancelled(true)
    controller.current?.abort()
  }

  const describedBy = (field: string, hint?: string) =>
    [hint, error(field) ? `video-${field}-error` : undefined].filter(Boolean).join(' ') || undefined
  const fieldError = (field: string) => error(field) ? <p className="field-error" id={`video-${field}-error`}>{error(field)}</p> : null
  const percent = progress === null ? 0 : Math.round(progress * 100)

  return (
    <section className="institution-account video-form" aria-labelledby="video-form-title">
      <header className="video-form-header">
        <h3 id="video-form-title">Subir una historia</h3>
        <p className="privacy-note" id="video-privacy">Comparte la experiencia de tus alumnos en el programa dual. La verán las empresas, la Secretaría y el Administrador con sesión, y se publica en cuanto termina de procesarse.</p>
      </header>
      {failure && <InstitutionRequestError failure={failure} />}
      {cancelled && !mutation.pending && <p className="notice" role="status">Subida cancelada. Tus datos se conservaron.</p>}
      <form onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
        <div className="video-form-grid">
          <div className="video-form-media">
            <VideoDropzone file={file} resetKey={inputKey} disabled={mutation.pending} invalid={Boolean(error('video'))}
              describedBy={error('video') ? 'video-video-error' : undefined} showPreview={open} onChoose={choose}
              onDuration={(seconds) => { if (seconds > MAX_VIDEO_SECONDS) setLocalErrors((current) => ({ ...current, video: TOO_LONG })) }} />
            {fieldError('video')}
          </div>
          <fieldset disabled={mutation.pending}>
            <legend className="visually-hidden">Datos del video</legend>
            <label htmlFor="video-title">Título</label>
            <input id="video-title" name="title" type="text" autoComplete="off" required maxLength={VIDEO_LIMITS.title}
              placeholder="Ej. Mi experiencia en manufactura" value={values.title} aria-invalid={Boolean(error('title'))}
              aria-describedby={describedBy('title', 'video-title-count')} onChange={(event) => set('title', event.target.value)} />
            <p className="field-hint" id="video-title-count">{values.title.length} de {VIDEO_LIMITS.title} caracteres</p>
            {fieldError('title')}

            <label htmlFor="video-description">Descripción (opcional)</label>
            <textarea id="video-description" name="description" rows={5} maxLength={VIDEO_LIMITS.description} value={values.description}
              placeholder="Cuenta en pocas líneas de qué trata esta historia."
              aria-invalid={Boolean(error('description'))} aria-describedby={describedBy('description', 'video-description-count')}
              onChange={(event) => set('description', event.target.value)} />
            <p className="field-hint" id="video-description-count">{values.description.length} de {VIDEO_LIMITS.description} caracteres · sin enlaces, correos ni teléfonos</p>
            {fieldError('description')}
          </fieldset>
        </div>

        <label className="video-consent" data-invalid={Boolean(error('consent'))}>
          <input id="video-consent" name="consent" type="checkbox" checked={consent} disabled={mutation.pending} aria-invalid={Boolean(error('consent'))}
            aria-describedby={describedBy('consent')}
            onChange={(event) => { setConsent(event.target.checked); setLocalErrors((current) => without(current, 'consent')) }} />
          <span>Confirmo que cuento con la autorización de las personas y empresas que aparecen o se mencionan en el video.</span>
        </label>
        {fieldError('consent')}

        {progress !== null && (
          <div className="video-upload-progress">
            <label htmlFor="video-upload-progress">Subiendo video: {percent} %</label>
            <progress id="video-upload-progress" max={100} value={percent} />
            <p className="visually-hidden" role="status">{progress >= 1 ? 'Video enviado. Guardando…' : `Subiendo video: ${announced(progress)} %`}</p>
          </div>
        )}

        <div className="actions video-form-actions">
          {mutation.pending && <button type="button" className="secondary" onClick={cancel}>Cancelar subida</button>}
          <button type="submit" disabled={mutation.pending}>
            <PendingLabel pending={mutation.pending} label="Subir historia" pendingLabel="Subiendo historia…" />
          </button>
        </div>
      </form>
    </section>
  )
}
