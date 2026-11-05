import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ChevronLeftIcon, PlusIcon, VideoIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { duration, listVideos, updateVideoStatus, videoMessages } from './api'
import type { InstitutionVideo, VideoStatus } from './api'
import { VideoEditForm } from './VideoEditForm'
import { VideoPlayer } from './VideoPlayer'
import { VideoUploadForm } from './VideoUploadForm'
import './videos.css'

/** Intervalo de consulta mientras algún video se procesa (HU-S9-02 CA-05). */
export const POLL_INTERVAL_MS = 5000

const statusLabels: Record<VideoStatus, string> = { PROCESSING: 'Procesando…', READY: 'Publicado', FAILED: 'No se pudo procesar' }
const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })

function VideoStatusBadge({ video }: { video: InstitutionVideo }) {
  if (!video.is_active) return <span className="video-status inactive">Inactivo</span>
  return <span className={`video-status ${video.status.toLowerCase()}`}>{statusLabels[video.status]}</span>
}

/**
 * Historias del Dual de la institución (HU-S9-01, HU-S9-02): subida, estado en vivo mientras se procesan, vista
 * previa, edición de textos y baja lógica con confirmación.
 */
export function InstitutionVideosPage() {
  const { data, loading, failure, refresh, setData } = useApiRequest(listVideos, videoMessages)
  const [uploading, setUploading] = useState(false)
  const [received, setReceived] = useState<InstitutionVideo | null>(null)
  const [editing, setEditing] = useState<InstitutionVideo | null>(null)
  const [watching, setWatching] = useState<InstitutionVideo | null>(null)
  const [deactivating, setDeactivating] = useState<InstitutionVideo | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const status = useApiMutation(videoMessages)
  const statusButton = useRef<HTMLButtonElement | null>(null)
  const closeUpload = useCallback(() => setUploading(false), [])
  const closeEdit = useCallback(() => setEditing(null), [])
  const closeWatch = useCallback(() => setWatching(null), [])
  const processing = data?.some((video) => video.status === 'PROCESSING') ?? false

  // CA-05: consulta en silencio (sin esqueleto) solo mientras haya videos en proceso.
  useEffect(() => {
    if (!processing) return
    const controller = new AbortController()
    const timer = setInterval(() => {
      listVideos(controller.signal).then(setData).catch(() => { /* El siguiente intento lo reintenta. */ })
    }, POLL_INTERVAL_MS)
    return () => { clearInterval(timer); controller.abort() }
  }, [processing, setData])

  const replace = (updated: InstitutionVideo) =>
    setData((current) => current?.map((video) => video.public_id === updated.public_id ? updated : video) ?? current)

  async function changeStatus(video: InstitutionVideo, active: boolean) {
    setDeactivating(null)
    setNotice(null)
    await status.submit(() => updateVideoStatus(video.public_id, active), (updated) => {
      replace(updated)
      setNotice(active ? `«${updated.title}» está activo de nuevo.` : `«${updated.title}» se inactivó; ya no lo verán las empresas.`)
    })
  }

  const uploadButton = (label: string) => <button type="button" onClick={() => setUploading(true)}><PlusIcon />{label}</button>
  const statusFailure = status.failure && (status.failure.errors.is_active?.join(' ') ?? status.failure.message)

  return (
    <section className="card" aria-labelledby="institution-videos-title">
      <nav className="page-navigation" aria-label="Navegación de videos">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
      </nav>
      <h2 id="institution-videos-title">Historias del Dual</h2>
      <div className="page-toolbar">
        <p>Comparte con las empresas la experiencia de tus alumnos en el programa dual. Puedes tener hasta 5 videos activos de máximo 5 minutos cada uno.</p>
        {uploadButton('Subir video')}
      </div>
      {received && (
        <p className="institution-success" role="status">
          Recibimos «{received.title}». Procesando… Lo optimizamos para que se reproduzca rápido; puede tardar unos minutos.
        </p>
      )}
      {notice && <p className="institution-success" role="status">{notice}</p>}
      {statusFailure && <p className="notice" role="alert">{statusFailure}</p>}

      {loading ? <LoadingState label="Cargando videos…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.length === 0
          ? <StateMessage kind="empty" icon={<VideoIcon />} title="Aún no hay historias."
            description="Sube el testimonio de un alumno en el programa dual; lo optimizamos y lo publicamos para las empresas."
            action={uploadButton('Subir el primer video')} />
        : data && (
          <ul className="video-grid" aria-label="Tus videos">
            {data.map((video) => (
              <li key={video.public_id} className="video-card">
                <div className="video-poster">
                  {video.poster_url
                    ? <img src={video.poster_url} alt="" loading="lazy" />
                    : <span aria-hidden="true"><VideoIcon /></span>}
                  {video.duration_seconds !== null && <span className="video-duration">{duration(video.duration_seconds)}</span>}
                </div>
                <div className="video-card-body">
                  <h3>{video.title}</h3>
                  <VideoStatusBadge video={video} />
                  <p className="video-meta">
                    Subido el {dateFormat.format(new Date(video.created_at))}
                  </p>
                  {video.status === 'FAILED' && video.failure_reason && <p className="notice-muted">{video.failure_reason}</p>}
                  <div className="actions">
                    {video.status === 'READY' && video.video_url && (
                      <button type="button" className="secondary" onClick={() => setWatching(video)} aria-label={`Ver ${video.title}`}>Ver</button>
                    )}
                    <button type="button" className="secondary" onClick={() => setEditing(video)} aria-label={`Editar ${video.title}`}>Editar</button>
                    {video.is_active
                      ? (
                        <button type="button" className="secondary" disabled={status.pending} aria-label={`Inactivar ${video.title}`}
                          onClick={(event) => { statusButton.current = event.currentTarget; setDeactivating(video) }}>Inactivar</button>
                      )
                      : (
                        <button type="button" className="secondary" disabled={status.pending} aria-label={`Activar ${video.title}`}
                          onClick={() => { void changeStatus(video, true) }}>Activar</button>
                      )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

      <Sheet open={uploading} onClose={closeUpload} labelledBy="video-form-title" large>
        <VideoUploadForm open={uploading} onUploaded={(video) => { setReceived(video); setUploading(false); setData((current) => [video, ...(current ?? [])]) }} />
      </Sheet>
      <Sheet open={editing !== null} onClose={closeEdit} labelledBy="video-edit-title">
        {editing && <VideoEditForm key={editing.public_id} video={editing} onSaved={(video) => { replace(video); setEditing(null); setNotice('Cambios guardados.') }} />}
      </Sheet>
      <Sheet open={watching !== null} onClose={closeWatch} labelledBy="video-watch-title">
        {watching && (
          <section className="institution-account" aria-labelledby="video-watch-title">
            <h3 id="video-watch-title">{watching.title}</h3>
            {/* key: al cambiar de video se monta un reproductor nuevo y se detiene el anterior. */}
            {watching.video_url && (
              <VideoPlayer key={watching.public_id} src={watching.video_url} poster={watching.poster_url} label={watching.title}
                durationSeconds={watching.duration_seconds} width={watching.width} height={watching.height} />
            )}
            {watching.description && <p>{watching.description}</p>}
          </section>
        )}
      </Sheet>
      <ConfirmDialog open={deactivating !== null} origin={statusButton}
        title="¿Inactivar el video?"
        description="Dejará de mostrarse a las empresas. No se borra y podrás activarlo después, si tu institución tiene menos de 5 videos activos."
        confirmLabel="Inactivar" onConfirm={() => { if (deactivating) void changeStatus(deactivating, false) }} onCancel={() => setDeactivating(null)} />
    </section>
  )
}
