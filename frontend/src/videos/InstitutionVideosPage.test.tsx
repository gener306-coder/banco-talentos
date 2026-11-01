import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { isVideoFile, MAX_VIDEO_BYTES } from './api'

const institutionUser = { id: 5, name: 'Coordinación', email: 'coord@example.test', role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
const received = {
  public_id: '6c0f7c1e-6c3b-4b49-9a1f-3a3f0f9c2d11', title: 'Talleres de manufactura', description: null, status: 'PROCESSING',
  is_active: true, duration_seconds: null, width: null, height: null, original_bytes: 4096, output_bytes: null,
  failure_reason: null, created_at: '2026-10-31T18:00:00Z',
}
const fetchMock = vi.fn<typeof fetch>()

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
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/me') return Response.json({ user: institutionUser })
    if (path === '/sanctum/csrf-cookie') {
      window.document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
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
