import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const institutionUser = { id: 5, name: 'Coordinación', email: 'coord@example.test', role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
const emptyProfile = { program: null, period_type: null, period_number: null, dual_available: null, state_code: null, municipality: null, can_relocate: null }
const detail = { data: { id: 3, enrollment_number: 'A-001', given_names: 'María', first_surname: 'López', second_surname: null, is_active: true, created_at: '2026-10-13T12:00:00Z', profile: emptyProfile } }
const document = { name: 'Vigencia María.pdf', size: 150 * 1024, uploaded_at: '2026-10-16T18:30:00Z' }
const security = (nss: string | null = null, doc: typeof document | null = null) => Response.json({ data: { nss, document: doc } })
const fetchMock = vi.fn<typeof fetch>()
const securityMock = vi.fn<typeof fetch>()

beforeEach(() => {
  securityMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/api/me') return Response.json({ user: institutionUser })
    if (path === '/sanctum/csrf-cookie') {
      window.document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    if (path === '/api/students/3') return Response.json(detail)
    return securityMock(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
  window.document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
})
afterEach(() => vi.unstubAllGlobals())

async function section() {
  render(<MemoryRouter initialEntries={['/students/3']}><App /></MemoryRouter>)
  const region = await screen.findByRole('region', { name: 'Seguro Facultativo (IMSS)' })
  await within(region).findByLabelText('Número de Seguridad Social (NSS)')
  return region
}
const calls = (method: string) => securityMock.mock.calls.filter(([, options]) => (options?.method ?? 'GET') === method)
const pdf = (name = 'vigencia.pdf', size = 1024, type = 'application/pdf') => {
  const file = new File(['%PDF-1.7'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('seguro facultativo HU-S3-02', () => {
  it('carga el seguro aparte del detalle y lo presenta como resguardo exclusivo (CA-01)', async () => {
    securityMock.mockResolvedValueOnce(security())
    const region = await section()
    expect(within(region).getByText(/resguardo exclusivo de tu institución/)).toBeInTheDocument()
    expect(within(region).getByText('Aún no hay comprobante.')).toBeInTheDocument()
    expect(within(region).queryByRole('button', { name: 'Descargar comprobante' })).not.toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Subir comprobante' })).toBeInTheDocument()
    expect(securityMock.mock.calls[0][0]).toBe('/api/students/3/social-security')
  })

  it('agrupa el NSS mientras se escribe y solo admite 11 dígitos', async () => {
    securityMock.mockResolvedValueOnce(security())
    const input = within(await section()).getByLabelText('Número de Seguridad Social (NSS)')
    fireEvent.change(input, { target: { value: '1234-5678' } })
    expect(input).toHaveValue('1234 5678')
    expect(input).toHaveAccessibleDescription('8 de 11 dígitos')
    fireEvent.change(input, { target: { value: '1234 5678 903 77 ab' } })
    expect(input).toHaveValue('1234 5678 903')
    expect(input).toHaveAccessibleDescription('11 de 11 dígitos · dígito verificador correcto')
    expect(input).toHaveAttribute('inputmode', 'numeric')
  })

  it('valida el NSS sin enviarlo', async () => {
    securityMock.mockResolvedValueOnce(security())
    const region = await section()
    const input = within(region).getByLabelText('Número de Seguridad Social (NSS)')
    const save = within(region).getByRole('button', { name: 'Guardar NSS' })
    fireEvent.click(save)
    expect(input).toHaveAccessibleDescription(/El NSS es obligatorio/)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(input, { target: { value: '1234567890' } })
    fireEvent.click(save)
    expect(input).toHaveAccessibleDescription(/El NSS debe tener 11 dígitos/)
    fireEvent.change(input, { target: { value: '12345678904' } })
    fireEvent.click(save)
    expect(input).toHaveAccessibleDescription(/dígito verificador del NSS no es válido/)
    expect(calls('PUT')).toHaveLength(0)
  })

  it('guarda el NSS sin espacios y lo confirma junto al botón', async () => {
    securityMock.mockResolvedValueOnce(security()).mockResolvedValueOnce(security('12345678903'))
    const region = await section()
    fireEvent.change(within(region).getByLabelText('Número de Seguridad Social (NSS)'), { target: { value: '1234 5678 903' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Guardar NSS' }))
    expect(await within(region).findByText('NSS guardado correctamente.')).toHaveAttribute('role', 'status')
    expect(calls('PUT')[0][0]).toBe('/api/students/3/social-security')
    expect(JSON.parse(calls('PUT')[0][1]?.body as string)).toEqual({ nss: '12345678903' })
  })

  it('muestra un NSS duplicado junto al campo', async () => {
    securityMock.mockResolvedValueOnce(security())
      .mockResolvedValueOnce(Response.json({ errors: { nss: ['Ya existe un alumno con ese NSS en tu institución.'] } }, { status: 422 }))
    const region = await section()
    const input = within(region).getByLabelText('Número de Seguridad Social (NSS)')
    fireEvent.change(input, { target: { value: '12345678903' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Guardar NSS' }))
    await waitFor(() => expect(input).toHaveAccessibleDescription(/Ya existe un alumno con ese NSS/))
    expect(within(region).queryByText('NSS guardado correctamente.')).not.toBeInTheDocument()
  })

  it('carga el NSS guardado en el campo', async () => {
    securityMock.mockResolvedValueOnce(security('12345678903'))
    expect(within(await section()).getByLabelText('Número de Seguridad Social (NSS)')).toHaveValue('1234 5678 903')
  })

  it('sube el comprobante PDF y muestra su ficha (CA-03)', async () => {
    securityMock.mockResolvedValueOnce(security()).mockResolvedValueOnce(security(null, document))
    const region = await section()
    const file = pdf('Vigencia María.pdf')
    fireEvent.change(within(region).getByLabelText('Archivo PDF'), { target: { files: [file] } })
    fireEvent.click(within(region).getByRole('button', { name: 'Subir comprobante' }))
    expect(await within(region).findByText('Comprobante guardado correctamente.')).toBeInTheDocument()
    const [path, options] = calls('POST')[0]
    expect(path).toBe('/api/students/3/social-security/document')
    expect((options?.body as FormData).get('document')).toBe(file)
    expect(within(region).getByText('Vigencia María.pdf')).toBeInTheDocument()
    expect(within(region).getByText(/^150 KB · Subido el/)).toBeInTheDocument()
    expect(within(region).getByLabelText('Reemplazar por otro PDF')).toHaveValue('')
    expect(within(region).getByRole('button', { name: 'Reemplazar comprobante' })).toBeInTheDocument()
  })

  it.each([
    ['sin archivo', null, 'Selecciona el comprobante de vigencia del IMSS.'],
    ['una imagen', pdf('foto.png', 1024, 'image/png'), 'El comprobante debe ser un archivo PDF.'],
    ['más de 2 MB', pdf('grande.pdf', 2048 * 1024 + 1), 'El comprobante no debe superar 2 MB.'],
  ])('rechaza %s sin subirlo', async (_, file, message) => {
    securityMock.mockResolvedValueOnce(security())
    const region = await section()
    const input = within(region).getByLabelText('Archivo PDF')
    if (file) fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(within(region).getByRole('button', { name: 'Subir comprobante' }))
    expect(input).toHaveAccessibleDescription(new RegExp(message))
    expect(calls('POST')).toHaveLength(0)
  })

  it('impide subir dos veces mientras espera al servidor', async () => {
    let resolve!: (response: Response) => void
    securityMock.mockResolvedValueOnce(security()).mockReturnValueOnce(new Promise<Response>((done) => { resolve = done }))
    const region = await section()
    fireEvent.change(within(region).getByLabelText('Archivo PDF'), { target: { files: [pdf()] } })
    const submit = within(region).getByRole('button', { name: 'Subir comprobante' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    await waitFor(() => expect(calls('POST')).toHaveLength(1))
    expect(within(region).getByRole('button', { name: 'Subiendo comprobante…' })).toBeDisabled()
    await act(async () => { resolve(security(null, document)) })
    expect(await within(region).findByText('Comprobante guardado correctamente.')).toBeInTheDocument()
  })

  it('descarga el comprobante actual con un nombre fijo', async () => {
    const createObjectURL = vi.fn(() => 'blob:comprobante')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('comprobante-imss.pdf')
      expect(this.href).toBe('blob:comprobante')
    })
    securityMock.mockResolvedValueOnce(security('12345678903', document))
      .mockResolvedValueOnce(new Response(new Blob(['%PDF-1.7'], { type: 'application/pdf' })))
    const region = await section()
    fireEvent.click(within(region).getByRole('button', { name: 'Descargar comprobante' }))
    await waitFor(() => expect(click).toHaveBeenCalledOnce())
    expect(securityMock.mock.calls[1][0]).toBe('/api/students/3/social-security/document')
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:comprobante'))
    click.mockRestore()
  })

  it('avisa si el comprobante ya no está disponible', async () => {
    securityMock.mockResolvedValueOnce(security(null, document))
      .mockResolvedValueOnce(Response.json({ message: 'El alumno no tiene comprobante del IMSS.' }, { status: 404 }))
    const region = await section()
    fireEvent.click(within(region).getByRole('button', { name: 'Descargar comprobante' }))
    expect(await within(region).findByRole('alert')).toHaveTextContent('No encontramos el comprobante. Vuelve a subirlo.')
  })

  it('presenta el fallo de carga con reintento sin afectar el resto del detalle', async () => {
    securityMock.mockResolvedValueOnce(new Response(null, { status: 500 })).mockResolvedValueOnce(security())
    render(<MemoryRouter initialEntries={['/students/3']}><App /></MemoryRouter>)
    const region = await screen.findByRole('region', { name: 'Seguro Facultativo (IMSS)' })
    fireEvent.click(await within(region).findByRole('button', { name: 'Reintentar' }))
    expect(await within(region).findByLabelText('Número de Seguridad Social (NSS)')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Expediente público' })).toBeInTheDocument()
  })
})
