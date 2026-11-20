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
import { initials, layoutThread } from './chatLayout'
import type { Bubble as ThreadBubble } from './chatLayout'
import { ArrowUpIcon } from '../ui/icons'
import './linkage.css'

/** Consulta periódica con la pestaña visible (HU-S13-03 CA-04). */
export const POLL_INTERVAL_MS = 15_000

/** Distancia al final del hilo con la que aún se considera que la persona lo está siguiendo. */
const STICK_THRESHOLD_PX = 48

// T-S13-07: la fecha va en el separador del día; la burbuja solo lleva la hora.
const timeFormat = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' })

/** Altura máxima del campo de texto al crecer con el contenido (unas 6 líneas). */
const COMPOSER_MAX_HEIGHT_PX = 144

/** El contador aparece al acercarse al límite de 2000 caracteres. */
export const COUNTER_FROM = 1800
/** Tiempo sin desplazarse tras el que el separador de día fijo se desvanece. */
export const DAY_LABEL_IDLE_MS = 1200
export const SEND_HINT = 'Enter para enviar; Shift + Enter para un salto de línea.'

const isTouch = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

// sessionStorage puede no estar disponible (navegación privada o datos bloqueados): el borrador es solo una comodidad.
function readDraft(key: string): string {
  try { return window.sessionStorage.getItem(key) ?? '' } catch { return '' }
}
function writeDraft(key: string, value: string) {
  try {
    if (value) window.sessionStorage.setItem(key, value)
    else window.sessionStorage.removeItem(key)
  } catch { /* sin almacenamiento, sin borrador */ }
}

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
    // T-S14-13: el historial se conserva para consulta.
    case 'BAJA':
      return 'La vinculación se dio de baja: la conversación queda en solo lectura. Conserva el historial para consulta.'
    default:
      return `La conversación es de solo lectura: ${counterpart[role]} ya no está activa en la plataforma. Conserva el historial para consulta.`
  }
}

/**
 * Conversación de una solicitud (HU-S13-03, HU-S13-06), con presentación de app de mensajería (T-S13-07): encabezado y
 * campo de texto de vidrio sobre el hilo, separadores de día fijos al desplazarse y burbujas agrupadas por remitente.
 * Empieza con las burbujas de la solicitud (`intro`). Solo una solicitud aceptada carga el hilo, lo consulta cada 15 s
 * con la pestaña visible, marca como leído el último mensaje mostrado y admite escritura, salvo que la otra
 * organización esté inactiva (`meta.can_write`) o quien la monta lo indique con `readOnly`.
 */
