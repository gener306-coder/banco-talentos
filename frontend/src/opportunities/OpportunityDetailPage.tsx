import { useCallback, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { InstitutionRequestError, InstitutionStatus } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { periodLabel, stateName } from '../students/catalogs'
import { languageName, levelLabel } from '../students/cvCatalogs'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ChevronLeftIcon } from '../ui/icons'
import { LoadingState } from '../ui/StateMessage'
import { getOpportunity, opportunityMessages, setOpportunityStatus } from './api'
import { OpportunityLayout, SkillTags } from './OpportunityLayout'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

function OpportunityDetail({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => getOpportunity(id, signal), [id])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, opportunityMessages)
  const mutation = useApiMutation(opportunityMessages)
  const location = useLocation()
  const [notice] = useState<string | null>(() => {
    const state: unknown = location.state
    return state && typeof state === 'object' && 'notice' in state && typeof state.notice === 'string' ? state.notice : null
  })
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const statusButton = useRef<HTMLButtonElement>(null)
  const [confirming, setConfirming] = useState(false)

  // HU-S5-03 CA-04: inactivar se confirma; reactivar no tiene consecuencias que confirmar.
  function requestStatusChange() {
    if (!data || mutation.pending) return
    if (data.is_active) setConfirming(true)
    else void changeStatus()
  }

  async function changeStatus() {
    setConfirming(false)
    if (!data || mutation.pending) return
    setStatusNotice(null)
    await mutation.submit(() => setOpportunityStatus(id, !data.is_active), (updated) => {
      setData(updated)
      setStatusNotice(updated.is_active ? 'Oportunidad reactivada correctamente.' : 'Oportunidad inactivada correctamente.')
    })
  }

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

            <section className="opportunity-status" aria-labelledby="opportunity-status-title">
              <h3 id="opportunity-status-title">Estado de la oportunidad</h3>
              <p>
                {data.is_active
                  ? 'Inactívala cuando ya no tenga lugares disponibles. Conservará toda su información, pero no podrá elegirse para nuevas solicitudes de vinculación.'
                  : 'Está inactiva: conserva toda su información y puedes editarla, pero no podrá elegirse para nuevas solicitudes de vinculación hasta reactivarla.'}
              </p>
              {statusNotice && <p className="institution-success" role="status">{statusNotice}</p>}
              {mutation.failure && <InstitutionRequestError failure={mutation.failure} />}
              <div className="actions" aria-busy={mutation.pending}>
                <button type="button" ref={statusButton} className={data.is_active ? 'secondary' : undefined}
                  disabled={mutation.pending} onClick={requestStatusChange}>
                  {mutation.pending ? 'Guardando estado…' : data.is_active ? 'Inactivar oportunidad' : 'Reactivar oportunidad'}
                </button>
              </div>
            </section>
          </>
        )}
      <ConfirmDialog open={confirming} origin={statusButton}
        title="¿Inactivar la oportunidad?"
        description="No podrá elegirse para nuevas solicitudes de vinculación. No se borra ningún dato y podrás reactivarla después."
        confirmLabel="Inactivar" onConfirm={() => { void changeStatus() }} onCancel={() => setConfirming(false)} />
      <p className="institution-back"><Link className="plain" to="/opportunities"><ChevronLeftIcon />Volver a oportunidades</Link></p>
    </OpportunityLayout>
  )
}

export function OpportunityDetailPage() {
  const { id = '' } = useParams()
  return <OpportunityDetail key={id} id={id} />
}
