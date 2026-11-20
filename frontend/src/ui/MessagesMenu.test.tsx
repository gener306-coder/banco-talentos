import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

// T-S14-17: mensajes sin leer en la barra superior y aviso breve al llegar un mensaje.
type Item = { id: number; counterpart_name: string; opportunity_title: string; unread_count: number; last_message_id: number }
let user: Record<string, unknown>
let items: Item[]
const company = { id: 9, name: 'Rosa Garza', email: 'rosa@x.test', role: 'COMPANY', institution: null,
  company: { id: 3, name: 'ManuGolfo', missing: [], onboarding: 'done', can_operate: true } }
const institution = { id: 4, name: 'Laura Méndez', email: 'dual@ut.test', role: 'INSTITUTION', institution: { id: 1, name: 'UT del Golfo' }, company: null }
const conversation = (id: number, name: string, count: number, last: number): Item => ({ id, counterpart_name: name, opportunity_title: `Oportunidad ${id}`, unread_count: count, last_message_id: last })

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}

function renderApp(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)
}

/** Vuelve a consultar el resumen como lo hace la app al enfocar la ventana. */
async function refetch() {
  await act(async () => { window.dispatchEvent(new Event('focus')) })
}

beforeEach(() => {
  user = company
  items = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (path) => {
    if (path === '/api/me') return Response.json({ user })
    if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: items.length, items } })
    return new Promise<Response>(() => undefined)
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('mensajes sin leer en la barra (T-S14-17)', () => {
  it('muestra el número de conversaciones y un panel con cada una que lleva a su conversación', async () => {
    items = [conversation(41, 'UT del Golfo', 2, 10), conversation(42, 'Tecnológico de Reynosa', 1, 12)]
    renderApp()
    const trigger = await screen.findByRole('button', { name: 'Mensajes sin leer: 2 conversaciones' })
    expect(trigger).toHaveTextContent('2')
    fireEvent.click(trigger)
    const panel = screen.getByRole('region', { name: 'Mensajes sin leer' })
    const link = within(panel).getByRole('link', { name: /UT del Golfo/ })
    expect(link).toHaveAttribute('href', '/linkage-requests/41/chat')
    expect(link).toHaveTextContent('Oportunidad 41')
    expect(within(panel).getByLabelText('2 mensajes sin leer')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Ver todas las solicitudes' })).toHaveAttribute('href', '/linkage-requests')

    fireEvent.click(link)
    expect(screen.getByRole('status', { name: 'Ruta actual' })).toHaveTextContent('/linkage-requests/41/chat')
    expect(screen.queryByRole('region', { name: 'Mensajes sin leer' })).not.toBeInTheDocument()
  })

  it('sin pendientes no muestra insignia y el panel lo dice; Escape lo cierra y devuelve el foco', async () => {
    user = institution
    renderApp()
    const trigger = await screen.findByRole('button', { name: 'Mensajes, sin pendientes' })
    expect(trigger.querySelector('.messages-badge')).toBeNull()
    fireEvent.click(trigger)
    const panel = await screen.findByRole('region', { name: 'Mensajes sin leer' })
    await waitFor(() => expect(panel).toHaveTextContent('Estás al día: no tienes mensajes sin leer.'))
    expect(within(panel).getByRole('link', { name: 'Ver todas las solicitudes' })).toHaveAttribute('href', '/institution/linkage-requests')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Mensajes sin leer' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it.each([
    ['ADMIN', { id: 1, name: 'Administración', email: 'admin@bt.test', role: 'ADMIN', institution: null, company: null }],
    ['SECRETARY', { id: 2, name: 'Analista', email: 'sec@economia.test', role: 'SECRETARY', institution: null, company: null }],
  ])('no aparece para %s', async (_role, account) => {
    user = account
    renderApp()
    await screen.findByRole('button', { name: /Cuenta de/ })
    expect(screen.queryByRole('button', { name: /Mensajes/ })).not.toBeInTheDocument()
  })

  it('al llegar un mensaje nuevo avisa con «Ver», que abre la conversación; lo que ya estaba sin leer no se avisa', async () => {
    items = [conversation(41, 'UT del Golfo', 1, 10)]
    renderApp()
    await screen.findByRole('button', { name: 'Mensajes sin leer: 1 conversación' })
    expect(screen.queryByText(/Mensaje nuevo de/)).not.toBeInTheDocument()

    items = [conversation(41, 'UT del Golfo', 2, 11)]
    await refetch()
    const notice = await screen.findByText('2 mensajes nuevos de UT del Golfo')
    const snackbar = notice.closest('.snackbar') as HTMLElement
    fireEvent.click(within(snackbar).getByRole('button', { name: 'Ver' }))
    expect(screen.getByRole('status', { name: 'Ruta actual' })).toHaveTextContent('/linkage-requests/41/chat')
    expect(screen.queryByText('2 mensajes nuevos de UT del Golfo')).not.toBeInTheDocument()
  })

  it('no avisa de la conversación que se tiene abierta y a la vista', async () => {
    items = [conversation(41, 'UT del Golfo', 1, 10)]
    renderApp('/linkage-requests/41/chat')
    await screen.findByRole('button', { name: 'Mensajes sin leer: 1 conversación' })
    items = [conversation(41, 'UT del Golfo', 2, 11)]
    await refetch()
    await waitFor(() => expect(screen.getByRole('button', { name: /Mensajes sin leer/ })).toHaveTextContent('1'))
    expect(screen.queryByText(/mensajes nuevos de UT del Golfo/)).not.toBeInTheDocument()
  })
})
