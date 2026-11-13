import { useCallback } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { sectorName } from '../companies/catalogs'
import { InstitutionRequestError, InstitutionStatus } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { SkillTags } from '../opportunities/OpportunityLayout'
import { fullName } from '../students/api'
import { periodLabel, stateName } from '../students/catalogs'
import { languageName, levelLabel } from '../students/cvCatalogs'
import { StudentStatus } from '../students/StudentStatus'
import { backState } from '../ui/backLink'
import { Callout } from '../ui/Callout'
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons'
import { LoadingState } from '../ui/StateMessage'
import { getReceivedLinkage, institutionLinkageMessages } from './institutionApi'
import type { ReceivedLinkageDetail } from './institutionApi'
import { InstitutionLinkageLayout } from './InstitutionLinkageRequestsPage'
import { LinkageDecisionSection } from './LinkageDecisionSection'
import { LinkageStatus } from './LinkageStatus'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

/** Tipo de seguro para mostrar: sin datos capturados todavía no se sabe si es IMSS (T-S8-07). */
function insuranceLabel({ insurance_type, insurer_name, has_number, has_document }: ReceivedLinkageDetail['student']['social_security']): string {
  if (insurance_type === 'OTHER') return `Otro seguro: ${insurer_name ?? 'sin aseguradora'}`
  return has_number || has_document ? 'IMSS' : 'Sin capturar'
}

