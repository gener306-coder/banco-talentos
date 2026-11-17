import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { surnames } from '../students/api'
import { CsvDownloadButton } from '../ui/CsvDownloadButton'
import { ChevronLeftIcon, ChevronRightIcon, MessageIcon, SearchIcon } from '../ui/icons'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { backState } from '../ui/backLink'
import { useListParams } from '../ui/useListParams'
import { useRowNavigation } from '../ui/useRowNavigation'
import { LINKAGE_STATUSES } from './api'
import type { LinkageStatus as Status } from './api'
import { downloadReceivedLinkagesCsv, institutionLinkageMessages, listReceivedLinkages } from './institutionApi'
import { LinkageStatus } from './LinkageStatus'
import { UnreadBadge, UnreadTag } from './UnreadBadge'
import '../institutions/institutions.css'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })

/** Marco de la bandeja institucional (HU-S6-01) y su detalle. */
export function InstitutionLinkageLayout({ title, children }: { title: string; children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <section className="card institutions" aria-labelledby="institution-linkage-title">
      <nav className="institution-navigation" aria-label="Navegación de solicitudes">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
        <Link className="plain" to="/institution/linkage-requests" aria-current={pathname === '/institution/linkage-requests' ? 'page' : undefined}>Solicitudes de vinculación<UnreadBadge side="INSTITUTION" /></Link>
        <Link className="plain" to="/students">Alumnos</Link>
      </nav>
      <h2 id="institution-linkage-title">{title}</h2>
      {children}
    </section>
  )
}

/**
 * Solicitudes de vinculación recibidas por la institución (HU-S6-01 CA-06): filtro por estado y tabla con el alumno
 * identificado, la empresa, la oportunidad, la fecha y el estado, con enlace al detalle. **Descargar CSV** exporta
 * todas las solicitudes del filtro vigente, no solo la página visible (HU-S7-02 CA-04).
 */
export function InstitutionLinkageRequestsPage() {
  // T-S8-08 y T-S12-05: el estado y la página viven en la URL para que el aviso del inicio llegue filtrado y el regreso
  // desde el detalle recupere la misma vista. Cambiar el filtro vuelve a la página 1.
  const list = useListParams()
  const statusParam = list.get('status')
  const status: Status | '' = LINKAGE_STATUSES.find((item) => item.value === statusParam)?.value ?? ''
  // HU-S13-04 CA-04: solo las conversaciones con mensajes de la empresa sin leer.
  const unread = list.get('unread') === '1'
  const { page, setPage } = list
  const location = useLocation()
  const load = useCallback((signal: AbortSignal) => listReceivedLinkages({ page, status, unread }, signal), [page, status, unread])
  const { data, loading, failure, refresh } = useApiRequest(load, institutionLinkageMessages)
  const downloadCsv = useCallback(() => downloadReceivedLinkagesCsv(status), [status])
  // T-S12-04: toda la fila abre la solicitud, como en el padrón (HU-S8-01).
  const openRow = useRowNavigation()

  return (
    <InstitutionLinkageLayout title="Solicitudes de vinculación">
      <p>Solicitudes que las empresas enviaron para tus alumnos. Revisa cada una con el expediente del alumno antes de responder.</p>
      {/* T-S8-02: el filtro a la izquierda y «Descargar CSV» a la derecha, en la misma fila sobre la tabla. */}
      <div className="list-toolbar">
        <form className="table-search" role="search" aria-label="Filtrar solicitudes" onSubmit={(event) => event.preventDefault()}>
          <div className="table-search-filter">
            <label htmlFor="institution-linkage-status-filter">Estado</label>
            <select id="institution-linkage-status-filter" value={status}
              onChange={(event) => { list.update({ status: event.target.value }) }}>
              <option value="">Todos los estados</option>
              {LINKAGE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="unread-filter">
            <input id="institution-linkage-unread-filter" type="checkbox" checked={unread}
              onChange={(event) => { list.update({ unread: event.target.checked ? '1' : null }) }} />
            <label htmlFor="institution-linkage-unread-filter">Con mensajes sin leer</label>
          </div>
        </form>
        {!loading && !failure && data && data.items.length > 0 && (
          <CsvDownloadButton download={downloadCsv} prefix="solicitudes-vinculacion" messages={institutionLinkageMessages} />
        )}
      </div>
      {loading ? <LoadingState label="Cargando solicitudes…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.items.length === 0
          ? unread
            ? <StateMessage kind="empty" icon={<SearchIcon />} title="Ninguna conversación con mensajes sin leer."
              description="Quita el filtro para ver todas las solicitudes." />
            : status
            ? <StateMessage kind="empty" icon={<SearchIcon />} title="Ninguna solicitud con ese estado."
              description="Elige otro estado o revisa todas las solicitudes." />
            : <StateMessage kind="empty" icon={<SearchIcon />} title="Aún no has recibido solicitudes."
              description="Aparecerán aquí cuando una empresa solicite la vinculación de alguno de tus alumnos." />
        : data && (
          <>
            <div className="table-card">
              <div className="institution-table-wrapper" role="region" aria-label="Listado de solicitudes" tabIndex={0}>
                <table className="institution-table has-actions linkage-inbox">
                  <caption className="visually-hidden">Solicitudes de vinculación recibidas</caption>
                  <thead><tr><th scope="col">Alumno</th><th scope="col">Empresa</th><th scope="col">Oportunidad</th><th scope="col">Recibida</th><th scope="col">Estado</th><th scope="col">Detalle</th></tr></thead>
                  <tbody>
                    {data.items.map((item) => {
                      const name = `${surnames(item.student)}, ${item.student.given_names}`
                      const href = `/institution/linkage-requests/${item.id}`
                      const back = backState('Volver a solicitudes', location)
                      return (
                        <tr key={item.id} data-href={href} onClick={(event) => openRow(event, href, back)}>
                          {/* T-S8-15: solo lo que identifica; la carrera y el periodo están en el detalle. */}
                          <th scope="row">
                            {name}
                            <span className="linkage-meta mono">{item.student.enrollment_number}</span>
                          </th>
                          <td>{item.company.name}{item.company.municipality && <span className="linkage-meta">{item.company.municipality}</span>}</td>
                          <td><span className="linkage-title" title={item.opportunity.title}>{item.opportunity.title}</span></td>
                          <td className="nowrap">{dateFormat.format(new Date(item.created_at))}</td>
                          <td>
                            {/* HU-S13-06: el ícono junto al estado abre la conversación con la empresa. */}
                            <span className="cell-meta">
                              <LinkageStatus status={item.status} />
                              <span className="cell-actions">
                                <Link to={`${href}/chat`} state={back}
                                  aria-label={`Abrir la conversación con ${item.company.name} sobre ${name}`} title="Conversación"><MessageIcon /></Link>
                              </span>
                            </span>
                            {item.unread_count > 0 && <span className="linkage-meta"><UnreadTag count={item.unread_count} /></span>}
                          </td>
                          <td>
                            <Link className="pill-link row-link" to={href} state={back} aria-label={`Ver la solicitud de ${item.company.name} para ${name}`}>Ver detalle<ChevronRightIcon /></Link>
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
            </div>
          </>
        )}
    </InstitutionLinkageLayout>
  )
}
