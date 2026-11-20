import { TableHead, TableSkeleton } from '../ui/TableSkeleton'
import type { TableColumn } from '../ui/TableSkeleton'
import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { InstitutionRequestError, InstitutionStatus } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { BuildingIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon } from '../ui/icons'
import { backState } from '../ui/backLink'
import { StateMessage } from '../ui/StateMessage'
import { useListParams } from '../ui/useListParams'
import { useRowNavigation } from '../ui/useRowNavigation'
import { useTableMemory } from '../ui/useTableMemory'
import { rowIndex } from '../ui/tableMotion'
import { companyMessages, listCompanies } from './api'
import { UNNAMED_COMPANY } from './catalogs'
import { CompanyLayout } from './CompanyLayout'
import { CompanyProfileStatus } from './CompanyProfileStatus'

/**
 * Listado de empresas activas e inactivas con búsqueda por razón social, nombre comercial, RFC o correo de la cuenta
 * (HU-S4-02 CA-08, HU-S14-02 CA-03). La invitada sin nombre se identifica por el correo de su cuenta.
 */
/** Totales del pie con separador de miles (T-S14-08): «2,369 alumnos». */
const countFormat = new Intl.NumberFormat('es-MX')

/** Columnas del listado (T-S14-08): las comparten la tabla y su esqueleto. */
const columns: readonly TableColumn[] = [
  { label: 'Empresa', role: 'title', bone: 'text-meta' },
  { label: 'RFC', role: 'inline', bone: 'mono' },
  { label: 'Municipio', role: 'inline', bone: 'short' },
  { label: 'Perfil', role: 'status', bone: 'status' },
  { label: 'Estado', role: 'status', bone: 'status' },
  { label: 'Detalle', hidden: true, role: 'open', bone: 'open' },
]

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
        <Link className="institution-button" to="/companies/new"><PlusIcon />Invitar empresa</Link>
      </div>
      <form className="table-search" role="search" onSubmit={search}>
        <div className="table-search-field">
          <label htmlFor="company-search">Buscar empresa</label>
          <input id="company-search" type="search" maxLength={200} value={draft} placeholder="Nombre, RFC o correo de la cuenta"
            onChange={(event) => setDraft(event.target.value)} />
        </div>
        <button type="submit" className="secondary"><SearchIcon /><span className="table-search-button-text">Buscar</span></button>
      </form>
      {loading && !data ? <TableSkeleton label="Cargando empresas…" columns={columns} tableClass="institution-table has-actions" pager />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.companies.length === 0
          ? query
            ? <StateMessage kind="empty" icon={<SearchIcon />} title="Ninguna empresa coincide con la búsqueda."
              description={<>No hay empresas cuyo nombre, RFC o correo de cuenta contenga <strong>{query}</strong>.</>} />
            : <StateMessage kind="empty" icon={<BuildingIcon />} title="No hay empresas registradas."
              description="Invita a la primera empresa con el correo de quien gestionará su cuenta."
              action={<Link className="institution-button" to="/companies/new"><PlusIcon />Invitar la primera empresa</Link>} />
        : data && (
          <>
            <div className={`table-card${refreshing ? ' is-refreshing' : ''}`}>
              {/* T-S13-13: al buscar, filtrar o paginar, la tabla anterior se queda atenuada mientras llega la nueva. */}
              {refreshing && <p className="visually-hidden" role="status">Actualizando resultados…</p>}
              <div className="institution-table-wrapper" ref={tableMemory} aria-busy={refreshing} role="region" aria-label="Listado de empresas" tabIndex={0}>
                <table className="institution-table has-actions stack-mobile">
                  <caption className="visually-hidden">Empresas registradas</caption>
                  <TableHead columns={columns} />
                  <tbody key={location.search} className="rows-enter">
                    {data.companies.map((company, index) => {
                      const href = `/companies/${company.id}`
                      const back = backState('Volver a empresas', location)
                      const name = company.name ?? UNNAMED_COMPANY
                      return (
                        <tr key={company.id} data-href={href} style={rowIndex(index)} onClick={(event) => openRow(event, href, back)}>
                          <th scope="row" data-cell="title">
                            <span className={company.name ? undefined : 'company-pending-value'}>{name}</span>
                            {company.account_email && <span className="company-account-email">{company.account_email}</span>}
                          </th>
                          <td data-cell="inline">{company.rfc ?? <span className="company-pending-value"><span className="unit">RFC </span>Sin capturar</span>}</td>
                          <td data-cell="inline">{company.municipality ?? <span className="company-pending-value"><span className="unit">Municipio </span>Sin capturar</span>}</td>
                          <td data-cell="status"><CompanyProfileStatus status={company.profile_status} /></td>
                          <td data-cell="status"><InstitutionStatus active={company.is_active} /></td>
                          <td data-cell="open"><Link className="row-link row-open" to={href} state={back} aria-label={`Ver detalle de ${name}`} title="Ver detalle"><ChevronRightIcon /></Link></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {data.lastPage > 1 && (
                <div className="pager">
                  <p>Página {data.page} de {countFormat.format(data.lastPage)} · {countFormat.format(data.total)} empresas</p>
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
