import { useCallback, useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { listStudents, surnames } from './api'
import type { StudentStatusFilter } from './api'
import { studentMessages } from './messages'
import { StudentForm } from './StudentForm'
import { StudentStatus } from './StudentStatus'

/**
 * Padrón interno de la institución de la sesión (HU-S2-02), con búsqueda por matrícula o nombre, filtro por estado y
 * la columna «Acciones» de las demás tablas del sistema (HU-S8-01).
 */
export function StudentsPage() {
  // HU-S8-01: la búsqueda se aplica al enviarla; los filtros, al elegirlos. Todos vuelven a la página 1.
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  // T-S8-09: los filtros viven en la URL para que el aviso del inicio llegue filtrado y sobrevivan al volver del detalle.
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status')
  const status: StudentStatusFilter | '' = statusParam === 'active' || statusParam === 'inactive' ? statusParam : ''
  const missingData = searchParams.get('data') === 'missing'
  // La página pertenece a los filtros con los que se eligió: al cambiarlos vuelve a la 1 sin una consulta intermedia.
  const filters = `${status}|${missingData}`
  const [paging, setPaging] = useState({ filters, page: 1 })
  const page = paging.filters === filters ? paging.page : 1
  const setPage = (value: number) => setPaging({ filters, page: value })
  const load = useCallback((signal: AbortSignal) => listStudents({ page, q: query, status, missingData }, signal), [page, query, status, missingData])
  const { data, loading, failure, refresh } = useApiRequest(load, studentMessages)
  const navigate = useNavigate()
  const filtered = query !== '' || status !== '' || missingData

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setQuery(draft.trim())
  }

  function clearFilters() {
    setPage(1)
    setDraft('')
    setQuery('')
    setSearchParams({}, { replace: true })
  }

  function setFilter(name: 'status' | 'data', value: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(name, value)
      else next.delete(name)
      return next
    }, { replace: true })
  }

  // Toda la fila abre el detalle con el puntero; el enlace «Ver detalle» sigue siendo el control accesible (CA-04).
  function openRow(event: MouseEvent<HTMLTableRowElement>, href: string) {
    if (event.defaultPrevented || (event.target as HTMLElement).closest('a, button')) return
    if (window.getSelection()?.toString()) return
    void navigate(href)
  }
  // «Registrar alumno» del inicio abre directamente la hoja de alta.
  const location = useLocation()
  const [registering, setRegistering] = useState(() => {
    const state: unknown = location.state
    return typeof state === 'object' && state !== null && 'register' in state && state.register === true
  })
  const close = useCallback(() => setRegistering(false), [])

  const openButton = (label: string) => (
    <button type="button" onClick={() => setRegistering(true)}><PlusIcon />{label}</button>
  )

  return (
    <section className="card" aria-labelledby="students-title">
      <nav className="page-navigation" aria-label="Navegación de alumnos">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
      </nav>
      <h2 id="students-title">Alumnos</h2>
      <div className="page-toolbar">
        <p>Padrón interno de tu institución. Lo que registres aquí es la base de los perfiles que publicarás en el Banco de Talentos.</p>
        {openButton('Registrar alumno')}
      </div>
      <form className="table-search" role="search" aria-label="Buscar alumnos" onSubmit={search}>
        <div className="table-search-field">
          <label htmlFor="student-search">Buscar por matrícula o nombre</label>
          <input id="student-search" type="search" maxLength={100} value={draft} placeholder="Ej. A2026-001 o López García"
            onChange={(event) => setDraft(event.target.value)} />
        </div>
        <div className="table-search-filter">
          <label htmlFor="student-status-filter">Estado</label>
          <select id="student-status-filter" value={status}
            onChange={(event) => setFilter('status', event.target.value)}>
            <option value="">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
        <div className="table-search-filter">
          <label htmlFor="student-data-filter">Datos faltantes</label>
          <select id="student-data-filter" value={missingData ? 'missing' : ''}
            onChange={(event) => setFilter('data', event.target.value)}>
            <option value="">Todos</option>
            <option value="missing">Por completar</option>
          </select>
        </div>
        <button type="submit" className="secondary"><SearchIcon />Buscar</button>
      </form>
      {loading ? <LoadingState label="Cargando alumnos…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.total === 0
          ? filtered
            ? <StateMessage kind="empty" icon={<SearchIcon />} title="Ningún alumno coincide con la búsqueda."
              description={missingData ? 'No hay alumnos con datos faltantes que coincidan con los filtros.'
                : query ? `No hay alumnos cuya matrícula o nombre contenga «${query}» con el estado elegido.` : 'No hay alumnos con el estado elegido.'}
              action={<button type="button" className="secondary" onClick={clearFilters}>Limpiar filtros</button>} />
            : <StateMessage kind="empty" icon={<SearchIcon />} title="Aún no hay alumnos registrados."
              description="Registra a tus alumnos con su matrícula y nombre. Estos datos son de uso exclusivo de tu institución."
              action={openButton('Registrar el primer alumno')} />
        : data && (
          <>
            <div className="data-table-wrapper" role="region" aria-label="Padrón de alumnos" tabIndex={0}>
              <table className="data-table">
                <caption className="visually-hidden">Alumnos registrados</caption>
                <thead><tr><th scope="col">Matrícula</th><th scope="col">Apellidos</th><th scope="col">Nombre(s)</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
                <tbody>
                  {data.students.map((student) => {
                    const href = `/students/${student.id}`
                    return (
                      <tr key={student.id} data-href={href} onClick={(event) => openRow(event, href)}>
                        <td className="mono">{student.enrollment_number}</td>
                        <th scope="row">{surnames(student)}</th>
                        <td>{student.given_names}</td>
                        <td><StudentStatus active={student.is_active} /></td>
                        <td>
                          <Link className="pill-link" to={href} aria-label={`Ver detalle de ${surnames(student)}, ${student.given_names}`}>
                            Ver detalle<ChevronRightIcon />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <p>Página {data.page} de {data.lastPage} · {data.total} {data.total === 1 ? 'alumno' : 'alumnos'}</p>
              {data.lastPage > 1 && (
                <div className="actions">
                  <button type="button" className="secondary" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>
                    <ChevronLeftIcon />Anterior
                  </button>
                  <button type="button" className="secondary" disabled={data.page >= data.lastPage} onClick={() => setPage(data.page + 1)}>
                    Siguiente<ChevronRightIcon />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      <Sheet open={registering} onClose={close} labelledBy="student-form-title">
        <StudentForm onCreated={() => { void refresh() }}
          onCompleteProfile={(student) => { void navigate(`/students/${student.id}`, { state: { completeProfile: true } }) }} />
      </Sheet>
    </section>
  )
}
