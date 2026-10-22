import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { StudentCv } from './cv'

const institutionUser = { id: 5, name: 'Coordinación', email: 'coord@example.test', role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
const emptyProfile = { program: null, period_type: null, period_number: null, dual_available: null, state_code: null, municipality_code: null, municipality: null, pending_municipality: null, can_relocate: null }
const student = { data: { id: 3, enrollment_number: 'A-001', given_names: 'Ana', first_surname: 'López', second_surname: null, is_active: true, created_at: '2026-10-13T12:00:00Z', profile: emptyProfile } }
const emptyCv = (): StudentCv => ({
  public: { headline: null, skills: [], languages: [], certifications: [], projects: [] },
  protected: { links: [], credentials: [], reviews: [] },
})
const fetchMock = vi.fn<typeof fetch>()
// Escrituras del CV: cada prueba define qué responde el servidor.
const writeMock = vi.fn<typeof fetch>()
const skillsMock = vi.fn<typeof fetch>()
let cv: StudentCv

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}
function renderApp(path = '/students/3/cv') {
  return render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)
}
async function section(name: string) {
  renderApp()
  await screen.findByRole('heading', { level: 2, name: 'Ana López' })
  return screen.getByRole('region', { name })
}
const writes = () => writeMock.mock.calls
const sent = (index = 0) => JSON.parse(writes()[index][1]?.body as string)
const respond = (next: StudentCv) => writeMock.mockResolvedValueOnce(Response.json({ data: next }))

