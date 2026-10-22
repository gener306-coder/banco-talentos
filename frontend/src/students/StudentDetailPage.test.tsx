import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { clearMunicipalityCache } from './municipalities'

const institutionUser = { id: 5, name: 'Coordinación', email: 'coord@example.test', role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
// El seguro facultativo (HU-S3-02) se carga aparte; sus rutas no consumen las respuestas de apiMock.
const securityMock = vi.fn<typeof fetch>()
// El catálogo de municipios (HU-S4-04) tampoco consume las respuestas de apiMock.
const catalogMock = vi.fn<typeof fetch>()
const municipalitiesOf: Record<string, { code: string; name: string }[]> = {
  '28': [{ code: '28022', name: 'Matamoros' }, { code: '28032', name: 'Reynosa' }, { code: '28041', name: 'Victoria' }],
  '09': [{ code: '09003', name: 'Coyoacán' }, { code: '09015', name: 'Cuauhtémoc' }],
}
let user: Record<string, unknown>
const emptyProfile = { program: null, period_type: null, period_number: null, dual_available: null, state_code: null, municipality_code: null, municipality: null, pending_municipality: null, can_relocate: null }
const savedInput = { program: 'Ingeniería en Sistemas', period_type: 'semester', period_number: 6, dual_available: true, state_code: '28', municipality_code: '28041', can_relocate: false }
const savedProfile = { ...savedInput, municipality: 'Victoria', pending_municipality: null }
const detail = (profile: Record<string, unknown> = emptyProfile, identity: Record<string, unknown> = {}) => ({
  data: { id: 3, enrollment_number: 'A-001', given_names: 'María Fernanda', first_surname: 'López', second_surname: 'García', is_active: true, created_at: '2026-10-13T12:00:00Z', ...identity, profile },
})

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}
function renderApp(path = '/students/3') {
  return render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)
}
function writes() {
  return apiMock.mock.calls.filter(([, options]) => options?.method === 'PUT')
}
async function profileForm() {
  await screen.findByRole('heading', { name: 'Expediente público' })
  return screen.getByRole('region', { name: 'Expediente público' })
}
/** Escribe en el selector de municipio y elige la opción de la lista. */
async function chooseMunicipality(form: HTMLElement, search: string, option: string) {
  const input = await waitFor(() => {
    const element = within(form).getByRole('combobox', { name: 'Municipio' })
    expect(element).toBeEnabled()
    return element
  })
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: search } })
  fireEvent.mouseDown(await within(form).findByRole('option', { name: option }))
}
async function fillProfile(form: HTMLElement) {
  fireEvent.change(within(form).getByLabelText('Carrera o programa educativo'), { target: { value: '  Ingeniería en Sistemas ' } })
  fireEvent.change(within(form).getByLabelText('Tipo de periodo'), { target: { value: 'semester' } })
  fireEvent.change(within(form).getByLabelText('Periodo actual'), { target: { value: '6' } })
  fireEvent.click(within(form).getByLabelText('Disponible'))
  fireEvent.change(within(form).getByLabelText('Estado'), { target: { value: '28' } })
  await chooseMunicipality(form, 'vict', 'Victoria')
  fireEvent.click(within(within(form).getByRole('group', { name: 'Disponibilidad para reubicarse' })).getByLabelText('No'))
}

