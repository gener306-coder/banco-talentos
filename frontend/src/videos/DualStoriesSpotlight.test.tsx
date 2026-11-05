import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const story = (id: number, title: string) => ({
  public_id: `0b8f3a52-2d4e-4f7b-8c1a-9e5d6f7a8b${String(id).padStart(2, '0')}`, title, description: `Descripción de ${title}`, duration_seconds: 92, width: 1280, height: 720,
  institution: { public_id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b', name: 'Instituto Dual' },
  poster_url: `/api/media/videos/7/${id}.jpg?signature=a`, video_url: `/api/media/videos/7/${id}.mp4?signature=a`,
})
const three = [story(1, 'Primera'), story(2, 'Segunda'), story(3, 'Tercera')]
const pageOf = (data: unknown[]) => Response.json({ data, meta: { current_page: 1, last_page: 1, total: data.length, per_page: 12 } })
const company = { id: 8, name: 'Recursos Humanos', email: 'rh@example.test', role: 'COMPANY', company: { id: 3, name: 'ManuGolfo' } }
const fetchMock = vi.fn<typeof fetch>()
const galleryMock = vi.fn<() => Promise<Response>>()
const HEADING = 'Alumnos que ya vivieron el Dual en una empresa'
const scrollTo = vi.fn()

function start(user: unknown = company) {
  fetchMock.mockImplementation(async (url) => {
    if (url === '/api/me') return Response.json({ user })
    if (url === '/api/dashboard') return Response.json({ data: { role: (user as { role: string }).role, metrics: {} } })
    if (String(url).startsWith('/api/promotional-videos')) return galleryMock()
    return new Response(null, { status: 404 })
  })
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
}

const currentDot = (region: HTMLElement) => within(region).getAllByRole('button', { name: /^Ir a la historia / }).findIndex((dot) => dot.getAttribute('aria-current') === 'true')

/** Región del carrusel con temporizadores simulados, ya cargada. */
async function carousel(stories = three) {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  galleryMock.mockImplementation(async () => pageOf(stories))
  start()
  return screen.findByRole('region', { name: HEADING })
}
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  fetchMock.mockReset()
  galleryMock.mockReset()
  scrollTo.mockReset()
  HTMLElement.prototype.scrollTo = scrollTo
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => {})
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('carrusel del inicio HU-S9-06', () => {
  it('muestra hasta 5 historias, con la actual debajo y enlace al feed', async () => {
    galleryMock.mockImplementation(async () => pageOf([1, 2, 3, 4, 5, 6].map((id) => story(id, `Historia ${id}`))))
    start()
    const region = await screen.findByRole('region', { name: HEADING })

    expect(within(region).getAllByRole('group', { name: / de 5$/ })).toHaveLength(5)
    expect(within(region).getByRole('group', { name: '1 de 5' })).toBeInTheDocument()
    expect(region.querySelector('.spotlight-caption')).toHaveTextContent('Historia 1')
    expect(within(region).getByRole('link', { name: 'Ver todas las historias' })).toHaveAttribute('href', '/promocion')
  })

  it('se desliza sola cada 6 s y vuelve al inicio al final', async () => {
    const region = await carousel()
    expect(currentDot(region)).toBe(0)

    await advance(6000)
    expect(currentDot(region)).toBe(1)
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(region.querySelector('.spotlight-caption')).toHaveTextContent('Segunda')

    await advance(6000)
    await advance(6000)
    expect(currentDot(region)).toBe(0)
  })

  it('se detiene con el puntero encima y sigue al salir', async () => {
    const region = await carousel()
    fireEvent.pointerEnter(region, { pointerType: 'mouse' })
    await advance(20000)
    expect(scrollTo).not.toHaveBeenCalled()

    fireEvent.pointerLeave(region)
    await advance(6000)
    expect(currentDot(region)).toBe(1)
  })

  it('se detiene con el foco de teclado dentro y sigue al salir', async () => {
    const region = await carousel()
    const next = within(region).getByRole('button', { name: 'Historia siguiente' })
    const matches = vi.spyOn(next, 'matches').mockReturnValue(true)
    fireEvent.focusIn(next)
    matches.mockRestore()
    await advance(20000)
    expect(scrollTo).not.toHaveBeenCalled()

    fireEvent.focusOut(next, { relatedTarget: document.body })
    await advance(6000)
    expect(currentDot(region)).toBe(1)
  })

  it('el botón pausa y reanuda', async () => {
    const region = await carousel()
    fireEvent.click(within(region).getByRole('button', { name: 'Pausar el carrusel' }))
    await advance(20000)
    expect(scrollTo).not.toHaveBeenCalled()

    fireEvent.click(within(region).getByRole('button', { name: 'Reanudar el carrusel' }))
    await advance(6000)
    expect(currentDot(region)).toBe(1)
  })

  it('anuncia los cambios solo cuando no avanza sola', async () => {
    const region = await carousel()
    expect(region.querySelector('.spotlight-caption')).toHaveAttribute('aria-live', 'off')
    fireEvent.click(within(region).getByRole('button', { name: 'Pausar el carrusel' }))
    expect(region.querySelector('.spotlight-caption')).toHaveAttribute('aria-live', 'polite')
  })

  it('se navega con flechas y puntos', async () => {
    const region = await carousel()
    fireEvent.click(within(region).getByRole('button', { name: 'Historia siguiente' }))
    expect(currentDot(region)).toBe(1)
    fireEvent.click(within(region).getByRole('button', { name: 'Ir a la historia 3' }))
    expect(currentDot(region)).toBe(2)
    fireEvent.click(within(region).getByRole('button', { name: 'Historia siguiente' }))
    expect(currentDot(region)).toBe(0)
    fireEvent.click(within(region).getByRole('button', { name: 'Historia anterior' }))
    expect(currentDot(region)).toBe(2)
  })

  it('con movimiento reducido no avanza sola ni ofrece pausar, y cambia sin animación', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion'), media: query, addEventListener() {}, removeEventListener() {} }))
    const region = await carousel()
    await advance(20000)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(within(region).queryByRole('button', { name: 'Pausar el carrusel' })).not.toBeInTheDocument()

    fireEvent.click(within(region).getByRole('button', { name: 'Historia siguiente' }))
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
  })

  it('con una sola historia no hay controles', async () => {
    const region = await carousel([story(1, 'Única')])
    expect(within(region).queryByRole('button', { name: /Historia siguiente|Ir a la historia|Pausar/ })).not.toBeInTheDocument()
    await advance(20000)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})

describe('vista previa del inicio HU-S9-06', () => {
  it('no monta ningún video hasta el clic, y lo abre en el mismo inicio', async () => {
    galleryMock.mockImplementation(async () => pageOf(three))
    start()
    const region = await screen.findByRole('region', { name: HEADING })
    expect(document.querySelector('video')).toBeNull()

    fireEvent.click(within(region).getByRole('button', { name: 'Ver la vista previa de Segunda, de Instituto Dual' }))
    const preview = await screen.findByRole('dialog', { name: 'Segunda' })

    expect(screen.getByRole('heading', { name: /^Hola, / , hidden: true })).toBeInTheDocument()
    const player = within(preview).getByLabelText('Video: Segunda, de Instituto Dual')
    expect(player).toHaveAttribute('src', story(2, '').video_url)
    expect(player).not.toHaveAttribute('controls')
    expect(within(preview).getByText('Descripción de Segunda')).toBeInTheDocument()
    expect(within(preview).getByRole('link', { name: 'Buscar talento' })).toHaveAttribute('href', '/talent')
    expect(within(preview).getByRole('link', { name: 'Ver todas las historias' })).toHaveAttribute('href', `/promocion?video=${story(2, '').public_id}`)
    expect(within(preview).getByRole('heading', { name: 'Segunda' })).toHaveFocus()
  })

  it('el carrusel no avanza con la vista previa abierta, y al cerrarla se desmonta el video', async () => {
    const region = await carousel()
    fireEvent.click(within(region).getByRole('button', { name: 'Ver la vista previa de Primera, de Instituto Dual' }))
    const preview = await screen.findByRole('dialog', { name: 'Primera' })
    await advance(20000)
    expect(scrollTo).not.toHaveBeenCalled()

    fireEvent.click(within(preview).getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(document.querySelector('video')).toBeNull())
  })
})

describe('módulo del inicio HU-S9-05', () => {
  it('no aparece sin historias, y el inicio sigue completo', async () => {
    galleryMock.mockImplementation(async () => pageOf([]))
    start()
    await screen.findByRole('navigation', { name: 'Empresa' })
    await waitFor(() => expect(galleryMock).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: HEADING })).not.toBeInTheDocument()
  })

  it('un error de la galería no muestra alertas', async () => {
    galleryMock.mockImplementation(async () => new Response(null, { status: 500 }))
    start()
    await screen.findByRole('navigation', { name: 'Empresa' })
    await waitFor(() => expect(galleryMock).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: HEADING })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['ADMIN', { id: 1, name: 'Administración', email: 'admin@example.test', role: 'ADMIN' }],
    ['SECRETARY', { id: 2, name: 'Secretaría', email: 'sec@example.test', role: 'SECRETARY' }],
  ])('no aparece para %s', async (_role, user) => {
    galleryMock.mockImplementation(async () => pageOf(three))
    start(user)
    await screen.findByRole('link', { name: /Historias del Dual/ })
    expect(galleryMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: HEADING })).not.toBeInTheDocument()
  })
})
