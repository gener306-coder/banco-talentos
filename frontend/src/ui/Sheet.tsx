import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './icons'
import { prefersReducedMotion, useModal } from './modal'
import { animateSpring, projectMomentum, releaseVelocity, rubberband } from './spring'
import type { SpringAnimation } from './spring'

const COMPACT_QUERY = '(max-width: 640px)'

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(COMPACT_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const isCompact = () => typeof window.matchMedia === 'function' && window.matchMedia(COMPACT_QUERY).matches

/**
 * Hoja modal. En pantallas estrechas sube desde abajo y se arrastra desde su barra superior
 * (seguimiento 1:1, velocidad de suelta, proyección del impulso y resistencia en el borde);
 * en pantallas anchas es un panel centrado. El contenido sigue montado al cerrarse, para que el
 * trabajo en curso (por ejemplo, un enlace manual generado) no se pierda al reabrir.
 */
export function Sheet({ open, onClose, labelledBy, children }: {
  open: boolean
  onClose: () => void
  /** Id del título dentro del contenido que nombra el diálogo. */
  labelledBy: string
  children: ReactNode
}) {
  const layer = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const compact = useSyncExternalStore(subscribe, isCompact, () => false)
  const animated = compact && !prefersReducedMotion()
  const animation = useRef<SpringAnimation | null>(null)
  const offset = useRef(0)
  const handoff = useRef(0)
  const drag = useRef<{ start: number; origin: number; samples: { time: number; value: number }[] } | null>(null)

  // Mientras se anima el cierre la hoja sigue visible, aunque ya no es modal.
  const [closing, setClosing] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    setClosing(!open && animated)
  }
  useModal(open, layer, onClose)

  // Solo usan refs: son estables entre renders.
  const place = useCallback((value: number) => {
    offset.current = value
    const node = panel.current
    if (!node) return
    node.style.transform = value === 0 ? '' : `translateY(${value}px)`
    if (scrim.current) scrim.current.style.opacity = String(Math.max(0, Math.min(1, 1 - value / (node.offsetHeight || 1))))
  }, [])

  const springTo = useCallback((target: number, velocity: number, onComplete?: () => void) => {
    animation.current?.stop()
    animation.current = animateSpring({
      from: offset.current, to: target, velocity,
      // Rebote leve solo si un gesto con impulso precede a la animación.
      damping: velocity ? 0.8 : 1, response: 0.3,
      onUpdate: place,
      onComplete: () => { animation.current = null; onComplete?.() },
    })
  }, [place])

  useLayoutEffect(() => {
    const node = panel.current
    if (!node) return
    if (open) {
      if (!animated) { animation.current?.stop(); place(0); return }
      // Interrumpible: si se reabre a mitad del cierre, parte de la posición actual.
      if (!animation.current) place(node.offsetHeight + 24)
      springTo(0, 0)
    } else if (closing) {
      const velocity = handoff.current
      handoff.current = 0
      springTo(node.offsetHeight + 24, velocity, () => setClosing(false))
    }
  }, [open, closing, animated, place, springTo])

  useLayoutEffect(() => () => animation.current?.stop(), [])

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!animated || (event.target as HTMLElement).closest('button')) return
    animation.current?.stop()
    animation.current = null
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { start: event.clientY, origin: offset.current, samples: [{ time: event.timeStamp, value: event.clientY }] }
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current, node = panel.current
    if (!state || !node) return
    let next = state.origin + event.clientY - state.start
    if (next < 0) next = -rubberband(-next, node.offsetHeight)
    place(next)
    state.samples.push({ time: event.timeStamp, value: event.clientY })
    if (state.samples.length > 5) state.samples.shift()
  }
  function onPointerUp() {
    const state = drag.current, node = panel.current
    drag.current = null
    if (!state || !node) return
    const velocity = releaseVelocity(state.samples)
    // Se decide con el punto proyectado, no con la posición de suelta.
    if (offset.current + projectMomentum(velocity) > node.offsetHeight / 2) {
      handoff.current = velocity
      onClose()
    } else {
      springTo(0, velocity)
    }
  }

  return createPortal(
    <div ref={layer} className={`sheet-layer ${compact ? 'compact' : 'wide'}`} hidden={!open && !closing}>
      <div ref={scrim} className="sheet-scrim" onClick={onClose} />
      <div ref={panel} className="sheet-panel" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="sheet-header" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {compact && <span className="sheet-handle" aria-hidden="true" />}
          <button type="button" className="plain" onClick={onClose}><CloseIcon />Cerrar</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
