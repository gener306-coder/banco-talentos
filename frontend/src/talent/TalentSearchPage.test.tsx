import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { clearMunicipalityCache } from '../students/municipalities'

const fetchMock = vi.fn<typeof fetch>()
const talentMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const companyUser = { id: 7, name: 'Talento', email: 'talento@empresa.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo' } }
const publicId = '3f2c1b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f'
const card = {
  public_id: publicId, headline: 'Analista de datos', program: 'Ingeniería Mecatrónica', period_type: 'semester', period_number: 6,
  institution: 'Universidad Tecnológica del Golfo', state_code: '28', municipality: 'Matamoros', distance_km: 80,
  skills: [{ name: 'Python', kind: 'technical' }, { name: 'Trabajo en equipo', kind: 'soft' }], languages: [{ language_code: 'en', level: 4 }],
  verified_certifications: 2, dual_available: true, can_relocate: false,
}
const page = (cards: unknown[], extra: Record<string, number> = {}) =>
  Response.json({ data: cards, meta: { current_page: 1, last_page: 1, total: cards.length, per_page: 20, ...extra } })

function renderApp(path = '/talent') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}
const lastQuery = () => new URLSearchParams(String(talentMock.mock.calls.at(-1)?.[0]).split('?')[1])

beforeEach(() => {
  user = companyUser
  clearMunicipalityCache()
  talentMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/api/me') return Response.json({ user })
    if (typeof path === 'string' && path.startsWith('/api/catalogs/')) {
      return Response.json({ data: [{ code: '28032', name: 'Reynosa' }, { code: '28041', name: 'Victoria' }] })
    }
    return talentMock(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('buscador de talento HU-S4-05', () => {
  it('ofrece el buscador a COMPANY desde el inicio y lo niega a otros roles (CA-01)', async () => {
    const view = renderApp('/')
    expect(await screen.findByText('ManuGolfo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Buscar talento' })).toHaveAttribute('href', '/talent')
    view.unmount()

    user = { id: 2, name: 'SE', email: 'se@economia.test', role: 'SECRETARY', institution: null, company: null }
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para buscar talento.')
    expect(talentMock).not.toHaveBeenCalled()
  })

  it('muestra tarjetas anónimas con institución, distancia y sin acciones de contacto (CA-05, CA-10)', async () => {
    talentMock.mockResolvedValueOnce(page([card]))
    renderApp()
    const article = await screen.findByRole('article', { name: 'Analista de datos' })
    expect(within(article).getByText('Universidad Tecnológica del Golfo')).toBeInTheDocument()
    expect(within(article).getByText('Matamoros, Tamaulipas · A unos 80 km')).toBeInTheDocument()
    expect(within(article).getByText('Ingeniería Mecatrónica · 6.º semestre')).toBeInTheDocument()
    expect(within(article).getByText(/Inglés B2 · Intermedio alto · 2 certificaciones revisadas/)).toBeInTheDocument()
    expect(within(within(article).getByRole('list', { name: /Habilidades principales/ })).getAllByRole('listitem')).toHaveLength(2)
    expect(within(article).getByRole('link', { name: 'Ver perfil: Analista de datos' })).toHaveAttribute('href', `/talent/${publicId}`)
    expect(screen.queryByRole('button', { name: /contactar/i })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 perfil encontrado')
    expect(talentMock.mock.calls[0][0]).toBe('/api/talent?page=1')
  })

  it('aplica los filtros al buscar y agrega habilidades con Enter (CA-03)', async () => {
    talentMock.mockResolvedValueOnce(page([card])).mockResolvedValueOnce(page([]))
    renderApp()
    await screen.findByRole('article', { name: 'Analista de datos' })
    const form = screen.getByRole('search', { name: 'Filtros de búsqueda' })
    const skill = within(form).getByLabelText('Agregar habilidad (todas requeridas)')
    fireEvent.change(skill, { target: { value: ' React ' } })
    fireEvent.keyDown(skill, { key: 'Enter' })
    fireEvent.change(skill, { target: { value: 'react' } })
    fireEvent.keyDown(skill, { key: 'Enter' })
    expect(within(form).getByText('Esta habilidad ya está en los filtros.')).toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText('Idioma'), { target: { value: 'en' } })
    fireEvent.change(within(form).getByLabelText('Nivel mínimo'), { target: { value: '4' } })
    fireEvent.change(within(form).getByLabelText('Carrera'), { target: { value: 'Mecatrónica' } })
    fireEvent.change(within(form).getByLabelText('Periodo mínimo'), { target: { value: '5' } })
    fireEvent.click(within(form).getByLabelText('Disponible para el programa dual'))
    fireEvent.click(within(form).getByLabelText('Con al menos una certificación revisada'))
    fireEvent.change(within(form).getByLabelText('Estado del alumno'), { target: { value: '28' } })
    fireEvent.change(within(form).getByLabelText('Distancia máxima'), { target: { value: '50' } })
    expect(talentMock).toHaveBeenCalledTimes(1)
    fireEvent.click(within(form).getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText('Ningún perfil coincide con los filtros.')).toBeInTheDocument()
    expect(Object.fromEntries(lastQuery())).toEqual({
      'skills[]': 'React', language: 'en', min_level: '4', program: 'Mecatrónica', min_period: '5', dual_available: '1',
      verified_certification: '1', state_code: '28', radius_km: '50', page: '1',
    })
  })

  it('mide la distancia desde otro municipio elegido del catálogo (CA-04)', async () => {
    talentMock.mockResolvedValue(page([card]))
    renderApp()
    await screen.findByRole('article', { name: 'Analista de datos' })
    const form = screen.getByRole('search', { name: 'Filtros de búsqueda' })
    fireEvent.click(within(form).getByLabelText('Otro municipio'))
    fireEvent.click(within(form).getByRole('button', { name: 'Buscar' }))
    expect(within(form).getByText('Elige el municipio desde el que se mide la distancia.')).toBeInTheDocument()

    fireEvent.change(within(form).getByLabelText('Estado de origen'), { target: { value: '28' } })
    const municipality = within(form).getByRole('combobox', { name: 'Municipio de origen' })
    await waitFor(() => expect(municipality).toBeEnabled())
    fireEvent.focus(municipality)
    fireEvent.change(municipality, { target: { value: 'vict' } })
    fireEvent.mouseDown(await within(form).findByRole('option', { name: 'Victoria' }))
    fireEvent.click(within(form).getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(lastQuery().get('origin_municipality_code')).toBe('28041'))

    fireEvent.click(within(form).getByLabelText('El municipio de mi empresa'))
    fireEvent.click(within(form).getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(lastQuery().has('origin_municipality_code')).toBe(false))
  })

  it('pagina los resultados de 20 en 20 (CA-09)', async () => {
    talentMock.mockResolvedValueOnce(page([card], { last_page: 2, total: 21 })).mockResolvedValueOnce(page([card], { current_page: 2, last_page: 2, total: 21 }))
    renderApp()
    expect(await screen.findByText('21 perfiles encontrados')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(lastQuery().get('page')).toBe('2'))
  })

  it('informa el límite de frecuencia', async () => {
    talentMock.mockResolvedValueOnce(new Response(null, { status: 429 }))
    renderApp()
    expect(await screen.findByText(/Espera al menos un minuto/)).toBeInTheDocument()
  })

  it('abre el perfil público completo, sin botón de contacto (CA-06)', async () => {
    talentMock.mockResolvedValueOnce(Response.json({ data: {
      ...card,
      certifications: [{ name: 'CCNA', issuer: 'Cisco', issued_on: '2025-06-01', expires_on: null, verified: true }, { name: 'Scrum', issuer: 'Scrum.org', issued_on: '2024-02-10', expires_on: '2027-02-10', verified: false }],
      projects: [{ title: 'Robot seguidor de línea', description: 'Control PID', role: 'Programación', year: 2025 }],
    } }))
    renderApp(`/talent/${publicId}`)
    expect(await screen.findByRole('heading', { level: 2, name: 'Analista de datos' })).toBeInTheDocument()
    expect(screen.getByText('Revisada por la institución')).toBeInTheDocument()
    expect(screen.getByText('Sin revisar')).toBeInTheDocument()
    expect(screen.getByText('Emitida el 1 de junio de 2025')).toBeInTheDocument()
    expect(screen.getByText('Robot seguidor de línea')).toBeInTheDocument()
    expect(screen.getByText('Inglés: B2 · Intermedio alto')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /contactar/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al buscador' })).toHaveAttribute('href', '/talent')
  })

  it('muestra el mismo estado para un perfil inexistente o no disponible (CA-08)', async () => {
    talentMock.mockResolvedValueOnce(Response.json({ message: 'El perfil no existe.' }, { status: 404 }))
    renderApp(`/talent/${publicId}`)
    expect(await screen.findByText('El perfil no existe.')).toBeInTheDocument()
  })
})