beforeEach(() => {
  user = institutionUser
  apiMock.mockReset()
  securityMock.mockReset()
  securityMock.mockImplementation(async () => Response.json({ data: { nss: null, document: null } }))
  clearMunicipalityCache()
  catalogMock.mockReset()
  catalogMock.mockImplementation(async (path) => Response.json({ data: municipalitiesOf[String(path).split('/')[4]] ?? [] }))
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/api/me') return Response.json({ user })
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    if (typeof path === 'string' && path.includes('/social-security')) return securityMock(path, options)
    if (typeof path === 'string' && path.startsWith('/api/catalogs/')) return catalogMock(path, options)
    return apiMock(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
})
afterEach(() => vi.unstubAllGlobals())

describe('expediente del alumno HU-S2-03', () => {
  it('abre el detalle desde el padrón y muestra la identidad como uso interno (CA-01)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: [detail().data], meta: { current_page: 1, last_page: 1, total: 1 } }))
      .mockResolvedValueOnce(Response.json(detail()))
    renderApp('/students')
    fireEvent.click(await screen.findByRole('link', { name: 'López García' }))
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/students/3')
    expect(await screen.findByRole('heading', { level: 2, name: 'María Fernanda López García' })).toBeInTheDocument()
    const identity = screen.getByRole('region', { name: 'Identidad (uso interno)' })
    expect(within(identity).getByText('A-001')).toBeInTheDocument()
    expect(within(identity).getByText(/no se mostrarán a las empresas/)).toBeInTheDocument()
    expect(apiMock.mock.calls[1][0]).toBe('/api/students/3')
  })

  it('guarda el expediente académico, geográfico y de movilidad (CA-02 a CA-04)', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail())).mockResolvedValueOnce(Response.json(detail(savedProfile)))
    renderApp()
    const form = await profileForm()
    expect(within(form).getByLabelText('Estado').querySelectorAll('option')).toHaveLength(33)
    await fillProfile(form)
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar expediente' }))
    expect(await within(form).findByText('Expediente guardado correctamente.')).toHaveAttribute('role', 'status')
    expect(writes()[0][0]).toBe('/api/students/3/profile')
    fireEvent.change(within(form).getByLabelText('Municipio'), { target: { value: 'Matamoros' } })
    expect(within(form).queryByText('Expediente guardado correctamente.')).not.toBeInTheDocument()
    expect(JSON.parse(writes()[0][1]?.body as string)).toEqual(savedInput)
  })

  it('carga el expediente guardado en el formulario', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail({ ...savedProfile, period_type: 'four_month', dual_available: false, can_relocate: true })))
    renderApp()
    const form = await profileForm()
    expect(within(form).getByLabelText('Carrera o programa educativo')).toHaveValue('Ingeniería en Sistemas')
    expect(within(form).getByLabelText('Tipo de periodo')).toHaveValue('four_month')
    expect(within(form).getByLabelText('Periodo actual')).toHaveValue('6')
    expect(within(form).getByLabelText('No disponible')).toBeChecked()
    expect(within(form).getByLabelText('Estado')).toHaveDisplayValue('Tamaulipas')
    expect(within(form).getByRole('combobox', { name: 'Municipio' })).toHaveValue('Victoria')
    expect(within(within(form).getByRole('group', { name: 'Disponibilidad para reubicarse' })).getByLabelText('Sí')).toBeChecked()
  })

  it('valida todos los campos del expediente sin enviar (CA-06)', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail()))
    renderApp()
    const form = await profileForm()
    fireEvent.change(within(form).getByLabelText('Carrera o programa educativo'), { target: { value: '   ' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar expediente' }))
    expect(within(form).getByLabelText('Carrera o programa educativo')).toHaveAccessibleDescription('La carrera o programa educativo es obligatorio.')
    expect(within(form).getByLabelText('Tipo de periodo')).toHaveAttribute('aria-invalid', 'true')
    expect(within(form).getByLabelText('Periodo actual')).toHaveAttribute('aria-invalid', 'true')
    expect(within(form).getByLabelText('Estado')).toHaveAccessibleDescription('El estado es obligatorio.')
    expect(within(form).getByLabelText('Municipio')).toHaveAttribute('aria-invalid', 'true')
    expect(within(form).getByRole('group', { name: 'Disponibilidad para el programa dual' })).toHaveAccessibleDescription('Indica la disponibilidad para el programa dual.')
    expect(within(form).getByRole('group', { name: 'Disponibilidad para reubicarse' })).toHaveAccessibleDescription('Indica si puede reubicarse.')
    expect(writes()).toHaveLength(0)
  })

  it('muestra los errores del servidor junto a su campo', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail()))
      .mockResolvedValueOnce(Response.json({ errors: { state_code: ['El estado no es válido.'] } }, { status: 422 }))
    renderApp()
    const form = await profileForm()
    await fillProfile(form)
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar expediente' }))
    await waitFor(() => expect(within(form).getByLabelText('Estado')).toHaveAccessibleDescription('El estado no es válido.'))
    expect(screen.queryByText('Expediente guardado correctamente.')).not.toBeInTheDocument()
  })

  it('impide un envío duplicado del expediente', async () => {
    let resolve: (response: Response) => void = () => undefined
    apiMock.mockResolvedValueOnce(Response.json(detail()))
      .mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    renderApp()
    const form = await profileForm()
    await fillProfile(form)
    const submit = within(form).getByRole('button', { name: 'Guardar expediente' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(within(form).getByRole('button', { name: 'Guardando expediente…' })).toBeDisabled()
    await act(async () => { resolve(Response.json(detail(savedProfile))) })
    expect(await screen.findByText('Expediente guardado correctamente.')).toBeInTheDocument()
  })

  it('corrige la matrícula y el nombre en una hoja (CA-07)', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail(savedProfile)))
      .mockResolvedValueOnce(Response.json(detail(savedProfile, { enrollment_number: 'A-101', first_surname: 'Lopez', second_surname: null })))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Corregir identidad' }))
    const dialog = screen.getByRole('dialog', { name: 'Corregir identidad' })
    expect(within(dialog).getByLabelText('Matrícula o control interno')).toHaveValue('A-001')
    fireEvent.change(within(dialog).getByLabelText('Matrícula o control interno'), { target: { value: 'A-101' } })
    fireEvent.change(within(dialog).getByLabelText('Primer apellido'), { target: { value: 'Lopez' } })
    fireEvent.change(within(dialog).getByLabelText('Segundo apellido (opcional)'), { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar identidad' }))
    expect(await screen.findByText('Identidad actualizada correctamente.')).toBeInTheDocument()
    expect(writes()[0][0]).toBe('/api/students/3/identity')
    expect(JSON.parse(writes()[0][1]?.body as string)).toEqual({ enrollment_number: 'A-101', given_names: 'María Fernanda', first_surname: 'Lopez', second_surname: null })
    expect(screen.getByRole('heading', { level: 2, name: 'María Fernanda Lopez' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Corregir identidad' })).not.toBeInTheDocument())
  })

  it('muestra la matrícula duplicada en la corrección sin cerrar la hoja', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail()))
      .mockResolvedValueOnce(Response.json({ errors: { enrollment_number: ['Ya existe un alumno con esa matrícula en tu institución.'] } }, { status: 422 }))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Corregir identidad' }))
    const dialog = screen.getByRole('dialog', { name: 'Corregir identidad' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar identidad' }))
    expect(await within(dialog).findByText('Ya existe un alumno con esa matrícula en tu institución.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'María Fernanda López García' })).toBeInTheDocument()
  })

  it('trata un alumno ajeno o inexistente como no encontrado (CA-05)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ message: 'El alumno no existe.' }, { status: 404 }))
    renderApp('/students/99')
    expect(await screen.findByText('El alumno no existe.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Expediente público' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it.each(['ADMIN', 'COMPANY', 'SECRETARY'])('impide al rol %s abrir el detalle', async (role) => {
    user = { ...institutionUser, role, institution: null }
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument()
    expect(apiMock).not.toHaveBeenCalled()
  })
})

describe('baja lógica del alumno HU-S2-04', () => {
  const patches = () => apiMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')
  const inactive = () => detail(savedProfile, { is_active: false })

  it('muestra el estado ACTIVO por defecto (CA-01)', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail()))
    renderApp()
    const section = await screen.findByRole('region', { name: 'Estado en el Banco de Talentos' })
    expect(within(section).getByText('ACTIVO')).toBeInTheDocument()
    expect(within(section).getByText(/visible para las empresas/)).toBeInTheDocument()
  })

  it('inactiva al alumno tras confirmar y conserva el expediente (CA-02)', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail(savedProfile))).mockResolvedValueOnce(Response.json(inactive()))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Inactivar alumno' }))
    const confirm = screen.getByRole('alertdialog', { name: '¿Inactivar al alumno?' })
    expect(confirm).toHaveAccessibleDescription(/Su expediente se conserva/)
    expect(within(confirm).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    expect(patches()).toHaveLength(0)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Inactivar' }))
    const section = screen.getByRole('region', { name: 'Estado en el Banco de Talentos' })
    expect(await within(section).findByRole('status')).toHaveTextContent('Alumno inactivado correctamente.')
    expect(patches()[0][0]).toBe('/api/students/3/status')
    expect(JSON.parse(patches()[0][1]?.body as string)).toEqual({ is_active: false })
    expect(within(section).getByText('INACTIVO')).toBeInTheDocument()
    expect(within(section).getByText(/puedes seguir editándolo/)).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Carrera o programa educativo')).toHaveValue('Ingeniería en Sistemas')
    expect(screen.getByRole('button', { name: 'Guardar expediente' })).toBeEnabled()
  })

  it('no cambia nada si se cancela la confirmación', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail()))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Inactivar alumno' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(patches()).toHaveLength(0)
    expect(within(screen.getByRole('region', { name: 'Estado en el Banco de Talentos' })).getByText('ACTIVO')).toBeInTheDocument()
  })

  it('reactiva sin confirmación', async () => {
    apiMock.mockResolvedValueOnce(Response.json(inactive())).mockResolvedValueOnce(Response.json(detail(savedProfile)))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Reactivar alumno' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Alumno reactivado correctamente.')).toBeInTheDocument()
    expect(JSON.parse(patches()[0][1]?.body as string)).toEqual({ is_active: true })
    expect(screen.getByRole('button', { name: 'Inactivar alumno' })).toBeInTheDocument()
  })

  it('bloquea el botón mientras espera y no repite el envío', async () => {
    let resolve!: (response: Response) => void
    apiMock.mockResolvedValueOnce(Response.json(inactive())).mockReturnValueOnce(new Promise<Response>((done) => { resolve = done }))
    renderApp()
    const button = await screen.findByRole('button', { name: 'Reactivar alumno' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(screen.getByRole('button', { name: 'Guardando estado…' })).toBeDisabled()
    await act(async () => { resolve(Response.json(detail(savedProfile))) })
    expect(await screen.findByText('Alumno reactivado correctamente.')).toBeInTheDocument()
  })

  it('informa un fallo del servidor sin cambiar el estado mostrado', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail())).mockResolvedValueOnce(Response.json({ message: 'El alumno no existe.' }, { status: 404 }))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Inactivar alumno' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Inactivar' }))
    const section = screen.getByRole('region', { name: 'Estado en el Banco de Talentos' })
    expect(await within(section).findByText('El alumno no existe.')).toBeInTheDocument()
    expect(within(section).getByText('ACTIVO')).toBeInTheDocument()
    expect(screen.queryByText('Alumno inactivado correctamente.')).not.toBeInTheDocument()
  })
})

