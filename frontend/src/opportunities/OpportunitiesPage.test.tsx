import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { clearMunicipalityCache } from '../students/municipalities'
import { OPPORTUNITY_CONTACT_MESSAGE } from './OpportunityForm'

const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
const skillsMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const companyUser = { id: 9, name: 'Reclutadora', email: 'rh@manugolfo.test', role: 'COMPANY', institution: null, company: { id: 3, name: 'ManuGolfo' } }
const defaults = { state_code: '28', municipality_code: '28032', municipality: 'Reynosa' }
const summary = {
  id: 12, title: 'Automatización de línea', program: 'Ingeniería Mecatrónica', state_code: '28', municipality_code: '28032',
  municipality: 'Reynosa', vacancies: 3, is_active: true, created_at: '2026-10-27T10:00:00Z',
  skills: [{ name: 'PLC', kind: 'technical' }, { name: 'Trabajo en equipo', kind: 'soft' }],
}
const opportunity = {
  ...summary, period_type: 'semester', period_number: 5, can_relocate: false,
  description: 'Programación de PLC y mantenimiento preventivo.', language_code: 'en', min_level: 4,
  created_by: { id: 9, name: 'Reclutadora' }, updated_at: '2026-10-27T10:00:00Z',
}
const page = (items: unknown[], meta = {}) => Response.json({ data: items, meta: { current_page: 1, last_page: 1, total: items.length, per_page: 20, ...meta } })

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}
function renderApp(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)
}
const writes = (method: string) => apiMock.mock.calls.filter(([, options]) => options?.method === method)
const sent = (method: string) => JSON.parse(writes(method)[0][1]?.body as string) as Record<string, unknown>

