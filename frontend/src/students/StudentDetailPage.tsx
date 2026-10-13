import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { ChevronLeftIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { LoadingState } from '../ui/StateMessage'
import { fullName, getStudent } from './api'
import { studentMessages } from './messages'
import { StudentForm } from './StudentForm'
import { StudentProfileForm } from './StudentProfileForm'

/** Detalle de un alumno propio: identidad interna y expediente público (HU-S2-03). */
function StudentDetailView({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => getStudent(id, signal), [id])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, studentMessages)
  const [notice, setNotice] = useState<string | null>(null)
  const [correcting, setCorrecting] = useState(false)
  const close = useCallback(() => setCorrecting(false), [])
  // Cada apertura de la hoja parte de la identidad guardada, sin cambios a medias de la vez anterior.
  const [openings, setOpenings] = useState(0)


  return (
    <section className="card" aria-labelledby="student-title">
      <nav className="page-navigation" aria-label="Navegación de alumnos">
        <Link className="plain" to="/students" aria-label="Volver a alumnos"><ChevronLeftIcon />Alumnos</Link>
      </nav>
      {loading ? <><h2 id="student-title">Alumno</h2><LoadingState label="Cargando alumno…" variant="details" /></>
        : failure ? <><h2 id="student-title">Alumno</h2><InstitutionRequestError failure={failure} retry={refresh} page /></>
        : data && (
          <>
            <h2 id="student-title">{fullName(data)}</h2>
            {notice && <p className="institution-success" role="status">{notice}</p>}

            <section className="student-section" aria-labelledby="student-identity-title">
              <h3 id="student-identity-title">Identidad (uso interno)</h3>
              <p className="privacy-note">La matrícula y el nombre son de uso exclusivo de tu institución y no se mostrarán a las empresas.</p>
              <dl className="student-identity">
                <dt>Matrícula o control interno</dt><dd className="mono">{data.enrollment_number}</dd>
                <dt>Nombre completo</dt><dd>{fullName(data)}</dd>
              </dl>
              <div className="actions">
                <button type="button" className="secondary" onClick={() => { setNotice(null); setOpenings((count) => count + 1); setCorrecting(true) }}>Corregir identidad</button>
              </div>
            </section>

            <section className="student-section" aria-labelledby="student-profile-title">
              <h3 id="student-profile-title">Expediente público</h3>
              <p>Es la información con la que las empresas podrán encontrar a este alumno en el Banco de Talentos, sin conocer su identidad.</p>
              <StudentProfileForm student={data} onSaved={(student) => { setNotice(null); setData(student) }} />
            </section>

            <Sheet open={correcting} onClose={close} labelledBy="student-form-title">
              <StudentForm key={openings} student={data} onUpdated={(student) => { setData(student); setNotice('Identidad actualizada correctamente.'); setCorrecting(false) }} />
            </Sheet>
          </>
        )}
    </section>
  )
}

export function StudentDetailPage() {
  const { id = '' } = useParams()
  return <StudentDetailView key={id} id={id} />
}