describe('municipio del catálogo INEGI HU-S4-04', () => {
  const pendingProfile = { ...savedProfile, municipality_code: null, municipality: null, pending_municipality: 'Cd. Victoria' }

  it('deshabilita el municipio hasta elegir el estado (CA-08)', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail()))
    renderApp()
    const form = await profileForm()
    const input = within(form).getByRole('combobox', { name: 'Municipio' })
    expect(input).toBeDisabled()
    expect(input).toHaveAccessibleDescription('Elige primero el estado.')
    expect(catalogMock).not.toHaveBeenCalled()
  })

  it('filtra sin distinguir acentos ni mayúsculas y envía la clave INEGI (CA-08)', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail({ ...savedProfile, state_code: '09', municipality_code: '09003', municipality: 'Coyoacán' })))
      .mockResolvedValueOnce(Response.json(detail({ ...savedProfile, state_code: '09', municipality_code: '09015', municipality: 'Cuauhtémoc' })))
    renderApp()
    const form = await profileForm()
    const input = await within(form).findByRole('combobox', { name: 'Municipio' })
    expect(input).toHaveValue('Coyoacán')
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'CUAUHTEMOC' } })
    expect(await within(form).findByRole('option', { name: 'Cuauhtémoc' })).toBeInTheDocument()
    expect(within(form).queryByRole('option', { name: 'Coyoacán' })).not.toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('Cuauhtémoc')
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar expediente' }))
    await within(form).findByText('Expediente guardado correctamente.')
    expect(JSON.parse(writes()[0][1]?.body as string)).toMatchObject({ state_code: '09', municipality_code: '09015' })
    expect(catalogMock.mock.calls[0][0]).toBe('/api/catalogs/states/09/municipalities')
  })

  it('limpia el municipio al cambiar de estado y carga los del nuevo estado (CA-08)', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail(savedProfile)))
    renderApp()
    const form = await profileForm()
    expect(await within(form).findByRole('combobox', { name: 'Municipio' })).toHaveValue('Victoria')
    fireEvent.change(within(form).getByLabelText('Estado'), { target: { value: '09' } })
    const input = within(form).getByRole('combobox', { name: 'Municipio' })
    expect(input).toHaveValue('')
    await waitFor(() => expect(catalogMock.mock.calls.map(([path]) => path)).toContain('/api/catalogs/states/09/municipalities'))
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar expediente' }))
    expect(within(form).getByRole('combobox', { name: 'Municipio' })).toHaveAccessibleDescription(/El municipio es obligatorio\./)
    expect(writes()).toHaveLength(0)
  })

  it('exige elegir de la lista un nombre que no coincide con ningún municipio', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail(savedProfile)))
    renderApp()
    const form = await profileForm()
    const input = await within(form).findByRole('combobox', { name: 'Municipio' })
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: 'Ciudad Inventada' } })
    expect(within(form).getByText('Ningún municipio coincide con la búsqueda.')).toBeInTheDocument()
    fireEvent.blur(input)
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar expediente' }))
    expect(input).toHaveAccessibleDescription(/Elige un municipio de la lista\./)
    expect(writes()).toHaveLength(0)
  })

  it('acepta un nombre escrito completo al salir del campo si coincide con un solo municipio', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail(savedProfile))).mockResolvedValueOnce(Response.json(detail(savedProfile)))
    renderApp()
    const form = await profileForm()
    const input = await within(form).findByRole('combobox', { name: 'Municipio' })
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: '  reynosa ' } })
    fireEvent.blur(input)
    expect(input).toHaveValue('Reynosa')
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar expediente' }))
    await within(form).findByText('Expediente guardado correctamente.')
    expect(JSON.parse(writes()[0][1]?.body as string)).toMatchObject({ municipality_code: '28032' })
  })

  it('avisa del municipio por confirmar hasta que se elige del catálogo y se guarda (CA-06)', async () => {
    apiMock.mockResolvedValueOnce(Response.json(detail(pendingProfile))).mockResolvedValueOnce(Response.json(detail(savedProfile)))
    renderApp()
    const form = await profileForm()
    expect(within(form).getByText('Municipio por confirmar: «Cd. Victoria». Elígelo del catálogo y guarda el expediente.')).toBeInTheDocument()
    expect(within(form).getByRole('combobox', { name: 'Municipio' })).toHaveValue('')
    await chooseMunicipality(form, 'victoria', 'Victoria')
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar expediente' }))
    await within(form).findByText('Expediente guardado correctamente.')
    expect(within(form).queryByText(/Municipio por confirmar/)).not.toBeInTheDocument()
  })

  it('permite reintentar si el catálogo no se pudo cargar', async () => {
    catalogMock.mockResolvedValueOnce(new Response(null, { status: 500 }))
    apiMock.mockResolvedValueOnce(Response.json(detail(savedProfile)))
    renderApp()
    const form = await profileForm()
    expect(await within(form).findByRole('alert')).toHaveTextContent('No se pudieron cargar los municipios.')
    expect(within(form).getByRole('combobox', { name: 'Municipio' })).toBeDisabled()
    fireEvent.click(within(form).getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(within(form).getByRole('combobox', { name: 'Municipio' })).toBeEnabled())
    expect(within(form).queryByRole('alert')).not.toBeInTheDocument()
  })
})
