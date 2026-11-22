import { TableHead, TableSkeleton } from '../ui/TableSkeleton'
import type { TableColumn } from '../ui/TableSkeleton'
import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { CompanyProfileStatus } from '../companies/CompanyProfileStatus'
import { backState } from '../ui/backLink'
import { BuildingIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon } from '../ui/icons'
import { StateMessage } from '../ui/StateMessage'
import { useListParams } from '../ui/useListParams'
import { useRowNavigation } from '../ui/useRowNavigation'
import { useTableMemory } from '../ui/useTableMemory'
import { rowIndex } from '../ui/tableMotion'
import { listInstitutions, UNNAMED_INSTITUTION } from './api'
import { InstitutionLayout, InstitutionRequestError, InstitutionStatus } from './InstitutionLayout'
import { useInstitutionRequest } from './useInstitutionRequest'
import '../companies/companies.css'

/** Totales del pie con separador de miles (T-S14-08). */
const countFormat = new Intl.NumberFormat('es-MX')

/** Columnas del listado (T-S14-08): las comparten la tabla y su esqueleto. */
const columns: readonly TableColumn[] = [
  { label: 'Nombre', role: 'title', bone: 'text' },
  { label: 'CCT', role: 'inline', bone: 'mono' },
  { label: 'Correo de contacto', role: 'meta', bone: 'text' },
  { label: 'Perfil', role: 'status', bone: 'status' },
  { label: 'Estado', role: 'status', bone: 'status' },
  { label: 'Detalle', hidden: true, role: 'open', bone: 'open' },
]

/**
 * Instituciones de Administración. Desde HU-S16-05 el listado se pagina y busca por nombre, CCT o correo de la cuenta,
 * y muestra el estado del perfil: las instituciones invitadas capturan su propio perfil (HU-S16-06 y HU-S16-07).
 */
export function InstitutionsPage() {
  // La búsqueda y la página viven en la URL para que el regreso desde el detalle recupere la misma vista (T-S12-05).
  const list = useListParams()
  const query = list.get('q')
  const [draft, setDraft] = useState(query)
  const { page, setPage } = list
  const location = useLocation()
  const load = useCallback((signal: AbortSignal) => listInstitutions(page, query, signal), [page, query])
  const { data, loading, failure, refresh, pending } = useInstitutionRequest(load)
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
    <InstitutionLayout title="Instituciones">
      <div className="institution-toolbar">
        <p>Consulta y administra las instituciones educativas registradas.</p>
        <Link className="institution-button" to="/institutions/new"><PlusIcon />Nueva institución</Link>
      </div>
      <form className="table-search" role="search" onSubmit={search}>
        <div className="table-search-field">
          <label htmlFor="institution-search">Buscar institución</label>
          <input id="institution-search" type="search" maxLength={200} value={draft} placeholder="Nombre, CCT o correo de la cuenta"
            onChange={(event) => setDraft(event.target.value)} />
        </div>
        <button type="submit" className="secondary"><SearchIcon /><span className="table-search-button-text">Buscar</span></button>
      </form>
      {loading && !data ? <TableSkeleton label="Cargando instituciones…" columns={columns} tableClass="institution-table has-actions" pager />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.institutions.length === 0
          ? query
            ? <StateMessage kind="empty" icon={<SearchIcon />} title="Ninguna institución coincide con la búsqueda."
              description={<>No hay instituciones cuyo nombre, CCT o correo de cuenta contenga <strong>{query}</strong>.</>} />
            : <StateMessage kind="empty" icon={<BuildingIcon />} title="No hay instituciones registradas."
              description="Registra la primera institución para empezar a crear sus cuentas y enlaces de configuración."
              action={<Link className="institution-button" to="/institutions/new"><PlusIcon />Registrar la primera institución</Link>} />
        : data && (
          <div className={`table-card${refreshing ? ' is-refreshing' : ''}`}>
            {/* T-S13-13: al buscar, filtrar o paginar, la tabla anterior se queda atenuada mientras llega la nueva. */}
            {refreshing && <p className="visually-hidden" role="status">Actualizando resultados…</p>}
            <div className="institution-table-wrapper" ref={tableMemory} aria-busy={refreshing} role="region" aria-label="Listado de instituciones" tabIndex={0}>
              <table className="institution-table has-actions stack-mobile">
                <caption className="visually-hidden">Instituciones registradas</caption>
                <TableHead columns={columns} />
                <tbody key={location.search} className="rows-enter">
                  {data.institutions.map((institution, index) => {
                    const href = `/institutions/${institution.id}`
                    const back = backState('Volver a instituciones', location)
                    const name = institution.name ?? UNNAMED_INSTITUTION
                    return (
                      <tr key={institution.id} data-href={href} style={rowIndex(index)} onClick={(event) => openRow(event, href, back)}>
                        <th scope="row" data-cell="title">
                          <span className={institution.name ? undefined : 'company-pending-value'}>{name}</span>
                          {institution.account_email && <span className="company-account-email">{institution.account_email}</span>}
                        </th>
                        <td data-cell="inline">{institution.cct ?? <span className="company-pending-value"><span className="unit">CCT </span>Sin capturar</span>}</td>
                        <td data-cell="meta">{institution.contact_email ?? <span className="company-pending-value">Contacto sin capturar</span>}</td>
                        <td data-cell="status"><CompanyProfileStatus status={institution.profile_status} /></td>
                        <td data-cell="status"><InstitutionStatus active={institution.is_active} /></td>
                        <td data-cell="open"><Link className="row-link row-open" to={href} state={back} aria-label={`Ver detalle de ${name}`} title="Ver detalle"><ChevronRightIcon /></Link></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {data.lastPage > 1 && (
              <div className="pager">
                <p>Página {data.page} de {countFormat.format(data.lastPage)} · {countFormat.format(data.total)} instituciones</p>
                <div className="actions">
                  <button type="button" className="secondary" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeftIcon />Anterior</button>
                  <button type="button" className="secondary" disabled={data.page >= data.lastPage} onClick={() => setPage(data.page + 1)}>Siguiente<ChevronRightIcon /></button>
                </div>
              </div>
            )}
          </div>
        )}
    </InstitutionLayout>
  )
}
