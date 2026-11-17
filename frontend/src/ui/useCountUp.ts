import { useEffect, useState } from 'react'
import { prefersReducedMotion } from './modal'

/** Duración del conteo (T-S12-11): suficiente para leer la magnitud, sin hacer esperar. */
export const COUNT_UP_MS = 800

const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3

/**
 * Conteo de 0 hasta `target` con desaceleración (T-S12-11). Devuelve el valor intermedio mientras anima y `null`
 * cuando no anima (o ya terminó), para que quien lo usa muestre el valor real. Sin animación si `enabled` es falso
 * o con `prefers-reduced-motion`.
 */
export function useCountUp(target: number, enabled: boolean): number | null {
  const [current, setCurrent] = useState<number | null>(() => (enabled && target > 0 && !prefersReducedMotion() ? 0 : null))

  useEffect(() => {
    if (current === null) return
    let frame = 0
    let start: number | null = null
    const step = (now: number) => {
      start ??= now
      const progress = Math.min((now - start) / COUNT_UP_MS, 1)
      setCurrent(progress < 1 ? Math.round(target * easeOutCubic(progress)) : null)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
    // Solo arranca una vez por montaje: un valor nuevo durante el conteo se muestra al terminar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return current
}
