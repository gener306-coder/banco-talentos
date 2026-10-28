import { useCallback, useState } from 'react'
import type { MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { InstitutionRequestError, InstitutionStatus } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { BriefcaseIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../ui/icons'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { listOpportunities, opportunityMessages } from './api'
import { OpportunityLayout, SkillTags } from './OpportunityLayout'

/** Listado de las oportunidades de la empresa, de la más reciente a la más antigua, de 20 en 20 (HU-S5-02 CA-06). */
export function OpportunitiesPage() {
  const [page, setPage] = useState(1)
  const load = useCallback((signal: AbortSignal) => listOpportunities(page, signal), [page])
  const { data, loading, failure, refresh } = useApiRequest(load, opportunityMessages)
  const navigate = useNavigate()

  // Toda la fila abre el detalle con el puntero; el enlace «Ver detalle» sigue siendo el control accesible.
  function openRow(event: MouseEvent<HTMLTableRowElement>, href: string) {
    if (event.defaultPrevented || (event.target as HTMLElement).closest('a, button')) return
    if (window.getSelection()?.toString()) return
    void navigate(href)
  }

  return (
    <OpportunityLayout title="Oportunidades Duales">
      <div className="institution-toolbar">
        <p>Proyectos y lugares de tu empresa para alumnos de Educación Dual.</p>
        <Link className="institution-button" to="/opportunities/new"><PlusIcon />Nueva oportunidad</Link>
      </div>
      {loading ? <LoadingState label="Cargando oportunidades…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.opportunities.length === 0
          ? <StateMessage kind="empty" icon={<BriefcaseIcon />} title="Aún no hay oportunidades registradas."
            description="Registra la primera oportunidad con el perfil, los lugares y el municipio donde se realizará."
            action={<Link className="institution-button" to="/opportunities/new"><PlusIcon />Registrar la primera oportunidad</Link>} />
        : data && (
          <>
            <div className="institution-table-wrapper" role="region" aria-label="Listado de oportunidades" tabIndex={0}>
              <table className="institution-table">
                <caption className="visually-hidden">Oportunidades de la empresa</caption>
                <thead><tr><th scope="col">Oportunidad</th><th scope="col">Municipio</th><th scope="col">Lugares</th><th scope="col">Habilidades</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
                <tbody>
                  {data.opportunities.map((opportunity) => {
                    const href = `/opportunities/${opportunity.id}`
                    return (
                      <tr key={opportunity.id} data-href={href} onClick={(event) => openRow(event, href)}>
                        <th scope="row">{opportunity.title}<span className="option-meta"> · {opportunity.program}</span></th>
                        <td>{opportunity.municipality ?? opportunity.municipality_code}</td>
                        <td>{opportunity.vacancies}</td>
                        <td>{opportunity.skills.length ? <SkillTags skills={opportunity.skills} label={`Habilidades de ${opportunity.title}`} /> : '—'}</td>
                        <td><InstitutionStatus active={opportunity.is_active} /></td>
                        <td><Link className="pill-link" to={href} aria-label={`Ver detalle de ${opportunity.title}`}>Ver detalle<ChevronRightIcon /></Link></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {data.lastPage > 1 && (
              <div className="pager">
                <p>Página {data.page} de {data.lastPage} · {data.total} oportunidades</p>
                <div className="actions">
                  <button type="button" className="secondary" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeftIcon />Anterior</button>
                  <button type="button" className="secondary" disabled={data.page >= data.lastPage} onClick={() => setPage(data.page + 1)}>Siguiente<ChevronRightIcon /></button>
                </div>
              </div>
            )}
          </>
        )}
    </OpportunityLayout>
  )
}
