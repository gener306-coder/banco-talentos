import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, ShuffleIcon, VideoIcon } from '../ui/icons'
import { prefersReducedMotion } from '../ui/modal'
import { StateMessage } from '../ui/StateMessage'
import { deactivatePromotionalVideo, galleryMessages, listPromotionalVideos, randomSeed } from './galleryApi'
import type { PromotionalVideo, PromotionalVideoPage, StoryOrder } from './galleryApi'
import { StorySkeleton } from './StorySkeleton'
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

function Story({ story, enter, muted, onMutedChange, onRetry, company, moderator, moderating, onDeactivate }: {
  story: PromotionalVideo
  /** Retraso de entrada en ms (T-S12-10). */
  enter: number
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
    <article id={`story-${story.public_id}`} className="story" aria-labelledby={titleId} tabIndex={-1}
      data-enter="" style={{ '--enter-delay': `${enter}ms` } as CSSProperties}>
      <VideoPlayer src={story.video_url} fallbackSrc={story.webm_url} poster={story.poster_url} label={`${story.title}, de ${story.institution.name}`}
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

function StoryFeed({ sort, target }: { sort: StoryOrder; target: string | null }) {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const load = useCallback((signal: AbortSignal) => listPromotionalVideos(page, signal, { sort, first: target }), [page, sort, target])
  const { data, loading, failure, refresh } = useApiRequest(load, galleryMessages)
  const [stories, setStories] = useState<PromotionalVideo[]>([])
  const [merged, setMerged] = useState<PromotionalVideoPage | null>(null)
  const [muted, setMuted] = useState(true)
  const [deactivating, setDeactivating] = useState<PromotionalVideo | null>(null)
  const [notice, setNotice] = useState<ReactNode>(null)
  const moderation = useApiMutation(galleryMessages)
  const deactivateButton = useRef<HTMLButtonElement | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const placed = useRef(false)

  if (data && data !== merged) {
    setMerged(data)
    setStories((current) => merge(current, data.videos))
  }

  const hasMore = data !== null && data.page < data.lastPage
  // Solo las historias de la primera página entran escalonadas; las que se cargan después, sin retraso.
  const firstBatch = 3
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
    void Promise.all(Array.from({ length: page }, (_, index) => listPromotionalVideos(index + 1, undefined, { sort, first: target })))
      .then((pages) => setStories((current) => merge(current, pages.flatMap((result) => result.videos))))
      .catch(() => { /* El reproductor conserva su botón de reintentar. */ })
  }, [page, sort, target])

  async function deactivate(video: PromotionalVideo) {
    setDeactivating(null)
    setNotice(null)
    await moderation.submit(() => deactivatePromotionalVideo(video.public_id), () => {
      setStories((current) => current.filter((story) => story.public_id !== video.public_id))
      setNotice(<><strong className="notice-subject">{video.title}</strong> se inactivó y ya no aparece en las historias. Solo {video.institution.name} puede reactivarla.</>)
    })
  }

  return (
    <>
      {notice && <p className="institution-success" role="status">{notice}</p>}
      {moderation.failure && <InstitutionRequestError failure={moderation.failure} />}

      {loading && stories.length === 0 ? (
        // T-S12-10: el esqueleto aparece de inmediato y conserva la altura del feed al cambiar el orden.
        <div className="story-feed" aria-busy="true">
          <p className="visually-hidden" role="status">Cargando historias…</p>
          <StorySkeleton /><StorySkeleton />
        </div>
      )
        : failure && stories.length === 0 ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : stories.length === 0
          ? <StateMessage kind="empty" icon={<VideoIcon />} title="Aún no hay historias."
            description="Cuando las instituciones compartan testimonios de sus alumnos en el programa dual, aparecerán aquí." />
        : (
          <>
            <div className="story-feed" role="feed" aria-busy={loadingMore} aria-label="Historias del Dual">
              {stories.map((story, position) => (
                <Story key={story.public_id} story={story} enter={position < firstBatch ? position * 60 : 0} muted={muted} onMutedChange={setMuted} onRetry={renewUrls}
                  company={user?.role === 'COMPANY'} moderator={user?.role === 'ADMIN'} moderating={moderation.pending}
                  onDeactivate={(button) => { deactivateButton.current = button; setDeactivating(story) }} />
              ))}
              {loadingMore && <StorySkeleton />}
            </div>
            {loadingMore && <p className="visually-hidden" role="status">Cargando más historias…</p>}
            <div ref={sentinel} className="story-more-wrapper">
              {failure ? <InstitutionRequestError failure={failure} retry={refresh} />
                : hasMore && !loadingMore && (
                  <button type="button" className="secondary" onClick={loadMore}>Ver más historias</button>
                )}
            </div>
          </>
        )}

      <ConfirmDialog open={deactivating !== null} origin={deactivateButton}
        title="¿Inactivar la historia?"
        description="Dejará de mostrarse a las empresas. No se borra; la institución la verá inactiva y solo ella podrá reactivarla."
        confirmLabel="Inactivar" onConfirm={() => { if (deactivating) void deactivate(deactivating) }} onCancel={() => setDeactivating(null)} />
    </>
  )
}

