import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { isVideoFile, MAX_VIDEO_BYTES } from './api'

const institutionUser = { id: 5, name: 'Coordinación', email: 'coord@example.test', role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
const received = {
  public_id: '6c0f7c1e-6c3b-4b49-9a1f-3a3f0f9c2d11', title: 'Talleres de manufactura', description: null, status: 'PROCESSING',
  is_active: true, duration_seconds: null, width: null, height: null,
  failure_reason: null, created_at: '2026-10-31T18:00:00Z', poster_url: null, video_url: null,
}
const ready = {
  ...received, public_id: '0b8f3a52-2d4e-4f7b-8c1a-9e5d6f7a8b9c', title: 'Laboratorio de robótica', description: 'Proyectos de nuestros alumnos',
  status: 'READY', duration_seconds: 92, width: 1280, height: 720,
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
  URL.createObjectURL = vi.fn(() => 'blob:local')
  URL.revokeObjectURL = vi.fn()
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
  return screen.findByRole('dialog', { name: 'Subir una historia' })
}

function fill(form: HTMLElement, { title = 'Talleres de manufactura', file = video(), consent = true }: { title?: string; file?: File | null; consent?: boolean } = {}) {
  fireEvent.change(within(form).getByLabelText('Título'), { target: { value: title } })
  if (file) fireEvent.change(within(form).getByLabelText('Archivo de video'), { target: { files: [file] } })
  if (consent) fireEvent.click(within(form).getByLabelText(/Confirmo que cuento con la autorización/))
}

const submit = (form: HTMLElement) => fireEvent.click(within(form).getByRole('button', { name: 'Subir historia' }))

describe('videos promocionales HU-S9-01', () => {
  it('aparece en el inicio de la institución', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: /Historias del Dual/ })).toHaveAttribute('href', '/institution/videos')
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
    expect(within(form).getByRole('button', { name: 'Subiendo historia…' })).toBeDisabled()

    act(() => xhr.respond(202, { data: received }))
    expect(await screen.findByText(/Recibimos «Talleres de manufactura»\. Procesando…/)).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('dialog', { name: 'Subir una historia' })).not.toBeInTheDocument()
  })

  it('valida antes de subir', async () => {
    const form = await openForm()
    submit(form)

    expect(within(form).getByText('Selecciona el video.')).toBeInTheDocument()
    expect(within(form).getByText('El título es obligatorio.')).toBeInTheDocument()
    expect(within(form).getByText('Confirma que cuentas con la autorización de las personas y empresas que aparecen o se mencionan en el video.')).toBeInTheDocument()
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
    // Sin información de peso (HU-S9-04).
    expect(grid).not.toHaveTextContent(/\d\s?(MB|KB)/)
    expect(published.querySelector('img')).toHaveAttribute('src', ready.poster_url)
    expect(within(card(grid, 'Video dañado')).getByText('El archivo no contiene una pista de video.')).toBeInTheDocument()
    expect(within(card(grid, 'Video anterior')).getByText('Inactivo')).toBeInTheDocument()
    // Solo un video listo se puede ver.
    expect(within(card(grid, 'Video dañado')).queryByRole('button', { name: 'Ver Video dañado' })).not.toBeInTheDocument()
  })

  it('muestra un estado vacío con la acción de subir', async () => {
    render(<MemoryRouter initialEntries={['/institution/videos']}><App /></MemoryRouter>)
    expect(await screen.findByText('Aún no hay historias.')).toBeInTheDocument()
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
    // Reproductor propio (HU-S9-04): sin controles nativos, que ofrecen descargar.
    expect(player).not.toHaveAttribute('controls')
    expect(within(sheet).getByRole('button', { name: 'Reproducir: Laboratorio de robótica' })).toBeInTheDocument()
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

  it('ofrece las acciones como íconos con su nombre accesible y su etiqueta (T-S9-05)', async () => {
    const grid = await list([ready, received])
    const row = within(grid).getAllByRole('listitem')[0]
    for (const [verb, tooltip] of [['Ver', 'Ver'], ['Editar', 'Editar'], ['Inactivar', 'Inactivar'], ['Eliminar', 'Eliminar']]) {
      const button = within(row).getByRole('button', { name: `${verb} ${ready.title}` })
      expect(button).toHaveAttribute('data-tooltip', tooltip)
      expect(button).toHaveTextContent('')
      expect(button.querySelector('svg')).not.toBeNull()
    }
    // Un video en proceso no se puede ver ni eliminar todavía, pero sus columnas se conservan.
    const processing = within(grid).getAllByRole('listitem')[1]
    expect(within(processing).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([`Editar ${received.title}`, `Inactivar ${received.title}`])
    expect(processing.querySelectorAll('.icon-action-slot')).toHaveLength(2)
  })

  it('elimina un video tras confirmarlo y lo quita de la lista (T-S9-04)', async () => {
    const grid = await list([ready, failed, received])
    videosMock.mockImplementation(async (_path, options) => options?.method === 'PATCH' ? new Response(null, { status: 204 }) : Response.json({ data: [ready, failed, received] }))

    // Un video en proceso no se puede eliminar todavía.
    expect(within(grid).queryByRole('button', { name: `Eliminar ${received.title}` })).not.toBeInTheDocument()
    fireEvent.click(within(grid).getByRole('button', { name: 'Eliminar Laboratorio de robótica' }))
    const dialog = await screen.findByRole('alertdialog', { name: '¿Eliminar el video?' })
    expect(dialog).toHaveTextContent('no se puede deshacer')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(calls('PATCH')).toHaveLength(0)

    fireEvent.click(within(grid).getByRole('button', { name: 'Eliminar Laboratorio de robótica' }))
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: '¿Eliminar el video?' })).getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('Eliminaste «Laboratorio de robótica» y se liberó su espacio.')).toHaveAttribute('role', 'status')
    expect(within(grid).queryByText('Laboratorio de robótica')).not.toBeInTheDocument()
    expect(within(grid).getByText(failed.title)).toBeInTheDocument()
    expect(calls('PATCH')[0][0]).toBe(`/api/institution/videos/${ready.public_id}/deletion`)
  })

  it('explica si el video aún se está procesando al eliminarlo (T-S9-04)', async () => {
    const grid = await list([failed])
    videosMock.mockImplementation(async () => Response.json({ errors: { video: ['Espera a que termine de procesarse para eliminarlo.'] } }, { status: 422 }))

    fireEvent.click(within(grid).getByRole('button', { name: `Eliminar ${failed.title}` }))
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: '¿Eliminar el video?' })).getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Espera a que termine de procesarse para eliminarlo.')
    expect(within(grid).getByText(failed.title)).toBeInTheDocument()
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
        return Response.json({ data: [polls === 1 ? received : { ...received, status: 'READY', duration_seconds: 30, poster_url: '/p.jpg', video_url: '/v.mp4' }] })
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
    const form = await screen.findByRole('dialog', { name: 'Subir una historia' })
    fill(form)
    submit(form)
    await waitFor(() => expect(FakeXhr.last).not.toBeNull())
    act(() => FakeXhr.last!.respond(202, { data: received }))

    expect(await within(grid).findByRole('heading', { name: 'Talleres de manufactura' })).toBeInTheDocument()
    expect(within(grid).getAllByRole('listitem')).toHaveLength(2)
  })
})

