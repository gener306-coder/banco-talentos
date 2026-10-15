import { useCallback, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ChevronLeftIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { LoadingState } from '../ui/StateMessage'
import { fullName, getStudent, setStudentStatus } from './api'
import { studentMessages } from './messages'
import { StudentForm } from './StudentForm'
import { StudentProfileForm } from './StudentProfileForm'
import { StudentStatus } from './StudentStatus'

/** Detalle de un alumno propio: identidad interna y expediente público (HU-S2-03) y su estado (HU-S2-04). */
function StudentDetailView({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => getStudent(id, signal), [id])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, studentMessages)
  const [notice, setNotice] = useState<string | null>(null)
  const [correcting, setCorrecting] = useState(false)
  const close = useCallback(() => setCorrecting(false), [])
  // Cada apertura de la hoja parte de la identidad guardada, sin cambios a medias de la vez anterior.
  const [openings, setOpenings] = useState(0)
  const mutation = useApiMutation(studentMessages)
  const statusButton = useRef<HTMLButtonElement>(null)
  const [confirming, setConfirming] = useState(false)
  // El aviso del estado va junto a su botón, al final de la vista; el de identidad, arriba.
  const [statusNotice, setStatusNotice] = useState<string | null>(null)

  // Inactivar oculta al alumno del Banco de Talentos: se confirma. Reactivar no tiene consecuencias que confirmar.
  function requestStatusChange() {
    if (!data || mutation.pending) return
    if (data.is_active) setConfirming(true)
    else void changeStatus()
  }

  async function changeStatus() {
    setConfirming(false)
    if (!data || mutation.pending) return
    setNotice(null)
    setStatusNotice(null)
    await mutation.submit(() => setStudentStatus(data.id, !data.is_active), (updated) => {
      setData(updated)
      setStatusNotice(updated.is_active ? 'Alumno reactivado correctamente.' : 'Alumno inactivado correctamente.')
    })
  }

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
                <button type="button" className="secondary" onClick={() => { setNotice(null); setStatusNotice(null); setOpenings((count) => count + 1); setCorrecting(true) }}>Corregir identidad</button>
              </div>
            </section>

            <section className="student-section" aria-labelledby="student-profile-title">
              <h3 id="student-profile-title">Expediente público</h3>
              <p>Es la información con la que las empresas podrán encontrar a este alumno en el Banco de Talentos, sin conocer su identidad.</p>
              <StudentProfileForm student={data} onSaved={(student) => { setNotice(null); setStatusNotice(null); setData(student) }} />
            </section>

            <section className="student-section" aria-labelledby="student-status-title">
              <h3 id="student-status-title">Estado en el Banco de Talentos</h3>
              {mutation.failure && <InstitutionRequestError failure={mutation.failure} />}
              <dl className="student-identity">
                <dt>Estado</dt><dd><StudentStatus active={data.is_active} /></dd>
              </dl>
              <p>{data.is_active
                ? 'El alumno es visible para las empresas en el Banco de Talentos.'
                : 'El alumno está oculto del Banco de Talentos. Su expediente se conserva y puedes seguir editándolo.'}</p>
              <div className="actions" aria-busy={mutation.pending}>
                <button type="button" ref={statusButton} className={data.is_active ? 'secondary' : undefined}
                  disabled={mutation.pending} onClick={requestStatusChange}>
                  {mutation.pending ? 'Guardando estado…' : data.is_active ? 'Inactivar alumno' : 'Reactivar alumno'}
                </button>
              </div>
              {statusNotice && <p className="institution-success" role="status">{statusNotice}</p>}
            </section>

            <Sheet open={correcting} onClose={close} labelledBy="student-form-title">
              <StudentForm key={openings} student={data} onUpdated={(student) => { setData(student); setNotice('Identidad actualizada correctamente.'); setCorrecting(false) }} />
            </Sheet>
          </>
        )}
      <ConfirmDialog open={confirming} origin={statusButton}
        title="¿Inactivar al alumno?"
        description="Dejará de aparecer en el Banco de Talentos. Su expediente se conserva y podrás reactivarlo después."
        confirmLabel="Inactivar" onConfirm={() => { void changeStatus() }} onCancel={() => setConfirming(false)} />
    </section>
  )
}

export function StudentDetailPage() {
  const { id = '' } = useParams()
  return <StudentDetailView key={id} id={id} />
}
