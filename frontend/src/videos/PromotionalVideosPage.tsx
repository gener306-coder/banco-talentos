import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ChevronLeftIcon, ChevronRightIcon, VideoIcon } from '../ui/icons'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { duration } from './api'
import { deactivatePromotionalVideo, galleryMessages, listPromotionalVideos } from './galleryApi'
import type { PromotionalVideo } from './galleryApi'
import './videos.css'

/**
 * Galería de promoción dual (HU-S9-03): videos listos de las instituciones activas, con reproductor que no descarga
 * nada hasta reproducirse (`preload="none"`). El Administrador puede inactivar un video (moderación mínima, CA-05).
 */
export function PromotionalVideosPage() {
  const { user } = useAuth()
  const moderator = user?.role === 'ADMIN'
  const [page, setPage] = useState(1)
  const load = useCallback((signal: AbortSignal) => listPromotionalVideos(page, signal), [page])
  const { data, loading, failure, refresh } = useApiRequest(load, galleryMessages)
  const [deactivating, setDeactivating] = useState<PromotionalVideo | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const moderation = useApiMutation(galleryMessages)
  const deactivateButton = useRef<HTMLButtonElement | null>(null)

  async function deactivate(video: PromotionalVideo) {
    setDeactivating(null)
    setNotice(null)
    await moderation.submit(() => deactivatePromotionalVideo(video.public_id), () => {
      setNotice(`«${video.title}» se inactivó y ya no aparece en la galería. Solo ${video.institution.name} puede reactivarlo.`)
      void refresh()
    })
  }

  return (
    <section className="card" aria-labelledby="promotional-videos-title">
      <nav className="page-navigation" aria-label="Navegación de la galería">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
      </nav>
      <h2 id="promotional-videos-title">Promoción dual</h2>
      <p>Conoce las instalaciones, talleres y proyectos de las instituciones del programa de Educación Dual.</p>
      {notice && <p className="institution-success" role="status">{notice}</p>}
      {moderation.failure && <InstitutionRequestError failure={moderation.failure} />}

      {loading ? <LoadingState label="Cargando videos…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.total === 0
          ? <StateMessage kind="empty" icon={<VideoIcon />} title="Aún no hay videos promocionales."
            description="Cuando las instituciones publiquen videos de su programa dual, aparecerán aquí." />
        : data && (
          <>
            <ul className="video-grid" aria-label="Videos promocionales">
              {data.videos.map((video) => (
                <li key={video.public_id} className="video-card">
                  {/* CA-04: póster visible y nada se descarga hasta reproducir. */}
                  <video className="video-inline" controls preload="none" playsInline poster={video.poster_url} src={video.video_url}
                    aria-label={`Video: ${video.title}, de ${video.institution.name}`} />
                  <div className="video-card-body">
                    <h3>{video.title}</h3>
                    <p className="video-meta">{video.institution.name} · {duration(video.duration_seconds)}</p>
                    {video.description && <p>{video.description}</p>}
                    {moderator && (
                      <div className="actions">
                        <button type="button" className="secondary" disabled={moderation.pending} aria-label={`Inactivar ${video.title}`}
                          onClick={(event) => { deactivateButton.current = event.currentTarget; setDeactivating(video) }}>Inactivar</button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="pager">
              <p>Página {data.page} de {data.lastPage} · {data.total} {data.total === 1 ? 'video' : 'videos'}</p>
              {data.lastPage > 1 && (
                <div className="actions">
                  <button type="button" className="secondary" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>
                    <ChevronLeftIcon />Anterior
                  </button>
                  <button type="button" className="secondary" disabled={data.page >= data.lastPage} onClick={() => setPage(data.page + 1)}>
                    Siguiente<ChevronRightIcon />
                  </button>
                </div>
              )}
            </div>
          </>
        )}

      <ConfirmDialog open={deactivating !== null} origin={deactivateButton}
        title="¿Inactivar el video?"
        description="Dejará de mostrarse en la galería. No se borra; la institución lo verá inactivo y solo ella podrá reactivarlo."
        confirmLabel="Inactivar" onConfirm={() => { if (deactivating) void deactivate(deactivating) }} onCancel={() => setDeactivating(null)} />
    </section>
  )
}
