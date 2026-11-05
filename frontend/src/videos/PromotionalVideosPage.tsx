import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ChevronLeftIcon, ChevronRightIcon, VideoIcon } from '../ui/icons'
import { prefersReducedMotion } from '../ui/modal'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { deactivatePromotionalVideo, galleryMessages, listPromotionalVideos } from './galleryApi'
import type { PromotionalVideo, PromotionalVideoPage } from './galleryApi'
import { VideoPlayer } from './VideoPlayer'
import './videos.css'

/** Longitud a partir de la cual la descripción se recorta a 3 líneas con «Más». */
const LONG_DESCRIPTION = 180
const CONNECTORS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e'])

/** «UT» para «Universidad Tecnológica de Teoloyucan»: sin artículos ni preposiciones. */
function initials(name: string): string {
  const words = name.split(/\s+/).filter((word) => word && !CONNECTORS.has(word.toLowerCase()))
  return words.slice(0, 2).map((word) => word[0].toUpperCase()).join('')
}

/** Agrega una página al feed sin repetir: una historia nueva recorre las páginas siguientes. */
function merge(current: PromotionalVideo[], incoming: PromotionalVideo[]): PromotionalVideo[] {
  const updated = new Map(incoming.map((video) => [video.public_id, video]))
  const known = new Set(current.map((video) => video.public_id))
  return [...current.map((video) => updated.get(video.public_id) ?? video), ...incoming.filter((video) => !known.has(video.public_id))]
}

