import { useCallback, useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { InstitutionRequestError, InstitutionStatus } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { BuildingIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon } from '../ui/icons'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { companyMessages, listCompanies } from './api'
import { CompanyLayout } from './CompanyLayout'

/** Listado de empresas activas e inactivas con búsqueda por razón social, nombre comercial o RFC (HU-S4-02 CA-08). */
export function CompaniesPage() {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const load = useCallback((signal: AbortSignal) => listCompanies(page, query, signal), [page, query])
  const { data, loading, failure, refresh } = useApiRequest(load, companyMessages)
  const navigate = useNavigate()

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setQuery(draft.trim())
  }

  // Toda la fila abre el detalle con el puntero; el enlace «Ver detalle» sigue siendo el control accesible.
  function openRow(event: MouseEvent<HTMLTableRowElement>, href: string) {
    if (event.defaultPrevented || (event.target as HTMLElement).closest('a, button')) return
    if (window.getSelection()?.toString()) return
    void navigate(href)
  }

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
        <button type="submit" className="secondary"><SearchIcon />Buscar</button>
      </form>
      {loading ? <LoadingState label="Cargando empresas…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.companies.length === 0
          ? query
            ? <StateMessage kind="empty" icon={<SearchIcon />} title="Ninguna empresa coincide con la búsqueda."
              description={`No hay empresas cuya razón social, nombre comercial o RFC contenga «${query}».`} />
            : <StateMessage kind="empty" icon={<BuildingIcon />} title="No hay empresas registradas."
              description="Registra la primera empresa validada para que pueda participar en el Banco de Talentos."
              action={<Link className="institution-button" to="/companies/new"><PlusIcon />Registrar la primera empresa</Link>} />
        : data && (
          <>
            <div className="institution-table-wrapper" role="region" aria-label="Listado de empresas" tabIndex={0}>
              <table className="institution-table">
                <caption className="visually-hidden">Empresas registradas</caption>
                <thead><tr><th scope="col">Razón social</th><th scope="col">RFC</th><th scope="col">Municipio</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
                <tbody>
                  {data.companies.map((company) => {
                    const href = `/companies/${company.id}`
                    return (
                      <tr key={company.id} data-href={href} onClick={(event) => openRow(event, href)}>
                        <th scope="row">{company.legal_name}{company.trade_name && <span className="option-meta"> · {company.trade_name}</span>}</th>
                        <td>{company.rfc}</td>
                        <td>{company.municipality ?? company.municipality_code}</td>
                        <td><InstitutionStatus active={company.is_active} /></td>
                        <td><Link className="pill-link" to={href} aria-label={`Ver detalle de ${company.legal_name}`}>Ver detalle<ChevronRightIcon /></Link></td>
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
          </>
        )}
    </CompanyLayout>
  )
}
