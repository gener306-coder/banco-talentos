import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/** Tiempo antes de mostrar el esqueleto: una carga rápida no debe parpadear. */
export const SKELETON_DELAY_MS = 300

/**
 * Carga: anuncia el texto de inmediato a lectores de pantalla y muestra el esqueleto
 * solo si la espera supera SKELETON_DELAY_MS.
 */
export function LoadingState({ label, variant }: { label: string; variant: 'table' | 'details' }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SKELETON_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <p className="visually-hidden" role="status">{label}</p>
      {visible && (variant === 'table'
        ? <div className="skeleton" aria-hidden="true" data-testid="skeleton">
          {Array.from({ length: 6 }, (_, row) => (
            <div className="skeleton-row" key={row}>
              <span className="bone" /><span className="bone" /><span className="bone" /><span className="bone pill" /><span className="bone pill" />
            </div>
          ))}
        </div>
        : <div className="skeleton-details" aria-hidden="true" data-testid="skeleton">
          {Array.from({ length: 8 }, (_, bone) => <span className="bone" key={bone} />)}
        </div>)}
    </>
  )
}

/** Vacío o error de una vista completa: icono, título, explicación y la siguiente acción posible. */
export function StateMessage({ kind, icon, title, description, action }: {
  kind: 'empty' | 'error'
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className={`state-message ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="state-badge" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}