function Story({ story, muted, onMutedChange, onRetry, company, moderator, moderating, onDeactivate }: {
  story: PromotionalVideo
  muted: boolean
  onMutedChange: (muted: boolean) => void
  onRetry: () => void
  company: boolean
  moderator: boolean
  moderating: boolean
  onDeactivate: (button: HTMLButtonElement) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const long = (story.description?.length ?? 0) > LONG_DESCRIPTION
  const titleId = `story-${story.public_id}-title`

  return (
    <article id={`story-${story.public_id}`} className="story" aria-labelledby={titleId} tabIndex={-1}>
      <VideoPlayer src={story.video_url} poster={story.poster_url} label={`${story.title}, de ${story.institution.name}`}
        durationSeconds={story.duration_seconds} width={story.width} height={story.height}
        autoPlay muted={muted} onMutedChange={onMutedChange} onRetry={onRetry} />
      <div className="story-byline">
        <span className="story-avatar" aria-hidden="true">{initials(story.institution.name)}</span>
        <p className="story-institution">{story.institution.name}</p>
      </div>
      <div className="story-text">
        <h3 id={titleId}>{story.title}</h3>
        {story.description && <p className="story-description" data-clamped={long && !expanded}>{story.description}</p>}
        {long && !expanded && <button type="button" className="story-more" onClick={() => setExpanded(true)} aria-label={`Leer más de ${story.title}`}>Más</button>}
      </div>
      {(company || moderator) && (
        <div className="story-actions">
          {company && <Link className="pill-link" to="/talent">Buscar talento<ChevronRightIcon /></Link>}
          {moderator && (
            <button type="button" className="secondary" disabled={moderating} aria-label={`Inactivar ${story.title}`}
              onClick={(event) => onDeactivate(event.currentTarget)}>Inactivar</button>
          )}
        </div>
      )}
    </article>
  )
}

/**
 * Historias del Dual (HU-S9-03, HU-S9-04): feed de testimonios de alumnos que están o estuvieron en el programa dual.
 * El video visible arranca sin sonido y el feed carga más al acercarse al final. La empresa va de cada historia al
 * buscador; el Administrador puede inactivar una (moderación mínima). `?video=` coloca el feed en esa historia.
 */
export function PromotionalVideosPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const target = params.get('video')
  const [page, setPage] = useState(1)
  const load = useCallback((signal: AbortSignal) => listPromotionalVideos(page, signal), [page])
  const { data, loading, failure, refresh } = useApiRequest(load, galleryMessages)
  const [stories, setStories] = useState<PromotionalVideo[]>([])
  const [merged, setMerged] = useState<PromotionalVideoPage | null>(null)
  const [muted, setMuted] = useState(true)
  const [deactivating, setDeactivating] = useState<PromotionalVideo | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const moderation = useApiMutation(galleryMessages)
  const deactivateButton = useRef<HTMLButtonElement | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const placed = useRef(false)

  if (data && data !== merged) {
    setMerged(data)
    setStories((current) => merge(current, data.videos))
  }

  const hasMore = data !== null && data.page < data.lastPage
  const loadingMore = data !== null && data.page !== page
  const loadMore = useCallback(() => {
    setPage((current) => current + 1)
  }, [])

  // Carga continua al acercarse al final; el botón **Ver más historias** es la alternativa accesible.
  useEffect(() => {
    if (!hasMore || loadingMore || failure || typeof IntersectionObserver === 'undefined' || !sentinel.current) return
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) loadMore() }, { rootMargin: '400px' })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, failure, loadMore])

  // Enlace del inicio de la empresa: una sola vez, al tener la historia en el feed.
  useEffect(() => {
    if (!target || placed.current || !stories.some((story) => story.public_id === target)) return
    placed.current = true
    const element = document.getElementById(`story-${target}`)
    element?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    element?.focus({ preventScroll: true })
  }, [target, stories])

  /** Una URL firmada venció (1 a 2 h): se piden de nuevo las páginas ya cargadas para obtener URLs vigentes. */
  const renewUrls = useCallback(() => {
    void Promise.all(Array.from({ length: page }, (_, index) => listPromotionalVideos(index + 1)))
      .then((pages) => setStories((current) => merge(current, pages.flatMap((result) => result.videos))))
      .catch(() => { /* El reproductor conserva su botón de reintentar. */ })
  }, [page])

  async function deactivate(video: PromotionalVideo) {
    setDeactivating(null)
    setNotice(null)
    await moderation.submit(() => deactivatePromotionalVideo(video.public_id), () => {
      setStories((current) => current.filter((story) => story.public_id !== video.public_id))
      setNotice(`«${video.title}» se inactivó y ya no aparece en las historias. Solo ${video.institution.name} puede reactivarla.`)
    })
  }

  return (
    <section className="card" aria-labelledby="promotional-videos-title">
      <nav className="page-navigation" aria-label="Navegación de las historias">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
      </nav>
      <header className="story-header">
        <h2 id="promotional-videos-title">Historias del Dual</h2>
        <p>Alumnos que están o estuvieron en el programa dual cuentan cómo fue su experiencia en la empresa.</p>
      </header>
      {notice && <p className="institution-success" role="status">{notice}</p>}
      {moderation.failure && <InstitutionRequestError failure={moderation.failure} />}

      {loading && stories.length === 0 ? <LoadingState label="Cargando historias…" variant="details" />
        : failure && stories.length === 0 ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : stories.length === 0
          ? <StateMessage kind="empty" icon={<VideoIcon />} title="Aún no hay historias."
            description="Cuando las instituciones compartan testimonios de sus alumnos en el programa dual, aparecerán aquí." />
        : (
          <>
            <div className="story-feed" role="feed" aria-busy={loadingMore} aria-label="Historias del Dual">
              {stories.map((story) => (
                <Story key={story.public_id} story={story} muted={muted} onMutedChange={setMuted} onRetry={renewUrls}
                  company={user?.role === 'COMPANY'} moderator={user?.role === 'ADMIN'} moderating={moderation.pending}
                  onDeactivate={(button) => { deactivateButton.current = button; setDeactivating(story) }} />
              ))}
            </div>
            <div ref={sentinel} className="story-more-wrapper">
              {failure ? <InstitutionRequestError failure={failure} retry={refresh} />
                : hasMore && (
                  <button type="button" className="secondary" disabled={loadingMore} onClick={loadMore}>
                    {loadingMore ? 'Cargando historias…' : 'Ver más historias'}
                  </button>
                )}
            </div>
          </>
        )}

      <ConfirmDialog open={deactivating !== null} origin={deactivateButton}
        title="¿Inactivar la historia?"
        description="Dejará de mostrarse a las empresas. No se borra; la institución la verá inactiva y solo ella podrá reactivarla."
        confirmLabel="Inactivar" onConfirm={() => { if (deactivating) void deactivate(deactivating) }} onCancel={() => setDeactivating(null)} />
    </section>
  )
}
