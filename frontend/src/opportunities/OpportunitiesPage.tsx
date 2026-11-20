import { TableHead, TableSkeleton } from '../ui/TableSkeleton'
import type { TableColumn } from '../ui/TableSkeleton'
import { useCallback } from 'react'
import { Link, useLocation } from 'react-router'
import { InstitutionRequestError, InstitutionStatus } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { BriefcaseIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../ui/icons'
import { backState } from '../ui/backLink'
import { StateMessage } from '../ui/StateMessage'
import { useListParams } from '../ui/useListParams'
import { useRowNavigation } from '../ui/useRowNavigation'
import { useTableMemory } from '../ui/useTableMemory'
import { rowIndex } from '../ui/tableMotion'
import { listOpportunities, opportunityMessages } from './api'
import { OpportunityLayout, SkillTags } from './OpportunityLayout'

/** Listado de las oportunidades de la empresa, de la más reciente a la más antigua, de 20 en 20 (HU-S5-02 CA-06). */
/** Totales del pie con separador de miles (T-S14-08): «2,369 alumnos». */
const countFormat = new Intl.NumberFormat('es-MX')

/** Columnas del listado (T-S14-08): las comparten la tabla y su esqueleto. */
const columns: readonly TableColumn[] = [
  { label: 'Oportunidad', role: 'title', bone: 'text-meta' },
  { label: 'Municipio', role: 'inline', bone: 'short' },
  { label: 'Lugares', role: 'inline', bone: 'mono' },
  { label: 'Habilidades', role: 'block', bone: 'chips' },
  { label: 'Estado', role: 'status', bone: 'status' },
  { label: 'Detalle', hidden: true, role: 'open', bone: 'open' },
]

export function OpportunitiesPage() {
  // T-S12-05: la página vive en la URL para que el regreso desde el detalle recupere la misma vista.
  const { page, setPage } = useListParams()
  const location = useLocation()
  const load = useCallback((signal: AbortSignal) => listOpportunities(page, signal), [page])
  const { data, loading, failure, refresh, pending } = useApiRequest(load, opportunityMessages)
  // T-S13-13: con un resultado a la vista, una consulta nueva lo atenúa en lugar de desmontarlo.
  const refreshing = pending && data !== null

  // Toda la fila abre el detalle con el puntero; el enlace «Ver detalle» sigue siendo el control accesible (HU-S8-01).
  const openRow = useRowNavigation()
  // T-S13-12: al volver de una fila, la tabla recupera su posición y la fila parpadea.
  const tableMemory = useTableMemory(page)

  return (
    <OpportunityLayout title="Oportunidades Duales">
      <div className="institution-toolbar">
        <p>Proyectos y lugares de tu empresa para alumnos de Educación Dual.</p>
        <Link className="institution-button" to="/opportunities/new"><PlusIcon />Nueva oportunidad</Link>
      </div>
      {loading && !data ? <TableSkeleton label="Cargando oportunidades…" columns={columns} tableClass="institution-table has-actions" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.opportunities.length === 0
          ? <StateMessage kind="empty" icon={<BriefcaseIcon />} title="Aún no hay oportunidades registradas."
            description="Registra la primera oportunidad con el perfil, los lugares y el municipio donde se realizará."
            action={<Link className="institution-button" to="/opportunities/new"><PlusIcon />Registrar la primera oportunidad</Link>} />
        : data && (
          <>
            <div className={`table-card${refreshing ? ' is-refreshing' : ''}`}>
              {/* T-S13-13: al buscar, filtrar o paginar, la tabla anterior se queda atenuada mientras llega la nueva. */}
              {refreshing && <p className="visually-hidden" role="status">Actualizando resultados…</p>}
              <div className="institution-table-wrapper" ref={tableMemory} aria-busy={refreshing} role="region" aria-label="Listado de oportunidades" tabIndex={0}>
                <table className="institution-table has-actions stack-mobile">
                  <caption className="visually-hidden">Oportunidades de la empresa</caption>
                  <TableHead columns={columns} />
                  <tbody key={location.search} className="rows-enter">
                    {data.opportunities.map((opportunity, index) => {
                      const href = `/opportunities/${opportunity.id}`
                      const back = backState('Volver a oportunidades', location)
                      return (
                        <tr key={opportunity.id} data-href={href} style={rowIndex(index)} onClick={(event) => openRow(event, href, back)}>
                          {/* T-S14-08: el programa, en su propia línea atenuada bajo el título. */}
                          <th scope="row" data-cell="title">{opportunity.title}<span className="row-subtitle">{opportunity.program}</span></th>
                          <td data-cell="inline">{opportunity.municipality ?? opportunity.municipality_code}</td>
                          <td data-cell="inline">{opportunity.vacancies}<span className="unit">{opportunity.vacancies === 1 ? ' lugar' : ' lugares'}</span></td>
                          <td data-cell="block">{opportunity.skills.length ? <SkillTags skills={opportunity.skills} label={`Habilidades de ${opportunity.title}`} /> : '—'}</td>
                          <td data-cell="status"><InstitutionStatus active={opportunity.is_active} /></td>
                          <td data-cell="open"><Link className="row-link row-open" to={href} state={back} aria-label={`Ver detalle de ${opportunity.title}`} title="Ver detalle"><ChevronRightIcon /></Link></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {data.lastPage > 1 && (
                <div className="pager">
                  <p>Página {data.page} de {countFormat.format(data.lastPage)} · {countFormat.format(data.total)} oportunidades</p>
                  <div className="actions">
                    <button type="button" className="secondary" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeftIcon />Anterior</button>
                    <button type="button" className="secondary" disabled={data.page >= data.lastPage} onClick={() => setPage(data.page + 1)}>Siguiente<ChevronRightIcon /></button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
    </OpportunityLayout>
  )
}
