import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const institutionUser = { id: 5, name: 'Coordinación', email: 'coord@example.test', role: 'INSTITUTION', institution: { id: 7, name: 'Instituto Dual' } }
const fetchMock = vi.fn<typeof fetch>()
const apiMock = vi.fn<typeof fetch>()
let user: Record<string, unknown>
const meta = (total: number, page = 1, last = 1) => ({ current_page: page, last_page: last, total })
const row = (id: number, enrollment: string, given: string, first: string, second: string | null = null) =>
  ({ id, enrollment_number: enrollment, given_names: given, first_surname: first, second_surname: second, is_active: true, created_at: '2026-10-13T12:00:00Z' })

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}
function renderApp(path = '/students') {
  return render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)
}
function writes() {
  return apiMock.mock.calls.filter(([, options]) => options?.method === 'POST')
}
async function openForm(name = 'Registrar alumno') {
  fireEvent.click(await screen.findByRole('button', { name }))
  return screen.getByRole('dialog', { name: 'Registrar alumno' })
}
function fill(dialog: HTMLElement, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) fireEvent.change(within(dialog).getByLabelText(label), { target: { value } })
}

beforeEach(() => {
  user = institutionUser
  apiMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (path, options) => {
    if (path === '/api/me') return Response.json({ user })
    if (path === '/sanctum/csrf-cookie') {
      document.cookie = 'XSRF-TOKEN=csrf; Path=/'
      return new Response(null, { status: 204 })
    }
    return apiMock(path, options)
  })
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('padrón de alumnos HU-S2-02', () => {
  it('muestra el padrón de la institución con apellidos primero', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: [row(1, 'A-001', 'María Fernanda', 'López', 'García'), row(2, 'A-002', 'Luis', 'Pérez')], meta: meta(2) }))
    renderApp()
    const table = await screen.findByRole('table', { name: 'Alumnos registrados' })
    const first = within(table).getByRole('row', { name: /López García/ })
    expect(within(first).getByText('A-001')).toBeInTheDocument()
    expect(within(first).getByText('María Fernanda')).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 1 · 2 alumnos')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Siguiente/ })).not.toBeInTheDocument()
    expect(apiMock.mock.calls[0][0]).toBe('/api/students?page=1')
  })

  it('muestra el estado de cada alumno sin ocultar a los inactivos (HU-S2-04)', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: [row(1, 'A-001', 'Ana', 'Ruiz'), { ...row(2, 'A-002', 'Luis', 'Báez'), is_active: false }], meta: meta(2) }))
    renderApp()
    const table = await screen.findByRole('table', { name: 'Alumnos registrados' })
    expect(within(table).getByRole('columnheader', { name: 'Estado' })).toBeInTheDocument()
    expect(within(within(table).getByRole('row', { name: /Ruiz/ })).getByText('ACTIVO')).toBeInTheDocument()
    expect(within(within(table).getByRole('row', { name: /Báez/ })).getByText('INACTIVO')).toBeInTheDocument()
  })

  it('pagina el padrón con Anterior y Siguiente', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: [row(1, 'A-001', 'Ana', 'Ruiz')], meta: meta(51, 1, 2) }))
      .mockResolvedValueOnce(Response.json({ data: [row(51, 'A-051', 'Zoe', 'Zamora')], meta: meta(51, 2, 2) }))
    renderApp()
    expect(await screen.findByRole('button', { name: /Anterior/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))
    expect(await screen.findByText('A-051')).toBeInTheDocument()
    expect(screen.getByText('Página 2 de 2 · 51 alumnos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Siguiente/ })).toBeDisabled()
    expect(apiMock.mock.calls[1][0]).toBe('/api/students?page=2')
  })

  it('ofrece registrar el primer alumno desde el padrón vacío', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: [], meta: meta(0) }))
    renderApp()
    const heading = await screen.findByRole('heading', { name: 'Aún no hay alumnos registrados.' })
    fireEvent.click(within(heading.closest<HTMLElement>('[role="status"]')!).getByRole('button', { name: 'Registrar el primer alumno' }))
    expect(screen.getByRole('dialog', { name: 'Registrar alumno' })).toBeInTheDocument()
  })

  it('presenta el fallo de carga con reintento', async () => {
    apiMock.mockResolvedValueOnce(new Response(null, { status: 500 })).mockResolvedValueOnce(Response.json({ data: [], meta: meta(0) }))
    renderApp()
    fireEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'Aún no hay alumnos registrados.' })).toBeInTheDocument()
  })

  it('registra un alumno sin enviar la institución, actualiza el padrón y queda listo para el siguiente', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: [], meta: meta(0) }))
      .mockResolvedValueOnce(Response.json({ data: row(9, 'A-009', 'Eva', 'Báez', 'Soto') }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ data: [row(9, 'A-009', 'Eva', 'Báez', 'Soto')], meta: meta(1) }))
    renderApp()
    const dialog = await openForm()
    expect(within(dialog).getByLabelText('Matrícula o control interno')).toHaveAccessibleDescription(/uso exclusivo de tu institución/)
    fill(dialog, { 'Matrícula o control interno': ' A-009 ', 'Nombre(s)': 'Eva', 'Primer apellido': 'Báez', 'Segundo apellido (opcional)': 'Soto' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar alumno' }))
    expect(await within(dialog).findByText('Alumno registrado: Eva Báez Soto. Puedes registrar el siguiente.')).toHaveAttribute('role', 'status')
    expect(JSON.parse(writes()[0][1]?.body as string)).toEqual({ enrollment_number: 'A-009', given_names: 'Eva', first_surname: 'Báez', second_surname: 'Soto' })
    expect(within(dialog).getByLabelText('Matrícula o control interno')).toHaveValue('')
    expect(within(dialog).getByLabelText('Matrícula o control interno')).toHaveFocus()
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(3))
    expect(await screen.findByText('A-009')).toBeInTheDocument()
  })

  it('valida los campos obligatorios y el formato de la matrícula sin enviar', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: [], meta: meta(0) }))
    renderApp()
    const dialog = await openForm()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar alumno' }))
    expect(within(dialog).getByLabelText('Matrícula o control interno')).toHaveAccessibleDescription(/La matrícula es obligatoria/)
    expect(within(dialog).getByLabelText('Nombre(s)')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByLabelText('Primer apellido')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByLabelText('Segundo apellido (opcional)')).not.toHaveAttribute('aria-invalid', 'true')
    const enrollment = within(dialog).getByLabelText('Matrícula o control interno')
    fireEvent.change(enrollment, { target: { value: 'A 001' } })
    fireEvent.blur(enrollment)
    expect(enrollment).toHaveAccessibleDescription(/sin espacios/)
    expect(writes()).toHaveLength(0)
  })

  it('muestra la matrícula duplicada junto a su campo y conserva lo escrito', async () => {
    apiMock.mockResolvedValueOnce(Response.json({ data: [], meta: meta(0) }))
      .mockResolvedValueOnce(Response.json({ errors: { enrollment_number: ['Ya existe un alumno con esa matrícula en tu institución.'] } }, { status: 422 }))
    renderApp()
    const dialog = await openForm()
    fill(dialog, { 'Matrícula o control interno': 'A-001', 'Nombre(s)': 'Ana', 'Primer apellido': 'Ruiz' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar alumno' }))
    expect(await within(dialog).findByText('Ya existe un alumno con esa matrícula en tu institución.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Matrícula o control interno')).toHaveValue('A-001')
    expect(within(dialog).queryByText(/Alumno registrado/)).not.toBeInTheDocument()
  })

  it('impide un envío duplicado mientras espera al servidor', async () => {
    let resolve!: (response: Response) => void
    apiMock.mockResolvedValueOnce(Response.json({ data: [], meta: meta(0) }))
      .mockReturnValueOnce(new Promise<Response>((done) => { resolve = done }))
      .mockResolvedValue(Response.json({ data: [], meta: meta(0) }))
    renderApp()
    const dialog = await openForm()
    fill(dialog, { 'Matrícula o control interno': 'A-001', 'Nombre(s)': 'Ana', 'Primer apellido': 'Ruiz' })
    const submit = within(dialog).getByRole('button', { name: 'Registrar alumno' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(within(dialog).getByRole('button', { name: 'Registrando alumno…' })).toBeDisabled()
    await act(async () => { resolve(Response.json({ data: row(1, 'A-001', 'Ana', 'Ruiz') }, { status: 201 })) })
    expect(await within(dialog).findByText(/Alumno registrado/)).toBeInTheDocument()
  })

  it.each(['ADMIN', 'COMPANY', 'SECRETARY'])('impide al rol %s abrir el padrón', async (role) => {
    user = { ...institutionUser, role, institution: null }
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso para acceder al padrón de alumnos.')
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('ofrece el padrón desde la sesión solo a una cuenta institucional vinculada', async () => {
    renderApp('/')
    fireEvent.click(await screen.findByRole('link', { name: 'Alumnos' }))
    expect(screen.getByLabelText('Ruta actual').textContent).toBe('/students')
  })

  it.each([['ADMIN', null], ['INSTITUTION', null]])('no ofrece el padrón a %s sin institución vinculada', async (role, institution) => {
    user = { ...institutionUser, role, institution }
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Sesión iniciada' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Alumnos' })).not.toBeInTheDocument()
  })
})
