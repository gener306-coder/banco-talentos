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
/** Respuestas del catálogo por texto escrito, con la bandera match de T-S10-01. */
const catalog: Record<string, unknown[]> = {
  js: [{ id: 1, name: 'JavaScript', kind: 'technical', match: 'alias' }],
  react: [{ id: 2, name: 'React', kind: 'technical', match: 'prefix' }],
  pyhton: [{ id: 3, name: 'Python', kind: 'technical', match: 'fuzzy' }],
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
    // Indicadores del inicio (HU-S5-01): ajenos a estas pruebas, quedan pendientes sin consumir respuestas.
    if (path === '/api/dashboard') return new Promise<Response>(() => undefined)
    // Módulo destacado del inicio (HU-S9-05): ajeno a estas pruebas.
    if (typeof path === 'string' && path.startsWith('/api/promotional-videos')) return new Promise<Response>(() => undefined)
    // Solicitudes ya enviadas para el perfil (HU-S5-05 CA-04): ninguna en estas pruebas.
    if (typeof path === 'string' && path.startsWith('/api/linkage-requests?')) {
      return Response.json({ data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 20 } })
    }
    if (typeof path === 'string' && path.startsWith('/api/catalogs/')) {
      return Response.json({ data: [{ code: '28032', name: 'Reynosa' }, { code: '28041', name: 'Victoria' }] })
    }
    // Autocompletar del catálogo (HU-S11-01).
    if (typeof path === 'string' && path.startsWith('/api/skills?')) {
      return Response.json({ data: catalog[new URLSearchParams(path.split('?')[1]).get('q')?.toLowerCase() ?? ''] ?? [] })
    }
    return talentMock(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('buscador de talento HU-S4-05', () => {
  it('no repite la entrada a las Historias del Dual en el buscador (T-S9-02)', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Buscar talento' })
    expect(screen.queryByRole('link', { name: /Historias|Ver historias/ })).not.toBeInTheDocument()
  })

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

  it('aplica los filtros al buscar, con el texto libre y una habilidad del catálogo (CA-03, HU-S11-03 CA-06)', async () => {
    talentMock.mockResolvedValueOnce(page([card])).mockResolvedValueOnce(page([]))
    renderApp()
    await screen.findByRole('article', { name: 'Analista de datos' })
    const form = screen.getByRole('search', { name: 'Filtros de búsqueda' })
    const skill = within(form).getByRole('combobox', { name: 'Agregar habilidad (todas requeridas)' })
    fireEvent.change(skill, { target: { value: ' React ' } })
    await within(form).findByRole('option', { name: /React/ })
    fireEvent.keyDown(skill, { key: 'Enter' })
    fireEvent.change(within(form).getByLabelText('Titular o carrera'), { target: { value: ' analista mecatronica ' } })
    expect(within(form).queryByLabelText('Carrera')).not.toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText('Idioma'), { target: { value: 'en' } })
    fireEvent.change(within(form).getByLabelText('Nivel mínimo'), { target: { value: '4' } })
    fireEvent.change(within(form).getByLabelText('Periodo mínimo'), { target: { value: '5' } })
    fireEvent.click(within(form).getByLabelText('Disponible para el programa dual'))
    fireEvent.click(within(form).getByLabelText('Con al menos una certificación revisada'))
    fireEvent.change(within(form).getByLabelText('Estado del alumno'), { target: { value: '28' } })
    fireEvent.change(within(form).getByLabelText('Distancia máxima'), { target: { value: '50' } })
    expect(talentMock).toHaveBeenCalledTimes(1)
    // T-S11-01 CA-05: con filtros editados sin aplicar, el botón lo indica; al aplicarlos vuelve a «Buscar».
    fireEvent.click(within(form).getByRole('button', { name: 'Aplicar filtros' }))
    expect(within(form).getByRole('button', { name: 'Buscar' })).not.toHaveClass('talent-pending')

    expect(await screen.findByText('Ningún perfil coincide con los filtros.')).toBeInTheDocument()
    expect(Object.fromEntries(lastQuery())).toEqual({
      q: 'analista mecatronica', 'skills[]': 'React', language: 'en', min_level: '4', min_period: '5', dual_available: '1',
      verified_certification: '1', state_code: '28', radius_km: '50', page: '1',
    })
  })

  it('agrega con Enter la habilidad sugerida por alias y no la repite (HU-S11-01 CA-01, CA-03)', async () => {
    talentMock.mockResolvedValue(page([card]))
    renderApp()
    await screen.findByRole('article', { name: 'Analista de datos' })
    const form = screen.getByRole('search', { name: 'Filtros de búsqueda' })
    const skill = within(form).getByRole('combobox', { name: 'Agregar habilidad (todas requeridas)' })
    fireEvent.change(skill, { target: { value: 'js' } })
    expect(await within(form).findByRole('option', { name: /JavaScript/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(skill, { key: 'Enter' })
    const chips = within(form).getByRole('list', { name: 'Habilidades requeridas' })
    expect(within(chips).getByText('JavaScript')).toBeInTheDocument()
    // Enter agrega la habilidad sin lanzar la búsqueda.
    expect(talentMock).toHaveBeenCalledTimes(1)

    // Ya elegida: no se vuelve a sugerir ni se agrega dos veces.
    fireEvent.change(skill, { target: { value: 'javascript' } })
    fireEvent.keyDown(skill, { key: 'Enter' })
    expect(within(form).getByText('Esta habilidad ya está en la lista.')).toBeInTheDocument()
    expect(within(chips).getAllByRole('listitem')).toHaveLength(1)

    fireEvent.click(within(form).getByRole('button', { name: 'Quitar JavaScript' }))
    expect(within(form).queryByRole('list', { name: 'Habilidades requeridas' })).not.toBeInTheDocument()
  })

  it('exige elegir la sugerencia aproximada y no admite habilidades fuera del catálogo (HU-S11-01 CA-01, CA-02)', async () => {
    talentMock.mockResolvedValue(page([card]))
    renderApp()
    await screen.findByRole('article', { name: 'Analista de datos' })
    const form = screen.getByRole('search', { name: 'Filtros de búsqueda' })
    const skill = within(form).getByRole('combobox', { name: 'Agregar habilidad (todas requeridas)' })
    // Solo catálogo: sin tipo para habilidades nuevas ni la opción de agregarlas.
    expect(within(form).queryByRole('group', { name: 'Tipo para una habilidad nueva' })).not.toBeInTheDocument()

    fireEvent.change(skill, { target: { value: 'pyhton' } })
    const option = await within(form).findByRole('option', { name: /Python/ })
    expect(option).toHaveAttribute('aria-selected', 'false')
    expect(within(form).queryByRole('option', { name: /como nueva/ })).not.toBeInTheDocument()
    fireEvent.keyDown(skill, { key: 'Enter' })
    expect(within(form).getByText(/Elige una habilidad de las sugerencias/)).toBeInTheDocument()
    expect(within(form).queryByRole('list', { name: 'Habilidades requeridas' })).not.toBeInTheDocument()

    fireEvent.keyDown(skill, { key: 'ArrowDown' })
    fireEvent.keyDown(skill, { key: 'Enter' })
    expect(within(within(form).getByRole('list', { name: 'Habilidades requeridas' })).getByText('Python')).toBeInTheDocument()

    // Sin sugerencias: lo escrito no se agrega.
    fireEvent.change(skill, { target: { value: 'Destreza inexistente' } })
    fireEvent.keyDown(skill, { key: 'Enter' })
    expect(within(form).getByText(/Elige una habilidad de las sugerencias/)).toBeInTheDocument()
    expect(within(within(form).getByRole('list', { name: 'Habilidades requeridas' })).getAllByRole('listitem')).toHaveLength(1)
    // T-S11-01 CA-03: cuando el catálogo responde sin resultados, el campo lo dice.
    expect(await within(form).findByText('Sin coincidencias en el catálogo')).toBeInTheDocument()
  })

  it('explica las sugerencias, quita con Retroceso y devuelve el foco al campo (T-S11-01 CA-03, CA-04, CA-05)', async () => {
    talentMock.mockResolvedValue(page([card]))
    renderApp()
    await screen.findByRole('article', { name: 'Analista de datos' })
    const form = screen.getByRole('search', { name: 'Filtros de búsqueda' })
    const skill = within(form).getByRole('combobox', { name: 'Agregar habilidad (todas requeridas)' })
    expect(within(form).getByRole('button', { name: 'Buscar' })).toBeInTheDocument()

    // Una sugerencia por alias muestra el alias escrito; una aproximada, «¿Quisiste decir?».
    fireEvent.change(skill, { target: { value: 'JS' } })
    expect(within(await within(form).findByRole('option', { name: /JavaScript/ })).getByText('js')).toBeInTheDocument()
    fireEvent.keyDown(skill, { key: 'Enter' })
    fireEvent.change(skill, { target: { value: 'pyhton' } })
    expect(within(await within(form).findByRole('option', { name: /Python/ })).getByText('¿Quisiste decir?')).toBeInTheDocument()
    fireEvent.keyDown(skill, { key: 'ArrowDown' })
    fireEvent.keyDown(skill, { key: 'Enter' })
    const chips = within(form).getByRole('list', { name: 'Habilidades requeridas' })
    expect(within(chips).getAllByRole('listitem')).toHaveLength(2)
    // Hay filtros sin aplicar.
    expect(within(form).getByRole('button', { name: 'Aplicar filtros' })).toHaveClass('talent-pending')

    // Quitar con el botón devuelve el foco al campo.
    fireEvent.click(within(form).getByRole('button', { name: 'Quitar JavaScript' }))
    expect(skill).toHaveFocus()
    // Retroceso con texto solo borra el texto; con el campo vacío quita la última habilidad.
    fireEvent.change(skill, { target: { value: 'r' } })
    fireEvent.keyDown(skill, { key: 'Backspace' })
    expect(within(chips).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.change(skill, { target: { value: '' } })
    fireEvent.keyDown(skill, { key: 'Backspace' })
    expect(within(form).queryByRole('list', { name: 'Habilidades requeridas' })).not.toBeInTheDocument()
    // Sin diferencias con lo aplicado, el botón vuelve a «Buscar».
    expect(within(form).getByRole('button', { name: 'Buscar' })).not.toHaveClass('talent-pending')
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
    fireEvent.click(within(form).getByRole('button', { name: 'Aplicar filtros' }))
    await waitFor(() => expect(lastQuery().get('origin_municipality_code')).toBe('28041'))

    fireEvent.click(within(form).getByLabelText('El municipio de mi empresa'))
    fireEvent.click(within(form).getByRole('button', { name: 'Aplicar filtros' }))
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

describe('buscador de talento en pantallas estrechas (T-S12-03)', () => {
  // Pantalla de teléfono: se cumplen el corte del buscador (959 px) y el de la hoja compacta (640 px). Con reducir
  // movimiento la hoja se cierra sin la animación de resorte, que bajo carga tardaría más que el waitFor.
  const narrowMatchMedia = (query: string) => ({
    matches: /max-width|prefers-reduced-motion/.test(query), media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })

  it('abre los filtros en una hoja, cuenta los aplicados y la cierra al buscar', async () => {
    vi.stubGlobal('matchMedia', narrowMatchMedia)
    talentMock.mockResolvedValueOnce(page([card])).mockResolvedValueOnce(page([]))
    renderApp()
    await screen.findByRole('article', { name: 'Analista de datos' })
    // El panel no ocupa la página: los resultados quedan a la vista.
    expect(screen.queryByRole('search', { name: 'Filtros de búsqueda' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filtros de búsqueda' })
    const form = within(dialog).getByRole('search', { name: 'Filtros de búsqueda' })
    fireEvent.change(within(form).getByLabelText('Titular o carrera'), { target: { value: 'analista' } })
    fireEvent.click(within(form).getByLabelText('Puede reubicarse'))
    fireEvent.click(within(form).getByRole('button', { name: 'Aplicar filtros' }))

    expect(await screen.findByText('Ningún perfil coincide con los filtros.')).toBeInTheDocument()
    expect(Object.fromEntries(lastQuery())).toEqual({ q: 'analista', can_relocate: '1', page: '1' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filtros de búsqueda' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Filtros (2)' })).toBeInTheDocument()
  })
})

describe('regreso contextual del perfil público (T-S12-04)', () => {
  const renderProfile = (state: unknown) => render(
    <MemoryRouter initialEntries={[{ pathname: `/talent/${publicId}`, state }]}><App /></MemoryRouter>)

  it('regresa a la bandeja de solicitudes, con su filtro, si se abrió desde ella', async () => {
    talentMock.mockResolvedValueOnce(Response.json({ data: card }))
    renderProfile({ back: { to: '/linkage-requests?status=ACEPTADA', label: 'Volver a solicitudes' } })
    expect(await screen.findByRole('link', { name: 'Volver a solicitudes' })).toHaveAttribute('href', '/linkage-requests?status=ACEPTADA')
    expect(screen.queryByRole('link', { name: 'Volver al buscador' })).not.toBeInTheDocument()
  })

  it.each([
    ['otro sitio', { back: { to: '//sitio-ajeno.test/robo', label: 'Volver a solicitudes' } }],
    ['una URL absoluta', { back: { to: 'https://sitio-ajeno.test', label: 'Volver a solicitudes' } }],
    ['un estado incompleto', { back: { to: '/linkage-requests' } }],
  ])('ignora un regreso hacia %s y usa el del buscador', async (_case, state) => {
    talentMock.mockResolvedValueOnce(Response.json({ data: card }))
    renderProfile(state)
    expect(await screen.findByRole('link', { name: 'Volver al buscador' })).toHaveAttribute('href', '/talent')
  })
})

