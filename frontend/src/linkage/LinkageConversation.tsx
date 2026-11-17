import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { LoadingState } from '../ui/StateMessage'
import type { LinkageStatus } from './api'
import {
  conversationMessages, LINKAGE_CONVERSATION_LIMIT, LINKAGE_READ_EVENT, listLinkageMessages, markLinkageMessagesRead, mergeThread, sendLinkageMessage,
} from './conversationApi'
import type { IntroMessage, LinkageSide, LinkageThread } from './conversationApi'
import './linkage.css'

/** Consulta periódica con la pestaña visible (HU-S13-03 CA-04). */
export const POLL_INTERVAL_MS = 15_000

/** Distancia al final del hilo con la que aún se considera que la persona lo está siguiendo. */
const STICK_THRESHOLD_PX = 48

const timeFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

const counterpart: Record<LinkageSide, string> = { COMPANY: 'la institución', INSTITUTION: 'la empresa' }

/** Hilo de una solicitud que no está aceptada: no se consulta (la API respondería 422) y no admite escritura. */
const CLOSED_THREAD: LinkageThread = { items: [], canWrite: false, lastReadMessageId: null }

/** Por qué no se puede escribir en una solicitud que no está aceptada (HU-S13-06 CA-03). */
function closedReason(status: LinkageStatus, role: LinkageSide): string {
  switch (status) {
    case 'PENDIENTE_INSTITUCION':
      return role === 'COMPANY'
        ? 'La conversación se habilita cuando la institución acepte la solicitud.'
        : 'La conversación se habilita cuando aceptes la solicitud.'
    case 'RECHAZADA':
      return role === 'COMPANY'
        ? 'La institución rechazó la solicitud; la conversación no se habilitó.'
        : 'Rechazaste esta solicitud; la conversación no se habilitó.'
    case 'CANCELADA':
      return role === 'COMPANY'
        ? 'Cancelaste esta solicitud; la conversación no se habilitó.'
        : 'La empresa canceló la solicitud; la conversación no se habilitó.'
    default:
      return `La conversación es de solo lectura: ${counterpart[role]} ya no está activa en la plataforma. Conserva el historial para consulta.`
  }
}

interface Bubble {
  key: string
  own: boolean
  name: string
  createdAt: string
  body: string
  label?: string
}

/**
 * Conversación de una solicitud (HU-S13-03, HU-S13-06), compartida por las vistas de la empresa y de la institución.
 * Empieza con las burbujas de la solicitud (`intro`). Solo una solicitud aceptada carga el hilo, lo consulta cada 15 s
 * con la pestaña visible, marca como leído el último mensaje mostrado y admite escritura, salvo que la otra
 * organización esté inactiva (`meta.can_write`) o quien la monta lo indique con `readOnly`.
 */
