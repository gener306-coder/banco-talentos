import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const users = {
  COMPANY: { id: 8, name: 'Recursos Humanos', email: 'rh@example.test', role: 'COMPANY', company: { id: 3, name: 'ManuGolfo' } },
  ADMIN: { id: 1, name: 'Administración', email: 'admin@example.test', role: 'ADMIN' },
  INSTITUTION: { id: 5, name: 'Coordinación', email: 'coord@example.test', role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } },
}
const promo = {
  public_id: '0b8f3a52-2d4e-4f7b-8c1a-9e5d6f7a8b9c', title: 'Mi experiencia en manufactura', description: 'Cuento cómo fue mi año dual.',
  duration_seconds: 92, width: 1280, height: 720, institution: { public_id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b', name: 'Universidad Tecnológica de Teoloyucan' },
  poster_url: '/api/media/videos/7/historia.jpg?signature=a', video_url: '/api/media/videos/7/historia.mp4?signature=a',
}
const second = { ...promo, public_id: '1c9f3a52-2d4e-4f7b-8c1a-9e5d6f7a8b9d', title: 'Mi año en logística' }
const pageOf = (data: unknown[], meta: Partial<Record<string, number>> = {}) =>
  Response.json({ data, meta: { current_page: 1, last_page: 1, total: data.length, per_page: 12, ...meta } })
const fetchMock = vi.fn<typeof fetch>()
const galleryMock = vi.fn<typeof fetch>()
let observers: { callback: IntersectionObserverCallback; element: Element }[] = []

class FakeIntersectionObserver {
  private readonly callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) { this.callback = callback }
  observe(element: Element) { observers.push({ callback: this.callback, element }) }
  disconnect() { observers = observers.filter((observer) => observer.callback !== this.callback) }
  unobserve() {}
  takeRecords() { return [] }
}

