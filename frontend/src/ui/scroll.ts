import { prefersReducedMotion } from './modal'

/** Salida suave: arranca rápido y se posa sin rebote (T-S13-13). */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const MIN_MS = 280
const MAX_MS = 600
/** Interacciones que toman el control: el desplazamiento animado cede en cuanto la persona se mueve. */
const TAKEOVER = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/**
 * Desplazamiento vertical animado de la ventana (T-S13-13), de 280 a 600 ms según la distancia. Con movimiento
 * reducido, o sin requestAnimationFrame, salta directo. `onDone` se llama al llegar o al cederle el control a la
 * persona. Devuelve cómo cancelarlo (por ejemplo, al desmontarse la vista).
 */
export function smoothScrollTo(top: number, onDone?: () => void): () => void {
  const start = window.scrollY
  const distance = Math.max(0, top) - start
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    for (const name of TAKEOVER) window.removeEventListener(name, takeOver)
    onDone?.()
  }
  function takeOver() {
    cancelAnimationFrame(frame)
    finish()
  }
  let frame = 0
  if (prefersReducedMotion() || Math.abs(distance) < 2 || typeof window.requestAnimationFrame !== 'function') {
    window.scrollTo(0, start + distance)
    finish()
    return () => undefined
  }
  const duration = Math.min(MAX_MS, Math.max(MIN_MS, Math.abs(distance) * 0.45))
  const begin = performance.now()
  const step = (now: number) => {
    const progress = Math.min(1, (now - begin) / duration)
    window.scrollTo(0, start + distance * easeOutCubic(progress))
    if (progress < 1) frame = requestAnimationFrame(step)
    else finish()
  }
  for (const name of TAKEOVER) window.addEventListener(name, takeOver, { passive: true })
  frame = requestAnimationFrame(step)
  return () => {
    cancelAnimationFrame(frame)
    finished = true
    for (const name of TAKEOVER) window.removeEventListener(name, takeOver)
  }
}

/** Distancia que la barra fija de la aplicación tapa arriba (T-S12-09 publica --app-bar-height). */
export function stickyTop(): number {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-bar-height'))
  return Number.isFinite(value) ? value : 0
}
