import { PlacesStatus } from '../opportunities/PlacesStatus'
import { useCallback } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { NO_SECTOR, NOT_CAPTURED, sectorName } from '../companies/catalogs'
import { InstitutionRequestError, InstitutionStatus } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { SkillTags } from '../opportunities/OpportunityLayout'
import { fullName } from '../students/api'
import { minimumPeriodLabel, periodLabel, stateName } from '../students/catalogs'
import { languageName, levelLabel } from '../students/cvCatalogs'
import { StudentStatus } from '../students/StudentStatus'
import { backState, useBackLink, useContextualBack } from '../ui/backLink'
import { Callout } from '../ui/Callout'
import { EmailMenu } from '../ui/EmailMenu'
import { ChevronRightIcon, MessageIcon } from '../ui/icons'
import { LoadingState } from '../ui/StateMessage'
import { getReceivedLinkage, institutionLinkageMessages, terminateReceivedLinkage } from './institutionApi'
import type { ReceivedLinkageDetail } from './institutionApi'
import { InstitutionLinkageLayout } from './InstitutionLinkageRequestsPage'
import { LinkageDecisionSection } from './LinkageDecisionSection'
import { LinkageTerminationSection } from './LinkageTermination'
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
  const chatPath = `/institution/linkage-requests/${data.id}/chat`
  // T-S13-07: si se llegó desde la conversación, «Volver a la conversación» ya lleva a ella; no se repite el botón.
  const fromChat = useContextualBack()?.to === chatPath

  return (
    <>
      <dl className="student-identity">
        <dt>Estado de la solicitud</dt><dd><LinkageStatus status={data.status} /></dd>
        <dt>Recibida</dt><dd>{dateFormat.format(new Date(data.created_at))}</dd>
      </dl>
      {/* HU-S13-06 y T-S13-14: el mensaje de la empresa y la respuesta se leen en la conversación, que mientras siga
          pendiente muestra solo el mensaje de la empresa. */}
      {!fromChat && (
        <p>
          <Link className="institution-button" to={chatPath} state={toRequest}>
            <MessageIcon />Abrir conversación
          </Link>
        </p>
      )}

      <section className="student-section" aria-labelledby="linkage-student-title">
        <h3 id="linkage-student-title">Alumno solicitado</h3>
        {/* HU-S15-04: con la vinculación aceptada (o dada de baja después), la institución pudo compartir datos por la
            conversación; la nota ya no afirma que la empresa no conoce al alumno (Aviso de Privacidad, privacidad progresiva). */}
        <p className="privacy-note">
          {data.status === 'ACEPTADA' || data.status === 'BAJA'
            ? 'La plataforma no muestra la identidad del alumno a la empresa. Si hace falta para coordinar la vinculación, comparte por la conversación solo los datos necesarios y con el consentimiento del alumno.'
            : 'La identidad del alumno es de uso exclusivo de tu institución; la empresa no la conoce.'}
        </p>
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
          <dt>Lugares</dt><dd><PlacesStatus opportunity={opportunity} /></dd>
          <dt>Carrera o programa requerido</dt><dd>{opportunity.program}</dd>
          <dt>Periodo mínimo</dt><dd>{minimumPeriodLabel(opportunity.period_number)}, semestre o cuatrimestre</dd>
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
        <p>Una vez aceptada la solicitud, coordina la vinculación en la conversación de esta página o con este contacto.</p>
        <dl className="student-identity">
          <dt>Razón social</dt><dd>{company.legal_name ?? NOT_CAPTURED}</dd>
          {company.trade_name && <><dt>Nombre comercial</dt><dd>{company.trade_name}</dd></>}
          <dt>Sector</dt><dd>{company.sector_code ? sectorName(company.sector_code) : NO_SECTOR}</dd>
          <dt>Ubicación</dt><dd>{company.state_code ? [company.municipality, stateName(company.state_code)].filter(Boolean).join(', ') : NOT_CAPTURED}</dd>
          <dt>Contacto</dt><dd>{company.contact_name ?? NOT_CAPTURED}</dd>
          {company.contact_position && <><dt>Puesto o departamento</dt><dd>{company.contact_position}</dd></>}
          {/* T-S12-06: el correo queda visible y seleccionable; su ícono ofrece copiarlo, webmail o la app del sistema. */}
          <dt>Correo</dt><dd>{company.contact_email
            ? <span className="cell-meta">{company.contact_email}<span className="cell-actions"><EmailMenu email={company.contact_email} /></span></span>
            : NOT_CAPTURED}</dd>
          <dt>Teléfono</dt><dd>{company.contact_phone ? <a href={`tel:${company.contact_phone.replace(/[^\d+]/g, '')}`}>{company.contact_phone}</a> : 'Sin teléfono'}</dd>
        </dl>
      </section>

      <LinkageDecisionSection data={data} onDecided={onDecided} refresh={refresh} />
      {/* T-S14-13: la institución da de baja una vinculación aceptada de su alumno (libera el lugar). */}
      <LinkageTerminationSection viewer="INSTITUTION" status={data.status} termination={data.termination} messages={institutionLinkageMessages}
        submit={(reason) => terminateReceivedLinkage(data.id, reason)} onTerminated={onDecided} />
    </>
  )
}

function InstitutionLinkageRequestDetail({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => getReceivedLinkage(id, signal), [id])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, institutionLinkageMessages)
  // T-S12-05: regresa a la bandeja con el filtro y la página de origen.
  const back = useBackLink({ to: '/institution/linkage-requests', label: 'Volver a solicitudes' })

  return (
    <InstitutionLinkageLayout title="Detalle de solicitud" back={back}>
      {loading ? <LoadingState label="Cargando solicitud…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page notFoundTitle="No encontramos esta solicitud" />
        : data && <div className="content-enter"><Detail data={data} onDecided={setData} refresh={refresh} /></div>}
    </InstitutionLinkageLayout>
  )
}

/** Detalle de una solicitud recibida (HU-S6-01 CA-05, CA-06) y su respuesta (HU-S6-02 CA-05). */
export function InstitutionLinkageRequestDetailPage() {
  const { id = '' } = useParams()
  return <InstitutionLinkageRequestDetail key={id} id={id} />
}
