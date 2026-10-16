import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  downloadSocialSecurityDocument, fileSize, formatNss, getSocialSecurity, isPdfFile, isValidNss, nssDigits,
  updateSocialSecurity, uploadSocialSecurityDocument,
} from './socialSecurity'

const fetchMock = vi.fn<typeof fetch>()
const document = { name: 'vigencia.pdf', size: 2048, uploaded_at: '2026-10-16T12:00:00Z' }

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  window.document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
})
afterEach(() => vi.unstubAllGlobals())

function csrf() {
  window.document.cookie = 'XSRF-TOKEN=token%3D; Path=/'
  return Promise.resolve(new Response(null, { status: 204 }))
}

describe('cliente del seguro facultativo HU-S3-02', () => {
  it('obtiene el seguro y conserva solo los campos del contrato', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: { nss: '12345678903', document: { ...document, path: 'imss/1/x.pdf' }, nss_hash: 'x' } }))
    await expect(getSocialSecurity(3)).resolves.toEqual({ nss: '12345678903', document })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/students/3/social-security')
  })

  it.each([
    [{ data: null }],
    [{ data: { nss: 123, document: null } }],
    [{ data: { nss: null } }],
    [{ data: { nss: null, document: { name: 'x.pdf', size: '1', uploaded_at: 'x' } } }],
    [{ data: { nss: null, document: 'x' } }],
  ])('rechaza una respuesta inesperada', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body))
    await expect(getSocialSecurity(3)).rejects.toMatchObject({ status: 502 })
  })

  it('guarda el NSS con CSRF enviando solo el NSS', async () => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: { nss: '12345678903', document: null } }))
    await updateSocialSecurity(3, '12345678903')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/students/3/social-security')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PUT')
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({ nss: '12345678903' })
  })

  it('sube el comprobante como multipart sin forzar JSON', async () => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: { nss: null, document } }))
    const file = new File(['%PDF-1.7'], 'vigencia.pdf', { type: 'application/pdf' })
    await expect(uploadSocialSecurityDocument(3, file)).resolves.toEqual({ nss: null, document })
    const [path, options] = fetchMock.mock.calls[1]
    expect(path).toBe('/api/students/3/social-security/document')
    expect(options?.method).toBe('POST')
    expect((options?.body as FormData).get('document')).toBe(file)
    expect(new Headers(options?.headers).get('Content-Type')).toBeNull()
    expect(new Headers(options?.headers).get('X-XSRF-TOKEN')).toBe('token=')
  })

  it('descarga el comprobante con la sesión y propaga los errores', async () => {
    fetchMock.mockResolvedValueOnce(new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } }))
    const blob = await downloadSocialSecurityDocument(3)
    expect(await blob.text()).toBe('%PDF-1.7')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/students/3/social-security/document')
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include')

    fetchMock.mockResolvedValueOnce(Response.json({ message: 'El alumno no tiene comprobante del IMSS.' }, { status: 404 }))
    await expect(downloadSocialSecurityDocument(3)).rejects.toMatchObject({ status: 404 })
  })

  it('valida el NSS con el dígito verificador de Luhn', () => {
    expect(isValidNss('12345678903')).toBe(true)
    expect(isValidNss('12345678904')).toBe(false)
    expect(isValidNss('1234567890')).toBe(false)
    expect(nssDigits('1234-5678 903 99')).toBe('12345678903')
    expect(nssDigits('abc12')).toBe('12')
    expect(formatNss('12345678903')).toBe('1234 5678 903')
    expect(formatNss('12345')).toBe('1234 5')
  })

  it('reconoce PDF y presenta el tamaño', () => {
    expect(isPdfFile(new File([''], 'a.pdf', { type: 'application/pdf' }))).toBe(true)
    expect(isPdfFile(new File([''], 'a.PDF'))).toBe(true)
    expect(isPdfFile(new File([''], 'a.png', { type: 'image/png' }))).toBe(false)
    expect(isPdfFile(new File([''], 'a.pdf', { type: 'image/png' }))).toBe(false)
    expect(fileSize(2048)).toBe('2 KB')
    expect(fileSize(1536 * 1024)).toBe('1.5 MB')
  })
})
