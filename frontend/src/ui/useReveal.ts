import { useEffect, useRef, useState } from 'react'

/**
 * Revelado al entrar en pantalla (T-S12-11): `pending` hasta que el elemento asoma por abajo y `shown` después,
 * una sola vez, y solo desde que `ready`. Sin IntersectionObserver queda `shown` de inmediato, así nada se oculta si el navegador no lo soporta.
 */
export function useReveal<T extends Element>(ready = true) {
  const ref = useRef<T>(null)
  const [state, setState] = useState<'pending' | 'shown'>(() => (typeof IntersectionObserver === 'function' ? 'pending' : 'shown'))

  useEffect(() => {
    const element = ref.current
    // Hasta que la vista tenga su altura final no se observa: un elemento que asoma solo un instante no se revela.
    if (state === 'shown' || !element || !ready) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setState('shown'); observer.disconnect() }
    }, { rootMargin: '0px 0px -40px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [state, ready])

  return [ref, state] as const
}
