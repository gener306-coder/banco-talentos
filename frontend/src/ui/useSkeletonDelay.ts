import { useEffect, useState } from 'react'
import { SKELETON_DELAY_MS } from './StateMessage'

/**
 * T-S14-07: el esqueleto reserva su espacio desde el primer pintado (sin saltos), pero sus huesos solo se ven si la
 * espera supera SKELETON_DELAY_MS; una carga rápida no parpadea.
 */
export function useSkeletonDelay(): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SKELETON_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])
  return visible
}
