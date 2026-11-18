import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { smoothScrollTo, stickyTop } from './scroll'

/**
 * T-S13-12: memoria de la tabla al ir y volver. Al abrir una fila (o un enlace interno de ella: detalle, perfil,
 * oportunidad, chat), se recuerda qué fila era y en qué altura de la pantalla estaba. Al volver al mismo listado (misma
 * ruta y mismos filtros), la vista parte del principio y baja con un desplazamiento animado rápido hasta dejar la fila
 * donde estaba (T-S13-13), aunque la tabla haya cambiado de orden; al llegar, la fila parpadea y, si se usó el teclado,
 * recupera el foco. El desplazamiento horizontal de la tabla se recupera antes, sin animación. Al cambiar de página
 * (`page`), la vista sube con la misma animación hasta el inicio de la tabla.
 *
 * Se guarda en sessionStorage (solo esta pestaña) y se consume una sola vez; si no está disponible, la tabla abre como
 * siempre. Uso: `<div className="institution-table-wrapper" ref={useTableMemory()}>`; las filas llevan `data-href`.
 */
const STORAGE_KEY = 'table-memory'
/** Más allá de este tiempo, volver al listado ya no es «regresar»: se abre desde el inicio. */
const MAX_AGE_MS = 30 * 60 * 1000
const FLASH_CLASS = 'row-return'
const FLASH_MS = 1800

interface TableMemory {
  url: string
  row: string
  /** Distancia de la fila al borde superior de la ventana al dejar la tabla. */
  top: number
  scrollY: number
  scrollLeft: number
  at: number
  /** Se abrió con el teclado (Enter en un enlace): al volver, el foco regresa a la fila. */
  keyboard?: boolean
}

function read(): TableMemory | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? 'null')
    if (typeof value !== 'object' || value === null) return null
    const memory = value as Partial<TableMemory>
    return typeof memory.url === 'string' && typeof memory.row === 'string' && typeof memory.top === 'number' &&
      typeof memory.scrollY === 'number' && typeof memory.scrollLeft === 'number' && typeof memory.at === 'number' ? memory as TableMemory : null
  } catch {
    return null
  }
}
function write(memory: TableMemory | null) {
  try {
    if (memory) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory))
    else window.sessionStorage.removeItem(STORAGE_KEY)
  } catch { /* Sin almacenamiento, sin memoria. */ }
}

/** Solo lo que navega dentro de la aplicación: una fila sin control propio o un enlace interno. */
function navigates(target: Element): boolean {
  const control = target.closest('a, button, input, select, textarea, label, summary, [role="button"]')
  if (!control) return true
  return control instanceof HTMLAnchorElement && (control.getAttribute('href') ?? '').startsWith('/')
}

/** Traslación vertical de la fila por su animación de entrada (T-S13-13), para medir dónde quedará en reposo. */
function translateY(element: HTMLElement): number {
  const match = /^matrix\(([^)]+)\)$/.exec(getComputedStyle(element).transform)
  const value = match ? Number(match[1].split(',')[5]) : 0
  return Number.isFinite(value) ? value : 0
}

export function useTableMemory(page?: number) {
  const { pathname, search } = useLocation()
  const url = pathname + search
  const [node, setNode] = useState<HTMLElement | null>(null)
  const ref = useCallback((element: HTMLElement | null) => setNode(element), [])

  // Recordar la fila justo antes de navegar (fase de captura: ocurre antes de que el clic cambie de pantalla).
  useEffect(() => {
    if (!node) return
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target : null
      const row = target?.closest('tr[data-href]')
      if (!target || !row || !node.contains(row) || !navigates(target)) return
      write({
        url, row: row.getAttribute('data-href') ?? '', top: row.getBoundingClientRect().top,
        scrollY: window.scrollY, scrollLeft: node.scrollLeft, at: Date.now(), keyboard: event.detail === 0,
      })
    }
    node.addEventListener('click', onClick, true)
    return () => node.removeEventListener('click', onClick, true)
  }, [node, url])

  // Al volver: desde arriba, baja animado hasta que la fila queda a su altura anterior; luego, el parpadeo.
  useLayoutEffect(() => {
    if (!node) return
    const memory = read()
    if (!memory || memory.url !== url) return
    write(null)
    if (Date.now() - memory.at > MAX_AGE_MS) return
    if (typeof node.scrollTo === 'function') node.scrollTo({ left: memory.scrollLeft })
    const row = [...node.querySelectorAll<HTMLElement>('tr[data-href]')].find((item) => item.dataset.href === memory.row)
    const target = row ? row.getBoundingClientRect().top - translateY(row) + window.scrollY - memory.top : memory.scrollY
    let timer = 0
    window.scrollTo(0, 0)
    const cancel = smoothScrollTo(target, () => {
      if (!row) return
      row.classList.add(FLASH_CLASS)
      // Quien llegó con el teclado sigue donde estaba: el foco vuelve al control de la fila (su flecha o «Ver detalle»).
      if (memory.keyboard) row.querySelector<HTMLElement>('.row-link')?.focus({ preventScroll: true })
      timer = window.setTimeout(() => row.classList.remove(FLASH_CLASS), FLASH_MS)
    })
    return () => {
      cancel()
      window.clearTimeout(timer)
    }
  }, [node, url])

  // Al cambiar de página, el resultado nuevo queda a la vista: la página sube hasta el inicio de la tabla.
  const previousPage = useRef(page)
  useEffect(() => {
    const before = previousPage.current
    previousPage.current = page
    if (!node || page === undefined || before === undefined || before === page) return
    const top = node.getBoundingClientRect().top + window.scrollY - stickyTop() - 16
    if (top < window.scrollY) return smoothScrollTo(top)
  }, [node, page])

  return ref
}
