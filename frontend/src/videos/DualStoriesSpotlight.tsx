import { useId } from 'react'
import { Link } from 'react-router'
import { useApiRequest } from '../lib/useApiRequest'
import { ChevronRightIcon, PlayIcon } from '../ui/icons'
import { duration } from './api'
import { listPromotionalVideos } from './galleryApi'
import type { PromotionalVideo } from './galleryApi'
import './videos.css'

// Constante del módulo: una función nueva en cada render relanzaría la carga en bucle.
const load = (signal: AbortSignal) => listPromotionalVideos(1, signal)
const SHOWN = 3

function SpotlightStory({ story, lead = false }: { story: PromotionalVideo; lead?: boolean }) {
  return (
    <Link className={`spotlight-story${lead ? ' lead' : ''}`} to={`/promocion?video=${encodeURIComponent(story.public_id)}`}
      aria-label={`Ver la historia ${story.title}, de ${story.institution.name}`}>
      <span className="spotlight-poster">
        <img src={story.poster_url} alt="" loading="lazy" />
        <span className="spotlight-play" aria-hidden="true"><PlayIcon /></span>
        <span className="spotlight-duration">{duration(story.duration_seconds)}</span>
      </span>
      <span className="spotlight-title">{story.title}</span>
      <span className="spotlight-institution">{story.institution.name}</span>
    </Link>
  )
}

/**
 * Módulo destacado del inicio de la empresa (HU-S9-05): la historia más reciente y dos más. Son enlaces: aquí no se
 * reproduce nada, porque el inicio se abre en cada sesión y no debe gastar datos ni distraer. Sin historias o con un
 * error no aparece: nunca deja un hueco ni una alerta en el inicio.
 */
export function DualStoriesSpotlight() {
  const titleId = useId()
  const { data } = useApiRequest(load)
  if (!data || data.videos.length === 0) return null
  const [first, ...others] = data.videos.slice(0, SHOWN)

  return (
    <section className="spotlight" aria-labelledby={titleId}>
      <div className="spotlight-heading">
        <div>
          <p className="eyebrow">Historias del Dual</p>
          <h3 id={titleId}>Alumnos que ya vivieron el Dual en una empresa</h3>
        </div>
        <Link className="pill-link" to="/promocion">Ver todas las historias<ChevronRightIcon /></Link>
      </div>
      <div className="spotlight-grid" data-count={Math.min(data.videos.length, SHOWN)}>
        <SpotlightStory story={first} lead />
        {others.map((story) => <SpotlightStory key={story.public_id} story={story} />)}
      </div>
    </section>
  )
}
