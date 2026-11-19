import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { surnames } from '../students/api'
import { CsvDownloadButton } from '../ui/CsvDownloadButton'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '../ui/icons'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { backState } from '../ui/backLink'
import type { BackTarget } from '../ui/backLink'
import { NavBackLink } from '../ui/NavBackLink'
import { useListParams } from '../ui/useListParams'
import { useRowNavigation } from '../ui/useRowNavigation'
import { useTableMemory } from '../ui/useTableMemory'
import { rowIndex } from '../ui/tableMotion'
import { downloadReceivedLinkagesCsv, institutionLinkageMessages, listReceivedLinkages } from './institutionApi'
import { LinkageStatus } from './LinkageStatus'
import { NotificationPrompt } from './NotificationPrompt'
import { isFiltered, lastMessageLabel, useInboxFilters } from './inboxFilters'
import { LinkageInboxFilters } from './LinkageInboxFilters'
import { useLiveRows } from './useLiveInbox'
import { ConversationLink } from './UnreadBadge'
import '../institutions/institutions.css'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })

/** Marco de la bandeja institucional (HU-S6-01) y su detalle. */
export function InstitutionLinkageLayout({ title, back, children }: { title: string; back?: BackTarget; children: ReactNode }) {
  return (
    <section className="card institutions" aria-labelledby="institution-linkage-title">
      <nav className="institution-navigation" aria-label="Navegación de solicitudes">
        <NavBackLink back={back} />
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
  // T-S13-09: estado, búsqueda, interacción y orden viven en la URL: el regreso desde el chat o el detalle los conserva.
  const filters = useInboxFilters(list)
  const { page, setPage } = list
  const location = useLocation()
  const { status, q, interaction, sort } = filters
  const load = useCallback((signal: AbortSignal) => listReceivedLinkages({ page, status, q, interaction, sort }, signal), [page, status, q, interaction, sort])
  const { data, loading, failure, refresh, setData, pending } = useApiRequest(load, institutionLinkageMessages)
  // T-S13-13: con un resultado a la vista, una consulta nueva lo atenúa en lugar de desmontarlo.
  const refreshing = pending && data !== null
  // T-S13-10 y T-S13-13: cuando llegan mensajes nuevos, la tabla se vuelve a pedir sin indicador de carga ni perder la
  // vista, y las filas cuyo contador subió pulsan una vez.
  const raised = useLiveRows(data?.items, useCallback(() => load(new AbortController().signal), [load]), setData)
  const downloadCsv = useCallback(() => downloadReceivedLinkagesCsv({ status, q, interaction, sort }), [status, q, interaction, sort])
  // T-S12-04: toda la fila abre la solicitud, como en el padrón (HU-S8-01).
  const openRow = useRowNavigation()
  // T-S13-12: al volver de una fila, la tabla recupera su posición y la fila parpadea.
  const tableMemory = useTableMemory(page)

  return (
    <InstitutionLinkageLayout title="Solicitudes de vinculación">
      <p>Solicitudes que las empresas enviaron para tus alumnos. Revisa cada una con el expediente del alumno antes de responder.</p>
      <NotificationPrompt />
      {/* T-S13-09: búsqueda, Estado, Interacción y Orden; «Descargar CSV» a la derecha descarga lo que muestra la tabla. */}
      <LinkageInboxFilters idPrefix="institution-linkage" searchLabel="Buscar por empresa, oportunidad, alumno o matrícula"
        placeholder="Ej. ManuGolfo o A2026-001" filters={filters} busy={refreshing} onChange={(changes) => list.update(changes)} onClear={list.clear}
        actions={!loading && !failure && data && data.items.length > 0 && (
          <CsvDownloadButton download={downloadCsv} prefix="solicitudes-vinculacion" messages={institutionLinkageMessages} />
        )} />
      {loading && !data ? <LoadingState label="Cargando solicitudes…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.items.length === 0
          ? isFiltered(filters)
            ? <StateMessage kind="empty" icon={<SearchIcon />} title="Ninguna solicitud coincide con la búsqueda o los filtros."
              description={q
                ? <>No hay solicitudes que coincidan con <strong className="notice-subject">{q}</strong>{status || interaction !== 'all' ? ' y los filtros elegidos' : ''}.</>
                : 'Cambia los filtros o quítalos para ver todas las solicitudes.'}
              action={<button type="button" className="secondary" onClick={list.clear}>Limpiar filtros</button>} />
            : <StateMessage kind="empty" icon={<SearchIcon />} title="Aún no has recibido solicitudes."
              description="Aparecerán aquí cuando una empresa solicite la vinculación de alguno de tus alumnos." />
        : data && (
          <>
            <div className={`table-card${refreshing ? ' is-refreshing' : ''}`}>
              {/* T-S13-13: al buscar, filtrar o paginar, la tabla anterior se queda atenuada mientras llega la nueva. */}
              {refreshing && <p className="visually-hidden" role="status">Actualizando resultados…</p>}
              <div className="institution-table-wrapper" ref={tableMemory} aria-busy={refreshing} role="region" aria-label="Listado de solicitudes" tabIndex={0}>
                <table className="institution-table has-actions linkage-inbox">
                  <caption className="visually-hidden">Solicitudes de vinculación recibidas</caption>
                  <thead><tr><th scope="col">Alumno</th><th scope="col">Empresa</th><th scope="col">Oportunidad</th><th scope="col">Recibida</th><th scope="col">Estado</th><th scope="col"><span className="visually-hidden">Detalle</span></th></tr></thead>
                  <tbody key={location.search} className="rows-enter">
                    {data.items.map((item, index) => {
                      const name = `${surnames(item.student)}, ${item.student.given_names}`
                      const href = `/institution/linkage-requests/${item.id}`
                      const back = backState('Volver a solicitudes', location)
                      return (
                        <tr key={item.id} data-href={href} style={rowIndex(index)}
                          className={[item.unread_count > 0 && 'has-unread', raised.has(item.id) && 'row-updated'].filter(Boolean).join(' ') || undefined} onClick={(event) => openRow(event, href, back)}>
                          {/* T-S8-15: solo lo que identifica; la carrera y el periodo están en el detalle. */}
                          {/* T-S13-10: el alumno es una pastilla a su expediente, en su propia celda. */}
                          <th scope="row">
                            <Link className="cell-pill" to={`/students/${item.student.id}`} state={back} aria-label={`Ver expediente de ${name}`} title={name}>
                              <span>{name}</span><ChevronRightIcon />
                            </Link>
                            <span className="linkage-meta mono">{item.student.enrollment_number}</span>
                          </th>
                          <td>
                            {/* T-S13-08: la conversación junto a la empresa, con sus mensajes sin leer. */}
                            <span className="cell-meta">
                              {item.company.name}
                              <span className="cell-actions">
                                <ConversationLink to={`${href}/chat`} state={back} counterpart={`${item.company.name} sobre ${name}`} count={item.unread_count} />
                              </span>
                            </span>
                            {item.company.municipality && <span className="linkage-meta">{item.company.municipality}</span>}
                          </td>
                          <td><span className="linkage-title" title={item.opportunity.title}>{item.opportunity.title}</span></td>
                          <td className="nowrap">
                            {dateFormat.format(new Date(item.created_at))}
                            {/* T-S13-09: explica por qué la fila está arriba con el orden por actividad. */}
                            {item.last_message_at && <span className="linkage-meta">{lastMessageLabel(item.last_message_at)}</span>}
                          </td>
                          <td>
                            <LinkageStatus status={item.status} />
                          </td>
                          <td>
                            <Link className="row-link row-open" to={href} state={back} title="Ver detalle"
                              aria-label={`Ver la solicitud de ${item.company.name} para ${name}`}><ChevronRightIcon /></Link>
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
