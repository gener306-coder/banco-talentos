import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const story = (id: number, title: string) => ({
  public_id: `0b8f3a52-2d4e-4f7b-8c1a-9e5d6f7a8b${String(id).padStart(2, '0')}`, title, description: null, duration_seconds: 92, width: 1280, height: 720,
  institution: { public_id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b', name: 'Instituto Dual' },
  poster_url: `/api/media/videos/7/${id}.jpg?signature=a`, video_url: `/api/media/videos/7/${id}.mp4?signature=a`,
})
const pageOf = (data: unknown[]) => Response.json({ data, meta: { current_page: 1, last_page: 1, total: data.length, per_page: 12 } })
const company = { id: 8, name: 'Recursos Humanos', email: 'rh@example.test', role: 'COMPANY', company: { id: 3, name: 'ManuGolfo' } }
const fetchMock = vi.fn<typeof fetch>()
const galleryMock = vi.fn<() => Promise<Response>>()
const HEADING = 'Alumnos que ya vivieron el Dual en una empresa'

function start(user: unknown = company) {
  fetchMock.mockImplementation(async (url) => {
    if (url === '/api/me') return Response.json({ user })
    if (url === '/api/dashboard') return Response.json({ data: { role: (user as { role: string }).role, metrics: {} } })
    if (String(url).startsWith('/api/promotional-videos')) return galleryMock()
    return new Response(null, { status: 404 })
  })
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
}

beforeEach(() => {
  fetchMock.mockReset()
  galleryMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('módulo destacado del inicio HU-S9-05', () => {
  it('muestra la historia más reciente y hasta dos más, con enlace a cada una y al feed', async () => {
    galleryMock.mockImplementation(async () => pageOf([story(1, 'Primera'), story(2, 'Segunda'), story(3, 'Tercera'), story(4, 'Cuarta')]))
    start()
    const region = await screen.findByRole('region', { name: HEADING })

    const links = within(region).getAllByRole('link', { name: /^Ver la historia / })
    expect(links).toHaveLength(3)
    expect(links[0]).toHaveAccessibleName('Ver la historia Primera, de Instituto Dual')
    expect(links[0]).toHaveAttribute('href', `/promocion?video=${story(1, '').public_id}`)
    expect(within(region).getByRole('link', { name: 'Ver todas las historias' })).toHaveAttribute('href', '/promocion')
  })

  it('no reproduce nada en el inicio', async () => {
    galleryMock.mockImplementation(async () => pageOf([story(1, 'Primera')]))
    start()
    const region = await screen.findByRole('region', { name: HEADING })
    expect(region.querySelector('video')).toBeNull()
  })

  it('no aparece sin historias ni con un error, y el inicio sigue completo', async () => {
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
    galleryMock.mockImplementation(async () => pageOf([story(1, 'Primera')]))
    start(user)
    await screen.findByRole('link', { name: /Historias del Dual/ })
    expect(galleryMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: HEADING })).not.toBeInTheDocument()
  })
})