beforeEach(() => {
  cv = emptyCv()
  writeMock.mockReset()
  skillsMock.mockReset()
  skillsMock.mockResolvedValue(Response.json({ data: [] }))
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, options) => {
    const url = String(path)
    if (url === '/api/me') return Response.json({ user: institutionUser })
    if (url === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    if (url.startsWith('/api/skills')) return skillsMock(path, options)
    if (url.includes('/social-security')) return Response.json({ data: { nss: null, document: null } })
    if (url === '/api/students/3') return Response.json(student)
    if (url === '/api/students/3/cv' && !options?.method) return Response.json({ data: cv })
    return writeMock(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
})
afterEach(() => vi.unstubAllGlobals())

describe('página del CV HU-S3-01', () => {
  it('se abre desde el detalle del alumno', async () => {
    renderApp('/students/3')
    fireEvent.click(await screen.findByRole('link', { name: 'CV profesional' }))
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/students/3/cv')
    expect(await screen.findByRole('heading', { level: 2, name: 'Ana López' })).toBeInTheDocument()
    for (const name of ['Titular profesional', 'Habilidades', 'Idiomas', 'Certificaciones', 'Proyectos']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
  })

  it('marca los enlaces como protegidos y fuera de la búsqueda de empresas (CA-02)', async () => {
    const links = await section('Enlaces externos Protegido')
    expect(within(links).getByText('Protegido.')).toBeInTheDocument()
    expect(within(links).getByText(/no es visible en la búsqueda general de empresas/)).toBeInTheDocument()
  })

  it('trata un alumno ajeno como no encontrado', async () => {
    fetchMock.mockImplementation(async (path) => String(path) === '/api/me' ? Response.json({ user: institutionUser })
      : Response.json({ message: 'El alumno no existe.' }, { status: 404 }))
    renderApp('/students/99/cv')
    expect(await screen.findByText('El alumno no existe.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Habilidades' })).not.toBeInTheDocument()
  })
})

describe('titular', () => {
  it('guarda el titular con contador y confirma junto al botón', async () => {
    respond({ ...emptyCv(), public: { ...emptyCv().public, headline: 'Enfermera General' } })
    const region = await section('Titular profesional')
    const input = within(region).getByLabelText('Titular')
    fireEvent.change(input, { target: { value: '  Enfermera   General ' } })
    expect(input).toHaveAccessibleDescription(/de 120 caracteres/)
    fireEvent.click(within(region).getByRole('button', { name: 'Guardar titular' }))
    expect(await within(region).findByText('Titular guardado correctamente.')).toHaveAttribute('role', 'status')
    expect(writes()[0][0]).toBe('/api/students/3/cv/headline')
    expect(sent()).toEqual({ headline: 'Enfermera General' })
  })

  it('rechaza datos de contacto sin enviar', async () => {
    const region = await section('Titular profesional')
    const input = within(region).getByLabelText('Titular')
    fireEvent.change(input, { target: { value: 'Contacto: ana@correo.mx' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Guardar titular' }))
    expect(input).toHaveAccessibleDescription(/van en la sección protegida de enlaces/)
    expect(writes()).toHaveLength(0)
  })
})

describe('habilidades', () => {
  it('sugiere del catálogo y agrega la habilidad con el tipo del catálogo', async () => {
    skillsMock.mockResolvedValue(Response.json({ data: [{ id: 8, name: 'Liderazgo', kind: 'soft' }, { id: 9, name: 'Lighthouse', kind: 'technical' }] }))
    const region = await section('Habilidades')
    const input = within(region).getByRole('combobox', { name: 'Agregar habilidad' })
    fireEvent.change(input, { target: { value: 'li' } })
    await within(region).findByRole('option', { name: /Liderazgo/ })
    const list = within(region).getByRole('listbox', { name: 'Sugerencias de habilidades' })
    expect(skillsMock.mock.calls.at(-1)?.[0]).toBe('/api/skills?q=li')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(within(list).getAllByRole('option').map((option) => option.textContent)).toEqual(['LiderazgoBlanda', 'LighthouseTécnica', 'Agregar «li» como nuevaTécnica'])
    expect(within(list).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'Enter' })

    const soft = within(region).getByRole('list', { name: 'Blandas' })
    expect(within(soft).getByText('Liderazgo')).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('agrega una habilidad nueva con el tipo elegido y navega con las flechas', async () => {
    skillsMock.mockResolvedValue(Response.json({ data: [{ id: 9, name: 'Contabilidad', kind: 'technical' }] }))
    const region = await section('Habilidades')
    fireEvent.click(within(region).getByLabelText('Blanda'))
    const input = within(region).getByRole('combobox', { name: 'Agregar habilidad' })
    fireEvent.change(input, { target: { value: 'Negociación' } })
    await within(region).findByRole('option', { name: /Agregar «Negociación» como nueva/ })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(within(region).getByRole('option', { name: /Agregar «Negociación»/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(within(within(region).getByRole('list', { name: 'Blandas' })).getByText('Negociación')).toBeInTheDocument()
  })

  it('evita duplicados y datos de contacto, quita etiquetas y guarda la lista', async () => {
    cv.public.skills = [{ id: 1, name: 'React', kind: 'technical' }, { id: 2, name: 'Comunicación', kind: 'soft' }]
    respond({ ...cv, public: { ...cv.public, skills: [{ id: 1, name: 'React', kind: 'technical' }] } })
    const region = await section('Habilidades')
    const input = within(region).getByRole('combobox', { name: 'Agregar habilidad' })
    fireEvent.change(input, { target: { value: 'REACT' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveAccessibleDescription(/Esta habilidad ya está en la lista/)
    fireEvent.change(input, { target: { value: 'github.com/ana' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveAccessibleDescription(/sección protegida de enlaces/)

    fireEvent.click(within(region).getByRole('button', { name: 'Quitar Comunicación' }))
    expect(within(region).queryByText('Comunicación')).not.toBeInTheDocument()
    fireEvent.click(within(region).getByRole('button', { name: 'Guardar habilidades' }))
    expect(await within(region).findByText('Habilidades guardadas correctamente.')).toBeInTheDocument()
    expect(writes()[0][0]).toBe('/api/students/3/cv/skills')
    expect(sent()).toEqual({ skills: [{ name: 'React', kind: 'technical' }] })
  })

  it('cierra la lista con Escape', async () => {
    skillsMock.mockResolvedValue(Response.json({ data: [{ id: 9, name: 'Excel', kind: 'technical' }] }))
    const region = await section('Habilidades')
    const input = within(region).getByRole('combobox', { name: 'Agregar habilidad' })
    fireEvent.change(input, { target: { value: 'ex' } })
    await within(region).findByRole('option', { name: /Excel/ })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('idiomas', () => {
  it('agrega idiomas con nivel MCER o Nativo y evita repetirlos', async () => {
    respond({ ...cv, public: { ...cv.public, languages: [{ language_code: 'es', level: 7 }, { language_code: 'en', level: 4 }] } })
    const region = await section('Idiomas')
    const add = within(region).getByRole('button', { name: 'Agregar idioma' })
    fireEvent.click(add)
    fireEvent.click(add)
    fireEvent.change(within(region).getByLabelText('Idioma 1'), { target: { value: 'es' } })
    fireEvent.change(within(region).getByLabelText('Nivel de Español'), { target: { value: '7' } })
    fireEvent.change(within(region).getByLabelText('Idioma 2'), { target: { value: 'es' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Guardar idiomas' }))
    expect(within(region).getByLabelText('Idioma 2')).toHaveAccessibleDescription('Este idioma ya está en la lista.')
    expect(writes()).toHaveLength(0)

    fireEvent.change(within(region).getByLabelText('Idioma 2'), { target: { value: 'en' } })
    fireEvent.change(within(region).getByLabelText('Nivel de Inglés'), { target: { value: '4' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Guardar idiomas' }))
    expect(await within(region).findByText('Idiomas guardados correctamente.')).toBeInTheDocument()
    expect(sent()).toEqual({ languages: [{ language_code: 'es', level: 7 }, { language_code: 'en', level: 4 }] })
    expect(within(within(region).getByLabelText('Nivel de Inglés')).getByRole('option', { selected: true })).toHaveTextContent('B2 · Intermedio alto')
  })

  it('exige el nivel y permite quitar una fila', async () => {
    const region = await section('Idiomas')
    fireEvent.click(within(region).getByRole('button', { name: 'Agregar idioma' }))
    fireEvent.change(within(region).getByLabelText('Idioma 1'), { target: { value: 'fr' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Guardar idiomas' }))
    expect(within(region).getByLabelText('Nivel de Francés')).toHaveAccessibleDescription('Selecciona el nivel.')
    fireEvent.click(within(region).getByRole('button', { name: 'Quitar Francés' }))
    expect(within(region).getByText('Aún no hay idiomas.')).toBeInTheDocument()
  })
})

describe('certificaciones', () => {
  const ccna = { id: 4, name: 'CCNA', issuer: 'Cisco', issued_on: '2025-06-15', expires_on: null, verified_at: null }
  const credential = { certification_id: 4, credential_id: 'C-1', credential_url: 'https://www.credly.com/badges/1', verifiable: true }

  it('agrega una certificación con credencial protegida desde una hoja', async () => {
    respond({ ...cv, public: { ...cv.public, certifications: [ccna] }, protected: { ...cv.protected, credentials: [credential] } })
    const region = await section('Certificaciones')
    fireEvent.click(within(region).getByRole('button', { name: 'Agregar certificación' }))
    const sheet = screen.getByRole('dialog', { name: 'Agregar certificación' })
    expect(within(sheet).getByText(/no es visible en la búsqueda general de empresas/)).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Agregar certificación' }))
    expect(within(sheet).getByLabelText('Nombre de la certificación')).toHaveAccessibleDescription('Escribe el nombre de la certificación.')
    expect(within(sheet).getByLabelText('Fecha de emisión')).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(within(sheet).getByLabelText('Nombre de la certificación'), { target: { value: 'CCNA' } })
    fireEvent.change(within(sheet).getByLabelText('Emisor'), { target: { value: 'Cisco' } })
    fireEvent.change(within(sheet).getByLabelText('Fecha de emisión'), { target: { value: '2025-06-15' } })
    fireEvent.change(within(sheet).getByLabelText('URL de verificación (opcional)'), { target: { value: 'http://credly.com/x' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Agregar certificación' }))
    expect(within(sheet).getByLabelText('URL de verificación (opcional)')).toHaveAccessibleDescription('Escribe una dirección https:// pública y válida.')
    fireEvent.change(within(sheet).getByLabelText('URL de verificación (opcional)'), { target: { value: 'https://www.credly.com/badges/1' } })
    fireEvent.change(within(sheet).getByLabelText('ID de la credencial (opcional)'), { target: { value: 'C-1' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Agregar certificación' }))

    expect(await within(region).findByText('Certificación agregada correctamente.')).toBeInTheDocument()
    expect(sent()).toEqual({ certifications: [{ name: 'CCNA', issuer: 'Cisco', issued_on: '2025-06-15', expires_on: null, credential_id: 'C-1', credential_url: 'https://www.credly.com/badges/1' }] })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Agregar certificación' })).not.toBeInTheDocument())
    const card = within(region).getByRole('listitem')
    expect(within(card).getByText('Sin revisar')).toBeInTheDocument()
    expect(within(card).getByText('ID C-1')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Verificar en la plataforma emisora' })).toHaveAttribute('rel', 'noopener noreferrer nofollow')
  })

  it('marca y quita la revisión con PATCH (CA-04)', async () => {
    cv.public.certifications = [ccna]
    const reviewed = { ...ccna, verified_at: '2026-10-16T10:00:00Z' }
    respond({ ...cv, public: { ...cv.public, certifications: [reviewed] }, protected: { ...cv.protected, reviews: [{ certification_id: 4, verified_by: 'Coordinación' }] } })
    respond({ ...cv, public: { ...cv.public, certifications: [ccna] } })
    const region = await section('Certificaciones')
    fireEvent.click(within(region).getByRole('button', { name: 'Marcar como revisada CCNA' }))
    expect(await within(region).findByText('«CCNA» quedó revisada por tu institución.')).toBeInTheDocument()
    expect(writes()[0][0]).toBe('/api/students/3/cv/certifications/4/verification')
    expect(writes()[0][1]?.method).toBe('PATCH')
    expect(sent()).toEqual({ verified: true })
    expect(within(region).getByText('Revisada')).toBeInTheDocument()
    expect(within(region).getByText(/Revisada por Coordinación el/)).toBeInTheDocument()

    fireEvent.click(within(region).getByRole('button', { name: 'Quitar revisión de CCNA' }))
    expect(await within(region).findByText('Se quitó la revisión de «CCNA».')).toBeInTheDocument()
    expect(sent(1)).toEqual({ verified: false })
  })

  it('advierte que editar una certificación revisada quita la revisión y conserva su credencial', async () => {
    cv.public.certifications = [{ ...ccna, verified_at: '2026-10-16T10:00:00Z' }]
    cv.protected.credentials = [credential]
    respond(cv)
    const region = await section('Certificaciones')
    fireEvent.click(within(region).getByRole('button', { name: 'Editar CCNA' }))
    const sheet = screen.getByRole('dialog', { name: 'Editar certificación' })
    expect(within(sheet).getByText(/la revisión se quitará/)).toBeInTheDocument()
    expect(within(sheet).getByLabelText('ID de la credencial (opcional)')).toHaveValue('C-1')
    fireEvent.change(within(sheet).getByLabelText('Emisor'), { target: { value: 'Cisco Networking Academy' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar certificación' }))
    expect(await within(region).findByText('Certificación guardada correctamente.')).toBeInTheDocument()
    expect(sent()).toEqual({ certifications: [{ id: 4, name: 'CCNA', issuer: 'Cisco Networking Academy', issued_on: '2025-06-15', expires_on: null, credential_id: 'C-1', credential_url: 'https://www.credly.com/badges/1' }] })
  })

  it('elimina tras confirmar', async () => {
    cv.public.certifications = [ccna, { ...ccna, id: 5, name: 'BLS', issuer: 'Cruz Roja' }]
    respond({ ...cv, public: { ...cv.public, certifications: [ccna] } })
    const region = await section('Certificaciones')
    fireEvent.click(within(region).getByRole('button', { name: 'Eliminar BLS' }))
    const confirm = screen.getByRole('alertdialog', { name: '¿Eliminar la certificación?' })
    expect(writes()).toHaveLength(0)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Eliminar' }))
    expect(await within(region).findByText('Certificación eliminada.')).toBeInTheDocument()
    expect(sent().certifications.map((item: { id: number }) => item.id)).toEqual([4])
  })

  it('muestra los errores del servidor dentro de la hoja', async () => {
    writeMock.mockResolvedValueOnce(Response.json({ errors: { 'certifications.0.issued_on': ['La fecha de emisión no puede ser futura.'] } }, { status: 422 }))
    const region = await section('Certificaciones')
    fireEvent.click(within(region).getByRole('button', { name: 'Agregar certificación' }))
    const sheet = screen.getByRole('dialog', { name: 'Agregar certificación' })
    fireEvent.change(within(sheet).getByLabelText('Nombre de la certificación'), { target: { value: 'CCNA' } })
    fireEvent.change(within(sheet).getByLabelText('Emisor'), { target: { value: 'Cisco' } })
    fireEvent.change(within(sheet).getByLabelText('Fecha de emisión'), { target: { value: '2025-06-15' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Agregar certificación' }))
    await waitFor(() => expect(within(sheet).getByLabelText('Fecha de emisión')).toHaveAccessibleDescription('La fecha de emisión no puede ser futura.'))
  })
})

describe('proyectos', () => {
  it('agrega un proyecto en una hoja y rechaza enlaces en la descripción', async () => {
    const project = { id: 6, title: 'Inventario', description: 'API REST con Laravel.', role: 'Backend', year: 2025 }
    respond({ ...cv, public: { ...cv.public, projects: [project] } })
    const region = await section('Proyectos')
    fireEvent.click(within(region).getByRole('button', { name: 'Agregar proyecto' }))
    const sheet = screen.getByRole('dialog', { name: 'Agregar proyecto' })
    fireEvent.change(within(sheet).getByLabelText('Nombre del proyecto'), { target: { value: 'Inventario' } })
    fireEvent.change(within(sheet).getByLabelText('Descripción'), { target: { value: 'Código en https://github.com/ana/inv' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Agregar proyecto' }))
    expect(within(sheet).getByLabelText('Descripción')).toHaveAccessibleDescription(/sección protegida de enlaces/)
    expect(writes()).toHaveLength(0)

    fireEvent.change(within(sheet).getByLabelText('Descripción'), { target: { value: 'API REST con Laravel.' } })
    fireEvent.change(within(sheet).getByLabelText('Rol (opcional)'), { target: { value: 'Backend' } })
    fireEvent.change(within(sheet).getByLabelText('Año (opcional)'), { target: { value: '2025' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Agregar proyecto' }))
    expect(await within(region).findByText('Proyecto agregado correctamente.')).toBeInTheDocument()
    expect(sent()).toEqual({ projects: [{ title: 'Inventario', description: 'API REST con Laravel.', role: 'Backend', year: 2025 }] })
    expect(within(region).getByText('Backend · 2025')).toBeInTheDocument()
  })

  it('edita y elimina proyectos', async () => {
    cv.public.projects = [{ id: 6, title: 'Inventario', description: 'API.', role: null, year: null }, { id: 7, title: 'Brigada', description: 'Salud.', role: null, year: null }]
    respond(cv)
    respond({ ...cv, public: { ...cv.public, projects: [cv.public.projects[0]] } })
    const region = await section('Proyectos')
    fireEvent.click(within(region).getByRole('button', { name: 'Editar Brigada' }))
    const sheet = screen.getByRole('dialog', { name: 'Editar proyecto' })
    expect(within(sheet).getByLabelText('Nombre del proyecto')).toHaveValue('Brigada')
    fireEvent.change(within(sheet).getByLabelText('Nombre del proyecto'), { target: { value: 'Brigada de salud' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar proyecto' }))
    expect(await within(region).findByText('Proyecto guardado correctamente.')).toBeInTheDocument()
    expect(sent().projects[1]).toEqual({ title: 'Brigada de salud', description: 'Salud.', role: null, year: null })

    fireEvent.click(within(region).getByRole('button', { name: 'Eliminar Brigada' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    expect(await within(region).findByText('Proyecto eliminado.')).toBeInTheDocument()
    expect(sent(1).projects).toEqual([{ title: 'Inventario', description: 'API.', role: null, year: null }])
  })
})

describe('enlaces', () => {
  it('valida el dominio de cada tipo y guarda los enlaces protegidos', async () => {
    respond({ ...cv, protected: { ...cv.protected, links: [{ id: 1, kind: 'github', url: 'https://github.com/ana' }] } })
    const region = await section('Enlaces externos Protegido')
    fireEvent.click(within(region).getByRole('button', { name: 'Agregar enlace' }))
    fireEvent.change(within(region).getByLabelText('Tipo del enlace 1'), { target: { value: 'github' } })
    const url = within(region).getByLabelText('Dirección de GitHub')
    fireEvent.change(url, { target: { value: 'https://gitlab.com/ana' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Guardar enlaces' }))
    expect(url).toHaveAccessibleDescription('El enlace debe ser de github.com.')
    fireEvent.change(url, { target: { value: 'https://192.168.1.4' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Guardar enlaces' }))
    expect(url).toHaveAccessibleDescription('Escribe una dirección https:// pública y válida.')
    expect(writes()).toHaveLength(0)

    fireEvent.change(url, { target: { value: ' https://github.com/ana ' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Guardar enlaces' }))
    expect(await within(region).findByText('Enlaces guardados correctamente.')).toBeInTheDocument()
    expect(writes()[0][0]).toBe('/api/students/3/cv/links')
    expect(sent()).toEqual({ links: [{ kind: 'github', url: 'https://github.com/ana' }] })
  })

  it('evita enlaces repetidos', async () => {
    const region = await section('Enlaces externos Protegido')
    fireEvent.click(within(region).getByRole('button', { name: 'Agregar enlace' }))
    fireEvent.click(within(region).getByRole('button', { name: 'Agregar enlace' }))
    fireEvent.change(within(region).getByLabelText('Tipo del enlace 1'), { target: { value: 'portfolio' } })
    fireEvent.change(within(region).getByLabelText('Tipo del enlace 2'), { target: { value: 'other' } })
    fireEvent.change(within(region).getByLabelText('Dirección de Portafolio'), { target: { value: 'https://ana.dev' } })
    fireEvent.change(within(region).getByLabelText('Dirección de Otro'), { target: { value: 'https://ANA.dev' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Guardar enlaces' }))
    expect(within(region).getByLabelText('Dirección de Otro')).toHaveAccessibleDescription('Este enlace ya está en la lista.')
  })
})