describe('formulario de subida HU-S9-07', () => {
  const dropzone = (form: HTMLElement) => form.querySelector('.video-dropzone')!
  const preview = (form: HTMLElement, name = 'promocion.mp4') => within(form).findByLabelText(`Video: ${name}`)

  it('invita a arrastrar o elegir, con un input real para el teclado', async () => {
    const form = await openForm()
    expect(within(form).getByText('Arrastra tu video o elige un archivo')).toBeInTheDocument()
    expect(within(form).getByText('MP4, MOV o WebM, hasta 250 MB y 5 minutos')).toBeInTheDocument()
    expect(within(form).getByLabelText('Archivo de video')).toHaveAttribute('type', 'file')
  })

  it('acepta un archivo arrastrado y marca la zona mientras está encima', async () => {
    const form = await openForm()
    fireEvent.dragOver(dropzone(form))
    expect(dropzone(form)).toHaveAttribute('data-dragging', 'true')

    fireEvent.drop(dropzone(form), { dataTransfer: { files: [video()] } })
    expect(dropzone(form)).toHaveAttribute('data-dragging', 'false')
    expect(await preview(form)).toHaveAttribute('src', 'blob:local#t=0.1')
  })

  it('rechaza un formato inválido también al arrastrar', async () => {
    const form = await openForm()
    fireEvent.drop(dropzone(form), { dataTransfer: { files: [video('promocion.avi', 4096, 'video/x-msvideo')] } })
    expect(within(form).getByText('El video debe ser MP4, MOV o WebM.')).toBeInTheDocument()
  })

  it('muestra la vista previa local sin subir nada y ofrece cambiar el video', async () => {
    const form = await openForm()
    fill(form)
    const player = await preview(form)

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(player).toHaveAttribute('preload', 'metadata')
    expect(within(form).getByText('promocion.mp4')).toBeInTheDocument()
    expect(within(form).getByRole('button', { name: 'Cambiar video' })).toBeInTheDocument()
    expect(FakeXhr.last).toBeNull()
  })

  it('libera la URL local al cambiar de archivo', async () => {
    const form = await openForm()
    fill(form)
    await preview(form)

    fireEvent.change(within(form).getByLabelText('Archivo de video'), { target: { files: [video('otro.mp4')] } })
    await preview(form, 'otro.mp4')
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local'))
  })

  it('desmonta la vista previa al cerrar la hoja, para que no siga sonando', async () => {
    const form = await openForm()
    fill(form)
    await preview(form)

    fireEvent.click(within(form).getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(form.querySelector('video')).toBeNull())
    // El archivo elegido se conserva.
    expect(within(form).getByText('promocion.mp4')).toBeInTheDocument()
  })

  it('avisa si dura más de 5 minutos, antes de subirlo', async () => {
    const form = await openForm()
    fill(form)
    const player = await preview(form)
    Object.defineProperty(player, 'duration', { value: 301 })

    fireEvent.loadedMetadata(player)
    expect(await within(form).findByText('El video dura más de 5 minutos. Recórtalo y vuelve a subirlo.')).toBeInTheDocument()
    submit(form)
    expect(FakeXhr.last).toBeNull()
  })

  it('si el navegador no puede mostrarlo, lo dice y no bloquea la subida', async () => {
    const form = await openForm()
    fill(form, { file: video('iphone.mov', 4096, 'video/quicktime') })
    fireEvent.error(await preview(form, 'iphone.mov'))

    expect(await within(form).findByText(/Este navegador no puede mostrar la vista previa/)).toBeInTheDocument()
    expect(within(form).queryByRole('alert')).not.toBeInTheDocument()
    submit(form)
    await waitFor(() => expect(FakeXhr.last).not.toBeNull())
    expect((FakeXhr.last!.body?.get('video') as File).name).toBe('iphone.mov')
  })

  it('la casilla no ocupa todo el ancho: el texto la acompaña dentro de su etiqueta', async () => {
    const form = await openForm()
    const checkbox = within(form).getByRole('checkbox', { name: /Confirmo que cuento con la autorización/ })
    expect(checkbox.closest('label')).toHaveClass('video-consent')
    fireEvent.click(checkbox.closest('label')!)
    expect(checkbox).toBeChecked()
  })
})