export function LinkageConversation({ linkageRequestId, role, status, intro = [], readOnly = false, closedAction }: {
  linkageRequestId: number
  role: LinkageSide
  status: LinkageStatus
  intro?: IntroMessage[]
  readOnly?: boolean
  /** Acción junto al motivo de solo lectura (por ejemplo, «Responder solicitud» para la institución). */
  closedAction?: ReactNode
}) {
  const accepted = status === 'ACEPTADA'
  const load = useCallback(
    (signal: AbortSignal) => accepted ? listLinkageMessages(role, linkageRequestId, 0, signal) : Promise.resolve(CLOSED_THREAD),
    [accepted, role, linkageRequestId],
  )
  const { data, loading, failure, refresh, setData } = useApiRequest(load, conversationMessages)
  const mutation = useApiMutation(conversationMessages)
  const [body, setBody] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [unseen, setUnseen] = useState(false)
  const thread = useRef<HTMLDivElement | null>(null)
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  // La persona sigue el final del hilo: los mensajes nuevos la bajan. Si subió a leer, no se le mueve la vista.
  const following = useRef(true)
  const lastId = data?.items.at(-1)?.id ?? 0
  const lastIdRef = useRef(0)
  const readRequested = useRef(0)
  const polling = accepted && data !== null

  useEffect(() => { lastIdRef.current = lastId }, [lastId])

  // HU-S13-03 CA-04: solo lo posterior al último mensaje conocido; en pausa con la pestaña oculta y al volver consulta
  // enseguida.
  useEffect(() => {
    if (!polling) return
    const controller = new AbortController()
    let timer: number | undefined
    const poll = () => {
      listLinkageMessages(role, linkageRequestId, lastIdRef.current, controller.signal)
        .then((update) => setData((current) => current && mergeThread(current, update)))
        .catch(() => { /* El siguiente intento lo reintenta. */ })
    }
    const start = () => { if (timer === undefined && !document.hidden) timer = window.setInterval(poll, POLL_INTERVAL_MS) }
    const stop = () => { window.clearInterval(timer); timer = undefined }
    const onVisibility = () => {
      if (document.hidden) { stop(); return }
      poll()
      start()
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      controller.abort()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [polling, role, linkageRequestId, setData])

  // HU-S13-03 CA-04: al montar y con cada mensaje nuevo, el marcador del lado avanza al último mostrado. Los propios ya
  // lo avanzan en el servidor al enviarse; las burbujas de la solicitud no tienen id y nunca cuentan.
  const knownRead = data?.lastReadMessageId ?? 0
  useEffect(() => {
    if (lastId === 0 || lastId <= knownRead || lastId <= readRequested.current) return
    readRequested.current = lastId
    markLinkageMessagesRead(role, linkageRequestId, lastId)
      .then((marker) => {
        setData((current) => current && mergeThread(current, { items: [], lastReadMessageId: marker }))
        // HU-S13-04: el contador del menú baja en cuanto se lee.
        window.dispatchEvent(new Event(LINKAGE_READ_EVENT))
      })
      .catch(() => { readRequested.current = 0 })
  }, [lastId, knownRead, role, linkageRequestId, setData])

  const bubbles: Bubble[] = [
    ...intro.map((message) => ({
      key: message.key, own: message.is_own, name: message.sender_name, createdAt: message.created_at, body: message.body, label: message.label,
    })),
    ...(data?.items ?? []).map((message) => ({
      key: String(message.id), own: message.is_own, name: message.is_own ? (message.account_name ?? message.sender_name) : message.sender_name,
      createdAt: message.created_at, body: message.body,
    })),
  ]

  // Auto-scroll: con cada mensaje nuevo, el hilo baja al final solo si la persona ya estaba ahí (o si el mensaje es
  // suyo). Se mueve el contenedor, no la página.
  const count = bubbles.length
  useLayoutEffect(() => {
    const list = thread.current
    if (!list || count === 0) return
    if (following.current) {
      list.scrollTop = list.scrollHeight
      setUnseen(false)
    } else {
      setUnseen(true)
    }
  }, [count])

  function onScroll() {
    const list = thread.current
    if (!list) return
    following.current = list.scrollHeight - list.scrollTop - list.clientHeight <= STICK_THRESHOLD_PX
    if (following.current) setUnseen(false)
  }

  function showLatest() {
    following.current = true
    const list = thread.current
    if (list) list.scrollTop = list.scrollHeight
    setUnseen(false)
  }

  async function send(event?: FormEvent) {
    event?.preventDefault()
    const text = body.trim()
    if (!text) {
      setLocalError('Escribe un mensaje.')
      return
    }
    setLocalError(null)
    await mutation.submit(() => sendLinkageMessage(role, linkageRequestId, text), (message) => {
      setBody('')
      following.current = true
      setData((current) => current && mergeThread(current, { items: [message], lastReadMessageId: message.id }))
      textarea.current?.focus()
    })
  }

  // Ctrl o Cmd + Enter envía; Enter solo agrega un salto de línea.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void send()
    }
  }

  const serverError = mutation.failure && (mutation.failure.errors.body?.join(' ') ?? mutation.failure.errors.status?.join(' ') ?? mutation.failure.message)
  const messageError = localError ?? serverError
  const writable = accepted && !readOnly && data?.canWrite !== false
  const emptyText = accepted
    ? `Aún no hay mensajes.${writable ? ` Escribe el primero para coordinar la vinculación con ${counterpart[role]}.` : ''}`
    : 'La empresa no envió mensaje con la solicitud.'

  return (
    <div className="linkage-conversation">
      {loading ? <LoadingState label="Cargando conversación…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} />
        : data && (
          <>
            {bubbles.length === 0
              ? <p className="linkage-thread-empty">{emptyText}</p>
              : (
                <div className="linkage-thread-frame">
                  {/* Región desplazable con su propio foco: el teclado puede recorrer el historial. */}
                  <div ref={thread} className="linkage-thread" role="log" aria-label="Mensajes" aria-live="polite" tabIndex={0} onScroll={onScroll}>
                    <ol className="linkage-thread-list">
                      {bubbles.map((bubble) => (
                        <li key={bubble.key} className={`linkage-bubble ${bubble.own ? 'own' : 'other'}${bubble.label ? ' intro' : ''}`}>
                          {bubble.label && <span className="linkage-bubble-label">{bubble.label}</span>}
                          <span className="linkage-bubble-meta">
                            <strong>{bubble.name}</strong>
                            {' · '}<time dateTime={bubble.createdAt}>{timeFormat.format(new Date(bubble.createdAt))}</time>
                          </span>
                          <p className="linkage-bubble-text">{bubble.body}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                  {unseen && <button type="button" className="secondary linkage-thread-latest" onClick={showLatest}>Ver mensajes nuevos</button>}
                </div>
              )}
            {writable
              ? (
                <form className="linkage-composer" onSubmit={(event) => { void send(event) }} aria-busy={mutation.pending} noValidate>
                  <label htmlFor={`linkage-composer-${linkageRequestId}`}>Mensaje para {counterpart[role]}</label>
                  <textarea ref={textarea} id={`linkage-composer-${linkageRequestId}`} name="body" rows={2} maxLength={LINKAGE_CONVERSATION_LIMIT}
                    value={body} disabled={mutation.pending} aria-invalid={Boolean(messageError)}
                    aria-describedby={[`linkage-composer-count-${linkageRequestId}`, messageError ? `linkage-composer-error-${linkageRequestId}` : null].filter(Boolean).join(' ')}
                    onChange={(event) => { setBody(event.target.value); setLocalError(null) }} onKeyDown={onKeyDown} />
                  <div className="linkage-composer-footer">
                    <p className="field-hint" id={`linkage-composer-count-${linkageRequestId}`}>
                      {body.length} de {LINKAGE_CONVERSATION_LIMIT} caracteres · Ctrl + Enter para enviar
                    </p>
                    <button type="submit" disabled={mutation.pending}>{mutation.pending ? 'Enviando…' : 'Enviar mensaje'}</button>
                  </div>
                  {messageError && <p className="field-error" id={`linkage-composer-error-${linkageRequestId}`} role="alert">{messageError}</p>}
                </form>
              )
              : (
                <div className="linkage-closed" role="note">
                  <p>{closedReason(status, role)}</p>
                  {!accepted && closedAction}
                </div>
              )}
          </>
        )}
    </div>
  )
}
