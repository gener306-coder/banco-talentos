import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { listStudents, surnames } from './api'
import { studentMessages } from './messages'
import { StudentForm } from './StudentForm'
import { StudentStatus } from './StudentStatus'

/** Padrón interno de la institución de la sesión (HU-S2-02). */
export function StudentsPage() {
  const [page, setPage] = useState(1)
  const load = useCallback((signal: AbortSignal) => listStudents(page, signal), [page])
  const { data, loading, failure, refresh } = useApiRequest(load, studentMessages)
  const [registering, setRegistering] = useState(false)
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
      {loading ? <LoadingState label="Cargando alumnos…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.total === 0
          ? <StateMessage kind="empty" icon={<SearchIcon />} title="Aún no hay alumnos registrados."
            description="Registra a tus alumnos con su matrícula y nombre. Estos datos son de uso exclusivo de tu institución."
            action={openButton('Registrar el primer alumno')} />
        : data && (
          <>
            <div className="data-table-wrapper" role="region" aria-label="Padrón de alumnos" tabIndex={0}>
              <table className="data-table">
                <caption className="visually-hidden">Alumnos registrados</caption>
                <thead><tr><th scope="col">Matrícula</th><th scope="col">Apellidos</th><th scope="col">Nombre(s)</th><th scope="col">Estado</th></tr></thead>
                <tbody>
                  {data.students.map((student) => (
                    <tr key={student.id}>
                      <td className="mono">{student.enrollment_number}</td>
                      <th scope="row"><Link to={`/students/${student.id}`}>{surnames(student)}</Link></th>
                      <td>{student.given_names}</td>
                      <td><StudentStatus active={student.is_active} /></td>
                    </tr>
                  ))}
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
        <StudentForm onCreated={() => { void refresh() }} />
      </Sheet>
    </section>
  )
}
