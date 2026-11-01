import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const users = {
  COMPANY: { id: 8, name: 'Recursos Humanos', email: 'rh@example.test', role: 'COMPANY', company: { id: 3, name: 'ManuGolfo' } },
  ADMIN: { id: 1, name: 'Administración', email: 'admin@example.test', role: 'ADMIN' },
  INSTITUTION: { id: 5, name: 'Coordinación', email: 'coord@example.test', role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } },
}
const promo = {
  public_id: '0b8f3a52-2d4e-4f7b-8c1a-9e5d6f7a8b9c', title: 'Laboratorio de robótica', description: 'Proyectos de nuestros alumnos',
  duration_seconds: 92, institution: { public_id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b', name: 'Instituto Tecnológico Dual' },
  poster_url: '/api/media/videos/7/robotica.jpg?signature=a', video_url: '/api/media/videos/7/robotica.mp4?signature=a',
}
const pageOf = (data: unknown[], meta: Partial<Record<string, number>> = {}) =>
  Response.json({ data, meta: { current_page: 1, last_page: 1, total: data.length, per_page: 12, ...meta } })
const fetchMock = vi.fn<typeof fetch>()
const galleryMock = vi.fn<typeof fetch>()

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
  fetchMock.mockReset()
  galleryMock.mockReset()
  galleryMock.mockImplementation(async () => pageOf([promo]))
  vi.stubGlobal('fetch', fetchMock)
  window.document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
})
afterEach(() => vi.unstubAllGlobals())

describe('galería de promoción dual HU-S9-03', () => {
  it('muestra cada video con póster, título, institución y duración sin descargarlo antes de reproducir (CA-04)', async () => {
    start('COMPANY')
    const grid = await screen.findByRole('list', { name: 'Videos promocionales' })

    const player = within(grid).getByLabelText('Video: Laboratorio de robótica, de Instituto Tecnológico Dual')
    expect(player.tagName).toBe('VIDEO')
    expect(player).toHaveAttribute('preload', 'none')
    expect(player).toHaveAttribute('poster', promo.poster_url)
    expect(player).toHaveAttribute('src', promo.video_url)
    expect(player).toHaveAttribute('controls')
    expect(within(grid).getByRole('heading', { name: 'Laboratorio de robótica' })).toBeInTheDocument()
    expect(within(grid).getByText('Instituto Tecnológico Dual · 1:32')).toBeInTheDocument()
    // Solo el Administrador modera.
    expect(within(grid).queryByRole('button', { name: /Inactivar/ })).not.toBeInTheDocument()
    expect(galleryMock.mock.calls[0][0]).toBe('/api/promotional-videos?page=1')
  })

  it('muestra el estado vacío', async () => {
    galleryMock.mockImplementation(async () => pageOf([]))
    start('COMPANY')
    expect(await screen.findByText('Aún no hay videos promocionales.')).toBeInTheDocument()
  })

  it('pagina de 12 en 12', async () => {
    galleryMock.mockImplementation(async (url) => pageOf([{ ...promo, title: String(url).endsWith('page=2') ? 'Segunda página' : promo.title }], { last_page: 2, total: 13 }))
    start('COMPANY')
    fireEvent.click(await screen.findByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByRole('heading', { name: 'Segunda página' })).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 2 · 13 videos')).toBeInTheDocument()
  })

  it('el Administrador inactiva un video tras confirmarlo y desaparece de la galería (CA-05)', async () => {
    start('ADMIN')
    const grid = await screen.findByRole('list', { name: 'Videos promocionales' })
    galleryMock.mockImplementation(async (_url, options) => options?.method === 'PATCH'
      ? Response.json({ data: { public_id: promo.public_id, is_active: false } }) : pageOf([]))

    fireEvent.click(within(grid).getByRole('button', { name: 'Inactivar Laboratorio de robótica' }))
    const dialog = await screen.findByRole('alertdialog', { name: '¿Inactivar el video?' })
    expect(galleryMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Inactivar' }))

    expect(await screen.findByText(/se inactivó y ya no aparece en la galería\. Solo Instituto Tecnológico Dual puede reactivarlo\./)).toHaveAttribute('role', 'status')
    expect(await screen.findByText('Aún no hay videos promocionales.')).toBeInTheDocument()
    const patch = galleryMock.mock.calls.find(([, options]) => options?.method === 'PATCH')!
    expect(patch[0]).toBe(`/api/promotional-videos/${promo.public_id}/status`)
    expect(JSON.parse(String(patch[1]?.body))).toEqual({ is_active: false })
  })

  it('aparece en el inicio de empresas, Secretaría y Administrador, pero no de la institución (CA-04)', async () => {
    start('COMPANY', '/')
    expect(await screen.findByRole('link', { name: /Promoción dual/ })).toHaveAttribute('href', '/promocion')
  })

  it('niega la galería a la institución', async () => {
    start('INSTITUTION')
    expect(await screen.findByText('No tienes permiso para consultar la galería de promoción dual.')).toBeInTheDocument()
    expect(galleryMock).not.toHaveBeenCalled()
  })
})