beforeEach(() => {
  user = companyUser
  clearMunicipalityCache()
  apiMock.mockReset()
  skillsMock.mockReset()
  skillsMock.mockImplementation(async () => Response.json({ data: [] }))
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/api/me') return Response.json({ user })
    // Indicadores del inicio (HU-S5-01): ajenos a estas pruebas, quedan pendientes sin consumir respuestas.
    if (path === '/api/dashboard') return new Promise<Response>(() => undefined)
    if (path === '/api/opportunities/defaults') return Response.json({ data: defaults })
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    if (typeof path === 'string' && path.startsWith('/api/skills')) return skillsMock(path, options)
    if (typeof path === 'string' && path.startsWith('/api/catalogs/')) {
      return Response.json({ data: [{ code: '28032', name: 'Reynosa' }, { code: '28041', name: 'Victoria' }] })
    }
    return apiMock(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function form() {
  return (await screen.findByRole('button', { name: /Registrar oportunidad|Guardar cambios/ })).closest('form') as HTMLElement
}

async function fillRequired(view: HTMLElement) {
  fireEvent.change(within(view).getByLabelText('Título de la oportunidad'), { target: { value: '  Automatización de línea ' } })
  fireEvent.change(within(view).getByLabelText('Actividades y objetivos'), { target: { value: 'Programación de PLC y mantenimiento preventivo.' } })
  fireEvent.change(within(view).getByLabelText('Lugares disponibles'), { target: { value: '3' } })
  fireEvent.change(within(view).getByLabelText('Carrera o programa requerido'), { target: { value: 'Ingeniería Mecatrónica' } })
  fireEvent.change(within(view).getByLabelText('Tipo de periodo'), { target: { value: 'semester' } })
  fireEvent.change(within(view).getByLabelText('Periodo mínimo'), { target: { value: '5' } })
  fireEvent.click(within(within(view).getByRole('group', { name: '¿Requiere que el alumno se reubique?' })).getByLabelText('No'))
}

describe('oportunidades duales HU-S5-02', () => {
  it('ofrece Oportunidades Duales a COMPANY desde el inicio y la niega a otros roles (CA-01, CA-07)', async () => {
    const view = renderApp('/')
    expect(await screen.findByRole('link', { name: 'Oportunidades Duales' })).toHaveAttribute('href', '/opportunities')
    view.unmount()

    user = { id: 2, name: 'Analista', email: 'analista@economia.test', role: 'SECRETARY', institution: null, company: null }
    renderApp('/opportunities')
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para gestionar oportunidades.')
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('lista título, carrera, municipio, lugares, estado y habilidades, y pagina (CA-06)', async () => {
    apiMock.mockResolvedValueOnce(page([summary, { ...summary, id: 13, title: 'Calidad', is_active: false, skills: [] }], { last_page: 2, total: 21 }))
      .mockResolvedValueOnce(page([{ ...summary, id: 1, title: 'La más antigua' }], { current_page: 2, last_page: 2, total: 21 }))
    renderApp('/opportunities')
    const table = await screen.findByRole('table', { name: 'Oportunidades de la empresa' })
    const row = within(table).getByRole('row', { name: /Automatización de línea/ })
    expect(within(row).getByText(/Ingeniería Mecatrónica/)).toBeInTheDocument()
    expect(within(row).getByText('Reynosa')).toBeInTheDocument()
    expect(within(row).getByText('3')).toBeInTheDocument()
    expect(within(row).getByText('ACTIVA')).toBeInTheDocument()
    expect(within(within(row).getByRole('list', { name: 'Habilidades de Automatización de línea' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['PLC', 'Trabajo en equipo'])
    expect(within(table).getByText('INACTIVA')).toBeInTheDocument()
    expect(apiMock.mock.calls[0][0]).toBe('/api/opportunities?page=1')

    expect(screen.getByText('Página 1 de 2 · 21 oportunidades')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('La más antigua')).toBeInTheDocument()
    expect(apiMock.mock.calls[1][0]).toBe('/api/opportunities?page=2')
  })

  it('invita a registrar la primera oportunidad cuando no hay ninguna', async () => {
    apiMock.mockResolvedValueOnce(page([]))
    renderApp('/opportunities')
    expect(await screen.findByText('Aún no hay oportunidades registradas.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Registrar la primera oportunidad' })).toHaveAttribute('href', '/opportunities/new')
  })

  it('precarga el municipio de la empresa y registra con habilidades e idioma (CA-03, CA-05)', async () => {
    skillsMock.mockImplementation(async () => Response.json({ data: [{ id: 4, name: 'PLC', kind: 'technical' }] }))
    apiMock.mockResolvedValueOnce(Response.json({ data: opportunity }, { status: 201 })).mockResolvedValueOnce(Response.json({ data: opportunity }))
    renderApp('/opportunities/new')
    const view = await form()
    expect(within(view).getByLabelText('Estado')).toHaveValue('28')
    expect(within(view).getByRole('combobox', { name: 'Municipio' })).toHaveValue('Reynosa')
    await fillRequired(view)

    const skill = within(view).getByRole('combobox', { name: 'Agregar habilidad' })
    fireEvent.change(skill, { target: { value: 'pl' } })
    await within(view).findByRole('option', { name: /PLC/ })
    fireEvent.keyDown(skill, { key: 'Enter' })
    expect(within(within(view).getByRole('list', { name: 'Técnicas' })).getByText('PLC')).toBeInTheDocument()
    fireEvent.change(within(view).getByLabelText('Idioma (opcional)'), { target: { value: 'en' } })
    fireEvent.change(within(view).getByLabelText('Nivel mínimo'), { target: { value: '4' } })
    fireEvent.click(within(view).getByRole('button', { name: 'Registrar oportunidad' }))

    expect(await screen.findByText('Oportunidad registrada correctamente.')).toHaveAttribute('role', 'status')
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/opportunities/12')
    expect(sent('POST')).toEqual({
      title: 'Automatización de línea', program: 'Ingeniería Mecatrónica', period_type: 'semester', period_number: 5,
      vacancies: 3, can_relocate: false, state_code: '28', municipality_code: '28032',
      description: 'Programación de PLC y mantenimiento preventivo.', skills: [{ name: 'PLC', kind: 'technical' }],
      language_code: 'en', min_level: 4,
    })
    expect(writes('POST')[0][0]).toBe('/api/opportunities')
  })

  it('sin la ubicación de la empresa deja elegir estado y municipio', async () => {
    fetchMock.mockImplementationOnce(async () => Response.json({ user }))
    const original = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(async (path, options) => path === '/api/opportunities/defaults'
      ? new Response(null, { status: 500 }) : original!(path, options))
    renderApp('/opportunities/new')
    const view = await form()
    expect(within(view).getByLabelText('Estado')).toHaveValue('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('valida en línea y no envía con errores (CA-03, CA-04, CA-07)', async () => {
    renderApp('/opportunities/new')
    const view = await form()
    const title = within(view).getByLabelText('Título de la oportunidad')
    fireEvent.change(title, { target: { value: 'Escríbenos a rh@manugolfo.mx' } })
    fireEvent.blur(title)
    expect(title).toHaveAccessibleDescription(OPPORTUNITY_CONTACT_MESSAGE)

    fireEvent.change(within(view).getByLabelText('Lugares disponibles'), { target: { value: '51' } })
    fireEvent.change(within(view).getByLabelText('Idioma (opcional)'), { target: { value: 'fr' } })
    const skill = within(view).getByRole('combobox', { name: 'Agregar habilidad' })
    fireEvent.change(skill, { target: { value: 'wa.me/528991234567' } })
    fireEvent.keyDown(skill, { key: 'Enter' })
    expect(skill).toHaveAccessibleDescription(new RegExp(OPPORTUNITY_CONTACT_MESSAGE.slice(0, 30)))

    fireEvent.click(within(view).getByRole('button', { name: 'Registrar oportunidad' }))
    expect(title).toHaveAccessibleDescription(OPPORTUNITY_CONTACT_MESSAGE)
    expect(within(view).getByLabelText('Carrera o programa requerido')).toHaveAccessibleDescription('La carrera o programa requerido es obligatorio.')
    expect(within(view).getByLabelText('Actividades y objetivos')).toHaveAccessibleDescription(/La descripción de actividades es obligatoria/)
    expect(within(view).getByLabelText('Lugares disponibles')).toHaveAccessibleDescription('El número de lugares debe ser un entero del 1 al 50.')
    expect(within(view).getByLabelText('Nivel mínimo')).toHaveAccessibleDescription('Selecciona el nivel mínimo del idioma.')
    expect(writes('POST')).toHaveLength(0)
  })

  it('muestra los errores del servidor junto a cada campo', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ message: 'Invalid', errors: {
      municipality_code: ['El municipio no pertenece al estado seleccionado.'], 'skills.0.name': ['Los datos de contacto no se permiten.'],
    } }, { status: 422 }))
    renderApp('/opportunities/new')
    const view = await form()
    await fillRequired(view)
    fireEvent.click(within(view).getByRole('button', { name: 'Registrar oportunidad' }))
    expect(await within(view).findByText('El municipio no pertenece al estado seleccionado.')).toBeInTheDocument()
    expect(within(view).getByRole('combobox', { name: 'Agregar habilidad' })).toHaveAccessibleDescription(/Los datos de contacto no se permiten/)
  })

  it('muestra el detalle y edita la oportunidad (CA-02, CA-07)', async () => {
    const updated = { ...opportunity, title: 'Mantenimiento predictivo', can_relocate: true, language_code: null, min_level: null }
    apiMock.mockResolvedValueOnce(Response.json({ data: opportunity }))
      .mockResolvedValueOnce(Response.json({ data: opportunity }))
      .mockResolvedValueOnce(Response.json({ data: updated }))
      .mockResolvedValueOnce(Response.json({ data: updated }))
    renderApp('/opportunities/12')
    expect(await screen.findByText('Automatización de línea')).toBeInTheDocument()
    expect(screen.getByText('5.º semestre o posterior')).toBeInTheDocument()
    expect(screen.getByText('Inglés, B2 · Intermedio alto o superior')).toBeInTheDocument()
    expect(screen.getByText('Reynosa, Tamaulipas')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Habilidades requeridas' })).getByText('PLC')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Editar oportunidad' }))
    const view = await form()
    const title = within(view).getByLabelText('Título de la oportunidad')
    expect(title).toHaveValue('Automatización de línea')
    expect(within(view).getByRole('combobox', { name: 'Municipio' })).toHaveValue('Reynosa')
    fireEvent.change(title, { target: { value: 'Mantenimiento predictivo' } })
    fireEvent.click(within(within(view).getByRole('group', { name: '¿Requiere que el alumno se reubique?' })).getByLabelText('Sí'))
    fireEvent.change(within(view).getByLabelText('Idioma (opcional)'), { target: { value: '' } })
    fireEvent.change(within(view).getByLabelText('Nivel mínimo'), { target: { value: '' } })
    fireEvent.click(within(view).getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Oportunidad actualizada correctamente.')).toBeInTheDocument()
    expect(writes('PUT')[0][0]).toBe('/api/opportunities/12')
    expect(sent('PUT')).toMatchObject({ title: 'Mantenimiento predictivo', can_relocate: true, language_code: null, min_level: null, skills: opportunity.skills })
    expect(screen.getByText('Requiere que el alumno se reubique')).toBeInTheDocument()
  })

  it('muestra «No encontramos esta oportunidad» ante un 404 (CA-02)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ message: 'La oportunidad no existe.' }, { status: 404 }))
    renderApp('/opportunities/999')
    expect(await screen.findByRole('heading', { name: 'No encontramos esta oportunidad' })).toBeInTheDocument()
    expect(screen.getByText('La oportunidad no existe.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument())
  })

  describe('estado HU-S5-03', () => {
    it('cancelar la confirmación no cambia nada; inactivar pide confirmación y reactivar no (CA-04)', async () => {
      let resolveInactivation!: (value: Response) => void
      apiMock.mockResolvedValueOnce(Response.json({ data: opportunity }))
        .mockReturnValueOnce(new Promise<Response>((resolve) => { resolveInactivation = resolve }))
        .mockResolvedValueOnce(Response.json({ data: opportunity }))
      renderApp('/opportunities/12')
      const section = await screen.findByRole('region', { name: 'Estado de la oportunidad' })
      expect(within(section).getByText(/no podrá elegirse para nuevas solicitudes de vinculación/)).toBeInTheDocument()

      const inactivate = within(section).getByRole('button', { name: 'Inactivar oportunidad' })
      fireEvent.click(inactivate)
      let dialog = await screen.findByRole('alertdialog', { name: '¿Inactivar la oportunidad?' })
      expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(writes('PATCH')).toHaveLength(0)

      fireEvent.click(inactivate)
      dialog = await screen.findByRole('alertdialog', { name: '¿Inactivar la oportunidad?' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Inactivar' }))
      // Pendiente: un segundo clic no envía otra petición.
      const pending = await within(section).findByRole('button', { name: 'Guardando estado…' })
      expect(pending).toBeDisabled()
      fireEvent.click(pending)
      resolveInactivation(Response.json({ data: { ...opportunity, is_active: false } }))
      expect(await within(section).findByText('Oportunidad inactivada correctamente.')).toHaveAttribute('role', 'status')
      expect(screen.getByText('INACTIVA')).toBeInTheDocument()
      expect(within(section).getByText(/Está inactiva: conserva toda su información/)).toBeInTheDocument()

      fireEvent.click(within(section).getByRole('button', { name: 'Reactivar oportunidad' }))
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(await within(section).findByText('Oportunidad reactivada correctamente.')).toBeInTheDocument()
      expect(screen.getByText('ACTIVA')).toBeInTheDocument()
      expect(writes('PATCH').map(([path]) => path)).toEqual(['/api/opportunities/12/status', '/api/opportunities/12/status'])
      expect(writes('PATCH').map(([, options]) => JSON.parse(options?.body as string))).toEqual([{ is_active: false }, { is_active: true }])
    })

    it('muestra el error junto a la sección y conserva el estado', async () => {
      apiMock.mockResolvedValueOnce(Response.json({ data: { ...opportunity, is_active: false } }))
        .mockResolvedValueOnce(Response.json({ message: 'La oportunidad no existe.' }, { status: 404 }))
      renderApp('/opportunities/12')
      const section = await screen.findByRole('region', { name: 'Estado de la oportunidad' })
      fireEvent.click(within(section).getByRole('button', { name: 'Reactivar oportunidad' }))
      expect(await within(section).findByRole('alert')).toHaveTextContent('La oportunidad no existe.')
      expect(screen.getByText('INACTIVA')).toBeInTheDocument()
      expect(within(section).getByRole('button', { name: 'Reactivar oportunidad' })).toBeEnabled()
    })
  })
})
