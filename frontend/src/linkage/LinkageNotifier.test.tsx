import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/auth-context'
import type { AuthState } from '../auth/auth-context'
import type { User } from '../auth/api'
import { NOTIFICATIONS_PERMISSION_EVENT } from './browserNotifications'
import type { UnreadConversation } from './conversationApi'
import { LinkageNotifier } from './LinkageNotifier'
import { UnreadSummaryProvider } from './UnreadSummaryProvider'
import { UNREAD_POLL_INTERVAL_MS } from './useUnreadConversations'

// T-S13-08: avisos del navegador y título de la pestaña, alimentados por la consulta única del resumen.
const fetchMock = vi.fn<typeof fetch>()
let items: UnreadConversation[]
let hidden: boolean
let shown: { title: string; options: NotificationOptions; instance: { onclick: (() => void) | null; close: () => void } }[]
const company = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo', missing: [], onboarding: 'done', canOperate: true }, emailVerified: true, pendingEmail: null, emailLinkSentAt: null } as User
const institution = { id: 2, name: 'Coordinación', email: 'dual@ut.test', role: 'INSTITUTION', institution: { id: 1, name: 'UT del Golfo' }, company: null } as User
const conversation = (id: number, last: number, unread = 1): UnreadConversation =>
  ({ id, counterpart_name: 'UT del Golfo', opportunity_title: 'Tableros de producción', unread_count: unread, last_message_id: last })
const auth = (user: User | null): AuthState => ({
  status: 'ready', user, message: null, pending: false,
  restore: async () => undefined, expireSession: () => undefined, signIn: async () => undefined, signOut: async () => undefined, updateUser: () => undefined,
})

class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn(async () => FakeNotification.permission)
  onclick: (() => void) | null = null
  close = vi.fn()
  constructor(title: string, options: NotificationOptions) { shown.push({ title, options, instance: this }) }
}

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}

function view(user: User | null, path = '/linkage-requests') {
  const tree = (current: User | null) => (
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={auth(current)}>
        <UnreadSummaryProvider><LinkageNotifier /><Location /></UnreadSummaryProvider>
      </AuthContext.Provider>
    </MemoryRouter>
  )
  const result = render(tree(user))
  return { ...result, switchTo: (next: User | null) => result.rerender(tree(next)) }
}

/** Espera a que la consulta inicial llegue al proveedor: es la línea base de los avisos. */
const baseline = async () => { await waitFor(() => expect(summaries()).toBe(1)); await act(async () => { await Promise.resolve() }) }
const summaries = () => fetchMock.mock.calls.filter(([path]) => String(path).endsWith('/unread-summary')).length
const poll = async () => { await act(async () => { vi.advanceTimersByTime(UNREAD_POLL_INTERVAL_MS) }) }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  items = []
  hidden = true
  shown = []
  FakeNotification.permission = 'granted'
  document.title = 'Banco de Talentos'
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  vi.stubGlobal('Notification', FakeNotification)
  vi.stubGlobal('isSecureContext', true)
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => Response.json({ data: { conversations: items.length, items } }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'hidden')
})

describe('avisos del navegador', () => {
  it('toma lo ya sin leer como línea base y avisa solo de lo que llega después, sin el texto del mensaje', async () => {
    items = [conversation(41, 5, 2)]
    view(company)
    await baseline()
    await poll()
    expect(shown).toEqual([])

    items = [conversation(41, 7, 3), conversation(42, 9)]
    await poll()
    await waitFor(() => expect(shown).toHaveLength(2))
    expect(shown.map(({ title, options }) => [title, options.body, options.tag])).toEqual([
      ['3 mensajes nuevos de UT del Golfo', 'Oportunidad: Tableros de producción', 'linkage-COMPANY-41'],
      ['Mensaje nuevo de UT del Golfo', 'Oportunidad: Tableros de producción', 'linkage-COMPANY-42'],
    ])
    // Sin novedades no se repite.
    await poll()
    expect(shown).toHaveLength(2)
  })

  it('al hacer clic en el aviso abre esa conversación', async () => {
    view(institution, '/students')
    await baseline()
    items = [{ ...conversation(41, 3), counterpart_name: 'ManuGolfo' }]
    await poll()
    await waitFor(() => expect(shown).toHaveLength(1))
    expect(shown[0].title).toBe('Mensaje nuevo de ManuGolfo')
    act(() => shown[0].instance.onclick?.())
    expect(screen.getByRole('status', { name: 'Ruta actual' })).toHaveTextContent('/institution/linkage-requests/41/chat')
    expect(shown[0].instance.close).toHaveBeenCalled()
  })

  it('con la pestaña a la vista no usa el aviso del navegador: lo da la barra de mensajes dentro de la app (T-S14-17)', async () => {
    hidden = false
    view(company, '/linkage-requests/41/chat')
    await baseline()
    items = [conversation(41, 3), conversation(42, 4)]
    await poll()
    await act(async () => { await Promise.resolve() })
    expect(summaries()).toBeGreaterThan(1)
    expect(shown).toHaveLength(0)
  })

  it('sin permiso ni contador en pantalla no consulta; al conceder el permiso empieza a escuchar', async () => {
    FakeNotification.permission = 'default'
    view(company)
    await act(async () => { await Promise.resolve() })
    await poll()
    expect(summaries()).toBe(0)

    FakeNotification.permission = 'granted'
    act(() => { window.dispatchEvent(new Event(NOTIFICATIONS_PERMISSION_EVENT)) })
    await baseline()
    items = [conversation(41, 3)]
    await poll()
    await waitFor(() => expect(shown).toHaveLength(1))
  })

  it('reinicia la línea base al cambiar de cuenta y restaura el título al cerrar sesión', async () => {
    items = [conversation(41, 5), conversation(43, 6)]
    const { switchTo } = view(company)
    await waitFor(() => expect(document.title).toBe('(2) Banco de Talentos'))

    // Otra cuenta: lo que ya tenía sin leer es su nueva línea base, no un aviso.
    switchTo({ ...company, id: 10 })
    await waitFor(() => expect(summaries()).toBe(2))
    await poll()
    expect(shown).toEqual([])

    switchTo(null)
    await waitFor(() => expect(document.title).toBe('Banco de Talentos'))
  })
})
