import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, CloseIcon } from './icons'

/** Tiempo que el aviso permanece visible; se pausa mientras el puntero o el foco están sobre él. */
const SNACKBAR_MS = 4000

/**
 * Aviso breve de confirmación (T-S14-04): superficie invertida en la parte inferior, como el aviso de copiado
 * (`.cell-toast`), con cierre manual. Se anuncia con `role="status"` sin robar el foco y respeta el movimiento reducido.
 */
export function Snackbar({ text, onDone }: { text: string; onDone: () => void }) {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const timer = setTimeout(onDone, SNACKBAR_MS)
    return () => clearTimeout(timer)
  }, [paused, onDone])

  return createPortal(
    <div className="snackbar" role="status" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <CheckIcon />
      <span className="snackbar-text">{text}</span>
      <button type="button" className="snackbar-close" aria-label="Cerrar aviso" onClick={onDone}><CloseIcon /></button>
    </div>,
    document.body,
  )
}