export function LinkageConversation({ linkageRequestId, role, status, intro = [], readOnly = false, closedAction, header }: {
  linkageRequestId: number
  role: LinkageSide
  status: LinkageStatus
  intro?: IntroMessage[]
  readOnly?: boolean
  /** Acción junto al motivo de solo lectura (por ejemplo, «Responder solicitud» para la institución). */
  closedAction?: ReactNode
  /** Encabezado que flota sobre el hilo (nombre de la otra organización, estado, regreso). */
  header?: ReactNode
}) {
  // T-S14-13: una vinculación dada de baja también carga su historial, en solo lectura.
  const accepted = status === 'ACEPTADA' || status === 'BAJA'
  const load = useCallback(
    (signal: AbortSignal) => accepted ? listLinkageMessages(role, linkageRequestId, 0, signal) : Promise.resolve(CLOSED_THREAD),
    [accepted, role, linkageRequestId],
  )
  const { data, loading, failure, refresh, setData } = useApiRequest(load, conversationMessages)
  const mutation = useApiMutation(conversationMessages)
  // El borrador sobrevive a ir al perfil, la oportunidad o la solicitud y volver (solo en esta pestaña).
  const draftKey = `linkage-draft:${role}:${linkageRequestId}`
  const [body, setBody] = useState(() => readDraft(draftKey))
  useEffect(() => writeDraft(draftKey, body), [draftKey, body])
  const [localError, setLocalError] = useState<string | null>(null)
  const [unseen, setUnseen] = useState(false)
  const thread = useRef<HTMLDivElement | null>(null)
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const frame = useRef<HTMLDivElement | null>(null)
  const bar = useRef<HTMLDivElement | null>(null)
  const dock = useRef<HTMLDivElement | null>(null)
  // La persona sigue el final del hilo: los mensajes nuevos la bajan. Si subió a leer, no se le mueve la vista.
  const following = useRef(true)
  const lastId = data?.items.at(-1)?.id ?? 0
  const lastIdRef = useRef(0)
  const readRequested = useRef(0)
  // Una dada de baja ya no recibe mensajes: no se consulta periódicamente.
  const polling = status === 'ACEPTADA' && data !== null

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

  const bubbles: ThreadBubble[] = [
    ...intro.map((message) => ({
      key: message.key, own: message.is_own, name: message.sender_name, createdAt: message.created_at, body: message.body, label: message.label,
    })),
    ...(data?.items ?? []).map((message) => ({
      key: String(message.id), own: message.is_own, name: message.is_own ? (message.account_name ?? message.sender_name) : message.sender_name,
      createdAt: message.created_at, body: message.body,
    })),
  ]

  const days = layoutThread(bubbles)

  // T-S13-07: el encabezado y el campo de texto flotan sobre el hilo con efecto de vidrio. Sus alturas reales se pasan
  // al hilo como relleno (--chat-top, --chat-bottom), para que el primer y el último mensaje no queden tapados y los
  // separadores de día se fijen justo bajo el encabezado. Se escriben en el estilo, sin volver a renderizar.
  useLayoutEffect(() => {
    const measure = () => {
      frame.current?.style.setProperty('--chat-top', `${bar.current?.offsetHeight ?? 0}px`)
      frame.current?.style.setProperty('--chat-bottom', `${dock.current?.offsetHeight ?? 0}px`)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    if (bar.current) observer.observe(bar.current)
    if (dock.current) observer.observe(dock.current)
    return () => observer.disconnect()
  }, [loading])

  // El campo de texto crece con el contenido hasta unas 6 líneas; con una sola línea es una píldora.
  useLayoutEffect(() => {
    const field = textarea.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${Math.min(field.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`
  }, [body])

  // Auto-scroll: con cada mensaje nuevo, el hilo baja al final solo si la persona ya estaba ahí (o si el mensaje es
  // suyo). Se mueve el contenedor, no la página; su relleno inferior deja el último mensaje sobre el campo de texto.
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

  // T-S13-07: el separador fijo bajo el encabezado se muestra mientras se desplaza y se desvanece después; el que
  // está en su lugar dentro del hilo no cambia. Se marca directamente en el DOM para no volver a renderizar el hilo.
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(idleTimer.current), [])
  function revealDayLabels(list: HTMLElement) {
    const listTop = list.getBoundingClientRect().top
    for (const label of list.querySelectorAll<HTMLElement>('.linkage-day-label')) {
      const stickyTop = parseFloat(getComputedStyle(label).top) || 0
      label.classList.toggle('stuck', label.getBoundingClientRect().top - listTop <= stickyTop + 1)
    }
    list.classList.add('is-scrolling')
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => list.classList.remove('is-scrolling'), DAY_LABEL_IDLE_MS)
  }

  function onScroll() {
    const list = thread.current
    if (!list) return
    revealDayLabels(list)
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

  // Enter envía y Shift + Enter agrega un salto de línea, como en los chats habituales. En pantallas táctiles Enter
  // es salto de línea (se envía con el botón). Nunca se envía mientras un método de entrada compone una palabra.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    if (isTouch() && !event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    void send()
  }

  const serverError = mutation.failure && (mutation.failure.errors.body?.join(' ') ?? mutation.failure.errors.status?.join(' ') ?? mutation.failure.message)
  const messageError = localError ?? serverError
  const writable = accepted && !readOnly && data?.canWrite !== false
  const emptyText = accepted
    ? `Aún no hay mensajes.${writable ? ` Escribe el primero para coordinar la vinculación con ${counterpart[role]}.` : ''}`
    : 'La empresa no envió mensaje con la solicitud.'

  const fieldId = `linkage-composer-${linkageRequestId}`
  const countId = `linkage-composer-count-${linkageRequestId}`
  const hintId = `linkage-composer-hint-${linkageRequestId}`
  const nearLimit = body.length >= COUNTER_FROM
  const errorId = `linkage-composer-error-${linkageRequestId}`

  return (
    <div ref={frame} className="linkage-conversation">
      {header && <div ref={bar} className="linkage-chat-bar">{header}</div>}

      {/* Región desplazable con su propio foco: el teclado puede recorrer el historial. Pasa por debajo del encabezado
          y del campo de texto. */}
      <div ref={thread} className="linkage-thread" role="log" aria-label="Mensajes" aria-live="polite" tabIndex={0} onScroll={onScroll}>
        {loading ? <LoadingState label="Cargando conversación…" variant="details" />
          : failure ? <InstitutionRequestError failure={failure} retry={refresh} />
          : data && bubbles.length === 0 ? <p className="linkage-thread-empty">{emptyText}</p>
          : days.map((day) => (
            <section key={day.key} className="linkage-day" aria-label={day.label}>
              {/* Separador del día: se queda fijo bajo el encabezado mientras su día está a la vista. */}
              <p className="linkage-day-label" aria-hidden="true"><span>{day.label}</span></p>
              <ol className="linkage-thread-list">
                {day.bubbles.map((bubble) => {
                  const opensGroup = bubble.position === 'single' || bubble.position === 'first'
                  const closesGroup = bubble.position === 'single' || bubble.position === 'last'
                  return (
                    <li key={bubble.key} className={`linkage-bubble ${bubble.own ? 'own' : 'other'} ${bubble.position}${bubble.label ? ' intro' : ''}`}>
                      {/* Estilo Messenger: el remitente va sobre el grupo, fuera de la burbuja. */}
                      {opensGroup && <span className="linkage-bubble-name">{bubble.name}</span>}
                      <div className="linkage-bubble-row">
                        {/* Del otro lado, su avatar acompaña la última burbuja del grupo; las demás reservan el espacio. */}
                        {!bubble.own && (closesGroup
                          ? <span className="linkage-avatar small" aria-hidden="true">{initials(bubble.name)}</span>
                          : <span className="linkage-avatar-spacer" aria-hidden="true" />)}
                        <div className="linkage-bubble-body">
                          {bubble.label && <span className="linkage-bubble-label">{bubble.label}</span>}
                          <p className="linkage-bubble-text">
                            {bubble.body}
                            <time className="linkage-bubble-time" dateTime={bubble.createdAt}>{timeFormat.format(new Date(bubble.createdAt))}</time>
                          </p>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
      </div>
      {unseen && <button type="button" className="secondary linkage-thread-latest" onClick={showLatest}>Ver mensajes nuevos</button>}

      {data && (
        <div ref={dock} className="linkage-chat-dock">
          {writable
            ? (
              <form className="linkage-composer" onSubmit={(event) => { void send(event) }} aria-busy={mutation.pending} noValidate>
                <label className="visually-hidden" htmlFor={fieldId}>Mensaje para {counterpart[role]}</label>
                <div className="linkage-composer-pill">
                  <textarea ref={textarea} id={fieldId} name="body" rows={1} maxLength={LINKAGE_CONVERSATION_LIMIT}
                    placeholder={`Mensaje para ${counterpart[role]}`}
                    value={body} disabled={mutation.pending} aria-invalid={Boolean(messageError)}
                    aria-describedby={[hintId, nearLimit ? countId : null, messageError ? errorId : null].filter(Boolean).join(' ')}
                    onChange={(event) => { setBody(event.target.value); setLocalError(null) }} onKeyDown={onKeyDown} />
                  {/* Botón circular: solo se habilita con texto. */}
                  <button type="submit" className="linkage-send" aria-label={mutation.pending ? 'Enviando…' : 'Enviar mensaje'}
                    title="Enviar (Enter)" disabled={mutation.pending || body.trim() === ''}><ArrowUpIcon /></button>
                </div>
                {/* Estilo Messenger: sin línea fija bajo el campo. El atajo queda como descripción accesible y el contador
                    aparece al acercarse al límite (HU-S13-03 CA-02). */}
                <span className="visually-hidden" id={hintId}>{SEND_HINT}</span>
                {nearLimit && <p className="linkage-composer-hint" id={countId}>{body.length} de {LINKAGE_CONVERSATION_LIMIT} caracteres</p>}
                {messageError && <p className="field-error" id={errorId} role="alert">{messageError}</p>}
              </form>
            )
            : (
              <div className="linkage-closed" role="note">
                <p>{closedReason(status, role)}</p>
                {!accepted && closedAction}
              </div>
            )}
        </div>
      )}
    </div>
  )
}
