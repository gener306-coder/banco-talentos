import { useId, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from './modal'

/**
 * Confirmación con scrim para acciones con consecuencias. El diálogo nace del control que lo abrió
 * (transform-origin en el disparador) y el foco inicial queda en «Cancelar», la opción segura.
 */
export function ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onCancel, origin }: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  origin?: RefObject<HTMLElement | null>
}) {
  const layer = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const id = useId()
  useModal(open, layer, onCancel)

  useLayoutEffect(() => {
    if (!open || !dialog.current || !origin?.current) return
    const from = origin.current.getBoundingClientRect(), box = dialog.current.getBoundingClientRect()
    dialog.current.style.transformOrigin = `${from.left + from.width / 2 - box.left}px ${from.top + from.height / 2 - box.top}px`
  }, [open, origin])

  if (!open) return null
  return createPortal(
    <div className="modal-layer" ref={layer}>
      <div className="modal-scrim" onClick={onCancel} />
      <div className="modal-dialog" ref={dialog} role="alertdialog" aria-modal="true"
        aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
        <h2 id={`${id}-title`}>{title}</h2>
        <p id={`${id}-description`}>{description}</p>
        <div className="actions">
          <button type="button" onClick={onConfirm}>{confirmLabel}</button>
          <button type="button" className="secondary" onClick={onCancel} data-autofocus>Cancelar</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