/**
 * Ranura de un botón contextual de la barra de orden (T-S12-10): siempre está en el DOM para animar su entrada;
 * oculta, no recibe foco ni se anuncia.
 */
function ToolbarSlot({ shown, children }: { shown: boolean; children: ReactNode }) {
  return (
    <div className="story-toolbar-slot" data-shown={shown} inert={!shown} aria-hidden={shown ? undefined : true}>
      <div>{children}</div>
    </div>
  )
}

/** Distancia desde el borde superior a la que flota la barra de orden: debajo de la barra general. */
function stickyOffset(): number {
  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-bar-height'))
  return (Number.isFinite(bar) ? bar : 0) + 8
}

/** Si la barra de orden ya flota: su ancla quedó por encima de la barra general. */
function useStuck(anchor: RefObject<HTMLElement | null>): boolean {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const update = () => {
      const top = anchor.current?.getBoundingClientRect().top
      setStuck(top !== undefined && window.scrollY > 0 && top < stickyOffset())
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [anchor])
  return stuck
}

const ORDERS = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'random', label: 'Al azar' },
] as const

/**
 * Historias del Dual (HU-S9-03, HU-S9-04): feed de testimonios de alumnos que están o estuvieron en el programa dual.
 * El video visible arranca sin sonido y el feed carga más al acercarse al final. La empresa va de cada historia al
 * buscador; el Administrador puede inactivar una (moderación mínima). `?video=` coloca el feed en esa historia.
 */
export function PromotionalVideosPage() {
  const [params, setParams] = useSearchParams()
  const target = params.get('video')
  // T-S9-03: el orden vive en la URL; la semilla, en la página: cada visita al azar trae otra mezcla.
  const random = params.get('orden') === 'azar'
  const [seed, setSeed] = useState(randomSeed)
  const sort = useMemo<StoryOrder>(() => random ? { order: 'random', seed } : { order: 'recent' }, [random, seed])

  const title = useRef<HTMLHeadingElement>(null)
  const anchor = useRef<HTMLDivElement>(null)
  const stuck = useStuck(anchor)

  // T-S12-09: un orden nuevo empieza el feed desde la primera historia; si la barra flotaba, se vuelve a ese punto.
  function restart() {
    const element = anchor.current
    if (!stuck || !element) return
    window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - stickyOffset(), behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  // Al elegir otro orden ya no se fija la historia que se abrió desde el inicio.
  function choose(order: StoryOrder['order']) {
    setParams(order === 'random' ? { orden: 'azar' } : {}, { replace: true })
    restart()
  }

  function backToTop() {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    title.current?.focus({ preventScroll: true })
  }

  return (
    <section className="card" aria-labelledby="promotional-videos-title">
      <nav className="page-navigation" aria-label="Navegación de las historias">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
      </nav>
      <header className="story-header">
        <h2 id="promotional-videos-title" ref={title} tabIndex={-1}>Historias del Dual</h2>
        <p>Alumnos que están o estuvieron en el programa dual cuentan cómo fue su experiencia en la empresa.</p>
      </header>
      {/* Marca el punto donde la barra de orden empieza a flotar. */}
      <div ref={anchor} className="story-toolbar-anchor" aria-hidden="true" />
      <div className="story-toolbar" data-stuck={stuck}>
        <div className="story-pill">
          <fieldset className="segmented">
            <legend className="visually-hidden">Ordenar las historias</legend>
            {ORDERS.map((option) => (
              <label key={option.value} className="segmented-option">
                <input type="radio" name="story-order" value={option.value} checked={sort.order === option.value}
                  onChange={() => choose(option.value)} />
                <span>{option.value === 'random' && <ShuffleIcon />}{option.label}</span>
              </label>
            ))}
          </fieldset>
          <ToolbarSlot shown={random}>
            <button type="button" className="plain story-reshuffle" aria-label="Otra mezcla" title="Otra mezcla" onClick={() => { setSeed(randomSeed()); restart() }}>
              <ShuffleIcon /><span className="story-reshuffle-label">Otra mezcla</span>
            </button>
          </ToolbarSlot>
          <ToolbarSlot shown={stuck}>
            <button type="button" className="secondary story-top" aria-label="Volver arriba" title="Volver arriba" onClick={backToTop}><ArrowUpIcon /></button>
          </ToolbarSlot>
        </div>
      </div>
      {/* Cada orden o mezcla empieza un feed nuevo desde la primera página. */}
      <StoryFeed key={`${sort.order}-${random ? seed : 0}-${target ?? ''}`} sort={sort} target={target} />
    </section>
  )
}
