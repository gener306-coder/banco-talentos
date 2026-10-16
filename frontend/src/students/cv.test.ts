import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { certificationInput, getCv, searchSkills, setCertificationReview, updateCertifications, updateLinks, updateSkills } from './cv'
import { catalogSlug, hasContactInformation, isSafeHttpsUrl, linkUrlError } from './cvCatalogs'

const fetchMock = vi.fn<typeof fetch>()
const certification = { id: 4, name: 'CCNA', issuer: 'Cisco', issued_on: '2025-06-15', expires_on: null, verified_at: null }
const credential = { certification_id: 4, credential_id: 'C-1', credential_url: 'https://www.credly.com/badges/1', verifiable: true }
const body = {
  public: { headline: 'Auxiliar Contable', skills: [{ id: 1, name: 'Excel', kind: 'technical' }], languages: [{ language_code: 'en', level: 4 }], certifications: [certification], projects: [] },
  protected: { links: [{ id: 2, kind: 'github', url: 'https://github.com/ana' }], credentials: [credential], reviews: [] },
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
})
afterEach(() => vi.unstubAllGlobals())

function csrf() {
  document.cookie = 'XSRF-TOKEN=token%3D; Path=/'
  return Promise.resolve(new Response(null, { status: 204 }))
}
const sent = (call = 1) => JSON.parse(fetchMock.mock.calls[call][1]?.body as string)

describe('cliente del CV HU-S3-01', () => {
  it('obtiene el CV separado en público y protegido, sin campos fuera del contrato', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: {
      public: { ...body.public, skills: [{ ...body.public.skills[0], slug: 'excel' }] },
      protected: { ...body.protected, links: [{ ...body.protected.links[0], institution_id: 9 }] },
    } }))
    await expect(getCv(3)).resolves.toEqual(body)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/students/3/cv')
  })

  it.each([
    [{ data: { public: body.public } }],
    [{ data: { ...body, public: { ...body.public, headline: 5 } } }],
    [{ data: { ...body, public: { ...body.public, skills: [{ id: 1, name: 'Excel', kind: 'hard' }] } } }],
    [{ data: { ...body, public: { ...body.public, languages: [{ language_code: 'en', level: 8 }] } } }],
    [{ data: { ...body, protected: { ...body.protected, links: [{ id: 2, kind: 'twitter', url: 'x' }] } } }],
    [{ data: { ...body, protected: { ...body.protected, credentials: [{ ...credential, verifiable: 'yes' }] } } }],
  ])('rechaza un CV inesperado', async (response) => {
    fetchMock.mockResolvedValueOnce(Response.json(response))
    await expect(getCv(3)).rejects.toMatchObject({ status: 502 })
  })

  it('guarda cada sección con CSRF enviando solo sus campos', async () => {
    fetchMock.mockImplementation(async (path) => path === '/sanctum/csrf-cookie' ? csrf() : Response.json({ data: body }))
    await updateSkills(3, [{ name: 'Excel', kind: 'technical', ...{ id: 9 } }])
    expect(fetchMock.mock.calls[1][0]).toBe('/api/students/3/cv/skills')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PUT')
    expect(sent()).toEqual({ skills: [{ name: 'Excel', kind: 'technical' }] })

    await updateLinks(3, [{ kind: 'github', url: 'https://github.com/ana', ...{ id: 2 } }])
    expect(sent(3)).toEqual({ links: [{ kind: 'github', url: 'https://github.com/ana' }] })
  })

  it('envía el id solo de las certificaciones existentes', async () => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: body }))
    const created = { name: 'BLS', issuer: 'Cruz Roja', issued_on: '2025-01-01', expires_on: null, credential_id: null, credential_url: null }
    await updateCertifications(3, [certificationInput(certification, [credential]), created])
    expect(sent()).toEqual({ certifications: [
      { id: 4, name: 'CCNA', issuer: 'Cisco', issued_on: '2025-06-15', expires_on: null, credential_id: 'C-1', credential_url: 'https://www.credly.com/badges/1' },
      created,
    ] })
  })

  it('marca la revisión con PATCH y busca en el catálogo', async () => {
    fetchMock.mockImplementationOnce(csrf).mockResolvedValueOnce(Response.json({ data: body }))
    await setCertificationReview(3, 4, true)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/students/3/cv/certifications/4/verification')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH')
    expect(sent()).toEqual({ verified: true })

    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ id: 1, name: 'C#', kind: 'technical' }] }))
    await expect(searchSkills('c# ')).resolves.toEqual([{ id: 1, name: 'C#', kind: 'technical' }])
    expect(fetchMock.mock.calls[2][0]).toBe('/api/skills?q=c%23%20')
  })
})

describe('reglas del CV en el navegador', () => {
  it('normaliza el catálogo como el servidor', () => {
    expect(catalogSlug('  Curación   de HERIDAS ')).toBe('curacion de heridas')
    expect(catalogSlug('C#')).not.toBe(catalogSlug('C++'))
  })

  it.each(['https://ana.dev', 'www.ana', 'ana@correo.mx', '(834) 123-4567', '8341234567', 'github.com/ana', 'ana.com.mx'])('detecta contacto en «%s»', (text) => {
    expect(hasContactInformation(text)).toBe(true)
  })

  it.each(['Node.js', 'Vue.js', 'ASP.NET Core', 'C# y C++', 'Python 3.12', 'Proyecto 2023-2024', 'ISO 9001:2015'])('no confunde «%s» con contacto', (text) => {
    expect(hasContactInformation(text)).toBe(false)
  })

  it.each([
    ['https://github.com/ana', true], ['https://mx.linkedin.com/in/ana', true],
    ['http://ana.dev', false], ['https://127.0.0.1', false], ['https://[::1]', false], ['https://localhost', false],
    ['https://ana.dev:8443', false], ['https://u:p@ana.dev', false], ['https://intranet', false], ['https://ana.dev/a b', false], ['javascript:alert(1)', false],
  ])('valida %s como URL pública', (url, valid) => {
    expect(isSafeHttpsUrl(url)).toBe(valid)
  })

  it('exige el dominio de cada tipo de enlace', () => {
    expect(linkUrlError('github', 'https://github.com/ana')).toBeNull()
    expect(linkUrlError('github', 'https://github.com.evil.io/ana')).toBe('El enlace debe ser de github.com.')
    expect(linkUrlError('behance', 'https://www.behance.net/ana')).toBeNull()
    expect(linkUrlError('portfolio', 'https://ana.dev')).toBeNull()
    expect(linkUrlError('other', '')).toBe('Escribe la dirección del enlace.')
  })
})
