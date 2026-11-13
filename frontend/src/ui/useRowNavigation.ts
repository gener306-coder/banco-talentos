import { useCallback } from 'react'
import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router'

/**
 * Fila clicable de una tabla (HU-S8-01): con el puntero, toda la fila abre su detalle; el enlace «Ver detalle» de la
 * columna Acciones sigue siendo el control accesible. Los clics en enlaces y botones de la fila (contacto, «Cancelar»)
 * y la selección de texto no navegan. El estado opcional lleva el regreso contextual (ui/backLink.ts).
 */
export function useRowNavigation() {
  const navigate = useNavigate()
  return useCallback((event: MouseEvent<HTMLTableRowElement>, href: string, state?: unknown) => {
    if (event.defaultPrevented || (event.target as HTMLElement).closest('a, button')) return
    if (window.getSelection()?.toString()) return
    void navigate(href, state === undefined ? undefined : { state })
  }, [navigate])
}
