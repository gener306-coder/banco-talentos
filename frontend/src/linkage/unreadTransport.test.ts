import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startUnreadPolling, UNREAD_HIDDEN_INTERVAL_MS, UNREAD_VISIBLE_INTERVAL_MS } from './unreadTransport'
import type { UnreadTransport } from './unreadTransport'

// T-S14-17: transporte del resumen de mensajes sin leer (consulta frecuente, aislada para cambiarla por WebSockets).
let hidden = false
const fetchMock = vi.fn<typeof fetch>()
const calls = () => fetchMock.mock.calls.filter(([path]) => String(path).endsWith('/unread-summary')).length
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }
let transports: UnreadTransport[] = []

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => Response.json({ data: { conversations: 1, items: [{ id: 41, counterpart_name: 'UT', opportunity_title: 'Calidad', unread_count: 1, last_message_id: 9 }] } }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  transports.forEach((transport) => transport.stop())
  transports = []
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'hidden')
})

const start = (onSummary = vi.fn(), account = '9:COMPANY') => {
  const transport = startUnreadPolling({ side: 'COMPANY', account, onSummary })
  transports.push(transport)
  return { transport, onSummary }
}

describe('transporte del resumen de mensajes sin leer (T-S14-17)', () => {
  it('consulta al arrancar, cada 10 s a la vista y cada 60 s oculta, y enseguida al volver', async () => {
    const { onSummary } = start()
    await flush()
    expect(calls()).toBe(1)
    expect(onSummary).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(UNREAD_VISIBLE_INTERVAL_MS * 3) })
    await flush()
    expect(calls()).toBe(4)

    hidden = true
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    act(() => { vi.advanceTimersByTime(UNREAD_VISIBLE_INTERVAL_MS * 5) })
    expect(calls()).toBe(4)
    act(() => { vi.advanceTimersByTime(UNREAD_HIDDEN_INTERVAL_MS - UNREAD_VISIBLE_INTERVAL_MS * 5) })
    expect(calls()).toBe(5)

    hidden = false
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(calls()).toBe(6)
  })

  it('refresh() consulta de inmediato y stop() deja de consultar', async () => {
    const { transport } = start()
    transport.refresh()
    expect(calls()).toBe(2)
    transport.stop()
    act(() => { vi.advanceTimersByTime(UNREAD_HIDDEN_INTERVAL_MS * 2) })
    expect(calls()).toBe(2)
  })

  it.skipIf(typeof BroadcastChannel !== 'function')('comparte el resumen con las demás pestañas de la misma cuenta', async () => {
    const other = vi.fn()
    start(other)
    await flush()
    other.mockClear()
    const first = vi.fn()
    start(first)
    // La segunda «pestaña» consulta al arrancar y publica su resultado; la primera lo recibe sin otra petición.
    await vi.waitFor(() => expect(other).toHaveBeenCalled())
    expect(other.mock.calls[0][0]).toMatchObject({ conversations: 1 })
  })
})
