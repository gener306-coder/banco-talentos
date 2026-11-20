import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/auth-context'
import type { AuthState } from '../auth/auth-context'
import { COUNTER_FROM, DAY_LABEL_IDLE_MS, LinkageConversation, POLL_INTERVAL_MS, SEND_HINT } from './LinkageConversation'
import type { LinkageStatus } from './api'
import { introMessages, LINKAGE_READ_EVENT } from './conversationApi'
import type { IntroMessage, LinkageMessage, LinkageSide } from './conversationApi'

// HU-S13-03 y HU-S13-06: conversación con las burbujas de la solicitud, consulta periódica, envío, marcador de lectura,
// reglas de estado y auto-scroll.
const auth: AuthState = {
  status: 'ready', user: null, message: null, pending: false,
  restore: async () => undefined, expireSession: () => undefined, signIn: async () => undefined, signOut: async () => undefined, updateUser: () => undefined,
}
const fetchMock = vi.fn<typeof fetch>()
let thread: LinkageMessage[]
let canWrite: boolean
let lastRead: number | null
let hidden: boolean

const message = (id: number, own: boolean, body: string): LinkageMessage => ({
  id, sender_party: own ? 'COMPANY' : 'INSTITUTION', sender_name: own ? 'ManuGolfo' : 'UT del Golfo', is_own: own,
  account_name: own ? 'Reclutadora' : null, body, created_at: `2026-11-17T1${id % 10}:00:00Z`,
})

const calls = (method: string, suffix = '') => fetchMock.mock.calls
  .filter(([path, init]) => (init?.method ?? 'GET') === method && String(path).includes('/messages') && String(path).endsWith(suffix))
const getPaths = () => calls('GET').map(([path]) => path)
const readIds = () => calls('POST', '/read').map(([, init]) => JSON.parse(String(init?.body)).last_read_message_id)

function renderConversation(role: LinkageSide = 'COMPANY', readOnly = false, status: LinkageStatus = 'ACEPTADA', intro: IntroMessage[] = []) {
  return render(
    <AuthContext.Provider value={auth}>
      <LinkageConversation linkageRequestId={41} role={role} readOnly={readOnly} status={status} intro={intro} />
    </AuthContext.Provider>,
  )
}

/** Burbujas de la solicitud (HU-S13-06): el mensaje de la empresa y la respuesta de la institución. */
const opening = {
  message: 'Nos interesa su perfil para tableros.', created_at: '2026-11-10T10:00:00Z',
  response_message: 'Coordinemos la entrevista.', responded_at: '2026-11-11T16:00:00Z',
}
const names = { company: 'ManuGolfo', institution: 'UT del Golfo' }

/** Avanza el intervalo de la consulta periódica y deja resolver sus promesas. */
async function tick(ms = POLL_INTERVAL_MS) {
  await act(async () => { vi.advanceTimersByTime(ms) })
}

function setHidden(value: boolean) {
  hidden = value
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
}

beforeEach(() => {
  // Solo el intervalo es falso: las promesas y los temporizadores de Testing Library siguen siendo reales.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  thread = [message(1, false, 'Hola, ¿cuándo inicia?'), message(2, true, 'El lunes 24.')]
  canWrite = true
  lastRead = 2
  hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    const url = String(path)
    if (url === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    if (url.endsWith('/read')) {
      lastRead = Math.max(lastRead ?? 0, JSON.parse(String(init?.body)).last_read_message_id)
      return Response.json({ data: { last_read_message_id: lastRead } })
    }
    if (init?.method === 'POST') {
      const sent = message(thread.length + 1, true, JSON.parse(String(init.body)).body)
      thread = [...thread, sent]
      return Response.json({ data: sent }, { status: 201 })
    }
    const after = Number(new URL(url, 'http://localhost').searchParams.get('after') ?? 0)
    return Response.json({ data: thread.filter((item) => item.id > after), meta: { has_more: false, can_write: canWrite, last_read_message_id: lastRead } })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'hidden')
  sessionStorage.clear()
})

