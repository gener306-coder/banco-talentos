/** Contenido de un botón de envío: mientras la acción está en curso añade un indicador de progreso. */
export function PendingLabel({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return pending ? <><span className="spinner" aria-hidden="true" />{pendingLabel}</> : <>{label}</>
}
