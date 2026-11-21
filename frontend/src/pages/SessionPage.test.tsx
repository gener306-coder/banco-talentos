import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { initialsOf } from '../auth/user'
import { firstViewInSession, resetHomeCountUp } from './homeCountUp'

const fetchMock = vi.fn<typeof fetch>()
let unreadConversations = 0
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
  INSTITUTION: { active_students: 0, searchable_students: 0, missing_data_students: 0, pending_linkage_requests: 0 },
  COMPANY: { available_talent_profiles: 0, active_opportunities: 0, pending_linkage_requests: 0 },
}
/** Respuesta de GET /api/dashboard; por defecto, ceros para el rol de la sesión. */
let dashboard: (() => Response | Promise<Response>) | null
const dashboardCalls = () => fetchMock.mock.calls.filter(([path]) => path === '/api/dashboard').length

beforeEach(() => {
  dashboard = null
  apiMock.mockReset()
  apiMock.mockImplementation(async () => Response.json(emptyPage))
  fetchMock.mockReset()
  unreadConversations = 0
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/api/me') return Response.json({ user })
    // Aviso de conversaciones sin leer del menú (HU-S13-04): ajeno a estas pruebas salvo donde se indique.
    if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: unreadConversations } })
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

/** La sección de indicadores existe desde el primer pintado (T-S14-07): se espera a que deje de estar ocupada. */
async function loadedIndicators() {
  const region = await screen.findByRole('region', { name: 'Indicadores' })
  await waitFor(() => expect(region).toHaveAttribute('aria-busy', 'false'))
  return region
}