describe('hilo de la conversación', () => {
  it('muestra los mensajes propios a la derecha y los ajenos a la izquierda (CA-02)', async () => {
    renderConversation()
    const log = await screen.findByRole('log', { name: 'Mensajes' })
    const [first, second] = await within(log).findAllByRole('listitem')
    expect(first).toHaveClass('linkage-bubble', 'other')
    expect(first).toHaveTextContent('UT del Golfo')
    expect(first).toHaveTextContent('Hola, ¿cuándo inicia?')
    // Del lado propio se nombra la cuenta; del otro, solo la organización.
    expect(second).toHaveClass('linkage-bubble', 'own')
    expect(second).toHaveTextContent('Reclutadora')
    expect(getPaths()).toEqual(['/api/linkage-requests/41/messages'])
  })

  it('usa la ruta de la institución y nombra a la empresa como contraparte', async () => {
    renderConversation('INSTITUTION')
    expect(await screen.findByLabelText('Mensaje para la empresa')).toBeInTheDocument()
    expect(getPaths()).toEqual(['/api/institution/linkage-requests/41/messages'])
  })

  it('invita a escribir el primer mensaje en una conversación vacía', async () => {
    thread = []
    lastRead = null
    renderConversation()
    expect(await screen.findByText(/Aún no hay mensajes\. Escribe el primero/)).toBeInTheDocument()
    expect(readIds()).toEqual([])
  })
})