function Detail({ data, onDecided, refresh }: {
  data: ReceivedLinkageDetail
  onDecided: (updated: ReceivedLinkageDetail) => void
  refresh: () => Promise<void>
}) {
  const { student, opportunity, company } = data
  const { has_number: hasNumber, has_document: hasDocument } = student.social_security
  const studentPath = `/students/${student.id}`
  // T-S12-04: el expediente regresa a esta solicitud, no al padrón.
  const toRequest = backState('Volver a la solicitud', useLocation())

  return (
    <>
      <dl className="student-identity">
        <dt>Estado de la solicitud</dt><dd><LinkageStatus status={data.status} /></dd>
        <dt>Recibida</dt><dd>{dateFormat.format(new Date(data.created_at))}</dd>
        <dt>Mensaje de la empresa</dt><dd className="opportunity-description">{data.message ?? 'Sin mensaje'}</dd>
      </dl>

      <section className="student-section" aria-labelledby="linkage-student-title">
        <h3 id="linkage-student-title">Alumno solicitado</h3>
        <p className="privacy-note">La identidad del alumno es de uso exclusivo de tu institución; la empresa no la conoce.</p>
        <dl className="student-identity">
          <dt>Nombre completo</dt><dd>{fullName(student)}</dd>
          <dt>Matrícula o control interno</dt><dd className="mono">{student.enrollment_number}</dd>
          <dt>Carrera o programa</dt><dd>{student.program ?? 'Sin capturar'}</dd>
          <dt>Periodo actual</dt><dd>{student.period_type && student.period_number ? periodLabel(student.period_type, student.period_number) : 'Sin capturar'}</dd>
          <dt>Ubicación</dt><dd>{student.state_code ? [student.municipality, stateName(student.state_code)].filter(Boolean).join(', ') : 'Sin capturar'}</dd>
          <dt>Estado en el Banco de Talentos</dt><dd><StudentStatus active={student.is_active} /></dd>
        </dl>
        <p><Link className="pill-link" to={studentPath} state={toRequest}>Ver expediente del alumno<ChevronRightIcon /></Link></p>
      </section>

      <section className="student-section" aria-labelledby="linkage-security-title">
        <h3 id="linkage-security-title">Seguro del alumno</h3>
        <dl className="student-identity">
          <dt>Tipo de seguro</dt><dd>{insuranceLabel(student.social_security)}</dd>
          <dt>Número del seguro</dt><dd>{hasNumber ? 'Capturado' : 'Sin capturar'}</dd>
          <dt>Comprobante de vigencia</dt><dd>{hasDocument ? 'Cargado' : 'Sin cargar'}</dd>
        </dl>
        {!hasNumber && !hasDocument && (
          <Callout tone="pending"
            action={<Link className="pill-link" to={studentPath} state={toRequest}>Completar expediente<ChevronRightIcon /></Link>}>
            <p>Al alumno le falta el número del seguro o el comprobante de vigencia. Complétalo en su expediente antes de coordinar la vinculación.</p>
          </Callout>
        )}
      </section>

      <section className="student-section" aria-labelledby="linkage-opportunity-title">
        <h3 id="linkage-opportunity-title">Oportunidad</h3>
        <dl className="student-identity">
          <dt>Título</dt><dd>{opportunity.title}</dd>
          <dt>Actividades y objetivos</dt><dd className="opportunity-description">{opportunity.description}</dd>
          <dt>Lugares disponibles</dt><dd>{opportunity.vacancies}</dd>
          <dt>Carrera o programa requerido</dt><dd>{opportunity.program}</dd>
          <dt>Periodo mínimo</dt><dd>{periodLabel(opportunity.period_type, opportunity.period_number)} o posterior</dd>
          <dt>Idioma</dt>
          <dd>{opportunity.language_code && opportunity.min_level ? `${languageName(opportunity.language_code)}, ${levelLabel(opportunity.min_level)} o superior` : 'Sin idioma requerido'}</dd>
          <dt>Habilidades requeridas</dt>
          <dd>{opportunity.skills.length ? <SkillTags skills={opportunity.skills} label="Habilidades requeridas" /> : 'Sin habilidades específicas'}</dd>
          <dt>Lugar</dt><dd>{[opportunity.municipality, stateName(opportunity.state_code)].filter(Boolean).join(', ')}</dd>
          <dt>Reubicación</dt><dd>{opportunity.can_relocate ? 'Requiere que el alumno se reubique' : 'No requiere reubicarse'}</dd>
          <dt>Estado</dt><dd><InstitutionStatus active={opportunity.is_active} /></dd>
        </dl>
      </section>

      <section className="student-section" aria-labelledby="linkage-company-title">
        <h3 id="linkage-company-title">Empresa y contacto del programa dual</h3>
        <p>La coordinación de la vinculación ocurre fuera de la plataforma con este contacto.</p>
        <dl className="student-identity">
          <dt>Razón social</dt><dd>{company.legal_name}</dd>
          {company.trade_name && <><dt>Nombre comercial</dt><dd>{company.trade_name}</dd></>}
          <dt>Sector</dt><dd>{sectorName(company.sector_code)}</dd>
          <dt>Ubicación</dt><dd>{[company.municipality, stateName(company.state_code)].filter(Boolean).join(', ')}</dd>
          <dt>Contacto</dt><dd>{company.contact_name}</dd>
          {company.contact_position && <><dt>Puesto o departamento</dt><dd>{company.contact_position}</dd></>}
          <dt>Correo</dt><dd><a href={`mailto:${company.contact_email}`} target="_blank" rel="noopener noreferrer">{company.contact_email}</a></dd>
          <dt>Teléfono</dt><dd>{company.contact_phone ? <a href={`tel:${company.contact_phone.replace(/[^\d+]/g, '')}`}>{company.contact_phone}</a> : 'Sin teléfono'}</dd>
        </dl>
      </section>

      <LinkageDecisionSection data={data} onDecided={onDecided} refresh={refresh} />
    </>
  )
}

function InstitutionLinkageRequestDetail({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => getReceivedLinkage(id, signal), [id])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, institutionLinkageMessages)

  return (
    <InstitutionLinkageLayout title="Detalle de solicitud">
      {loading ? <LoadingState label="Cargando solicitud…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page notFoundTitle="No encontramos esta solicitud" />
        : data && <Detail data={data} onDecided={setData} refresh={refresh} />}
      <p className="institution-back"><Link className="plain" to="/institution/linkage-requests"><ChevronLeftIcon />Volver a solicitudes</Link></p>
    </InstitutionLinkageLayout>
  )
}

/** Detalle de una solicitud recibida (HU-S6-01 CA-05, CA-06) y su respuesta (HU-S6-02 CA-05). */
export function InstitutionLinkageRequestDetailPage() {
  const { id = '' } = useParams()
  return <InstitutionLinkageRequestDetail key={id} id={id} />
}
