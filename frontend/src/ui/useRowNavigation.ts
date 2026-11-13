import { useCallback } from 'react'
import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router'

/** Controles que tienen su propia acción: un clic en ellos (o dentro de ellos) nunca abre la fila. */
const OWN_ACTION = 'a, button, input, select, textarea, label, summary, [role="button"]'

/**
 * Fila clicable de una tabla (HU-S8-01): con el puntero, toda la fila abre su detalle; el enlace «Ver detalle» de la
 * columna Acciones sigue siendo el control accesible. La fila es el último recurso del clic (T-S12-05):
 * - Los controles de la fila (pastillas, «Cancelar», íconos de contacto) conservan su propio clic: el evento sube hasta
 *   la fila, pero aquí se ignora si nació en un control. Así no hace falta stopPropagation en cada botón, que además
 *   rompería otros oyentes de la página (el clic fuera que cierra el menú de cuenta).
 * - Los clics que llegan desde un portal (T-S12-06) tampoco: React los propaga por su árbol, no por el del DOM.
 * - Con una tecla modificadora (abrir en otra pestaña o ventana) o con texto seleccionado, la fila no navega.
 * El estado opcional lleva el regreso contextual (ui/backLink.ts).
 */
export function useRowNavigation() {
  const navigate = useNavigate()
  return useCallback((event: MouseEvent<HTMLTableRowElement>, href: string, state?: unknown) => {
    // Un portal (menú de correo, aviso) sigue el árbol de React: su clic llega a la fila aunque no esté dentro de ella.
    if (!event.currentTarget.contains(event.target as Node)) return
    if (event.defaultPrevented || (event.target as HTMLElement).closest(OWN_ACTION)) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (window.getSelection()?.toString()) return
    void navigate(href, state === undefined ? undefined : { state })
  }, [navigate])
}
