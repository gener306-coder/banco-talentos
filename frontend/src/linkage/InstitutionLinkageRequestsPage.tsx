import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { periodLabel } from '../students/catalogs'
import { surnames } from '../students/api'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '../ui/icons'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { LINKAGE_STATUSES } from './api'
import type { LinkageStatus as Status } from './api'
import { institutionLinkageMessages, listReceivedLinkages } from './institutionApi'
import { LinkageStatus } from './LinkageStatus'
import '../institutions/institutions.css'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })

/** Marco de la bandeja institucional (HU-S6-01) y su detalle. */
export function InstitutionLinkageLayout({ title, children }: { title: string; children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <section className="card institutions" aria-labelledby="institution-linkage-title">
      <nav className="institution-navigation" aria-label="Navegación de solicitudes">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
        <Link className="plain" to="/institution/linkage-requests" aria-current={pathname === '/institution/linkage-requests' ? 'page' : undefined}>Solicitudes de vinculación</Link>
        <Link className="plain" to="/students">Alumnos</Link>
      </nav>
      <h2 id="institution-linkage-title">{title}</h2>
      {children}
    </section>
  )
}

/**
 * Solicitudes de vinculación recibidas por la institución (HU-S6-01 CA-06): filtro por estado y tabla con el alumno
 * identificado, la empresa, la oportunidad, la fecha y el estado, con enlace al detalle.
 */
export function InstitutionLinkageRequestsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<Status | ''>('')
  const load = useCallback((signal: AbortSignal) => listReceivedLinkages({ page, status }, signal), [page, status])
  const { data, loading, failure, refresh } = useApiRequest(load, institutionLinkageMessages)

  return (
    <InstitutionLinkageLayout title="Solicitudes de vinculación">
      <p>Solicitudes que las empresas enviaron para tus alumnos. Revisa cada una con el expediente del alumno antes de responder.</p>
      <form className="linkage-filter" role="search" aria-label="Filtrar solicitudes" onSubmit={(event) => event.preventDefault()}>
        <div>
          <label htmlFor="institution-linkage-status-filter">Estado</label>
          <select id="institution-linkage-status-filter" value={status}
            onChange={(event) => { setPage(1); setStatus(event.target.value as Status | '') }}>
            <option value="">Todos los estados</option>
            {LINKAGE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      </form>
      {loading ? <LoadingState label="Cargando solicitudes…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.items.length === 0
          ? status
            ? <StateMessage kind="empty" icon={<SearchIcon />} title="Ninguna solicitud con ese estado."
              description="Elige otro estado o revisa todas las solicitudes." />
            : <StateMessage kind="empty" icon={<SearchIcon />} title="Aún no has recibido solicitudes."
              description="Aparecerán aquí cuando una empresa solicite la vinculación de alguno de tus alumnos." />
        : data && (
          <>
            <div className="institution-table-wrapper" role="region" aria-label="Listado de solicitudes" tabIndex={0}>
              <table className="institution-table">
                <caption className="visually-hidden">Solicitudes de vinculación recibidas</caption>
                <thead><tr><th scope="col">Alumno</th><th scope="col">Empresa</th><th scope="col">Oportunidad</th><th scope="col">Recibida</th><th scope="col">Estado</th><th scope="col">Detalle</th></tr></thead>
                <tbody>
                  {data.items.map((item) => {
                    const name = `${surnames(item.student)}, ${item.student.given_names}`
                    return (
                      <tr key={item.id}>
                        <th scope="row">
                          {name}
                          <span className="linkage-profile-meta">
                            {[item.student.enrollment_number, item.student.program,
                              item.student.period_type && item.student.period_number ? periodLabel(item.student.period_type, item.student.period_number) : null].filter(Boolean).join(' · ')}
                          </span>
                        </th>
                        <td>{item.company.name}{item.company.municipality && <span className="linkage-profile-meta">{item.company.municipality}</span>}</td>
                        <td>{item.opportunity.title}<span className="linkage-profile-meta">{item.opportunity.program}</span></td>
                        <td>{dateFormat.format(new Date(item.created_at))}</td>
                        <td><LinkageStatus status={item.status} /></td>
                        <td>
                          <Link to={`/institution/linkage-requests/${item.id}`} aria-label={`Ver la solicitud de ${item.company.name} para ${name}`}>Ver detalle</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {data.lastPage > 1 && (
              <div className="pager">
                <p>Página {data.page} de {data.lastPage} · {data.total} solicitudes</p>
                <div className="actions">
                  <button type="button" className="secondary" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeftIcon />Anterior</button>
                  <button type="button" className="secondary" disabled={data.page >= data.lastPage} onClick={() => setPage(data.page + 1)}>Siguiente<ChevronRightIcon /></button>
                </div>
              </div>
            )}
          </>
        )}
    </InstitutionLinkageLayout>
  )
}
