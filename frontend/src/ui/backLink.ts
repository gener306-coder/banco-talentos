import { useLocation } from 'react-router'
import type { Location } from 'react-router'

/** Destino y texto del enlace de regreso de una página de detalle. */
export interface BackTarget { to: string; label: string }

/**
 * Estado de navegación para abrir un detalle desde otro flujo (T-S12-04): el detalle regresa a la vista exacta de
 * origen, con su búsqueda y filtros, y lo anuncia con su propio texto («Volver a solicitudes»).
 */
export function backState(label: string, location: Pick<Location, 'pathname' | 'search'>): { back: BackTarget } {
  return { back: { to: location.pathname + location.search, label } }
}

/** Solo rutas internas: el estado del historial no debe poder mandar a otro sitio («//dominio» o «https:»). */
function isBackTarget(value: unknown): value is BackTarget {
  if (typeof value !== 'object' || value === null) return false
  const { to, label } = value as Record<string, unknown>
  return typeof to === 'string' && typeof label === 'string' && label.trim() !== '' &&
    to.startsWith('/') && !to.startsWith('//') && !to.includes('\\')
}

/** Regreso contextual si la página se abrió con `backState`; si no, el regreso de siempre. */
export function useBackLink(fallback: BackTarget): BackTarget {
  const state: unknown = useLocation().state
  const back = typeof state === 'object' && state !== null && 'back' in state ? state.back : undefined
  return isBackTarget(back) ? back : fallback
}
