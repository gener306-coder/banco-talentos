import type { ReactNode } from 'react'
import { PendingLabel } from '../ui/forms'
import { LockIcon } from '../ui/icons'

/** Recordatorio de privacidad de lo que solo ve la institución (HU-S3-01 CA-02). */
export function ProtectedNote({ children }: { children: ReactNode }) {
  return (
    <p className="protected-note"><LockIcon /><span><strong>Protegido.</strong> {children}</span></p>
  )
}

export function ProtectedBadge() {
  return <span className="protected-badge"><LockIcon />Protegido</span>
}

export function FieldError({ id, messages }: { id: string; messages?: string[] | string | null }) {
  const text = Array.isArray(messages) ? messages.join(' ') : messages
  return text ? <p className="field-error" id={id}>{text}</p> : null
}

/** Aviso de guardado junto al botón de la sección: tras una sección larga, un aviso arriba quedaría fuera de la vista. */
export function SaveBar({ pending, saved, label, pendingLabel, savedLabel, disabled = false }: {
  pending: boolean
  saved: boolean
  label: string
  pendingLabel: string
  savedLabel: string
  disabled?: boolean
}) {
  return (
    <>
      {saved && <p className="institution-success" role="status">{savedLabel}</p>}
      <div className="actions">
        <button type="submit" disabled={pending || disabled}>
          <PendingLabel pending={pending} label={label} pendingLabel={pendingLabel} />
        </button>
      </div>
    </>
  )
}
