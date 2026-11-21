import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

function Location() {
  const location = useLocation()
  return <output aria-label="Ruta actual">{location.pathname}{location.search}</output>
}

const company = { id: 9, name: 'Rosa Garza', email: 'rosa@x.test', role: 'COMPANY', institution: null,
  company: { id: 3, name: 'ManuGolfo', missing: [], onboarding: 'done', can_operate: true } }

/** Sin sesión, /api/me responde 401; con `user`, la sesión está activa. */
function stubSession(user: unknown = null) {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (path) => {
    if (path === '/api/me') return user ? Response.json({ user }) : Response.json({ message: 'Unauthenticated.' }, { status: 401 })
    if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: 0, items: [] } })
    return new Promise<Response>(() => undefined)
  }))
}

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)
}

const route = () => screen.getByRole('status', { name: 'Ruta actual' }).textContent
const legalNav = () => screen.getByRole('navigation', { name: 'Documentos legales', hidden: false })

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('documentos legales públicos HU-S15-03', () => {
  it.each([
    ['/legal/privacidad', 'Aviso de Privacidad Integral'],
    ['/legal/terminos', 'Términos y Condiciones'],
    ['/legal/cookies', 'Cookies y tecnologías técnicas'],
  ])('%s se lee sin sesión y no redirige al inicio de sesión', async (path, title) => {
    stubSession()
    renderAt(path)
    expect(await screen.findByRole('heading', { name: title, level: 2 })).toBeInTheDocument()
    expect(route()).toBe(path)
    expect(screen.getByRole('link', { name: 'Ir al inicio de sesión' })).toHaveAttribute('href', '/login')
    // Configuración jurídica pendiente (D1): solo los documentos que la usan se anuncian como borrador (T-S15-01).
    if (path === '/legal/cookies') expect(screen.queryByRole('note', { name: 'Documento en borrador' })).not.toBeInTheDocument()
    else expect(screen.getByRole('note', { name: 'Documento en borrador' })).toBeInTheDocument()
  })

  it('los datos jurídicos pendientes se distinguen del texto (T-S15-01)', async () => {
    stubSession()
    const view = renderAt('/legal/privacidad')
    const owner = await screen.findByRole('region', { name: 'Responsable' })
    expect(within(owner).getAllByText('Pendiente de definir').every((node) => node.tagName === 'MARK')).toBe(true)
    expect(view.container.querySelectorAll('mark.legal-pending').length).toBeGreaterThan(3)
  })

  it('el índice marca la sección en lectura y se cierra con Esc (T-S15-01)', async () => {
    stubSession()
    // jsdom no calcula posiciones: las secciones quedan debajo del primer tercio de la ventana, salvo la primera.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return { top: this.id === 'objeto' ? 0 : 2000 } as DOMRect
    })
    const view = renderAt('/legal/terminos')
    await screen.findByRole('heading', { name: 'Términos y Condiciones', level: 2 })
    const toc = screen.getByRole('navigation', { name: 'En esta página' })
    expect(within(toc).getByRole('link', { name: 'Qué es la plataforma' })).toHaveAttribute('aria-current', 'location')
    const details = view.container.querySelector('details')!
    expect(details.querySelector('summary')).toHaveTextContent('Qué es la plataforma')
    details.setAttribute('open', '')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(details).not.toHaveAttribute('open')
    details.setAttribute('open', '')
    fireEvent.pointerDown(document.body)
    expect(details).not.toHaveAttribute('open')
  })

  it('el Aviso de Privacidad abre con el resumen por actor y describe la privacidad progresiva', async () => {
    stubSession()
    renderAt('/legal/privacidad')
    const summary = await screen.findByRole('region', { name: 'De un vistazo' })
    for (const actor of ['Instituciones', 'Empresas', 'Alumnos (sin cuenta)', 'Secretaría y Administración']) {
      expect(within(summary).getByText(actor)).toBeInTheDocument()
    }
    const progressive = screen.getByRole('region', { name: 'Privacidad progresiva del alumno' })
    expect(progressive).toHaveTextContent('La plataforma nunca entrega a la empresa la identidad del alumno')
    expect(screen.getByRole('region', { name: 'Medidas de seguridad' })).toHaveTextContent('nunca sus valores ni contraseñas')
  })

  it('la política de cookies niega rastreadores y lista las tecnologías reales', async () => {
    stubSession()
    renderAt('/legal/cookies')
    expect(await screen.findByText(/no usa cookies publicitarias, analítica ni rastreadores de terceros/)).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Cookies y almacenamiento del navegador' })
    for (const name of ['banco-de-talentos-session', 'XSRF-TOKEN', 'bt-theme', 'linkage-notifications-dismissed', 'table-memory', 'bt-unread', '/notifications-sw.js']) {
      expect(within(table).getByText(name)).toBeInTheDocument()
    }
  })

  it('cambia de documento y Volver regresa a la vista de origen, no al documento anterior', async () => {
    stubSession()
    renderAt('/login')
    const notice = await screen.findByText(/trata tus datos para administrar tu cuenta/)
    fireEvent.click(within(notice).getByRole('link', { name: 'Aviso de Privacidad' }))
    await screen.findByRole('heading', { name: 'Aviso de Privacidad Integral', level: 2 })

    fireEvent.click(within(legalNav()).getByRole('link', { name: 'Términos' }))
    await screen.findByRole('heading', { name: 'Términos y Condiciones', level: 2 })
    expect(within(legalNav()).getByRole('link', { name: 'Términos' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(within(legalNav()).getByRole('link', { name: 'Cookies' }))
    await screen.findByRole('heading', { name: 'Cookies y tecnologías técnicas', level: 2 })

    fireEvent.click(screen.getByRole('link', { name: 'Volver al inicio de sesión' }))
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(route()).toBe('/login')
  })

  it('con sesión, el regreso por defecto es el inicio y se ven los menús de la barra', async () => {
    stubSession(company)
    renderAt('/legal/terminos')
    expect(await screen.findByRole('button', { name: /Rosa Garza/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
  })

  it('un documento desconocido lleva al Aviso de Privacidad', async () => {
    stubSession()
    renderAt('/legal/otro')
    await screen.findByRole('heading', { name: 'Aviso de Privacidad Integral', level: 2 })
    expect(route()).toBe('/legal/privacidad')
  })

  it('el índice salta a cada sección sin cambiar la URL ni perder el regreso', async () => {
    stubSession()
    renderAt('/legal/privacidad')
    await screen.findByRole('heading', { name: 'Aviso de Privacidad Integral', level: 2 })
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const toc = screen.getByRole('navigation', { name: 'En esta página' })
    fireEvent.click(within(toc).getByRole('link', { name: 'Derechos ARCO y revocación' }))
    expect(scrollIntoView).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Derechos ARCO y revocación' })).toHaveFocus()
    expect(route()).toBe('/legal/privacidad')
  })
})

describe('footer HU-S15-03', () => {
  it('aparece sin sesión en el inicio de sesión y sus enlaces regresan a esa pantalla', async () => {
    stubSession()
    renderAt('/login')
    const footer = await screen.findByRole('contentinfo')
    expect(within(footer).getAllByRole('link').map((link) => link.textContent)).toEqual(['Aviso de Privacidad', 'Términos y Condiciones', 'Cookies'])
    fireEvent.click(within(footer).getByRole('link', { name: 'Cookies' }))
    await screen.findByRole('heading', { name: 'Cookies y tecnologías técnicas', level: 2 })
    expect(screen.getByRole('link', { name: 'Volver al inicio de sesión' })).toHaveAttribute('href', '/login')
  })
})

describe('aviso simplificado HU-S15-04', () => {
  it('el inicio de sesión enlaza el Aviso de Privacidad y los Términos', async () => {
    stubSession()
    renderAt('/login')
    const notice = await screen.findByText(/trata tus datos para administrar tu cuenta/)
    expect(within(notice).getByRole('link', { name: 'Aviso de Privacidad' })).toHaveAttribute('href', '/legal/privacidad')
    expect(within(notice).getByRole('link', { name: 'Términos y Condiciones' })).toHaveAttribute('href', '/legal/terminos')
    // Con el responsable pendiente, la pantalla no muestra el marcador como nombre.
    expect(notice).not.toHaveTextContent('Pendiente de definir')
  })
})
