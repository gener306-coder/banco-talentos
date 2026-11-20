import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { conversationNotice } from '../linkage/browserNotifications'
import type { LinkageSide, UnreadSummary } from '../linkage/conversationApi'
import { useUnreadSummarySubscription } from '../linkage/unreadSummaryContext'
import { ChevronRightIcon, MessageIcon } from './icons'
import { useGlobalSnackbar } from './snackbarContext'

const INBOX: Record<LinkageSide, string> = { COMPANY: '/linkage-requests', INSTITUTION: '/institution/linkage-requests' }

const conversations = (count: number) => (count === 1 ? '1 conversación' : `${count} conversaciones`)
const badgeText = (count: number) => (count > 99 ? '99+' : String(count))

/**
 * Mensajes sin leer en la barra superior (T-S14-17), para empresa e institución. El ícono lleva el número de
 * conversaciones con mensajes sin leer y abre un panel con cada una (la otra organización, la oportunidad y cuántos
 * mensajes), que lleva a su conversación. Cuando llega un mensaje nuevo sale un aviso breve con «Ver», salvo que esa
 * conversación esté abierta y a la vista. Se alimenta del resumen único (`UnreadSummaryProvider`), así que no agrega
 * peticiones; con el panel se cierra con Esc, con un clic fuera o al navegar, como el menú de cuenta.
 */
export function MessagesMenu() {
  const state = useUnreadSummarySubscription(true)
  const summary = state?.summary ?? null
  const side = state?.side ?? null
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const notify = useGlobalSnackbar()

  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  // Mensajes nuevos: la primera respuesta de cada cuenta es la línea base (lo que ya estaba sin leer no se avisa); después,
  // cada conversación cuyo último mensaje sin leer es más reciente que el conocido.
  const known = useRef<{ account: string; ids: Map<number, number> } | null>(null)
  const where = useRef(pathname)
  useEffect(() => { where.current = pathname }, [pathname])
  useEffect(() => {
    if (!summary || !side || !state) return
    const previous = known.current?.account === state.account ? known.current.ids : null
    known.current = { account: state.account, ids: new Map(summary.items.map((item) => [item.id, item.last_message_id])) }
    if (previous === null) return
    const fresh = summary.items.filter((item) => item.last_message_id > (previous.get(item.id) ?? 0))
      .filter((item) => document.hidden || conversationNotice(side, item).url !== where.current)
    if (fresh.length === 0) return
    if (fresh.length === 1) {
      const notice = conversationNotice(side, fresh[0])
      notify(notice.title, { icon: <MessageIcon />, action: { label: 'Ver', onClick: () => { void navigate(notice.url) } } })
    } else {
      notify(`Mensajes nuevos en ${conversations(fresh.length)}`, { icon: <MessageIcon />, action: { label: 'Ver', onClick: () => setOpen(true) } })
    }
  }, [summary, side, state, notify, navigate])

  if (!side) return null
  const count = summary?.conversations ?? 0

  return (
    <div className="messages-menu" ref={root}>
      <button ref={trigger} type="button" className="messages-trigger"
        aria-label={count > 0 ? `Mensajes sin leer: ${conversations(count)}` : 'Mensajes, sin pendientes'}
        aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((value) => !value)}>
        <MessageIcon />
        {/* La insignia rebota al cambiar (key), sin anunciarse aparte: el nombre del botón ya dice cuántas son. */}
        {count > 0 && <span key={count} className="messages-badge" aria-hidden="true">{badgeText(count)}</span>}
      </button>
      {open && <MessagesPanel id={panelId} side={side} summary={summary} onNavigate={() => setOpen(false)} />}
    </div>
  )
}

function MessagesPanel({ id, side, summary, onNavigate }: { id: string; side: LinkageSide; summary: UnreadSummary | null; onNavigate: () => void }) {
  const items = summary?.items ?? []
  return (
    <div className="account-panel messages-panel" id={id} role="region" aria-label="Mensajes sin leer">
      <p className="messages-panel-title">Mensajes sin leer</p>
      {items.length === 0
        ? <p className="messages-empty">{summary ? 'Estás al día: no tienes mensajes sin leer.' : 'Consultando tus mensajes…'}</p>
        : (
          <ul className="messages-list">
            {items.map((item) => (
              <li key={item.id}>
                <Link className="messages-item" to={conversationNotice(side, item).url} onClick={onNavigate}>
                  <span className="messages-item-text">
                    <span className="messages-item-name">{item.counterpart_name}</span>
                    <span className="messages-item-detail">{item.opportunity_title}</span>
                  </span>
                  <span className="messages-item-count" aria-label={item.unread_count === 1 ? '1 mensaje sin leer' : `${item.unread_count} mensajes sin leer`}>
                    {badgeText(item.unread_count)}
                  </span>
                  <ChevronRightIcon />
                </Link>
              </li>
            ))}
          </ul>
        )}
      <div className="account-panel-section">
        <Link className="messages-all" to={INBOX[side]} onClick={onNavigate}>Ver todas las solicitudes<ChevronRightIcon /></Link>
      </div>
    </div>
  )
}
