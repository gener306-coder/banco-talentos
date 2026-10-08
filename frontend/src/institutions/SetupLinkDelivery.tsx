import { useRef, useState } from 'react'
import type { DeliveryMethod } from './api'

/** Elección del método de entrega del enlace de configuración inicial (HU-S2-01). */
export function DeliveryMethodField({ idPrefix, value, disabled, onChange }: {
  idPrefix: string
  value: DeliveryMethod
  disabled: boolean
  onChange: (value: DeliveryMethod) => void
}) {
  return (
    <fieldset className="delivery-method" disabled={disabled}>
      <legend>Entrega del enlace de configuración</legend>
      <div>
        <input id={`${idPrefix}-delivery-email`} type="radio" name={`${idPrefix}-delivery-method`} value="email"
          checked={value === 'email'} onChange={() => onChange('email')} />
        <label htmlFor={`${idPrefix}-delivery-email`}>Enviar por correo a la persona titular</label>
      </div>
      <div>
        <input id={`${idPrefix}-delivery-manual`} type="radio" name={`${idPrefix}-delivery-method`} value="manual"
          checked={value === 'manual'} onChange={() => onChange('manual')} />
        <label htmlFor={`${idPrefix}-delivery-manual`}>Generar un enlace para compartirlo (por ejemplo, por WhatsApp)</label>
      </div>
    </fieldset>
  )
}

type CopyState = 'idle' | 'copied' | 'failed'

/**
 * Enlace manual de un solo uso. Se muestra como texto de solo lectura (no como vínculo,
 * para que el ADMIN no lo abra por error) y solo vive en el estado del componente.
 */
export function ManualSetupLink({ idPrefix, link }: { idPrefix: string; link: string }) {
  const [copy, setCopy] = useState<CopyState>('idle')
  const input = useRef<HTMLInputElement>(null)
  const inputId = `${idPrefix}-setup-link`

  async function copyLink() {
    try {
      if (!navigator.clipboard) throw new Error('Portapapeles no disponible')
      await navigator.clipboard.writeText(link)
      setCopy('copied')
    } catch {
      input.current?.select()
      setCopy('failed')
    }
  }

  return (
    <div className="manual-setup-link">
      <label htmlFor={inputId}>Enlace de configuración</label>
      <input id={inputId} ref={input} type="text" readOnly value={link} aria-describedby={`${inputId}-warning`}
        onFocus={(event) => event.currentTarget.select()} />
      <p id={`${inputId}-warning`}>Compártelo solo con la persona titular de la cuenta: caduca en 60 minutos, solo puede usarse una vez y quien lo abra podrá establecer la contraseña.</p>
      <div className="actions">
        <button type="button" className="secondary" onClick={() => { void copyLink() }}>Copiar enlace</button>
      </div>
      {copy === 'copied' && <p role="status">Enlace copiado al portapapeles.</p>}
      {copy === 'failed' && <p className="notice" role="alert">No se pudo copiar automáticamente. El enlace quedó seleccionado: cópialo manualmente.</p>}
    </div>
  )
}
