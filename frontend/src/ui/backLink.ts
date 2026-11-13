import { useLocation } from 'react-router'
import type { Location } from 'react-router'

/**
 * Destino y texto del enlace de regreso de una página de detalle. `state` es el regreso que tenía la vista de origen:
 * al volver a ella, recupera también su propio «Volver» (bandeja filtrada → solicitud → expediente → solicitud → bandeja).
 */
export interface BackTarget { to: string; label: string; state?: { back: BackTarget } }

/** Solo rutas internas: el estado del historial no debe poder mandar a otro sitio («//dominio» o «https:»). */
function isBackTarget(value: unknown): value is BackTarget {
  if (typeof value !== 'object' || value === null) return false
  const { to, label } = value as Record<string, unknown>
  return typeof to === 'string' && typeof label === 'string' && label.trim() !== '' &&
    to.startsWith('/') && !to.startsWith('//') && !to.includes('\\')
}

/** El regreso válido que trae un estado de navegación, si trae uno. */
function backOf(state: unknown): BackTarget | undefined {
  const back = typeof state === 'object' && state !== null && 'back' in state ? state.back : undefined
  return isBackTarget(back) ? back : undefined
}

/**
 * Estado de navegación para abrir un detalle desde otro flujo (T-S12-04): el detalle regresa a la vista exacta de
 * origen, con su búsqueda, filtros y página (T-S12-05), y lo anuncia con su propio texto («Volver a solicitudes»).
 * Del estado de origen solo se conserva su regreso; avisos u otras banderas no viajan.
 */
export function backState(label: string, location: Pick<Location, 'pathname' | 'search' | 'state'>): { back: BackTarget } {
  const parent = backOf(location.state)
  return { back: { to: location.pathname + location.search, label, ...(parent ? { state: { back: parent } } : {}) } }
}

/** Regreso contextual si la página se abrió con `backState`; si no, el regreso de siempre. */
export function useBackLink(fallback: BackTarget): BackTarget {
  return backOf(useLocation().state) ?? fallback
}