describe('inicio por rol (tarea transversal del Sprint 4)', () => {
  it.each([
    ['ADMIN', {}, 'Administración', 'Administrador', null, ['Nueva institución', '/institutions/new'], [['Instituciones', '/institutions'], ['Cuentas de la Secretaría', '/secretary-accounts'], ['Reporte ejecutivo', '/reports'], ['Bitácora', '/audit-events'], ['Historias del Dual', '/promocion']]],
    ['SECRETARY', {}, 'Secretaría de Economía', 'Secretaría de Economía', null, ['Registrar empresa', '/companies/new'], [['Empresas', '/companies'], ['Cuentas de la Secretaría', '/secretary-accounts'], ['Reporte ejecutivo', '/reports'], ['Historias del Dual', '/promocion']]],
    ['INSTITUTION', { institution: { id: 7, name: 'Instituto Dual' } }, 'Institución', 'Institución', 'Instituto Dual', ['Registrar alumno', '/students'], [['Alumnos', '/students'], ['Solicitudes de vinculación', '/institution/linkage-requests'], ['Historias del Dual', '/institution/videos']]],
    ['COMPANY', { company: { id: 3, name: 'ManuGolfo', missing: [] } }, 'Empresa', 'Empresa', 'ManuGolfo', null, [['Buscar talento', '/talent'], ['Oportunidades Duales', '/opportunities'], ['Solicitudes de vinculación', '/linkage-requests']]],
  ] as const)('%s ve su saludo, su acción principal y sus secciones', async (role, organization, navLabel, roleLabel, orgName, primary, sections) => {
    user = { ...base, role, ...organization }
    renderApp()
    expect(await screen.findByRole('heading', { level: 2, name: 'Hola, Laura Torres' })).toBeInTheDocument()
    expect(screen.getByText(roleLabel, { selector: '.home-role' })).toBeInTheDocument()
    // El correo solo aparece en el menú de cuenta del encabezado.
    expect(screen.queryByText('laura@example.test')).not.toBeInTheDocument()
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
    // HU-S15-03: el footer siempre trae los documentos legales; el contenido no tiene enlaces.
    expect(within(screen.getByRole('main')).queryByRole('link')).not.toBeInTheDocument()
  })

  describe('atajo de la empresa con el catálogo (T-S12-07)', () => {
    // Autocompletar del catálogo (HU-S11-01): «power» por prefijo y «pyhton» como aproximación.
    const catalog: Record<string, unknown[]> = {
      power: [{ id: 1, name: 'Power BI', kind: 'technical', match: 'prefix' }],
      pyhton: [{ id: 2, name: 'Python', kind: 'technical', match: 'fuzzy' }],
    }
    beforeEach(() => {
      user = { ...base, role: 'COMPANY', company: { id: 3, name: 'ManuGolfo', missing: [] } }
      apiMock.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.startsWith('/api/skills?')) {
          return Response.json({ data: catalog[new URLSearchParams(path.split('?')[1]).get('q')?.toLowerCase() ?? ''] ?? [] })
        }
        return Response.json({ data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 20 } })
      })
    })

    it('Enter agrega la habilidad del catálogo sin salir del inicio y «Buscar» la aplica en el buscador', async () => {
      renderApp()
      const search = await screen.findByRole('search', { name: 'Buscar talento' })
      const field = within(search).getByRole('combobox', { name: 'Buscar talento por habilidad' })
      fireEvent.change(field, { target: { value: 'power' } })
      await within(search).findByRole('option', { name: /Power BI/ })
      fireEvent.keyDown(field, { key: 'Enter' })
      expect(within(search).getByRole('list', { name: 'Habilidades requeridas' })).toHaveTextContent('Power BI')
      expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/')

      fireEvent.click(within(search).getByRole('button', { name: 'Buscar' }))
      expect(await screen.findByRole('heading', { level: 2, name: 'Buscar talento' })).toBeInTheDocument()
      expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/talent')
      expect(within(screen.getByRole('list', { name: 'Habilidades requeridas' })).getByText('Power BI')).toBeInTheDocument()
      await waitFor(() => expect(String(apiMock.mock.calls.at(-1)?.[0])).toBe('/api/talent?skills%5B%5D=Power+BI&page=1'))
    })

    it('una escritura aproximada exige elegir la sugerencia antes de buscar', async () => {
      renderApp()
      const search = await screen.findByRole('search', { name: 'Buscar talento' })
      const field = within(search).getByRole('combobox', { name: 'Buscar talento por habilidad' })
      fireEvent.change(field, { target: { value: 'pyhton' } })
      await within(search).findByRole('option', { name: /Python/ })
      fireEvent.click(within(search).getByRole('button', { name: 'Buscar' }))
      expect(await within(search).findByRole('alert')).toHaveTextContent('Elige una sugerencia del catálogo o borra el texto.')
      expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/')
      expect(apiMock.mock.calls.some(([path]) => String(path).startsWith('/api/talent'))).toBe(false)
    })

    it('sin habilidades abre el buscador sin filtros', async () => {
      renderApp()
      fireEvent.click(within(await screen.findByRole('search', { name: 'Buscar talento' })).getByRole('button', { name: 'Buscar' }))
      expect(await screen.findByRole('heading', { level: 2, name: 'Buscar talento' })).toBeInTheDocument()
      await waitFor(() => expect(String(apiMock.mock.calls.at(-1)?.[0])).toBe('/api/talent?page=1'))
    })
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
    const region = await loadedIndicators()
    return within(region).getAllByRole('term').map((term) => [term.textContent, term.nextElementSibling?.textContent])
  }

  it.each([
    ['ADMIN', {}, { active_institutions: 12, inactive_institutions: 3, active_secretaries: 4, pending_secretaries: 1, active_opportunities: 30, accepted_linkage_requests: 9 },
      [['Instituciones activas', '12'], ['Instituciones inactivas', '3'], ['Cuentas de la Secretaría activas', '4'], ['Cuentas de la Secretaría pendientes', '1'],
        ['Oportunidades activas', '30'], ['Vinculaciones aceptadas', '9']]],
    ['SECRETARY', {}, { active_companies: 1250, inactive_companies: 7, pending_secretaries: 2, active_opportunities: 2400, accepted_linkage_requests: 15 },
      [['Empresas activas', '1,250'], ['Empresas inactivas', '7'], ['Cuentas de la Secretaría pendientes', '2'], ['Oportunidades activas', '2,400'], ['Vinculaciones aceptadas', '15']]],
    ['INSTITUTION', { institution: { id: 7, name: 'Instituto Dual' } }, { active_students: 40, searchable_students: 25, missing_data_students: 0, pending_linkage_requests: 0 },
      [['Alumnos activos', '40'], ['Visibles en el buscador', '25'], ['Datos faltantes', '0'], ['Solicitudes pendientes', '0']]],
    ['COMPANY', { company: { id: 3, name: 'ManuGolfo', missing: [] } }, { available_talent_profiles: 318, active_opportunities: 4, pending_linkage_requests: 6 },
      [['Perfiles disponibles', '318'], ['Oportunidades activas', '4'], ['Solicitudes pendientes', '6']]],
  ] as const)('%s ve sus contadores', async (role, organization, metrics, expected) => {
    user = { ...base, role, ...organization }
    dashboard = () => Response.json({ data: { role, metrics } })
    renderApp()
    expect(await indicators()).toEqual(expected)
    expect(screen.queryByRole('link', { name: 'Revisar el padrón' })).not.toBeInTheDocument()
    // La empresa ve su contador de pendientes, pero el aviso es solo para la institución, que las responde.
    expect(screen.queryByRole('link', { name: 'Revisar solicitudes' })).not.toBeInTheDocument()
  })

  it.each([
    [1, '1 solicitud espera tu respuesta'],
    [3, '3 solicitudes esperan tu respuesta'],
  ])('avisa a la institución de %i solicitudes pendientes y enlaza a su bandeja (HU-S6-03 CA-02)', async (pending, text) => {
    user = { ...base, role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
    dashboard = () => Response.json({ data: { role: 'INSTITUTION', metrics: { ...zeroMetrics.INSTITUTION, pending_linkage_requests: pending } } })
    renderApp()
    const region = await loadedIndicators()
    const tasks = within(region).getByRole('list', { name: 'Por atender' })
    // T-S14-16: todo el aviso es el enlace; se anuncia por su acción y el conteo es su descripción.
    const review = within(tasks).getByRole('link', { name: 'Revisar solicitudes' })
    expect(review).toHaveAccessibleDescription(text)
    expect(review).toHaveAttribute('href', '/institution/linkage-requests?status=PENDIENTE_INSTITUCION')
    expect(review).toHaveClass('home-task', 'home-task-linkage')
  })

  it.each([
    [1, '1 alumno con datos por completar'],
    [14, '14 alumnos con datos por completar'],
  ])('avisa a la institución de %i alumnos con datos faltantes y enlaza al padrón', async (missing, text) => {
    user = { ...base, role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
    dashboard = () => Response.json({ data: { role: 'INSTITUTION', metrics: { ...zeroMetrics.INSTITUTION, active_students: 20, searchable_students: 5, missing_data_students: missing } } })
    renderApp()
    const region = await loadedIndicators()
    const review = within(region).getByRole('link', { name: 'Revisar el padrón' })
    expect(within(review).getByText(text)).toHaveClass('home-task-title')
    expect(review).toHaveAccessibleDescription(text)
    expect(review).toHaveAttribute('href', '/students?data=missing&status=active')
  })

  it.each([
    ['un error del servidor', () => new Response(null, { status: 500 })],
    ['una respuesta de otro rol', () => Response.json({ data: { role: 'ADMIN', metrics: zeroMetrics.ADMIN } })],
  ])('con %s el inicio sigue navegable', async (_case, response) => {
    user = { ...base, role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
    dashboard = response
    renderApp()
    expect(await screen.findByText(/No pudimos cargar los indicadores/)).toBeInTheDocument()
    // T-S14-07: la sección se queda con un aviso discreto y «Reintentar», sin cifras ni alertas.
    expect(within(screen.getByRole('region', { name: 'Indicadores' })).queryByRole('definition')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Institución' })).getByRole('link', { name: 'Alumnos' }))
    await waitFor(() => expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/students'))
  })

  it('«Reintentar» vuelve a pedir los indicadores y los muestra (T-S14-07)', async () => {
    user = { ...base, role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
    let calls = 0
    dashboard = () => (++calls === 1 ? new Response(null, { status: 500 }) : Response.json({ data: { role: 'INSTITUTION', metrics: zeroMetrics.INSTITUTION } }))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Alumnos activos')).toBeInTheDocument()
    expect(screen.queryByText(/No pudimos cargar los indicadores/)).not.toBeInTheDocument()
    expect(calls).toBe(2)
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

  it('con el nombre provisional de una invitada no repite el correo (M3 de HU-S14-02)', async () => {
    user = { ...base, name: 'operador@nueva.test', email: 'operador@nueva.test', role: 'COMPANY', company: { id: 3, name: null, missing: ['name'] } }
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Cuenta de operador@nueva.test' }))
    const panel = screen.getByRole('region', { name: 'Cuenta' })
    expect(within(panel).getAllByText('operador@nueva.test')).toHaveLength(1)
  })

  it('elige el tema desde el menú y lo recuerda; el claro es el predeterminado (T-S14-06)', async () => {
    localStorage.clear()
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Cuenta de Laura Torres' }))
    const group = within(screen.getByRole('region', { name: 'Cuenta' })).getByRole('group', { name: 'Tema' })
    expect(within(group).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent)).toEqual(['Claro', 'Oscuro', 'Sistema'])
    expect(within(group).getByLabelText('Claro')).toBeChecked()
    // Cada opción muestra la miniatura de su tema.
    expect(group.querySelectorAll('.theme-preview.light, .theme-preview.dark, .theme-preview.system')).toHaveLength(3)

    fireEvent.click(within(group).getByLabelText('Oscuro'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('bt-theme')).toBe('dark')
    expect(within(group).getByLabelText('Oscuro')).toBeChecked()

    fireEvent.click(within(group).getByLabelText('Claro'))
    expect(document.documentElement.dataset.theme).toBe('light')
    fireEvent.click(within(group).getByLabelText('Sistema'))
    expect(localStorage.getItem('bt-theme')).toBe('system')
    expect(within(group).getByLabelText('Sistema')).toBeChecked()
  })

  it('presenta la identidad, Mi cuenta con su descripción y Cerrar sesión como acción final (T-S14-06)', async () => {
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Cuenta de Laura Torres' }))
    const panel = screen.getByRole('region', { name: 'Cuenta' })
    expect(panel.querySelector('.user-avatar.md')).toHaveTextContent('LT')
    expect(within(panel).getByRole('link', { name: /Mi cuenta/ })).toHaveTextContent('Perfil y seguridad')
    const actions = within(panel).getAllByRole('button')
    expect(actions.at(-1)).toHaveTextContent('Cerrar sesión')
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

describe('inicio dinámico T-S12-11', () => {
  const metrics = { available_talent_profiles: 318, active_opportunities: 4, pending_linkage_requests: 6 }
  const company = { company: { id: 3, name: 'ManuGolfo', missing: [] } }
  const stat = async (label: string) => {
    const region = await loadedIndicators()
    return within(region).getByText(label).nextElementSibling as HTMLElement
  }

  beforeEach(() => { resetHomeCountUp() })

  it('la primera vez en la sesión los indicadores cuentan hasta su valor, que es siempre el texto real', async () => {
    user = { ...base, role: 'COMPANY', ...company }
    dashboard = () => Response.json({ data: { role: 'COMPANY', metrics } })
    renderApp()
    const profiles = await stat('Perfiles disponibles')
    expect(profiles).toHaveTextContent('318')
    expect(profiles).toHaveAttribute('data-count')
    await waitFor(() => expect(profiles).not.toHaveAttribute('data-count'), { timeout: 2000 })
    expect(profiles).toHaveTextContent('318')
  })

  it('al volver al inicio en la misma sesión no se repite el conteo', async () => {
    firstViewInSession()
    user = { ...base, role: 'COMPANY', ...company }
    dashboard = () => Response.json({ data: { role: 'COMPANY', metrics } })
    renderApp()
    expect(await stat('Perfiles disponibles')).not.toHaveAttribute('data-count')
  })

  it('con movimiento reducido no hay conteo', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query, addEventListener: () => {}, removeEventListener: () => {} }))
    try {
      user = { ...base, role: 'COMPANY', ...company }
      dashboard = () => Response.json({ data: { role: 'COMPANY', metrics } })
      renderApp()
      expect(await stat('Perfiles disponibles')).not.toHaveAttribute('data-count')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('mientras cargan los indicadores, su esqueleto reserva el lugar y las tarjetas se revelan al entrar en pantalla sin esperarlos (T-S14-07)', async () => {
    const observed = new Map<Element, IntersectionObserverCallback>()
    vi.stubGlobal('IntersectionObserver', class {
      private readonly callback: IntersectionObserverCallback
      constructor(callback: IntersectionObserverCallback) { this.callback = callback }
      observe(element: Element) { observed.set(element, this.callback) }
      disconnect() {}
    })
    let respond: (response: Response) => void = () => {}
    try {
      user = { ...base, role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
      dashboard = () => new Promise<Response>((resolve) => { respond = resolve })
      renderApp()
      const list = within(await within(screen.getByRole('main')).findByRole('navigation', { name: /./ })).getByRole('list')
      expect(list).toHaveAttribute('data-reveal', 'pending')
      // El esqueleto tiene una tarjeta por indicador del rol, así que la lista ya está en su lugar definitivo.
      const skeleton = screen.getByTestId('home-stats-skeleton')
      expect(skeleton.querySelectorAll('.home-stat')).toHaveLength(4)
      expect(screen.getByText('Cargando indicadores…')).toHaveAttribute('role', 'status')
      await waitFor(() => expect(observed.has(list)).toBe(true))
      act(() => observed.get(list)!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
      expect(list).toHaveAttribute('data-reveal', 'shown')

      respond(Response.json({ data: { role: 'INSTITUTION', metrics: zeroMetrics.INSTITUTION } }))
      await loadedIndicators()
      expect(screen.queryByTestId('home-stats-skeleton')).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('las tarjetas de acceso entran en cascada según su posición', async () => {
    user = { ...base, role: 'COMPANY', ...company }
    dashboard = () => Response.json({ data: { role: 'COMPANY', metrics } })
    renderApp()
    const cards = within(await within(screen.getByRole('main')).findByRole('navigation', { name: /./ })).getAllByRole('listitem')
    cards.forEach((card, index) => expect(card.style.getPropertyValue('--enter-index')).toBe(String(index)))
  })
})
