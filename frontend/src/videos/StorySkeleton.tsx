/**
 * Esqueleto de una historia del feed (T-S12-10): reproductor, institución, título, descripción y acción, con los
 * huesos animados de ui.css. Es decorativo; quien lo muestra anuncia la carga con un `role="status"`.
 */
export function StorySkeleton() {
  return (
    <div className="story-skeleton" aria-hidden="true" data-testid="story-skeleton">
      <span className="bone story-skeleton-player" />
      <div className="story-skeleton-byline">
        <span className="bone story-skeleton-avatar" />
        <span className="bone" style={{ width: '45%' }} />
      </div>
      <div className="story-skeleton-text">
        <span className="bone story-skeleton-title" />
        <span className="bone" style={{ width: '92%' }} />
        <span className="bone" style={{ width: '70%' }} />
      </div>
      <span className="bone story-skeleton-action" />
    </div>
  )
}
