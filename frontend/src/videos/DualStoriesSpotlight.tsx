import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FocusEvent } from 'react'
import { Link } from 'react-router'
import { useApiRequest } from '../lib/useApiRequest'
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from '../ui/icons'
import { prefersReducedMotion } from '../ui/modal'
import { Sheet } from '../ui/Sheet'
import { duration } from './api'
import { listPromotionalVideos } from './galleryApi'
import type { PromotionalVideo } from './galleryApi'
import { VideoPlayer } from './VideoPlayer'
import './videos.css'

// Constante del módulo: una función nueva en cada render relanzaría la carga en bucle.
const load = (signal: AbortSignal) => listPromotionalVideos(1, signal)
const SHOWN = 5
const ADVANCE_MS = 6000

/** Vista previa en el mismo inicio. Se monta solo al abrir: al cerrar, el video se detiene. */
function StoryPreview({ story }: { story: PromotionalVideo }) {
  const titleId = 'spotlight-preview-title'
  return (
    <section className="institution-account spotlight-preview" aria-labelledby={titleId}>
      <VideoPlayer src={story.video_url} poster={story.poster_url} label={`${story.title}, de ${story.institution.name}`}
        durationSeconds={story.duration_seconds} width={story.width} height={story.height} autoPlay />
      {/* El foco inicial va al título: en los controles del video, la barra de tiempo se activaría por accidente. */}
      <h3 id={titleId} tabIndex={-1} data-autofocus>{story.title}</h3>
      <p className="story-institution">{story.institution.name}</p>
      {story.description && <p className="story-description">{story.description}</p>}
      <div className="story-actions">
        <Link className="pill-link" to="/talent">Buscar talento<ChevronRightIcon /></Link>
        <Link className="pill-link" to={`/promocion?video=${encodeURIComponent(story.public_id)}`}>Ver todas las historias<ChevronRightIcon /></Link>
      </div>
    </section>
  )
}

/** Solo el foco de teclado detiene el carrusel: tras un clic con el ratón, el foco se quedaría ahí para siempre. */
function isKeyboardFocus(event: FocusEvent<HTMLElement>): boolean {
  return event.target.matches(':focus-visible')
}

