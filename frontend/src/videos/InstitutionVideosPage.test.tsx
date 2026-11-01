import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { isVideoFile, MAX_VIDEO_BYTES } from './api'

const institutionUser = { id: 5, name: 'Coordinación', email: 'coord@example.test', role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
const received = {
  public_id: '6c0f7c1e-6c3b-4b49-9a1f-3a3f0f9c2d11', title: 'Talleres de manufactura', description: null, status: 'PROCESSING',
  is_active: true, duration_seconds: null, width: null, height: null, original_bytes: 4096, output_bytes: null,
  failure_reason: null, created_at: '2026-10-31T18:00:00Z', poster_url: null, video_url: null,
}
const ready = {
  ...received, public_id: '0b8f3a52-2d4e-4f7b-8c1a-9e5d6f7a8b9c', title: 'Laboratorio de robótica', description: 'Proyectos de nuestros alumnos',
  status: 'READY', duration_seconds: 92, width: 1280, height: 720, original_bytes: 136 * 1024 * 1024, output_bytes: 14 * 1024 * 1024,
  poster_url: '/api/media/videos/7/robotica.jpg?signature=a', video_url: '/api/media/videos/7/robotica.mp4?signature=a',
}
const failed = { ...received, public_id: '9d2c1b0a-3e4f-4a5b-8c6d-7e8f9a0b1c2d', title: 'Video dañado', status: 'FAILED', failure_reason: 'El archivo no contiene una pista de video.' }
const fetchMock = vi.fn<typeof fetch>()
/** Respuestas de la API de videos (listado, edición y estado) que define cada prueba. */
const videosMock = vi.fn<typeof fetch>()

/** XMLHttpRequest controlado por la prueba: avance, respuesta y cancelación. */
class FakeXhr {
  static last: FakeXhr | null = null
  method = ''
  url = ''
  headers: Record<string, string> = {}
  withCredentials = false
  body: FormData | null = null
  status = 0
  responseText = ''
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  aborted = false

  constructor() { FakeXhr.last = this }
  open(method: string, url: string) { this.method = method; this.url = url }
  setRequestHeader(name: string, value: string) { this.headers[name] = value }
  send(body: FormData) { this.body = body }
  abort() { this.aborted = true; this.onabort?.() }
  progress(loaded: number, total: number) { this.upload.onprogress?.({ lengthComputable: true, loaded, total }) }
  respond(status: number, body: unknown) { this.status = status; this.responseText = JSON.stringify(body); this.onload?.() }
}

beforeEach(() => {
  FakeXhr.last = null
  fetchMock.mockReset()
  videosMock.mockReset()
  videosMock.mockImplementation(async () => Response.json({ data: [] }))
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/api/me') return Response.json({ user: institutionUser })
    if (path === '/sanctum/csrf-cookie') {
      window.document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    if (String(path).startsWith('/api/institution/videos')) return videosMock(path, options)
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  window.document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
})
afterEach(() => vi.unstubAllGlobals())

const video = (name = 'promocion.mp4', size = 4096, type = 'video/mp4') => {
  const file = new File(['video'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

async function openForm() {
  render(<MemoryRouter initialEntries={['/institution/videos']}><App /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Subir video' }))
  return screen.findByRole('dialog', { name: 'Subir video promocional' })
}

function fill(form: HTMLElement, { title = 'Talleres de manufactura', file = video(), consent = true }: { title?: string; file?: File | null; consent?: boolean } = {}) {
  fireEvent.change(within(form).getByLabelText('Título'), { target: { value: title } })
  if (file) fireEvent.change(within(form).getByLabelText('Archivo de video'), { target: { files: [file] } })
  if (consent) fireEvent.click(within(form).getByLabelText(/Confirmo que cuento con la autorización/))
}

const submit = (form: HTMLElement) => fireEvent.click(within(form).getByRole('button', { name: 'Subir video' }))

describe('videos promocionales HU-S9-01', () => {
  it('aparece en el inicio de la institución', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: /Videos promocionales/ })).toHaveAttribute('href', '/institution/videos')
  })

  it('sube el video con su progreso y lo muestra «Procesando…» (CA-07)', async () => {
    const form = await openForm()
    fill(form)
    fireEvent.change(within(form).getByLabelText('Descripción (opcional)'), { target: { value: 'Nuestros talleres' } })
    submit(form)

    await waitFor(() => expect(FakeXhr.last).not.toBeNull())
    const xhr = FakeXhr.last!
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('/api/institution/videos')
    expect(xhr.withCredentials).toBe(true)
    expect(xhr.headers['X-XSRF-TOKEN']).toBe('csrf')
    expect(xhr.body?.get('title')).toBe('Talleres de manufactura')
    expect(xhr.body?.get('description')).toBe('Nuestros talleres')
    expect(xhr.body?.get('consent')).toBe('1')
    expect((xhr.body?.get('video') as File).name).toBe('promocion.mp4')

    act(() => xhr.progress(42, 100))
    expect(within(form).getByRole('progressbar', { name: 'Subiendo video: 42 %' })).toHaveValue(42)
    // A lectores de pantalla solo se anuncia cada 25 %.
    expect(within(form).getByText('Subiendo video: 25 %')).toHaveAttribute('role', 'status')
    expect(within(form).getByRole('button', { name: 'Subiendo video…' })).toBeDisabled()

    act(() => xhr.respond(202, { data: received }))
    expect(await screen.findByText(/Recibimos «Talleres de manufactura»\. Procesando…/)).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('dialog', { name: 'Subir video promocional' })).not.toBeInTheDocument()
  })

  it('valida antes de subir', async () => {
    const form = await openForm()
    submit(form)

    expect(within(form).getByText('Selecciona el video.')).toBeInTheDocument()
    expect(within(form).getByText('El título es obligatorio.')).toBeInTheDocument()
    expect(within(form).getByText('Confirma que cuentas con la autorización de las personas que aparecen en el video.')).toBeInTheDocument()
    expect(FakeXhr.last).toBeNull()
  })

  it('rechaza otros formatos, más de 250 MB y datos de contacto', async () => {
    const form = await openForm()
    fill(form, { title: 'Escríbenos a promo@escuela.mx', file: video('promocion.avi', 4096, 'video/x-msvideo') })
    expect(within(form).getByText('El video debe ser MP4, MOV o WebM.')).toBeInTheDocument()

    fireEvent.change(within(form).getByLabelText('Archivo de video'), { target: { files: [video('grande.mov', MAX_VIDEO_BYTES + 1, 'video/quicktime')] } })
    expect(within(form).getByText('El video no debe superar 250 MB.')).toBeInTheDocument()

    submit(form)
    expect(within(form).getByText(/No incluyas enlaces, correos ni teléfonos/)).toBeInTheDocument()
    expect(FakeXhr.last).toBeNull()
  })

  it('muestra los errores del servidor junto a cada campo', async () => {
    const form = await openForm()
    fill(form)
    submit(form)
    await waitFor(() => expect(FakeXhr.last).not.toBeNull())

    act(() => FakeXhr.last!.respond(422, { errors: { video: ['Tu institución ya tiene 5 videos activos.'] } }))
    expect(await within(form).findByText('Tu institución ya tiene 5 videos activos.')).toBeInTheDocument()
    expect(within(form).getByLabelText('Archivo de video')).toHaveAttribute('aria-invalid', 'true')
  })

  it('cancela la subida y conserva los datos', async () => {
    const form = await openForm()
    fill(form)
    submit(form)
    await waitFor(() => expect(FakeXhr.last).not.toBeNull())

    fireEvent.click(within(form).getByRole('button', { name: 'Cancelar subida' }))
    expect(FakeXhr.last!.aborted).toBe(true)
    expect(await within(form).findByText('Subida cancelada. Tus datos se conservaron.')).toBeInTheDocument()
    expect(within(form).getByLabelText('Título')).toHaveValue('Talleres de manufactura')
    expect(within(form).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reconoce los formatos permitidos aunque el navegador no informe el tipo', () => {
    expect(isVideoFile(video('iphone.MOV', 1, ''))).toBe(true)
    expect(isVideoFile(video('clip.webm', 1, 'video/webm'))).toBe(true)
    expect(isVideoFile(video('clip.mp4', 1, 'application/pdf'))).toBe(false)
    expect(isVideoFile(video('clip.mkv', 1, ''))).toBe(false)
  })
})

const calls = (method: string) => videosMock.mock.calls.filter(([, options]) => (options?.method ?? 'GET') === method)

async function list(items: unknown[]) {
  videosMock.mockImplementation(async (_path, options) => (options?.method ?? 'GET') === 'GET' ? Response.json({ data: items }) : new Response(null, { status: 500 }))
  render(<MemoryRouter initialEntries={['/institution/videos']}><App /></MemoryRouter>)
  return screen.findByRole('list', { name: 'Tus videos' })
}
const card = (grid: HTMLElement, title: string) => within(grid).getByRole('heading', { name: title }).closest('li')!

describe('gestión de mis videos HU-S9-02', () => {
  it('lista los videos con estado, póster, duración, peso y motivo del fallo (CA-01)', async () => {
    const grid = await list([received, ready, failed, { ...ready, public_id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f', title: 'Video anterior', is_active: false }])

    expect(within(grid).getAllByRole('listitem').map((item) => within(item).getByRole('heading').textContent))
      .toEqual(['Talleres de manufactura', 'Laboratorio de robótica', 'Video dañado', 'Video anterior'])
    expect(within(card(grid, 'Talleres de manufactura')).getByText('Procesando…')).toBeInTheDocument()
    const published = card(grid, 'Laboratorio de robótica')
    expect(within(published).getByText('Publicado')).toBeInTheDocument()
    expect(within(published).getByText('1:32')).toBeInTheDocument()
    expect(within(published).getByText(/14\.0 MB \(original 136\.0 MB\)/)).toBeInTheDocument()
    expect(published.querySelector('img')).toHaveAttribute('src', ready.poster_url)
    expect(within(card(grid, 'Video dañado')).getByText('El archivo no contiene una pista de video.')).toBeInTheDocument()
    expect(within(card(grid, 'Video anterior')).getByText('Inactivo')).toBeInTheDocument()
    // Solo un video listo se puede ver.
    expect(within(card(grid, 'Video dañado')).queryByRole('button', { name: 'Ver Video dañado' })).not.toBeInTheDocument()
  })

  it('muestra un estado vacío con la acción de subir', async () => {
    render(<MemoryRouter initialEntries={['/institution/videos']}><App /></MemoryRouter>)
    expect(await screen.findByText('Aún no hay videos promocionales.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir el primer video' })).toBeInTheDocument()
  })

  it('reproduce un video listo en una hoja (CA-06)', async () => {
    const grid = await list([ready])
    fireEvent.click(within(grid).getByRole('button', { name: 'Ver Laboratorio de robótica' }))

    const sheet = await screen.findByRole('dialog', { name: 'Laboratorio de robótica' })
    const player = within(sheet).getByLabelText('Video: Laboratorio de robótica')
    expect(player.tagName).toBe('VIDEO')
    expect(player).toHaveAttribute('src', ready.video_url)
    expect(player).toHaveAttribute('poster', ready.poster_url)
    expect(player).toHaveAttribute('controls')
  })

  it('edita el título y la descripción (CA-02)', async () => {
    const grid = await list([ready])
    videosMock.mockImplementation(async (_path, options) => options?.method === 'PUT'
      ? Response.json({ data: { ...ready, title: 'Robótica 2026' } }) : Response.json({ data: [ready] }))
    fireEvent.click(within(grid).getByRole('button', { name: 'Editar Laboratorio de robótica' }))

    const sheet = await screen.findByRole('dialog', { name: 'Editar video' })
    fireEvent.change(within(sheet).getByLabelText('Título'), { target: { value: 'Robótica 2026' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar cambios' }))

    expect(await within(grid).findByRole('heading', { name: 'Robótica 2026' })).toBeInTheDocument()
    expect(calls('PUT')[0][0]).toBe(`/api/institution/videos/${ready.public_id}`)
    expect(JSON.parse(String(calls('PUT')[0][1]?.body))).toEqual({ title: 'Robótica 2026', description: 'Proyectos de nuestros alumnos' })
    expect(screen.getByText('Cambios guardados.')).toHaveAttribute('role', 'status')
  })

  it('pide confirmación para inactivar y permite activar de nuevo (CA-03)', async () => {
    const grid = await list([ready])
    videosMock.mockImplementation(async (_path, options) => {
      if (options?.method !== 'PATCH') return Response.json({ data: [ready] })
      const { is_active } = JSON.parse(String(options.body)) as { is_active: boolean }
      return Response.json({ data: { ...ready, is_active } })
    })

    fireEvent.click(within(grid).getByRole('button', { name: 'Inactivar Laboratorio de robótica' }))
    const dialog = await screen.findByRole('alertdialog', { name: '¿Inactivar el video?' })
    expect(calls('PATCH')).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Inactivar' }))

    expect(await within(grid).findByText('Inactivo')).toBeInTheDocument()
    expect(JSON.parse(String(calls('PATCH')[0][1]?.body))).toEqual({ is_active: false })
    expect(screen.getByText(/se inactivó; ya no lo verán las empresas/)).toBeInTheDocument()

    fireEvent.click(within(grid).getByRole('button', { name: 'Activar Laboratorio de robótica' }))
    expect(await within(grid).findByText('Publicado')).toBeInTheDocument()
    expect(JSON.parse(String(calls('PATCH')[1][1]?.body))).toEqual({ is_active: true })
  })

  it('explica cuando reactivar rebasaría la cuota (CA-03)', async () => {
    const grid = await list([{ ...ready, is_active: false }])
    videosMock.mockImplementation(async () => Response.json({ errors: { is_active: ['Tu institución ya tiene 5 videos activos.'] } }, { status: 422 }))

    fireEvent.click(within(grid).getByRole('button', { name: 'Activar Laboratorio de robótica' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu institución ya tiene 5 videos activos.')
  })

  it('consulta cada 5 s mientras algo se procesa y se detiene al terminar (CA-05)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const grid = await list([received])
      let polls = 0
      videosMock.mockImplementation(async () => {
        polls += 1
        return Response.json({ data: [polls === 1 ? received : { ...received, status: 'READY', duration_seconds: 30, output_bytes: 2048, poster_url: '/p.jpg', video_url: '/v.mp4' }] })
      })

      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
      expect(polls).toBe(1)
      expect(within(grid).getByText('Procesando…')).toBeInTheDocument()

      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
      expect(await within(grid).findByText('Publicado')).toBeInTheDocument()
      // Sin esqueleto: la consulta es silenciosa.
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument()

      await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
      expect(polls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('agrega al listado el video recién subido', async () => {
    const grid = await list([ready])
    fireEvent.click(screen.getByRole('button', { name: 'Subir video' }))
    const form = await screen.findByRole('dialog', { name: 'Subir video promocional' })
    fill(form)
    submit(form)
    await waitFor(() => expect(FakeXhr.last).not.toBeNull())
    act(() => FakeXhr.last!.respond(202, { data: received }))

    expect(await within(grid).findByRole('heading', { name: 'Talleres de manufactura' })).toBeInTheDocument()
    expect(within(grid).getAllByRole('listitem')).toHaveLength(2)
  })
})
