import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/auth-context'
import type { AuthState } from '../auth/auth-context'
import { LinkageConversation, POLL_INTERVAL_MS } from './LinkageConversation'
import { LINKAGE_READ_EVENT } from './conversationApi'
import type { LinkageMessage, LinkageSide } from './conversationApi'

// HU-S13-03: conversación de una solicitud aceptada con consulta periódica, envío, marcador de lectura y auto-scroll.
const auth: AuthState = {
  status: 'ready', user: null, message: null, pending: false,
  restore: async () => undefined, expireSession: () => undefined, signIn: async () => undefined, signOut: async () => undefined,
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

function renderConversation(role: LinkageSide = 'COMPANY', readOnly = false) {
  return render(<AuthContext.Provider value={auth}><LinkageConversation linkageRequestId={41} role={role} readOnly={readOnly} /></AuthContext.Provider>)
}

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
})

describe('hilo de la conversación', () => {
  it('muestra el aviso de privacidad y los mensajes propios a la derecha y los ajenos a la izquierda (CA-02, CA-03)', async () => {
    renderConversation()
    const region = await screen.findByRole('region', { name: 'Conversación con la institución' })
    expect(within(region).getByRole('note', { name: 'Aviso de privacidad' }))
      .toHaveTextContent('La empresa conoce al alumno solo por su perfil. No compartas datos personales del alumno por este medio.')

    const log = await within(region).findByRole('log', { name: 'Mensajes' })
    const [first, second] = within(log).getAllByRole('listitem')
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
    expect(await screen.findByRole('region', { name: 'Conversación con la empresa' })).toBeInTheDocument()
    expect(screen.getByLabelText('Mensaje para la empresa')).toBeInTheDocument()
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
    fireEvent.change(field, { target: { value: '  Llevará gafete.  ' } })
    expect(screen.getByText('19 de 2000 caracteres · Ctrl + Enter para enviar')).toBeInTheDocument()

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

  it('envía con Ctrl + Enter; Enter solo es un salto de línea', async () => {
    renderConversation()
    const field = await screen.findByLabelText('Mensaje para la institución')
    fireEvent.change(field, { target: { value: 'Confirmado' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(calls('POST').filter(([path]) => !String(path).endsWith('/read'))).toHaveLength(0)
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })
    expect(await screen.findByText('Confirmado')).toBeInTheDocument()
  })

  it('no envía un mensaje vacío y conserva el texto si el servidor lo rechaza', async () => {
    renderConversation()
    const field = await screen.findByLabelText('Mensaje para la institución')
    fireEvent.change(field, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))
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
