import { Link } from 'react-router'
import { MessageIcon } from '../ui/icons'
import type { LinkageSide } from './conversationApi'
import { useUnreadConversations } from './useUnreadConversations'
import './linkage.css'

/**
 * Número de conversaciones sin leer junto a «Solicitudes de vinculación» (HU-S13-04 CA-03). Sin pendientes no se
 * muestra. El lector de pantalla oye la frase completa como parte del nombre del enlace.
 */
export function UnreadBadge({ side }: { side: LinkageSide }) {
  const count = useUnreadConversations(side)
  if (count === 0) return null
  return (
    <span className="unread-badge">
      <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
      <span className="visually-hidden">{count === 1 ? ', 1 conversación con mensajes sin leer' : `, ${count} conversaciones con mensajes sin leer`}</span>
    </span>
  )
}

/** Marca «Nuevo» de una fila con mensajes sin leer (HU-S13-04 CA-04). */
export function UnreadTag({ count }: { count: number }) {
  if (count === 0) return null
  const label = count === 1 ? '1 mensaje sin leer' : `${count} mensajes sin leer`
  return (
    <span className="unread-tag" title={label}>
      Nuevo<span className="visually-hidden">: {label}</span>
    </span>
  )
}

/**
 * Acceso a la conversación desde una fila de la bandeja (T-S13-08), junto a las demás vías de contacto. Con mensajes
 * sin leer se resalta con el color de acento y muestra cuántos son, como el contador de una app de mensajería.
 */
export function ConversationLink({ to, state, counterpart, count }: { to: string; state?: unknown; counterpart: string; count: number }) {
  const unread = count === 1 ? '1 mensaje sin leer' : `${count} mensajes sin leer`
  return (
    <Link to={to} state={state} className={`conversation-link${count > 0 ? ' has-unread' : ''}`}
      aria-label={`Abrir la conversación con ${counterpart}${count > 0 ? `: ${unread}` : ''}`} title={count > 0 ? unread : 'Conversación'}>
      <MessageIcon />
      {count > 0 && <span className="conversation-count" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
    </Link>
  )
}
