import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { clearMunicipalityCache } from '../students/municipalities'

// HU-S14-03: perfil autogestionado de la empresa, onboarding /welcome, recordatorio del inicio y mínimo para operar (M1).
const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
let profile: Record<string, unknown>
const ALL_GAPS = ['name', 'contact_name', 'contact_email', 'legal_name', 'rfc', 'sector_code', 'location']
const companyUser = {
  id: 9, name: 'Lucía Herrera', email: 'lucia@manugolfo.test', role: 'COMPANY', institution: null,
  company: { id: 3, name: 'ManuGolfo', missing: ['sector_code'], onboarding: 'done', can_operate: true },
}
// M3: invitada sin nombre de la persona; la cuenta lleva el correo como nombre provisional.
const invitedUser = {
  id: 10, name: 'op@norteno.test', email: 'op@norteno.test', role: 'COMPANY', institution: null,
  company: { id: 4, name: null, missing: ALL_GAPS, onboarding: 'pending', can_operate: false },
}
const companyProfile = {
  type: 'company', name: 'ManuGolfo', legal_name: 'Manufacturas del Golfo, S.A. de C.V.', rfc: 'MGO150320AB1', sector_code: null, trade_name: 'ManuGolfo',
  state_code: '28', municipality_code: '28041', municipality: 'Victoria', contact_name: 'Lucía Herrera', contact_position: 'Recursos Humanos',
  contact_email: 'lucia@manugolfo.test', contact_phone: null, missing: ['sector_code'], can_operate: true,
}
const emptyProfile = {
  type: 'company', name: null, legal_name: null, rfc: null, sector_code: null, trade_name: null, state_code: null, municipality_code: null,
  municipality: null, contact_name: null, contact_position: null, contact_email: null, contact_phone: null, missing: ALL_GAPS, can_operate: false,
}
const institutionProfile = {
  type: 'institution', name: 'Universidad Tecnológica del Golfo', cct: '28EUT0001A', contact_name: 'Laura Méndez', contact_position: 'Coordinación Dual', contact_email: 'dual@ut.test', contact_phone: null,
}
const puts = () => apiMock.mock.calls.filter(([, init]) => init?.method === 'PUT')
const body = (index = 0) => JSON.parse(String(puts()[index][1]?.body)) as Record<string, unknown>

function Location() {
  const location = useLocation()
  return <output aria-label="Ruta actual">{location.pathname + location.hash}</output>
}
/** T-S14-03: la tarjeta abre en lectura; «Editar» la pasa al formulario en su sitio. */
function openEditor(section: HTMLElement) {
  fireEvent.click(within(section).getByRole('button', { name: 'Editar' }))
}
const renderApp = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)

