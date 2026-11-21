import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// Regresión: el resumen de mensajes sin leer (T-S13-08) devolvía sus hijos sin proveedor mientras no había sesión y los
// envolvía al iniciarla. React volvía a montar todo el árbol, y la barra fija publicaba 0 px en --app-bar-height:
// la pastilla de las Historias del Dual flotaba escondida bajo el encabezado.
afterEach(() => vi.unstubAllGlobals())

describe('estructura de la aplicación', () => {
  it.each(['COMPANY', 'ADMIN'])('no vuelve a montar el encabezado ni el contenido al cargar la sesión (%s)', async (role) => {
    let respond: (value: Response) => void = () => undefined
    const user = { id: 9, name: 'Rosa Garza', email: 'rosa@x.test', role, institution: null,
      company: role === 'COMPANY' ? { id: 3, name: 'ManuGolfo', missing: [], onboarding: 'done' } : null }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (path) => {
      if (path === '/api/me') return new Promise<Response>((resolve) => { respond = resolve })
      if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: 0, items: [] } })
      return new Promise<Response>(() => undefined)
    }))
    const view = render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    const header = view.container.querySelector('header.app-bar')
    const main = view.container.querySelector('main')
    expect(header).not.toBeNull()

    await act(async () => { respond(Response.json({ user })) })
    await screen.findByRole('heading', { name: 'Hola, Rosa Garza' })
    expect(view.container.querySelector('header.app-bar')).toBe(header)
    expect(view.container.querySelector('main')).toBe(main)
  })

  it('cada vista nueva empieza arriba, también al regresar al inicio por su enlace (T-S14-14)', async () => {
    const user = { id: 9, name: 'Rosa Garza', email: 'rosa@x.test', role: 'COMPANY', institution: null,
      company: { id: 3, name: 'ManuGolfo', missing: [], onboarding: 'done', can_operate: true } }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (path) => {
      if (path === '/api/me') return Response.json({ user })
      if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: 0, items: [] } })
      return new Promise<Response>(() => undefined)
    }))
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: /Oportunidades Duales/ })
    scrollTo.mockClear()
    fireEvent.click(link)
    await screen.findByRole('heading', { name: 'Oportunidades Duales', level: 2 })
    expect(scrollTo).toHaveBeenCalledWith(0, 0)

    scrollTo.mockClear()
    fireEvent.click(screen.getByRole('link', { name: 'Volver al inicio' }))
    await screen.findByRole('heading', { name: 'Hola, Rosa Garza' })
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('el footer desaparece en la conversación y vuelve sin montar de nuevo el encabezado ni el contenido (HU-S15-03)', async () => {
    const user = { id: 9, name: 'Rosa Garza', email: 'rosa@x.test', role: 'COMPANY', institution: null,
      company: { id: 3, name: 'ManuGolfo', missing: [], onboarding: 'done', can_operate: true } }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (path) => {
      if (path === '/api/me') return Response.json({ user })
      if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: 0, items: [] } })
      return new Promise<Response>(() => undefined)
    }))
    function Go({ to }: { to: string }) {
      const navigate = useNavigate()
      return <button type="button" onClick={() => { void navigate(to) }}>Ir a {to}</button>
    }
    const view = render(<MemoryRouter initialEntries={['/']}><App /><Go to="/linkage-requests/5/chat" /><Go to="/" /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Hola, Rosa Garza' })
    const header = view.container.querySelector('header.app-bar')
    const main = view.container.querySelector('main')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ir a /linkage-requests/5/chat' }))
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    expect(view.container.querySelector('header.app-bar')).toBe(header)
    expect(view.container.querySelector('main')).toBe(main)

    fireEvent.click(screen.getByRole('button', { name: 'Ir a /' }))
    await screen.findByRole('heading', { name: 'Hola, Rosa Garza' })
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(view.container.querySelector('header.app-bar')).toBe(header)
    expect(view.container.querySelector('main')).toBe(main)
  })
})
