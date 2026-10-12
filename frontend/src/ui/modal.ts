import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[hidden], [inert]'))
}

/**
 * Comportamiento modal común a diálogos y hojas: bloquea el fondo con `inert`, atrapa el foco,
 * cierra con Esc y devuelve el foco al control que abrió la capa.
 * `layer` es el nodo del portal: todo lo demás en <body> queda inerte mientras está abierta.
 */
export function useModal(open: boolean, layer: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    const node = layer.current
    if (!open || !node) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const background = [...document.body.children].filter((el) => el !== node && !el.contains(node) && !el.hasAttribute('inert'))
    background.forEach((el) => el.setAttribute('inert', ''))
    document.body.classList.add('modal-open')

    const initial = node.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(node)[0] ?? node
    initial.focus({ preventScroll: true })

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab' || !node) return
      const items = focusables(node)
      if (items.length === 0) { event.preventDefault(); return }
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    node.addEventListener('keydown', onKeyDown)

    return () => {
      node.removeEventListener('keydown', onKeyDown)
      background.forEach((el) => el.removeAttribute('inert'))
      document.body.classList.remove('modal-open')
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [open, layer])
}

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