beforeEach(() => {
  user = companyUser
  profile = companyProfile
  clearMunicipalityCache()
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/me') return Response.json({ user })
    if (typeof path === 'string' && path.endsWith('/unread-summary')) return Response.json({ data: { conversations: 0, items: [] } })
    if (path === '/api/dashboard' || (typeof path === 'string' && path.startsWith('/api/promotional-videos'))) return new Promise<Response>(() => undefined)
    if (path === '/api/organization/profile' && !init?.method) return Response.json({ data: profile })
    if (path === '/api/opportunities/defaults') return Response.json({ data: { state_code: null, municipality_code: null, municipality: null } })
    if (typeof path === 'string' && path.startsWith('/api/catalogs/')) return Response.json({ data: [{ code: '28041', name: 'Victoria' }, { code: '28032', name: 'Reynosa' }] })
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    return apiMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

/** T-S14-04: las confirmaciones salen en el aviso breve (Snackbar), fuera de las tarjetas. */
async function expectSnackbar(text: string) {
  const message = await screen.findByText(text)
  expect(message.closest('.snackbar')).toHaveAttribute('role', 'status')
}


describe('perfil de la empresa en Mi cuenta (CA-01, CA-06)', () => {
  it('edita todo el perfil, incluidos los datos fiscales y el sector, sin bloqueos ni confirmación', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...companyProfile, sector_code: '54', legal_name: 'Golfo Industrial, S.A.', missing: [] } }))
    renderApp('/account#organization')
    const section = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    expect(section).toHaveTextContent('6 de 7 datos')
    expect(within(section).getByLabelText('Razón social')).toHaveValue('Manufacturas del Golfo, S.A. de C.V.')
    expect(within(section).getByLabelText('RFC')).toHaveValue('MGO150320AB1')
    expect(within(section).queryByText('Folio u oficio de validación')).not.toBeInTheDocument()
    fireEvent.change(within(section).getByLabelText('Razón social'), { target: { value: 'Golfo Industrial, S.A.' } })
    fireEvent.change(within(section).getByLabelText('Sector económico (SCIAN)'), { target: { value: '54' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }))

    // Al guardar, la tarjeta vuelve a la ficha de lectura con una confirmación discreta.
    await expectSnackbar('Perfil actualizado.')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    // T-S14-09: el nombre del contacto no cambió, así que no viaja como nombre de la cuenta.
    expect(body()).toEqual({
      trade_name: 'ManuGolfo', legal_name: 'Golfo Industrial, S.A.', rfc: 'MGO150320AB1', sector_code: '54', state_code: '28', municipality_code: '28041',
      contact_name: 'Lucía Herrera', contact_position: 'Recursos Humanos', contact_email: 'lucia@manugolfo.test', contact_phone: null,
    })
    expect(section).toHaveTextContent('54 · Servicios profesionales, científicos y técnicos')
    // El sector sigue editable después de guardarlo.
    openEditor(section)
    expect(within(section).getByLabelText('Sector económico (SCIAN)')).toBeEnabled()
  })

  it('valida solo el formato de lo capturado y muestra los errores del servidor junto a su campo', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ message: 'Error', errors: { rfc: ['Ya existe una empresa registrada con ese RFC.'] } }, { status: 422 }))
    renderApp('/account')
    const section = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    openEditor(section)
    const rfc = within(section).getByLabelText('RFC')
    fireEvent.change(rfc, { target: { value: 'XAXX010101000' } })
    fireEvent.blur(rfc)
    fireEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }))
    expect(rfc).toHaveAccessibleDescription(/El RFC no es válido/)
    expect(puts()).toHaveLength(0)

    fireEvent.change(rfc, { target: { value: 'otr010101aa1' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(rfc).toHaveAccessibleDescription(/Ya existe una empresa registrada con ese RFC\./))
    expect(body().rfc).toBe('OTR010101AA1')
  })

  it('respeta el contacto vaciado: al volver no marca Soy yo ni vuelve a rellenar el nombre y el correo', async () => {
    const cleared = { ...companyProfile, contact_name: null, contact_email: null, missing: ['contact_name', 'contact_email', 'sector_code'], can_operate: false }
    apiMock.mockResolvedValueOnce(Response.json({ data: cleared }))
    const view = renderApp('/account')
    const section = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    openEditor(section)
    fireEvent.click(within(section).getByLabelText('Soy yo'))
    expect(within(section).getByLabelText(/Nombre del contacto/)).toHaveValue('')
    fireEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }))
    await expectSnackbar('Perfil actualizado.')
    expect(body()).toMatchObject({ contact_name: null, contact_email: null })
    openEditor(section)
    expect(within(section).getByLabelText('Soy yo')).not.toBeChecked()
    expect(within(section).getByLabelText(/Correo de contacto/)).toHaveValue('')
    view.unmount()

    // Al regresar a Mi cuenta, el contacto sigue vacío y la casilla sin marcar.
    profile = cleared
    renderApp('/account')
    const again = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    expect(within(again).getByRole('list', { name: 'Datos pendientes' })).toHaveTextContent('Nombre del contacto')
    openEditor(again)
    expect(within(again).getByLabelText('Soy yo')).not.toBeChecked()
    expect(within(again).getByLabelText(/Nombre del contacto/)).toHaveValue('')
    expect(within(again).getByLabelText(/Correo de contacto/)).toHaveValue('')
  })

  it('asigna el contacto a otra persona al desmarcar Soy yo, sin tocar el nombre de la cuenta', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...companyProfile, contact_name: 'Pedro Ruiz', contact_email: 'pedro@manugolfo.test' } }))
    renderApp('/account')
    const section = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    openEditor(section)
    expect(within(section).getByLabelText('Soy yo')).toBeChecked()
    fireEvent.click(within(section).getByLabelText('Soy yo'))
    const name = within(section).getByLabelText(/Nombre del contacto/)
    expect(name).toHaveValue('')
    fireEvent.change(name, { target: { value: 'Pedro Ruiz' } })
    fireEvent.change(within(section).getByLabelText(/Correo de contacto/), { target: { value: 'Pedro@ManuGolfo.test' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(body()).toMatchObject({ contact_name: 'Pedro Ruiz', contact_email: 'pedro@manugolfo.test' })
    expect(body()).not.toHaveProperty('account_name')
  })

  it('marca como guía lo necesario para operar: el nombre de la empresa y el nombre y correo del contacto', async () => {
    renderApp('/account')
    const section = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    openEditor(section)
    // El puesto y el teléfono son opcionales: la guía solo marca el nombre y el nombre y correo del contacto.
    expect(within(section).getAllByText('Necesario para operar')).toHaveLength(3)
    expect(within(section).getByLabelText('Puesto en la empresa (opcional)')).not.toBeRequired()
  })

  it('la institución conserva su alcance: solo su contacto, con el nombre oficial y la clave en solo lectura', async () => {
    user = { id: 2, name: 'Coordinación', email: 'dual@ut.test', role: 'INSTITUTION', institution: { id: 1, name: 'UT del Golfo' }, company: null }
    profile = institutionProfile
    apiMock.mockResolvedValueOnce(Response.json({ data: { ...institutionProfile, contact_phone: '8331234567' } }))
    renderApp('/account')
    const section = await screen.findByRole('region', { name: 'Perfil de la institución' })
    expect(section).toHaveTextContent('28EUT0001A')
    expect(section).toHaveTextContent('Los mantiene la Administración del Banco de Talentos.')
    openEditor(section)
    expect(within(section).queryByLabelText(/Razón social|RFC|Sector|Municipio|Soy yo/)).not.toBeInTheDocument()
    fireEvent.change(within(section).getByLabelText('Teléfono de contacto (opcional)'), { target: { value: '8331234567' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(body()).toEqual({ contact_name: 'Laura Méndez', contact_position: 'Coordinación Dual', contact_email: 'dual@ut.test', contact_phone: '8331234567' })
  })

  it('no se muestra a ADMIN', async () => {
    user = { id: 1, name: 'Administración', email: 'admin@bt.test', role: 'ADMIN', institution: null, company: null }
    renderApp('/account')
    await screen.findByRole('region', { name: 'Tu perfil' })
    expect(screen.queryByRole('region', { name: /Perfil de la/ })).not.toBeInTheDocument()
  })
})

describe('onboarding /welcome (CA-02, CA-03)', () => {
  beforeEach(() => {
    user = invitedUser
    profile = emptyProfile
  })

  it('lleva del inicio al onboarding pendiente con Soy yo marcado, el correo de la cuenta y sin el nombre provisional', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Completa el perfil de tu empresa' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/welcome')
    const form = (await screen.findByRole('button', { name: 'Guardar y continuar' })).closest('form') as HTMLElement
    expect(within(form).getByLabelText('Soy yo')).toBeChecked()
    expect(within(form).getByLabelText(/Tu nombre/)).toHaveValue('')
    expect(within(form).getByLabelText(/Tu nombre/)).toHaveAccessibleDescription('También corrige el nombre de tu cuenta.')
    expect(within(form).getByLabelText(/Correo de contacto/)).toHaveValue('op@norteno.test')
    // Guardado parcial real: ningún campo es obligatorio.
    expect(form.querySelectorAll('[required]')).toHaveLength(0)
  })

  it('guarda en parcial, corrige el nombre de la cuenta y sigue al inicio con el recordatorio', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: {
      ...emptyProfile, name: 'Taller Norteño', trade_name: 'Taller Norteño', contact_name: 'Rosa Garza', contact_email: 'op@norteno.test',
      missing: ['legal_name', 'rfc', 'sector_code', 'location'], can_operate: true,
    } }))
    renderApp('/welcome')
    const form = (await screen.findByRole('button', { name: 'Guardar y continuar' })).closest('form') as HTMLElement
    fireEvent.change(within(form).getByLabelText(/Nombre comercial/), { target: { value: 'Taller Norteño' } })
    fireEvent.change(within(form).getByLabelText(/Tu nombre/), { target: { value: 'Rosa Garza' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar y continuar' }))

    // Con el nombre y el correo de la cuenta ya cubre el mínimo: el recordatorio solo pide el resto.
    const reminder = await screen.findByRole('link', { name: /Tu perfil está casi listo: faltan 4 datos\./ })
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent(/^\/$/)
    expect(body()).toMatchObject({ trade_name: 'Taller Norteño', contact_name: 'Rosa Garza', contact_email: 'op@norteno.test', account_name: 'Rosa Garza', rfc: null })
    expect(reminder).toHaveAttribute('href', '/account#organization')
    expect(screen.getByRole('heading', { name: 'Hola, Rosa Garza' })).toBeInTheDocument()
    // Sin bucles: el inicio ya no regresa al onboarding.
    expect(screen.queryByRole('heading', { name: 'Completa el perfil de tu empresa' })).not.toBeInTheDocument()
  })

  it('pospone con Completar más tarde y sigue al inicio sin guardar datos', async () => {
    apiMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    renderApp('/welcome')
    fireEvent.click(await screen.findByRole('button', { name: 'Completar más tarde' }))
    const reminder = await screen.findByRole('link', { name: /Completa tu perfil para publicar oportunidades y enviar solicitudes\./ })
    expect(apiMock.mock.calls.map(([path, init]) => [path, init?.method])).toEqual([['/api/organization/profile/postpone', 'POST']])
    expect(reminder).toHaveAttribute('href', '/account#organization')
    // T-S14-01: el inicio no enumera lo que falta; ese detalle está en Mi cuenta.
    expect(reminder).not.toHaveTextContent(/Razón social|RFC|Falta/)
  })

  it('no intercepta los enlaces directos mientras el onboarding está pendiente', async () => {
    renderApp('/account')
    expect(await screen.findByRole('region', { name: 'Perfil de la empresa' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/account')
  })

  it('con el onboarding terminado, /welcome lleva al inicio', async () => {
    user = { ...invitedUser, company: { ...invitedUser.company, onboarding: 'done' } }
    renderApp('/welcome')
    expect(await screen.findByRole('heading', { name: 'Hola, op@norteno.test' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent(/^\/$/)
  })
})

describe('recordatorio y mínimo para operar (CA-04, CA-05)', () => {
  it('con el mínimo cubierto, el inicio muestra un recordatorio discreto de una línea hacia el perfil (T-S14-01)', async () => {
    renderApp('/')
    const reminder = await screen.findByRole('link', { name: /Tu perfil está casi listo: falta 1 dato\./ })
    expect(reminder).toHaveAttribute('href', '/account#organization')
    expect(reminder).toHaveTextContent('Completar')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('en Mi cuenta muestra el avance, los datos pendientes y cuáles son necesarios para operar (T-S14-01)', async () => {
    user = { ...invitedUser, company: { ...invitedUser.company, onboarding: 'done' } }
    profile = emptyProfile
    renderApp('/account#organization')
    const section = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    expect(section).toHaveTextContent('0 de 7 datos')
    expect(section).toHaveTextContent('Completa los datos marcados para publicar oportunidades y enviar solicitudes.')
    const pending = within(section).getByRole('list', { name: 'Datos pendientes' })
    expect(within(pending).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Nombre de la empresa (necesario para operar)', 'Nombre del contacto (necesario para operar)', 'Correo del contacto (necesario para operar)',
      'Razón social', 'RFC', 'Sector económico', 'Ubicación',
    ])
  })

  it('con el perfil completo, Mi cuenta solo lo confirma', async () => {
    profile = { ...companyProfile, sector_code: '54', missing: [] }
    renderApp('/account')
    const section = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    // T-S14-03: la insignia lo dice; la ficha no repite el bloque de avance.
    expect(section).toHaveTextContent('Perfil completo')
    expect(within(section).queryByRole('list', { name: 'Datos pendientes' })).not.toBeInTheDocument()
  })

  it('con el perfil completo no hay recordatorio', async () => {
    user = { ...companyUser, company: { ...companyUser.company, missing: [] } }
    renderApp('/')
    await screen.findByRole('heading', { name: 'Hola, Lucía Herrera' })
    expect(screen.queryByRole('link', { name: /Tu perfil|Completa tu perfil/ })).not.toBeInTheDocument()
  })

  it('sin el mínimo, el alta de oportunidades explica qué falta en lugar del formulario', async () => {
    user = { ...invitedUser, company: { ...invitedUser.company, onboarding: 'done' } }
    renderApp('/opportunities/new')
    const notice = await screen.findByRole('note', { name: 'Perfil de la empresa incompleto' })
    expect(within(notice).getByRole('link', { name: /Completar perfil/ })).toHaveAttribute('href', '/account#organization')
    expect(screen.queryByRole('button', { name: 'Registrar oportunidad' })).not.toBeInTheDocument()
  })

  it('al completar el mínimo en Mi cuenta, la sesión habilita publicar sin volver a cargarse', async () => {
    user = { ...invitedUser, company: { ...invitedUser.company, onboarding: 'done' } }
    profile = emptyProfile
    apiMock.mockResolvedValueOnce(Response.json({ data: {
      ...emptyProfile, name: 'Taller Norteño', trade_name: 'Taller Norteño', contact_name: 'Rosa Garza', contact_position: 'Dirección', contact_email: 'op@norteno.test',
      missing: ['legal_name', 'rfc', 'sector_code', 'location'], can_operate: true,
    } }))
    renderApp('/account#organization')
    const section = await screen.findByRole('region', { name: 'Perfil de la empresa' })
    fireEvent.change(within(section).getByLabelText(/Nombre comercial/), { target: { value: 'Taller Norteño' } })
    // En Mi cuenta un contacto vacío no se precarga: la empresa elige Soy yo para usar sus datos.
    fireEvent.click(within(section).getByLabelText('Soy yo'))
    fireEvent.change(within(section).getByLabelText(/Tu nombre/), { target: { value: 'Rosa Garza' } })
    fireEvent.change(within(section).getByLabelText('Puesto en la empresa (opcional)'), { target: { value: 'Dirección' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }))
    await expectSnackbar('Perfil actualizado.')
    // Nombre de la cuenta y de la empresa en la tarjeta de identidad, sin recargar la sesión.
    const identity = screen.getByRole('region', { name: 'Tu perfil' })
    expect(within(identity).getByRole('heading', { level: 2, name: 'Rosa Garza' })).toBeInTheDocument()
    expect(identity).toHaveTextContent('Empresa · Taller Norteño')
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/me')).toHaveLength(1)
  })
})
