import { useState } from 'react'
import { BellIcon, CloseIcon } from '../ui/icons'
import { notificationSupport, requestNotifications } from './browserNotifications'
import type { NotificationSupport } from './browserNotifications'

export const DISMISSED_KEY = 'linkage-notifications-dismissed'

// localStorage puede no estar disponible (navegación privada o datos bloqueados): entonces la franja vuelve a ofrecerse.
function dismissed(): boolean {
  try { return window.localStorage.getItem(DISMISSED_KEY) === '1' } catch { return false }
}
function remember() {
  try { window.localStorage.setItem(DISMISSED_KEY, '1') } catch { /* Sin almacenamiento. */ }
}

/**
 * Invitación a activar los avisos del navegador (T-S13-08), sobre la tabla de cada bandeja. El permiso se pide desde
 * el clic, como exigen los navegadores. No se muestra con el permiso concedido, sin soporte o en una conexión que no es
 * segura; si está bloqueado, explica cómo activarlo. Descartarla se recuerda en este navegador.
 */
export function NotificationPrompt() {
  const [support, setSupport] = useState<NotificationSupport>(notificationSupport)
  const [hidden, setHidden] = useState(dismissed)
  const [asking, setAsking] = useState(false)
  if (hidden || support === 'unsupported' || support === 'granted') return null

  const dismiss = () => { remember(); setHidden(true) }
  async function activate() {
    setAsking(true)
    try { setSupport(await requestNotifications()) } finally { setAsking(false) }
  }

  if (support === 'denied') {
    return (
      <div className="notify-prompt" role="note" aria-label="Avisos del navegador">
        <span className="notify-prompt-icon" aria-hidden="true"><BellIcon /></span>
        <p>Los avisos del navegador están bloqueados para este sitio. Para recibirlos, permítelos en la configuración del sitio de tu navegador.</p>
        <button type="button" className="plain notify-prompt-close" onClick={dismiss} aria-label="Descartar aviso" title="Descartar"><CloseIcon /></button>
      </div>
    )
  }
  return (
    <div className="notify-prompt" role="note" aria-label="Avisos del navegador">
      <span className="notify-prompt-icon" aria-hidden="true"><BellIcon /></span>
      <p><strong>Entérate de los mensajes nuevos.</strong> Recibe un aviso del navegador cuando te escriban, aunque estés en otra pestaña.</p>
      <div className="notify-prompt-actions">
        <button type="button" className="tinted" disabled={asking} onClick={() => { void activate() }}>Activar avisos</button>
        <button type="button" className="plain" onClick={dismiss}>Ahora no</button>
      </div>
    </div>
  )
}