function StoriesCarousel({ stories }: { stories: PromotionalVideo[] }) {
  const titleId = useId()
  const section = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  // Destino de un desplazamiento en curso: mientras llega, el scroll no debe mover los puntos hacia atrás.
  const heading = useRef<number | null>(null)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [focused, setFocused] = useState(false)
  const [onScreen, setOnScreen] = useState(true)
  const [pageVisible, setPageVisible] = useState(() => !document.hidden)
  const [preview, setPreview] = useState<PromotionalVideo | null>(null)
  const closePreview = useCallback(() => setPreview(null), [])
  const multiple = stories.length > 1
  const moves = multiple && !prefersReducedMotion()
  const advancing = moves && !paused && !hovering && !focused && onScreen && pageVisible && preview === null
  const current = stories[Math.min(index, stories.length - 1)]

  const goTo = useCallback((target: number) => {
    const slide = track.current?.children[target] as HTMLElement | undefined
    heading.current = target
    setIndex(target)
    track.current?.scrollTo({ left: slide?.offsetLeft ?? 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [])

  useEffect(() => {
    if (!advancing) return
    const timer = setTimeout(() => goTo((index + 1) % stories.length), ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [advancing, goTo, index, stories.length])

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !section.current) return
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.25 })
    observer.observe(section.current)
    return () => observer.disconnect()
  }, [])

  /** Sigue el deslizamiento con el dedo o el trackpad; ignora el paso por las historias intermedias de goTo(). */
  function syncWithScroll() {
    const element = track.current
    if (!element) return
    const slides = [...element.children] as HTMLElement[]
    const nearest = slides.reduce((best, slide, position) =>
      Math.abs(slide.offsetLeft - element.scrollLeft) < Math.abs(slides[best].offsetLeft - element.scrollLeft) ? position : best, 0)
    if (heading.current !== null) {
      if (nearest === heading.current) heading.current = null
      return
    }
    setIndex(nearest)
  }

  return (
    <section ref={section} className="spotlight" aria-labelledby={titleId} aria-roledescription="carrusel"
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovering(true) }} onPointerLeave={() => setHovering(false)}
      onFocus={(event) => { if (isKeyboardFocus(event)) setFocused(true) }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
      <div className="spotlight-heading">
        <div>
          <p className="eyebrow">Historias del Dual</p>
          <h3 id={titleId}>Alumnos que ya vivieron el Dual en una empresa</h3>
        </div>
        <Link className="pill-link" to="/promocion">Ver todas las historias<ChevronRightIcon /></Link>
      </div>

      <div ref={track} className="spotlight-track" onScroll={syncWithScroll}
        onPointerDown={() => { heading.current = null }} onWheel={() => { heading.current = null }}>
        {stories.map((story, position) => (
          <div key={story.public_id} className="spotlight-slide" role="group" aria-roledescription="historia" aria-label={`${position + 1} de ${stories.length}`}>
            <button type="button" className="spotlight-poster" aria-label={`Ver la vista previa de ${story.title}, de ${story.institution.name}`}
              onClick={() => setPreview(story)}>
              <img src={story.poster_url} alt="" loading={position === 0 ? 'eager' : 'lazy'} />
              <span className="spotlight-play" aria-hidden="true"><PlayIcon /></span>
              <span className="spotlight-duration">{duration(story.duration_seconds)}</span>
            </button>
          </div>
        ))}
      </div>

      <div className="spotlight-footer">
        {/* Solo se anuncian los cambios que provocó el usuario, no los automáticos. */}
        <div className="spotlight-caption" aria-live={advancing ? 'off' : 'polite'}>
          <span className="spotlight-title">{current.title}</span>
          <span className="spotlight-institution">{current.institution.name}</span>
        </div>
        {multiple && (
          <div className="spotlight-controls">
            <button type="button" className="spotlight-control" aria-label="Historia anterior" onClick={() => goTo((index - 1 + stories.length) % stories.length)}><ChevronLeftIcon /></button>
            <div className="spotlight-dots">
              {stories.map((story, position) => (
                <button key={story.public_id} type="button" className="spotlight-dot" aria-label={`Ir a la historia ${position + 1}`}
                  aria-current={position === index ? 'true' : undefined} onClick={() => goTo(position)} />
              ))}
            </div>
            <button type="button" className="spotlight-control" aria-label="Historia siguiente" onClick={() => goTo((index + 1) % stories.length)}><ChevronRightIcon /></button>
            {moves && (
              <button type="button" className="spotlight-control" aria-label={paused ? 'Reanudar el carrusel' : 'Pausar el carrusel'} onClick={() => setPaused(!paused)}>
                {paused ? <PlayIcon /> : <PauseIcon />}
              </button>
            )}
          </div>
        )}
      </div>

      <Sheet open={preview !== null} onClose={closePreview} labelledBy="spotlight-preview-title" large>
        {preview && <StoryPreview key={preview.public_id} story={preview} />}
      </Sheet>
    </section>
  )
}

/**
 * Módulo destacado del inicio de la empresa (HU-S9-05, HU-S9-06): carrusel de las historias más recientes que se
 * desliza solo, con vista previa en el mismo inicio al hacer clic. Aquí no se reproduce nada hasta ese clic, porque el
 * inicio se abre en cada sesión. Sin historias o con un error no aparece: nunca deja un hueco ni una alerta.
 */
export function DualStoriesSpotlight() {
  const { data } = useApiRequest(load)
  if (!data || data.videos.length === 0) return null
  return <StoriesCarousel stories={data.videos.slice(0, SHOWN)} />
}
