import { useCallback } from 'react'
import { Link, useParams } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { ChevronLeftIcon, LockIcon } from '../ui/icons'
import { LoadingState } from '../ui/StateMessage'
import { fullName, getStudent } from './api'
import { getCv } from './cv'
import type { StudentCv } from './cv'
import { CvCertificationsSection } from './CvCertificationsSection'
import { CvHeadlineSection } from './CvHeadlineSection'
import { CvLanguagesSection } from './CvLanguagesSection'
import { CvLinksSection } from './CvLinksSection'
import { CvProjectsSection } from './CvProjectsSection'
import { CvSkillsSection } from './CvSkillsSection'
import { studentMessages } from './messages'

/**
 * CV normalizado de un alumno propio (HU-S3-01): el mismo formato para cualquier disciplina.
 * Cada sección se guarda por separado; los enlaces y las credenciales son protegidos (CA-02).
 */
function StudentCvView({ id }: { id: string }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const [student, cv] = await Promise.all([getStudent(id, signal), getCv(id, signal)])
    return { student, cv }
  }, [id])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, studentMessages)
  const saved = useCallback((cv: StudentCv) => setData((current) => current && { ...current, cv }), [setData])

  return (
    <section className="card" aria-labelledby="student-cv-title">
      <nav className="page-navigation" aria-label="Navegación del CV">
        <Link className="plain" to={`/students/${encodeURIComponent(id)}`} aria-label="Volver al alumno"><ChevronLeftIcon />Alumno</Link>
      </nav>
      {loading ? <><h2 id="student-cv-title">CV profesional</h2><LoadingState label="Cargando CV…" variant="details" /></>
        : failure ? <><h2 id="student-cv-title">CV profesional</h2><InstitutionRequestError failure={failure} retry={refresh} page /></>
        : data && (
          <>
            <p className="eyebrow">CV profesional</p>
            <h2 id="student-cv-title">{fullName(data.student)}</h2>
            <p className="cv-intro">
              Un formato común para comparar talento de cualquier carrera. Las empresas verán el titular, las habilidades,
              los idiomas, las certificaciones y los proyectos sin conocer la identidad del alumno; lo marcado con
              <LockIcon /><span className="visually-hidden">candado</span> es protegido.
            </p>
            <CvHeadlineSection studentId={data.student.id} cv={data.cv} onSaved={saved} />
            <CvSkillsSection studentId={data.student.id} cv={data.cv} onSaved={saved} />
            <CvLanguagesSection studentId={data.student.id} cv={data.cv} onSaved={saved} />
            <CvCertificationsSection studentId={data.student.id} cv={data.cv} onSaved={saved} />
            <CvProjectsSection studentId={data.student.id} cv={data.cv} onSaved={saved} />
            <CvLinksSection studentId={data.student.id} cv={data.cv} onSaved={saved} />
          </>
        )}
    </section>
  )
}

export function StudentCvPage() {
  const { id = '' } = useParams()
  return <StudentCvView key={id} id={id} />
}
