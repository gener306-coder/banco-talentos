import type { ReactNode } from 'react'

/**
 * Aviso informativo o de pendiente (T-S12-04), con la misma anatomía que los avisos de resultado (.notice,
 * .institution-success): remarque izquierdo, ícono y fondo suave del tono. `info` usa el tinte de la marca (por ejemplo,
 * «Ya solicitaste la vinculación…»); `pending`, el tono de estado inactivo (datos faltantes o por confirmar).
 * El dato clave va en `<strong>`, sin comillas; la acción opcional es una pastilla.
 */
export function Callout({ tone, label, id, action, children }: {
  tone: 'info' | 'pending'
  /** Nombre accesible del aviso cuando su texto no basta para ubicarlo. */
  label?: string
  /** Para referenciarlo con aria-describedby desde un campo. */
  id?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={`callout ${tone}`} role="note" aria-label={label} id={id}>
      <div className="callout-body">{children}</div>
      {action && <div className="callout-action">{action}</div>}
    </div>
  )
}