function start(role: keyof typeof users, path = '/promocion') {
  fetchMock.mockImplementation(async (url, options) => {
    if (url === '/api/me') return Response.json({ user: users[role] })
    if (url === '/sanctum/csrf-cookie') {
      window.document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    if (String(url).startsWith('/api/promotional-videos')) return galleryMock(url, options)
    return new Response(null, { status: 404 })
  })
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

beforeEach(() => {
  observers = []
  fetchMock.mockReset()
  galleryMock.mockReset()
  galleryMock.mockImplementation(async () => pageOf([promo]))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => {})
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  window.document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Historias del Dual HU-S9-04', () => {
  it('muestra cada historia en un feed con su video, institución, título y descripción', async () => {
    start('COMPANY')
    const feed = await screen.findByRole('feed', { name: 'Historias del Dual' })
    const story = within(feed).getByRole('article', { name: 'Mi experiencia en manufactura' })

    const player = within(story).getByLabelText('Video: Mi experiencia en manufactura, de Universidad Tecnológica de Teoloyucan')
    expect(player.tagName).toBe('VIDEO')
    expect(player).toHaveAttribute('preload', 'none')
    expect(player).toHaveAttribute('poster', promo.poster_url)
    expect(player).toHaveAttribute('src', promo.video_url)
    expect(player).not.toHaveAttribute('controls')
    expect(within(story).getByText('Universidad Tecnológica de Teoloyucan')).toBeInTheDocument()
    expect(within(story).getByText('UT')).toBeInTheDocument()
    expect(within(story).getByText('Cuento cómo fue mi año dual.')).toBeInTheDocument()
    expect(screen.getByText(/cuentan cómo fue su experiencia en la empresa/)).toBeInTheDocument()
  })

  it('la empresa va de cada historia al buscador; no ve moderación', async () => {
    start('COMPANY')
    const story = await screen.findByRole('article', { name: 'Mi experiencia en manufactura' })

    expect(within(story).getByRole('link', { name: 'Buscar talento' })).toHaveAttribute('href', '/talent')
    expect(within(story).queryByRole('button', { name: /Inactivar/ })).not.toBeInTheDocument()
  })

  it('recorta una descripción larga con «Más»', async () => {
    const long = 'Texto largo. '.repeat(20).trim()
    galleryMock.mockImplementation(async () => pageOf([{ ...promo, description: long }]))
    start('COMPANY')
    const story = await screen.findByRole('article', { name: 'Mi experiencia en manufactura' })
    const description = within(story).getByText(long)

    expect(description).toHaveAttribute('data-clamped', 'true')
    fireEvent.click(within(story).getByRole('button', { name: 'Leer más de Mi experiencia en manufactura' }))
    expect(description).toHaveAttribute('data-clamped', 'false')
  })

  it('muestra el estado vacío', async () => {
    galleryMock.mockImplementation(async () => pageOf([]))
    start('COMPANY')
    expect(await screen.findByText('Aún no hay historias.')).toBeInTheDocument()
  })

  it('agrega la página siguiente al feed con el botón, sin repetir historias', async () => {
    galleryMock.mockImplementation(async (url) => String(url).endsWith('page=2')
      ? pageOf([promo, second], { current_page: 2, last_page: 2, total: 2 }) : pageOf([promo], { last_page: 2, total: 2 }))
    start('COMPANY')
    fireEvent.click(await screen.findByRole('button', { name: 'Ver más historias' }))

    expect(await screen.findByRole('article', { name: 'Mi año en logística' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Ver más historias' })).not.toBeInTheDocument()
  })

  it('carga la página siguiente al acercarse al final', async () => {
    galleryMock.mockImplementation(async (url) => String(url).endsWith('page=2')
      ? pageOf([second], { current_page: 2, last_page: 2, total: 2 }) : pageOf([promo], { last_page: 2, total: 2 }))
    start('COMPANY')
    await screen.findByRole('button', { name: 'Ver más historias' })
    const sentinel = observers.find(({ element }) => element.classList.contains('story-more-wrapper'))!

    act(() => sentinel.callback([{ isIntersecting: true, target: sentinel.element } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(await screen.findByRole('article', { name: 'Mi año en logística' })).toBeInTheDocument()
  })

  it('al fallar un video pide URLs nuevas para las páginas cargadas', async () => {
    start('COMPANY')
    const story = await screen.findByRole('article', { name: 'Mi experiencia en manufactura' })
    const fresh = '/api/media/videos/7/historia.mp4?signature=b'
    galleryMock.mockImplementation(async () => pageOf([{ ...promo, video_url: fresh }]))
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})

    fireEvent.error(within(story).getByLabelText(/^Video: /))
    fireEvent.click(within(story).getByRole('button', { name: 'Reintentar' }))

    await vi.waitFor(() => expect(within(story).getByLabelText(/^Video: /)).toHaveAttribute('src', fresh))
  })

  it('coloca el feed en la historia del enlace (?video=)', async () => {
    const scroll = vi.fn()
    HTMLElement.prototype.scrollIntoView = scroll
    galleryMock.mockImplementation(async () => pageOf([promo, second]))
    start('COMPANY', `/promocion?video=${second.public_id}`)

    const story = await screen.findByRole('article', { name: 'Mi año en logística' })
    await vi.waitFor(() => expect(scroll).toHaveBeenCalledTimes(1))
    expect(scroll.mock.contexts[0]).toBe(story)
    expect(story).toHaveFocus()
    // T-S9-03: la historia del enlace va primero aunque por su orden quedara en otra página.
    expect(galleryMock.mock.calls[0][0]).toBe(`/api/promotional-videos?page=1&first=${second.public_id}`)
  })

  it('el Administrador inactiva una historia tras confirmarlo y sale del feed', async () => {
    galleryMock.mockImplementation(async (_url, options) => options?.method === 'PATCH'
      ? Response.json({ data: { public_id: promo.public_id, is_active: false } }) : pageOf([promo]))
    start('ADMIN')
    const story = await screen.findByRole('article', { name: 'Mi experiencia en manufactura' })
    expect(within(story).queryByRole('link', { name: 'Buscar talento' })).not.toBeInTheDocument()

    fireEvent.click(within(story).getByRole('button', { name: 'Inactivar Mi experiencia en manufactura' }))
    const dialog = await screen.findByRole('alertdialog', { name: '¿Inactivar la historia?' })
    expect(galleryMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Inactivar' }))

    expect(await screen.findByText(/ya no aparece en las historias\. Solo Universidad Tecnológica de Teoloyucan puede reactivarla\./)).toHaveAttribute('role', 'status')
    expect(await screen.findByText('Aún no hay historias.')).toBeInTheDocument()
    const patch = galleryMock.mock.calls.find(([, options]) => options?.method === 'PATCH')!
    expect(patch[0]).toBe(`/api/promotional-videos/${promo.public_id}/status`)
    expect(JSON.parse(String(patch[1]?.body))).toEqual({ is_active: false })
  })

  it('niega las historias a la institución', async () => {
    start('INSTITUTION')
    expect(await screen.findByText('No tienes permiso para consultar las Historias del Dual.')).toBeInTheDocument()
    expect(galleryMock).not.toHaveBeenCalled()
  })
})

describe('orden de las historias T-S9-03', () => {
  const urls = () => galleryMock.mock.calls.map(([url]) => String(url))

  it('muestra primero las más recientes y cambia a una mezcla al azar desde la URL', async () => {
    start('COMPANY')
    const order = await screen.findByRole('group', { name: 'Ordenar las historias' })
    expect(within(order).getByRole('radio', { name: 'Más recientes' })).toBeChecked()
    expect(urls()[0]).toBe('/api/promotional-videos?page=1')
    expect(screen.queryByRole('button', { name: 'Otra mezcla' })).not.toBeInTheDocument()

    fireEvent.click(within(order).getByRole('radio', { name: 'Al azar' }))
    await vi.waitFor(() => expect(urls()).toHaveLength(2), { timeout: 5000 })
    expect(urls()[1]).toMatch(/^\/api\/promotional-videos\?page=1&order=random&seed=\d+$/)
    expect(within(order).getByRole('radio', { name: 'Al azar' })).toBeChecked()
  })

  it('«Otra mezcla» pide otra semilla y vuelve a la primera página', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.7)
    start('COMPANY', '/promocion?orden=azar')
    await screen.findByRole('article', { name: promo.title })
    const first = urls()[0]
    expect(first).toMatch(/order=random&seed=\d+$/)

    fireEvent.click(screen.getByRole('button', { name: 'Otra mezcla' }))
    await vi.waitFor(() => expect(urls()).toHaveLength(2), { timeout: 5000 })
    expect(urls()[1]).toMatch(/^\/api\/promotional-videos\?page=1&order=random&seed=\d+$/)
    expect(urls()[1]).not.toBe(first)
  })
})
