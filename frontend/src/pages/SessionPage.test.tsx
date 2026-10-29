import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { initialsOf } from '../auth/user'

const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const base = { id: 4, name: 'Laura Torres', email: 'laura@example.test', institution: null, company: null }

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}
function renderApp(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)
}
const emptyPage = { data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 20 } }

const zeroMetrics: Record<string, Record<string, number>> = {
  ADMIN: { active_institutions: 0, inactive_institutions: 0, active_secretaries: 0, pending_secretaries: 0, active_opportunities: 0, accepted_linkage_requests: 0 },
  SECRETARY: { active_companies: 0, inactive_companies: 0, pending_secretaries: 0, active_opportunities: 0, accepted_linkage_requests: 0 },
  INSTITUTION: { active_students: 0, searchable_students: 0, pending_municipality_students: 0, pending_linkage_requests: 0 },
  COMPANY: { available_talent_profiles: 0, active_opportunities: 0, pending_linkage_requests: 0 },
}
/** Respuesta de GET /api/dashboard; por defecto, ceros para el rol de la sesión. */
let dashboard: (() => Response) | null
const dashboardCalls = () => fetchMock.mock.calls.filter(([path]) => path === '/api/dashboard').length

beforeEach(() => {
  dashboard = null
  apiMock.mockReset()
  apiMock.mockImplementation(async () => Response.json(emptyPage))
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/api/me') return Response.json({ user })
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    if (path === '/api/logout') return new Response(null, { status: 204 })
    if (path === '/api/dashboard') {
      return dashboard ? dashboard() : Response.json({ data: { role: user.role, metrics: zeroMetrics[String(user.role)] } })
    }
    return apiMock(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('inicio por rol (tarea transversal del Sprint 4)', () => {
  it.each([
    ['ADMIN', {}, 'Administración', 'Administrador', null, ['Nueva institución', '/institutions/new'], [['Instituciones', '/institutions'], ['Cuentas de la Secretaría', '/secretary-accounts'], ['Reporte ejecutivo', '/reports'], ['Bitácora', '/audit-events']]],
    ['SECRETARY', {}, 'Secretaría de Economía', 'Secretaría de Economía', null, ['Registrar empresa', '/companies/new'], [['Empresas', '/companies'], ['Cuentas de la Secretaría', '/secretary-accounts'], ['Reporte ejecutivo', '/reports']]],
    ['INSTITUTION', { institution: { id: 7, name: 'Instituto Dual' } }, 'Institución', 'Institución', 'Instituto Dual', ['Registrar alumno', '/students'], [['Alumnos', '/students'], ['Solicitudes de vinculación', '/institution/linkage-requests']]],
    ['COMPANY', { company: { id: 3, name: 'ManuGolfo' } }, 'Empresa', 'Empresa', 'ManuGolfo', null, [['Buscar talento', '/talent'], ['Oportunidades Duales', '/opportunities'], ['Solicitudes de vinculación', '/linkage-requests']]],
  ] as const)('%s ve su saludo, su acción principal y sus secciones', async (role, organization, navLabel, roleLabel, orgName, primary, sections) => {
    user = { ...base, role, ...organization }
    renderApp()
    expect(await screen.findByRole('heading', { level: 2, name: 'Hola, Laura Torres' })).toBeInTheDocument()
    expect(screen.getByText(roleLabel, { selector: '.home-role' })).toBeInTheDocument()
    expect(screen.getByText('laura@example.test')).toBeInTheDocument()
    if (orgName) expect(screen.getByText(orgName)).toBeInTheDocument()

    if (primary) expect(screen.getByRole('link', { name: primary[0] })).toHaveAttribute('href', primary[1])
    const navigation = screen.getByRole('navigation', { name: navLabel })
    const links = within(navigation).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(sections.map(([, href]) => href))
    for (const [title, href] of sections) {
      const card = within(navigation).getByRole('link', { name: title })
      expect(card).toHaveAttribute('href', href)
      // La descripción acompaña al título sin cambiar el nombre accesible de la tarjeta.
      expect(card).toHaveAccessibleDescription(/.+/)
    }
  })

  it('explica que no hay secciones a una cuenta sin su organización vinculada', async () => {
    user = { ...base, role: 'INSTITUTION' }
    renderApp()
    expect(await screen.findByText(/no está vinculada a una organización/)).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Institución' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('el atajo de la empresa abre el buscador con la habilidad ya filtrada', async () => {
    user = { ...base, role: 'COMPANY', company: { id: 3, name: 'ManuGolfo' } }
    renderApp()
    const search = await screen.findByRole('search', { name: 'Buscar talento' })
    fireEvent.change(within(search).getByLabelText('Buscar talento por habilidad'), { target: { value: '  Power   BI ' } })
    fireEvent.click(within(search).getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Buscar talento' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/talent')
    expect(within(screen.getByRole('list', { name: 'Habilidades requeridas' })).getByText('Power BI')).toBeInTheDocument()
    await waitFor(() => expect(String(apiMock.mock.calls.at(-1)?.[0])).toBe('/api/talent?skills%5B%5D=Power+BI&page=1'))
  })

  it('«Registrar alumno» abre directamente la hoja de alta del padrón', async () => {
    user = { ...base, role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
    apiMock.mockImplementation(async () => Response.json({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } }))
    renderApp()
    fireEvent.click(await screen.findByRole('link', { name: 'Registrar alumno' }))
    expect(await screen.findByRole('dialog', { name: 'Registrar alumno' })).toBeInTheDocument()
  })
})

describe('indicadores del inicio (HU-S5-01 CA-07)', () => {
  /** Indicadores visibles como pares [etiqueta, cifra], en orden. */
  async function indicators() {
    const region = await screen.findByRole('region', { name: 'Indicadores' })
    return within(region).getAllByRole('term').map((term) => [term.textContent, term.nextElementSibling?.textContent])
  }

  it.each([
    ['ADMIN', {}, { active_institutions: 12, inactive_institutions: 3, active_secretaries: 4, pending_secretaries: 1, active_opportunities: 30, accepted_linkage_requests: 9 },
      [['Instituciones activas', '12'], ['Instituciones inactivas', '3'], ['Cuentas de la Secretaría activas', '4'], ['Cuentas de la Secretaría pendientes', '1'],
        ['Oportunidades activas', '30'], ['Vinculaciones aceptadas', '9']]],
    ['SECRETARY', {}, { active_companies: 1250, inactive_companies: 7, pending_secretaries: 2, active_opportunities: 2400, accepted_linkage_requests: 15 },
      [['Empresas activas', '1,250'], ['Empresas inactivas', '7'], ['Cuentas de la Secretaría pendientes', '2'], ['Oportunidades activas', '2,400'], ['Vinculaciones aceptadas', '15']]],
    ['INSTITUTION', { institution: { id: 7, name: 'Instituto Dual' } }, { active_students: 40, searchable_students: 25, pending_municipality_students: 0, pending_linkage_requests: 0 },
      [['Alumnos activos', '40'], ['Visibles en el buscador', '25'], ['Municipio por confirmar', '0'], ['Solicitudes pendientes', '0']]],
    ['COMPANY', { company: { id: 3, name: 'ManuGolfo' } }, { available_talent_profiles: 318, active_opportunities: 4, pending_linkage_requests: 6 },
      [['Perfiles disponibles', '318'], ['Oportunidades activas', '4'], ['Solicitudes pendientes', '6']]],
  ] as const)('%s ve sus contadores', async (role, organization, metrics, expected) => {
    user = { ...base, role, ...organization }
    dashboard = () => Response.json({ data: { role, metrics } })
    renderApp()
    expect(await indicators()).toEqual(expected)
    expect(screen.queryByText(/Municipio por confirmar»/)).not.toBeInTheDocument()
    // La empresa ve su contador de pendientes, pero el aviso es solo para la institución, que las responde.
    expect(screen.queryByRole('link', { name: 'Revisar solicitudes' })).not.toBeInTheDocument()
  })

  it.each([
    [1, 'Tienes 1 solicitud de vinculación pendiente de respuesta.'],
    [3, 'Tienes 3 solicitudes de vinculación pendientes de respuesta.'],
  ])('avisa a la institución de %i solicitudes pendientes y enlaza a su bandeja (HU-S6-03 CA-02)', async (pending, text) => {
    user = { ...base, role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
    dashboard = () => Response.json({ data: { role: 'INSTITUTION', metrics: { ...zeroMetrics.INSTITUTION, pending_linkage_requests: pending } } })
    renderApp()
    const region = await screen.findByRole('region', { name: 'Indicadores' })
    const notice = within(region).getByText(text, { exact: false })
    expect(within(notice).getByRole('link', { name: 'Revisar solicitudes' })).toHaveAttribute('href', '/institution/linkage-requests')
  })

  it.each([
    [1, '1 alumno tiene «Municipio por confirmar».'],
    [14, '14 alumnos tienen «Municipio por confirmar».'],
  ])('avisa a la institución de %i alumnos con municipio por confirmar y enlaza al padrón', async (pending, text) => {
    user = { ...base, role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
    dashboard = () => Response.json({ data: { role: 'INSTITUTION', metrics: { ...zeroMetrics.INSTITUTION, active_students: 20, searchable_students: 5, pending_municipality_students: pending } } })
    renderApp()
    const region = await screen.findByRole('region', { name: 'Indicadores' })
    const notice = within(region).getByText(text, { exact: false })
    expect(within(notice).getByRole('link', { name: 'Revisar el padrón' })).toHaveAttribute('href', '/students')
  })

  it.each([
    ['un error del servidor', () => new Response(null, { status: 500 })],
    ['una respuesta de otro rol', () => Response.json({ data: { role: 'ADMIN', metrics: zeroMetrics.ADMIN } })],
  ])('con %s el inicio sigue navegable', async (_case, response) => {
    user = { ...base, role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
    dashboard = response
    renderApp()
    expect(await screen.findByText(/No pudimos cargar los indicadores/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Indicadores' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Institución' })).getByRole('link', { name: 'Alumnos' }))
    await waitFor(() => expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/students'))
  })

  it('sin organización vinculada no consulta indicadores (CA-06)', async () => {
    user = { ...base, role: 'COMPANY' }
    renderApp()
    expect(await screen.findByText(/no está vinculada a una organización/)).toBeInTheDocument()
    expect(dashboardCalls()).toBe(0)
    expect(screen.queryByRole('region', { name: 'Indicadores' })).not.toBeInTheDocument()
  })

  it('no muestra contadores si el servidor responde metrics: null', async () => {
    user = { ...base, role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
    dashboard = () => Response.json({ data: { role: 'INSTITUTION', metrics: null } })
    renderApp()
    expect(await screen.findByRole('navigation', { name: 'Institución' })).toBeInTheDocument()
    await waitFor(() => expect(dashboardCalls()).toBe(1))
    expect(screen.queryByRole('region', { name: 'Indicadores' })).not.toBeInTheDocument()
    expect(screen.queryByText(/No pudimos cargar los indicadores/)).not.toBeInTheDocument()
  })
})

describe('menú de cuenta', () => {
  beforeEach(() => {
    user = { ...base, role: 'SECRETARY' }
  })

  it('calcula las iniciales del botón', () => {
    expect(initialsOf('Laura Torres')).toBe('LT')
    expect(initialsOf('axel')).toBe('AX')
    expect(initialsOf('  Universidad Politécnica del Valle ')).toBe('UP')
  })

  it('muestra la identidad de la sesión y se cierra con Esc devolviendo el foco', async () => {
    renderApp()
    const trigger = await screen.findByRole('button', { name: 'Cuenta de Laura Torres' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'Cuenta' })).not.toBeInTheDocument()
    fireEvent.click(trigger)
    const panel = screen.getByRole('region', { name: 'Cuenta' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(within(panel).getByText('Laura Torres')).toBeInTheDocument()
    expect(within(panel).getByText('laura@example.test')).toBeInTheDocument()
    expect(within(panel).getByText('Secretaría de Economía')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Cuenta' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('elige el tema desde el menú y lo recuerda (modo oscuro)', async () => {
    localStorage.clear()
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Cuenta de Laura Torres' }))
    const group = within(screen.getByRole('region', { name: 'Cuenta' })).getByRole('group', { name: 'Tema' })
    expect(within(group).getAllByRole('radio').map((radio) => radio.closest('div')?.textContent)).toEqual(['Sistema', 'Claro', 'Oscuro'])
    expect(within(group).getByLabelText('Sistema')).toBeChecked()

    fireEvent.click(within(group).getByLabelText('Oscuro'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('bt-theme')).toBe('dark')
    expect(within(group).getByLabelText('Oscuro')).toBeChecked()

    fireEvent.click(within(group).getByLabelText('Claro'))
    expect(document.documentElement.dataset.theme).toBe('light')
    fireEvent.click(within(group).getByLabelText('Sistema'))
    expect(localStorage.getItem('bt-theme')).toBeNull()
  })

  it('se cierra con un clic fuera y al navegar', async () => {
    renderApp()
    const trigger = await screen.findByRole('button', { name: 'Cuenta de Laura Torres' })
    fireEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('region', { name: 'Cuenta' })).not.toBeInTheDocument()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('link', { name: 'Empresas' }))
    await screen.findByLabelText('Ruta actual')
    await waitFor(() => expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/companies'))
    expect(screen.queryByRole('region', { name: 'Cuenta' })).not.toBeInTheDocument()
  })

  it('cierra la sesión desde cualquier vista', async () => {
    renderApp('/companies')
    fireEvent.click(await screen.findByRole('button', { name: 'Cuenta de Laura Torres' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Cuenta de/ })).not.toBeInTheDocument()
  })

  it('no aparece sin sesión ni en los enlaces de contraseña', async () => {
    user = undefined as unknown as Record<string, unknown>
    fetchMock.mockImplementationOnce(async () => new Response(null, { status: 401 }))
    const view = renderApp()
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Cuenta de/ })).not.toBeInTheDocument()
    view.unmount()
    renderApp('/set-initial-password')
    expect(screen.queryByRole('button', { name: /^Cuenta de/ })).not.toBeInTheDocument()
  })
})