describe('burbujas de la solicitud y estados (HU-S13-06)', () => {
  it('empieza con el mensaje de la solicitud y la respuesta, propios u ajenos según el lado, sin tocar el marcador', async () => {
    renderConversation('COMPANY', false, 'ACEPTADA', introMessages(opening, 'COMPANY', names))
    const log = await screen.findByRole('log', { name: 'Mensajes' })
    await within(log).findByText('El lunes 24.')
    const bubbles = within(log).getAllByRole('listitem')
    // El texto de la burbuja, sin la hora que va dentro de ella (T-S13-07).
    expect(bubbles.map((bubble) => bubble.querySelector('.linkage-bubble-text')?.firstChild?.textContent))
      .toEqual(['Nos interesa su perfil para tableros.', 'Coordinemos la entrevista.', 'Hola, ¿cuándo inicia?', 'El lunes 24.'])
    expect(bubbles[0]).toHaveClass('own', 'intro')
    expect(bubbles[0]).toHaveTextContent('Mensaje de la solicitud')
    expect(bubbles[0]).toHaveTextContent('ManuGolfo')
    expect(bubbles[0].querySelector('time')).toHaveAttribute('datetime', '2026-11-10T10:00:00Z')
    expect(bubbles[1]).toHaveClass('other', 'intro')
    expect(bubbles[1]).toHaveTextContent('Respuesta a la solicitud')
    // Las burbujas de la solicitud no tienen id: el marcador y `after` siguen el hilo.
    await tick()
    expect(getPaths().at(-1)).toBe('/api/linkage-requests/41/messages?after=2')
    expect(readIds()).toEqual([])
  })

  it('del lado de la institución, el mensaje de la empresa es ajeno y su respuesta es propia', async () => {
    renderConversation('INSTITUTION', false, 'ACEPTADA', introMessages(opening, 'INSTITUTION', names))
    const bubbles = await within(await screen.findByRole('log', { name: 'Mensajes' })).findAllByRole('listitem')
    expect(bubbles[0]).toHaveClass('other')
    expect(bubbles[1]).toHaveClass('own')
  })

  it.each([
    ['PENDIENTE_INSTITUCION', 'COMPANY', 'La conversación se habilita cuando la institución acepte la solicitud.'],
    ['PENDIENTE_INSTITUCION', 'INSTITUTION', 'La conversación se habilita cuando aceptes la solicitud.'],
    ['RECHAZADA', 'COMPANY', 'La institución rechazó la solicitud; la conversación no se habilitó.'],
    ['CANCELADA', 'INSTITUTION', 'La empresa canceló la solicitud; la conversación no se habilitó.'],
  ] as const)('en %s (%s) no consulta el hilo, muestra solo la solicitud y explica por qué no se escribe (CA-03)', async (status, role, reason) => {
    const intro = introMessages({ ...opening, ...(status === 'PENDIENTE_INSTITUCION' ? { response_message: null, responded_at: null } : {}) }, role, names)
    renderConversation(role, false, status, intro)
    expect(await screen.findByRole('note')).toHaveTextContent(reason)
    expect(screen.getByText('Nos interesa su perfil para tableros.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await tick(POLL_INTERVAL_MS * 2)
    expect(getPaths()).toEqual([])
    expect(readIds()).toEqual([])
  })

  it('dada de baja conserva el historial en solo lectura y deja de consultarlo (T-S14-13)', async () => {
    canWrite = false
    renderConversation('COMPANY', false, 'BAJA')
    expect(await within(await screen.findByRole('log', { name: 'Mensajes' })).findByText('El lunes 24.')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('La vinculación se dio de baja: la conversación queda en solo lectura.')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    const loaded = getPaths().length
    await tick(POLL_INTERVAL_MS * 2)
    expect(getPaths()).toHaveLength(loaded)
  })

  it('sin mensaje en la solicitud explica que la empresa no escribió', async () => {
    renderConversation('INSTITUTION', false, 'PENDIENTE_INSTITUCION', [])
    expect(await screen.findByText('La empresa no envió mensaje con la solicitud.')).toBeInTheDocument()
    expect(getPaths()).toEqual([])
  })
})

describe('consulta periódica (CA-04)', () => {
  it('trae cada 15 s solo lo posterior al último mensaje y marca como leído lo que llega', async () => {
    renderConversation()
    await screen.findByText('El lunes 24.')
    expect(readIds()).toEqual([])

    await tick(POLL_INTERVAL_MS - 1)
    expect(getPaths()).toHaveLength(1)

    thread = [...thread, message(3, false, '¿Necesita gafete?')]
    await tick(1)
    expect(await screen.findByText('¿Necesita gafete?')).toBeInTheDocument()
    expect(getPaths()).toEqual(['/api/linkage-requests/41/messages', '/api/linkage-requests/41/messages?after=2'])
    await waitFor(() => expect(readIds()).toEqual([3]))

    // Sin novedades, consulta de nuevo sin repetir mensajes ni marcadores.
    await tick()
    expect(getPaths().at(-1)).toBe('/api/linkage-requests/41/messages?after=3')
    expect(screen.getAllByText('¿Necesita gafete?')).toHaveLength(1)
    expect(readIds()).toEqual([3])
  })

  it('marca como leído al abrir si hay mensajes posteriores al marcador del lado y avisa al contador del menú', async () => {
    const onRead = vi.fn()
    window.addEventListener(LINKAGE_READ_EVENT, onRead)
    lastRead = 1
    renderConversation()
    await screen.findByText('El lunes 24.')
    await waitFor(() => expect(readIds()).toEqual([2]))
    expect(calls('POST', '/read')[0][0]).toBe('/api/linkage-requests/41/messages/read')
    // HU-S13-04: el aviso de conversaciones sin leer se actualiza sin esperar a su siguiente consulta.
    await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1))
    window.removeEventListener(LINKAGE_READ_EVENT, onRead)
  })

  it('se detiene con la pestaña oculta y consulta en cuanto vuelve a estar visible', async () => {
    renderConversation()
    await screen.findByText('El lunes 24.')

    setHidden(true)
    thread = [...thread, message(3, false, 'Mensaje en segundo plano')]
    await tick(POLL_INTERVAL_MS * 3)
    expect(getPaths()).toHaveLength(1)
    expect(screen.queryByText('Mensaje en segundo plano')).not.toBeInTheDocument()

    setHidden(false)
    expect(await screen.findByText('Mensaje en segundo plano')).toBeInTheDocument()
    expect(getPaths()).toHaveLength(2)
    // Y reanuda el intervalo.
    await tick()
    expect(getPaths()).toHaveLength(3)
  })

  it('deja de consultar al desmontarse', async () => {
    const view = renderConversation()
    await screen.findByText('El lunes 24.')
    view.unmount()
    await tick(POLL_INTERVAL_MS * 2)
    expect(getPaths()).toHaveLength(1)
  })
})

describe('envío (CA-02)', () => {
  it('envía el texto, cuenta los caracteres, bloquea el campo mientras envía y lo limpia', async () => {
    let release: () => void = () => undefined
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (path, init) => {
      if (init?.method === 'POST' && !String(path).endsWith('/read') && String(path).includes('/messages')) {
        await new Promise<void>((resolve) => { release = resolve })
      }
      return base(path, init)
    })
    renderConversation()
    const field = await screen.findByLabelText('Mensaje para la institución')
    // T-S13-07: sin línea fija; el atajo es parte de la descripción accesible y el contador aparece cerca del límite.
    expect(field).toHaveAccessibleDescription(SEND_HINT)
    fireEvent.change(field, { target: { value: 'a'.repeat(COUNTER_FROM - 1) } })
    expect(screen.queryByText(/de 2000 caracteres/)).not.toBeInTheDocument()
    fireEvent.change(field, { target: { value: 'a'.repeat(COUNTER_FROM) } })
    expect(screen.getByText(`${COUNTER_FROM} de 2000 caracteres`)).toBeInTheDocument()
    expect(field).toHaveAccessibleDescription(`${SEND_HINT} ${COUNTER_FROM} de 2000 caracteres`)
    fireEvent.change(field, { target: { value: '  Llevará gafete.  ' } })

    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))
    expect(await screen.findByRole('button', { name: 'Enviando…' })).toBeDisabled()
    expect(field).toBeDisabled()
    // Un segundo clic no duplica el envío.
    fireEvent.click(screen.getByRole('button', { name: 'Enviando…' }))

    await act(async () => { release() })
    expect(await screen.findByText('Llevará gafete.')).toBeInTheDocument()
    expect(field).toHaveValue('')
    expect(field).toBeEnabled()
    const posts = calls('POST').filter(([path]) => !String(path).endsWith('/read'))
    expect(posts).toHaveLength(1)
    expect(posts[0][0]).toBe('/api/linkage-requests/41/messages')
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({ body: 'Llevará gafete.' })

    // La consulta periódica no lo repite, y el envío ya dejó leído el lado: no hace falta marcarlo.
    await tick()
    expect(screen.getAllByText('Llevará gafete.')).toHaveLength(1)
    expect(readIds()).toEqual([])
  })

  it('envía con Enter (y con Ctrl + Enter); Shift + Enter es un salto de línea', async () => {
    renderConversation()
    const field = await screen.findByLabelText('Mensaje para la institución')
    const posts = () => calls('POST').filter(([path]) => !String(path).endsWith('/read'))
    fireEvent.change(field, { target: { value: 'Confirmado' } })
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true })
    // Mientras un método de entrada compone una palabra, Enter la confirma y no envía.
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
    expect(posts()).toHaveLength(0)
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(await screen.findByText('Confirmado')).toBeInTheDocument()
    fireEvent.change(field, { target: { value: 'Y otra cosa' } })
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })
    expect(await screen.findByText('Y otra cosa')).toBeInTheDocument()
    expect(posts()).toHaveLength(2)
  })

  it('en pantallas táctiles Enter es salto de línea y se envía con el botón', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)', media: query, addEventListener() {}, removeEventListener() {} }))
    renderConversation()
    const field = await screen.findByLabelText('Mensaje para la institución')
    fireEvent.change(field, { target: { value: 'Desde el celular' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(calls('POST').filter(([path]) => !String(path).endsWith('/read'))).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))
    expect(await screen.findByText('Desde el celular')).toBeInTheDocument()
  })

  it('conserva el borrador al salir y volver a la conversación, y lo descarta al enviarlo', async () => {
    const first = renderConversation()
    fireEvent.change(await screen.findByLabelText('Mensaje para la institución'), { target: { value: 'Pendiente de confirmar' } })
    first.unmount()
    renderConversation()
    const field = await screen.findByLabelText('Mensaje para la institución')
    expect(field).toHaveValue('Pendiente de confirmar')
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(await screen.findByText('Pendiente de confirmar', { selector: '.linkage-bubble-text' })).toBeInTheDocument()
    expect(sessionStorage.getItem('linkage-draft:COMPANY:41')).toBeNull()
  })

  it('no envía un mensaje vacío y conserva el texto si el servidor lo rechaza', async () => {
    renderConversation()
    const field = await screen.findByLabelText('Mensaje para la institución')
    // T-S13-07: el botón circular solo se habilita con texto; Enter con espacios explica por qué no se envía.
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled()
    fireEvent.change(field, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled()
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe un mensaje.')
    expect(field).toHaveAccessibleDescription(/Escribe un mensaje\./)

    fetchMock.mockImplementationOnce(async () => new Response(null, { status: 204 }))
      .mockImplementationOnce(async () => Response.json({ message: 'Too Many Attempts.' }, { status: 429 }))
    fireEvent.change(field, { target: { value: 'Otro más' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enviaste demasiados mensajes seguidos. Espera un minuto antes de enviar otro.')
    expect(field).toHaveValue('Otro más')
  })
})

describe('solo lectura (CA-05)', () => {
  it('oculta el campo y explica por qué cuando la otra organización está inactiva', async () => {
    canWrite = false
    renderConversation()
    expect(await screen.findByText('El lunes 24.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar mensaje' })).not.toBeInTheDocument()
    expect(screen.getByText(/La conversación es de solo lectura: la institución ya no está activa/)).toBeInTheDocument()
  })

  it('respeta la bandera readOnly de quien la monta', async () => {
    renderConversation('INSTITUTION', true)
    expect(await screen.findByText('El lunes 24.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('presentación de mensajería (T-S13-07)', () => {
  it('pinta un separador por día y agrupa las burbujas consecutivas del mismo remitente', async () => {
    const today = new Date()
    const iso = (daysAgo: number, minutes: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo, 9, minutes).toISOString()
    thread = [
      { ...message(1, false, 'Ayer'), created_at: iso(1, 0) },
      { ...message(2, true, 'Uno'), created_at: iso(0, 0) },
      { ...message(3, true, 'Dos'), created_at: iso(0, 1) },
      { ...message(4, true, 'Tres'), created_at: iso(0, 2) },
    ]
    lastRead = 4
    renderConversation()
    const log = await screen.findByRole('log', { name: 'Mensajes' })
    const yesterday = await within(log).findByRole('region', { name: 'Ayer' })
    const todayGroup = within(log).getByRole('region', { name: 'Hoy' })
    expect(within(yesterday).getAllByRole('listitem')).toHaveLength(1)
    const bubbles = within(todayGroup).getAllByRole('listitem')
    expect(bubbles.map((bubble) => [...bubble.classList].find((name) => ['single', 'first', 'middle', 'last'].includes(name))))
      .toEqual(['first', 'middle', 'last'])
    // Solo la primera burbuja del grupo nombra al remitente; todas llevan su hora dentro.
    expect(bubbles.map((bubble) => bubble.querySelector('.linkage-bubble-name')?.textContent ?? null)).toEqual(['Reclutadora', null, null])
    expect(bubbles.every((bubble) => bubble.querySelector('time.linkage-bubble-time'))).toBe(true)
    // Las propias no llevan avatar.
    expect(todayGroup.querySelector('.linkage-avatar')).toBeNull()
  })

  it('el separador fijo se ve mientras se desplaza el hilo y se desvanece al detenerse, para no tapar mensajes', async () => {
    const position = (top: number) => ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) })
    renderConversation()
    const log = await screen.findByRole('log', { name: 'Mensajes' })
    const label = log.querySelector<HTMLElement>('.linkage-day-label')!
    // En su lugar dentro del hilo (más abajo que la posición fija) nunca se marca como fijo.
    vi.spyOn(label, 'getBoundingClientRect').mockReturnValue(position(120))
    fireEvent.scroll(log)
    expect(log).toHaveClass('is-scrolling')
    expect(label).not.toHaveClass('stuck')
    // Fijo bajo el encabezado: solo visible mientras dura el desplazamiento.
    vi.spyOn(label, 'getBoundingClientRect').mockReturnValue(position(0))
    fireEvent.scroll(log)
    expect(label).toHaveClass('stuck')
    await waitFor(() => expect(log).not.toHaveClass('is-scrolling'), { timeout: DAY_LABEL_IDLE_MS + 1000 })
  })

  it('del otro lado, el avatar acompaña solo la última burbuja del grupo y las demás reservan su espacio', async () => {
    const base = new Date(2026, 10, 17, 9, 0).getTime()
    const minute = (n: number) => new Date(base + n * 60_000).toISOString()
    thread = [
      { ...message(1, false, 'Uno'), created_at: minute(0) },
      { ...message(2, false, 'Dos'), created_at: minute(1) },
      { ...message(3, false, 'Tres'), created_at: minute(2) },
    ]
    lastRead = 3
    renderConversation()
    const log = await screen.findByRole('log', { name: 'Mensajes' })
    const bubbles = await within(log).findAllByRole('listitem')
    expect(bubbles.map((bubble) => bubble.querySelector('.linkage-avatar')?.textContent ?? null)).toEqual([null, null, 'UG'])
    expect(bubbles.map((bubble) => Boolean(bubble.querySelector('.linkage-avatar-spacer')))).toEqual([true, true, false])
    expect(bubbles[2].querySelector('.linkage-avatar')).toHaveAttribute('aria-hidden', 'true')
  })

  it('el botón circular de enviar solo se habilita con texto', async () => {
    renderConversation()
    const field = await screen.findByLabelText('Mensaje para la institución')
    const button = screen.getByRole('button', { name: 'Enviar mensaje' })
    expect(field).toHaveAttribute('placeholder', 'Mensaje para la institución')
    expect(button).toBeDisabled()
    fireEvent.change(field, { target: { value: 'Hola' } })
    expect(button).toBeEnabled()
    fireEvent.change(field, { target: { value: '' } })
    expect(button).toBeDisabled()
  })

  it('pasa al hilo la altura del encabezado y del campo de texto, que flotan sobre él', async () => {
    const { container } = render(
      <AuthContext.Provider value={auth}>
        <LinkageConversation linkageRequestId={41} role="COMPANY" status="ACEPTADA" header={<h2>Conversación con UT del Golfo</h2>} />
      </AuthContext.Provider>,
    )
    await screen.findByText('El lunes 24.')
    const frame = container.querySelector<HTMLElement>('.linkage-conversation')!
    expect(frame.querySelector('.linkage-chat-bar')).toHaveTextContent('Conversación con UT del Golfo')
    expect(frame.querySelector('.linkage-chat-dock form')).not.toBeNull()
    // jsdom no calcula alturas, pero las variables quedan definidas para el relleno del hilo.
    expect(frame.style.getPropertyValue('--chat-top')).toBe('0px')
    expect(frame.style.getPropertyValue('--chat-bottom')).toBe('0px')
  })
})

describe('auto-scroll', () => {
  /** jsdom no calcula alturas: el hilo mide 1000 px de contenido en una ventana de 300. */
  function measure(log: HTMLElement) {
    Object.defineProperty(log, 'scrollHeight', { configurable: true, get: () => 1000 })
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => 300 })
  }

  it('baja al final con los mensajes nuevos si la persona seguía el final', async () => {
    renderConversation()
    const log = await screen.findByRole('log', { name: 'Mensajes' })
    measure(log)
    log.scrollTop = 700
    fireEvent.scroll(log)

    thread = [...thread, message(3, false, 'Nuevo')]
    await tick()
    await screen.findByText('Nuevo')
    expect(log.scrollTop).toBe(1000)
    expect(screen.queryByRole('button', { name: 'Ver mensajes nuevos' })).not.toBeInTheDocument()
  })

  it('no mueve la vista si la persona subió a leer; ofrece ir a los mensajes nuevos', async () => {
    renderConversation()
    const log = await screen.findByRole('log', { name: 'Mensajes' })
    measure(log)
    log.scrollTop = 100
    fireEvent.scroll(log)

    thread = [...thread, message(3, false, 'Nuevo')]
    await tick()
    await screen.findByText('Nuevo')
    expect(log.scrollTop).toBe(100)

    fireEvent.click(screen.getByRole('button', { name: 'Ver mensajes nuevos' }))
    expect(log.scrollTop).toBe(1000)
    expect(screen.queryByRole('button', { name: 'Ver mensajes nuevos' })).not.toBeInTheDocument()
  })

  it('al enviar, baja al final aunque la persona hubiera subido', async () => {
    renderConversation()
    const log = await screen.findByRole('log', { name: 'Mensajes' })
    measure(log)
    log.scrollTop = 0
    fireEvent.scroll(log)

    fireEvent.change(screen.getByLabelText('Mensaje para la institución'), { target: { value: 'Mío' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))
    await screen.findByText('Mío')
    expect(log.scrollTop).toBe(1000)
  })
})
