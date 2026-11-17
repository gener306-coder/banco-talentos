import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { Callout } from '../ui/Callout'
import { LoadingState } from '../ui/StateMessage'
import {
  conversationMessages, LINKAGE_CONVERSATION_LIMIT, listLinkageMessages, markLinkageMessagesRead, mergeThread, sendLinkageMessage,
} from './conversationApi'
import type { LinkageSide } from './conversationApi'
import './linkage.css'

/** Consulta periódica con la pestaña visible (HU-S13-03 CA-04). */
export const POLL_INTERVAL_MS = 15_000

/** Distancia al final del hilo con la que aún se considera que la persona lo está siguiendo. */
const STICK_THRESHOLD_PX = 48

const timeFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

const counterpart: Record<LinkageSide, string> = { COMPANY: 'la institución', INSTITUTION: 'la empresa' }

/**
 * Conversación de una solicitud aceptada (HU-S13-03), compartida por el detalle de la empresa y el de la institución.
 * Carga el hilo completo y luego consulta solo lo posterior al último mensaje cada 15 s, en pausa con la pestaña
 * oculta. Marca como leído el último mensaje mostrado. La escritura se bloquea si la otra organización está inactiva
 * (`meta.can_write`) o si quien la monta lo indica con `readOnly`.
 */
export function LinkageConversation({ linkageRequestId, role, readOnly = false }: {
  linkageRequestId: number
  role: LinkageSide
  readOnly?: boolean
}) {
  const load = useCallback((signal: AbortSignal) => listLinkageMessages(role, linkageRequestId, 0, signal), [role, linkageRequestId])
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
  const loaded = data !== null
  const titleId = `linkage-conversation-title-${linkageRequestId}`

  useEffect(() => { lastIdRef.current = lastId }, [lastId])

  // CA-04: solo lo posterior al último mensaje conocido; en pausa con la pestaña oculta y al volver consulta enseguida.
  useEffect(() => {
    if (!loaded) return
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
  }, [loaded, role, linkageRequestId, setData])

  // CA-04: al montar y con cada mensaje nuevo, el marcador del lado avanza al último mostrado. Los propios ya lo
  // avanzan en el servidor al enviarse.
  const knownRead = data?.lastReadMessageId ?? 0
  useEffect(() => {
    if (lastId === 0 || lastId <= knownRead || lastId <= readRequested.current) return
    readRequested.current = lastId
    markLinkageMessagesRead(role, linkageRequestId, lastId)
      .then((marker) => setData((current) => current && mergeThread(current, { items: [], lastReadMessageId: marker })))
      .catch(() => { readRequested.current = 0 })
  }, [lastId, knownRead, role, linkageRequestId, setData])

  // Auto-scroll: con cada mensaje nuevo, el hilo baja al final solo si la persona ya estaba ahí (o si el mensaje es
  // suyo). Se mueve el contenedor, no la página.
  const count = data?.items.length ?? 0
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
  const writable = !readOnly && data?.canWrite !== false

  return (
    <section className="student-section linkage-conversation" aria-labelledby={titleId}>
      <h3 id={titleId}>Conversación con {counterpart[role]}</h3>
      <Callout tone="info" label="Aviso de privacidad">
        <p>La empresa conoce al alumno solo por su perfil. No compartas datos personales del alumno por este medio.</p>
      </Callout>
      {loading ? <LoadingState label="Cargando conversación…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} />
        : data && (
          <>
            {data.items.length === 0
              ? <p className="linkage-thread-empty">Aún no hay mensajes. {writable ? `Escribe el primero para coordinar la vinculación con ${counterpart[role]}.` : ''}</p>
              : (
                <div className="linkage-thread-frame">
                  {/* Región desplazable con su propio foco: el teclado puede recorrer el historial. */}
                  <div ref={thread} className="linkage-thread" role="log" aria-label="Mensajes" aria-live="polite" tabIndex={0} onScroll={onScroll}>
                  <ol className="linkage-thread-list">
                    {data.items.map((message) => (
                      <li key={message.id} className={`linkage-bubble ${message.is_own ? 'own' : 'other'}`}>
                        <span className="linkage-bubble-meta">
                          <strong>{message.is_own ? (message.account_name ?? message.sender_name) : message.sender_name}</strong>
                          {' · '}<time dateTime={message.created_at}>{timeFormat.format(new Date(message.created_at))}</time>
                        </span>
                        <p className="linkage-bubble-text">{message.body}</p>
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
                  <textarea ref={textarea} id={`linkage-composer-${linkageRequestId}`} name="body" rows={3} maxLength={LINKAGE_CONVERSATION_LIMIT}
                    value={body} disabled={mutation.pending} aria-invalid={Boolean(messageError)}
                    aria-describedby={[`linkage-composer-count-${linkageRequestId}`, messageError ? `linkage-composer-error-${linkageRequestId}` : null].filter(Boolean).join(' ')}
                    onChange={(event) => { setBody(event.target.value); setLocalError(null) }} onKeyDown={onKeyDown} />
                  <p className="field-hint" id={`linkage-composer-count-${linkageRequestId}`}>
                    {body.length} de {LINKAGE_CONVERSATION_LIMIT} caracteres · Ctrl + Enter para enviar
                  </p>
                  {messageError && <p className="field-error" id={`linkage-composer-error-${linkageRequestId}`} role="alert">{messageError}</p>}
                  <div className="actions">
                    <button type="submit" disabled={mutation.pending}>{mutation.pending ? 'Enviando…' : 'Enviar mensaje'}</button>
                  </div>
                </form>
              )
              : (
                <p className="notice" role="note">
                  La conversación es de solo lectura: {counterpart[role]} ya no está activa en la plataforma. Conserva el historial para consulta.
                </p>
              )}
          </>
        )}
    </section>
  )
}
