import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { InstitutionRequestError, InstitutionStatus } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { BuildingIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon } from '../ui/icons'
import { backState } from '../ui/backLink'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { useListParams } from '../ui/useListParams'
import { useRowNavigation } from '../ui/useRowNavigation'
import { useTableMemory } from '../ui/useTableMemory'
import { rowIndex } from '../ui/tableMotion'
import { companyMessages, listCompanies } from './api'
import { CompanyLayout } from './CompanyLayout'

/** Listado de empresas activas e inactivas con búsqueda por razón social, nombre comercial o RFC (HU-S4-02 CA-08). */
export function CompaniesPage() {
  // T-S12-05: la búsqueda y la página viven en la URL para que el regreso desde el detalle recupere la misma vista.
  const list = useListParams()
  const query = list.get('q')
  const [draft, setDraft] = useState(query)
  const { page, setPage } = list
  const location = useLocation()
  const load = useCallback((signal: AbortSignal) => listCompanies(page, query, signal), [page, query])
  const { data, loading, failure, refresh, pending } = useApiRequest(load, companyMessages)
  // T-S13-13: con un resultado a la vista, una consulta nueva lo atenúa en lugar de desmontarlo.
  const refreshing = pending && data !== null

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    list.update({ q: draft.trim() })
  }

  // Toda la fila abre el detalle con el puntero; el enlace «Ver detalle» sigue siendo el control accesible (HU-S8-01).
  const openRow = useRowNavigation()
  // T-S13-12: al volver de una fila, la tabla recupera su posición y la fila parpadea.
  const tableMemory = useTableMemory(page)

  return (
    <CompanyLayout title="Empresas">
      <div className="institution-toolbar">
        <p>Empresas validadas por la Secretaría de Economía para participar en el Banco de Talentos.</p>
        <Link className="institution-button" to="/companies/new"><PlusIcon />Nueva empresa</Link>
      </div>
      <form className="table-search" role="search" onSubmit={search}>
        <div className="table-search-field">
          <label htmlFor="company-search">Buscar empresa</label>
          <input id="company-search" type="search" maxLength={200} value={draft} placeholder="Razón social, nombre comercial o RFC"
            onChange={(event) => setDraft(event.target.value)} />
        </div>
        <button type="submit" className="secondary"><SearchIcon /><span className="table-search-button-text">Buscar</span></button>
      </form>
      {loading && !data ? <LoadingState label="Cargando empresas…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.companies.length === 0
          ? query
            ? <StateMessage kind="empty" icon={<SearchIcon />} title="Ninguna empresa coincide con la búsqueda."
              description={<>No hay empresas cuya razón social, nombre comercial o RFC contenga <strong>{query}</strong>.</>} />
            : <StateMessage kind="empty" icon={<BuildingIcon />} title="No hay empresas registradas."
              description="Registra la primera empresa validada para que pueda participar en el Banco de Talentos."
              action={<Link className="institution-button" to="/companies/new"><PlusIcon />Registrar la primera empresa</Link>} />
        : data && (
          <>
            <div className={`table-card${refreshing ? ' is-refreshing' : ''}`}>
              {/* T-S13-13: al buscar, filtrar o paginar, la tabla anterior se queda atenuada mientras llega la nueva. */}
              {refreshing && <p className="visually-hidden" role="status">Actualizando resultados…</p>}
              <div className="institution-table-wrapper" ref={tableMemory} aria-busy={refreshing} role="region" aria-label="Listado de empresas" tabIndex={0}>
                <table className="institution-table has-actions">
                  <caption className="visually-hidden">Empresas registradas</caption>
                  <thead><tr><th scope="col">Razón social</th><th scope="col">RFC</th><th scope="col">Municipio</th><th scope="col">Estado</th><th scope="col"><span className="visually-hidden">Detalle</span></th></tr></thead>
                  <tbody key={location.search} className="rows-enter">
                    {data.companies.map((company, index) => {
                      const href = `/companies/${company.id}`
                      const back = backState('Volver a empresas', location)
                      return (
                        <tr key={company.id} data-href={href} style={rowIndex(index)} onClick={(event) => openRow(event, href, back)}>
                          <th scope="row">{company.legal_name}{company.trade_name && <span className="option-meta"> · {company.trade_name}</span>}</th>
                          <td>{company.rfc}</td>
                          <td>{company.municipality ?? company.municipality_code}</td>
                          <td><InstitutionStatus active={company.is_active} /></td>
                          <td><Link className="row-link row-open" to={href} state={back} aria-label={`Ver detalle de ${company.legal_name}`} title="Ver detalle"><ChevronRightIcon /></Link></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {data.lastPage > 1 && (
                <div className="pager">
                  <p>Página {data.page} de {data.lastPage} · {data.total} empresas</p>
                  <div className="actions">
                    <button type="button" className="secondary" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeftIcon />Anterior</button>
                    <button type="button" className="secondary" disabled={data.page >= data.lastPage} onClick={() => setPage(data.page + 1)}>Siguiente<ChevronRightIcon /></button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
    </CompanyLayout>
  )
}
