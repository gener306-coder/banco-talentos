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

beforeEach(() => {
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
    return apiMock(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('inicio por rol (tarea transversal del Sprint 4)', () => {
  it.each([
    ['ADMIN', {}, 'Administración', 'Administrador', null, ['Nueva institución', '/institutions/new'], [['Instituciones', '/institutions'], ['Cuentas de la Secretaría', '/secretary-accounts']]],
    ['SECRETARY', {}, 'Secretaría de Economía', 'Secretaría de Economía', null, ['Registrar empresa', '/companies/new'], [['Empresas', '/companies'], ['Cuentas de la Secretaría', '/secretary-accounts']]],
    ['INSTITUTION', { institution: { id: 7, name: 'Instituto Dual' } }, 'Institución', 'Institución', 'Instituto Dual', ['Registrar alumno', '/students'], [['Alumnos', '/students']]],
    ['COMPANY', { company: { id: 3, name: 'ManuGolfo' } }, 'Empresa', 'Empresa', 'ManuGolfo', null, [['Buscar talento', '/talent']]],
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
