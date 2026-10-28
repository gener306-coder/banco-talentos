import { useCallback, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { InstitutionRequestError, InstitutionStatus } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { periodLabel, stateName } from '../students/catalogs'
import { languageName, levelLabel } from '../students/cvCatalogs'
import { ChevronLeftIcon } from '../ui/icons'
import { LoadingState } from '../ui/StateMessage'
import { getOpportunity, opportunityMessages } from './api'
import { OpportunityLayout, SkillTags } from './OpportunityLayout'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

function OpportunityDetail({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => getOpportunity(id, signal), [id])
  const { data, loading, failure, refresh } = useApiRequest(load, opportunityMessages)
  const location = useLocation()
  const [notice] = useState<string | null>(() => {
    const state: unknown = location.state
    return state && typeof state === 'object' && 'notice' in state && typeof state.notice === 'string' ? state.notice : null
  })

  return (
    <OpportunityLayout title="Detalle de oportunidad">
      {loading ? <LoadingState label="Cargando oportunidad…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page notFoundTitle="No encontramos esta oportunidad" />
        : data && (
          <>
            {notice && <p className="institution-success" role="status">{notice}</p>}
            <dl className="opportunity-details">
              <dt>Título</dt><dd>{data.title}</dd>
              <dt>Actividades y objetivos</dt><dd className="opportunity-description">{data.description}</dd>
              <dt>Lugares disponibles</dt><dd>{data.vacancies}</dd>
              <dt>Carrera o programa requerido</dt><dd>{data.program}</dd>
              <dt>Periodo mínimo</dt><dd>{periodLabel(data.period_type, data.period_number)} o posterior</dd>
              <dt>Idioma</dt>
              <dd>{data.language_code && data.min_level ? `${languageName(data.language_code)}, ${levelLabel(data.min_level)} o superior` : 'Sin idioma requerido'}</dd>
              <dt>Habilidades requeridas</dt>
              <dd>{data.skills.length ? <SkillTags skills={data.skills} label="Habilidades requeridas" /> : 'Sin habilidades específicas'}</dd>
              <dt>Lugar</dt><dd>{data.municipality ?? data.municipality_code}, {stateName(data.state_code)}</dd>
              <dt>Reubicación</dt><dd>{data.can_relocate ? 'Requiere que el alumno se reubique' : 'No requiere reubicarse'}</dd>
              <dt>Registrada por</dt><dd>{data.created_by.name}, el {dateFormat.format(new Date(data.created_at))}</dd>
              <dt>Estado</dt><dd><InstitutionStatus active={data.is_active} /></dd>
            </dl>
            <div className="actions">
              <Link className="institution-button secondary" to={`/opportunities/${data.id}/edit`}>Editar oportunidad</Link>
            </div>
          </>
        )}
      <p className="institution-back"><Link className="plain" to="/opportunities"><ChevronLeftIcon />Volver a oportunidades</Link></p>
    </OpportunityLayout>
  )
}

export function OpportunityDetailPage() {
  const { id = '' } = useParams()
  return <OpportunityDetail key={id} id={id} />
}
