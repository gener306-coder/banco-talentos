import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmailMenu } from '../ui/EmailMenu'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PhoneIcon, SearchIcon } from '../ui/icons'
import { backState } from '../ui/backLink'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { useListParams } from '../ui/useListParams'
import { useRowNavigation } from '../ui/useRowNavigation'
import { useTableMemory } from '../ui/useTableMemory'
import { rowIndex } from '../ui/tableMotion'
import { cancelLinkageRequest, linkageMessages, listLinkageRequests } from './api'
import type { LinkageInboxItem } from './api'
import { LinkageStatus } from './LinkageStatus'
import { NotificationPrompt } from './NotificationPrompt'
import { isFiltered, lastMessageLabel, useInboxFilters } from './inboxFilters'
import { LinkageInboxFilters } from './LinkageInboxFilters'
import { useLiveRows } from './useLiveInbox'
import { ConversationLink } from './UnreadBadge'
import '../institutions/institutions.css'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })

/**
 * Bandeja de solicitudes de vinculación enviadas por la empresa (HU-S5-05 CA-05): filtro por estado, fila clicable al detalle
 * de la solicitud (HU-S13-02) y pastillas al detalle, al perfil anónimo y a la oportunidad (T-S12-04), correo de contacto de la institución y cancelación confirmada de las pendientes. Muestra
 * la fecha de la respuesta institucional (HU-S6-02 CA-04); su mensaje se lee en la conversación (HU-S13-06).
 */
export function LinkageRequestsPage() {
  // T-S12-04 y T-S12-05: el estado y la página viven en la URL, como en la bandeja de la institución, para que el regreso
  // desde el detalle, el perfil o la oportunidad recupere la misma vista. Cambiar el filtro vuelve a la página 1.
  const list = useListParams()
  // T-S13-09: estado, búsqueda, interacción y orden viven en la URL: el regreso desde el chat o el detalle los conserva.
  const filters = useInboxFilters(list)
  const { status, q, interaction, sort } = filters
  const { page, setPage } = list
  const location = useLocation()
  const openRow = useRowNavigation()
  // T-S13-12: al volver de una fila, la tabla recupera su posición y la fila parpadea.
  const tableMemory = useTableMemory(page)
  const load = useCallback((signal: AbortSignal) => listLinkageRequests({ page, status, q, interaction, sort }, signal), [page, status, q, interaction, sort])
  const { data, loading, failure, refresh, setData, pending } = useApiRequest(load, linkageMessages)
  // T-S13-13: con un resultado a la vista, una consulta nueva lo atenúa en lugar de desmontarlo.
  const refreshing = pending && data !== null
  // T-S13-10 y T-S13-13: cuando llegan mensajes nuevos, la tabla se vuelve a pedir sin indicador de carga ni perder la
  // vista, y las filas cuyo contador subió pulsan una vez.
  const raised = useLiveRows(data?.items, useCallback(() => load(new AbortController().signal), [load]), setData)
  const mutation = useApiMutation(linkageMessages)
  const [cancelling, setCancelling] = useState<LinkageInboxItem | null>(null)
  const [notice, setNotice] = useState<ReactNode>(null)
  const origin = useRef<HTMLButtonElement | null>(null)

  async function cancel() {
    const target = cancelling
    setCancelling(null)
    if (!target || mutation.pending) return
    setNotice(null)
    await mutation.submit(() => cancelLinkageRequest(target.id), (updated) => {
      setData((current) => current && { ...current, items: current.items.map((item) => item.id === updated.id ? updated : item) })
      setNotice(<>Solicitud para <strong className="notice-subject">{updated.opportunity.title}</strong> cancelada correctamente.</>)
    })
  }

  const cancelError = mutation.failure && (mutation.failure.errors.status?.join(' ') ?? mutation.failure.message)

  return (
    <section className="card institutions" aria-labelledby="linkage-requests-title">
      <nav className="institution-navigation" aria-label="Navegación de solicitudes">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
        <Link className="plain" to="/talent">Buscar talento</Link>
      </nav>
      <h2 id="linkage-requests-title">Solicitudes de vinculación</h2>
      <p>Solicitudes que tu empresa envió a las instituciones educativas. Las aceptadas se coordinan en la conversación de su detalle o con el contacto de cada institución.</p>
      <NotificationPrompt />
      {/* T-S13-09: búsqueda, Estado, Interacción y Orden. Sin filtro aparte por institución: la búsqueda la cubre. */}
      <LinkageInboxFilters idPrefix="linkage" searchLabel="Buscar por institución, oportunidad o perfil"
        placeholder="Ej. Tecnológica o analista de datos" filters={filters} busy={refreshing}
        onChange={(changes) => { setNotice(null); list.update(changes) }} onClear={() => { setNotice(null); list.clear() }} />
      {notice && <p className="institution-success" role="status">{notice}</p>}
      {cancelError && <p className="notice" role="alert">{cancelError}</p>}
      {loading && !data ? <LoadingState label="Cargando solicitudes…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.items.length === 0
          ? isFiltered(filters)
            ? <StateMessage kind="empty" icon={<SearchIcon />} title="Ninguna solicitud coincide con la búsqueda o los filtros."
              description={q
                ? <>No hay solicitudes que coincidan con <strong className="notice-subject">{q}</strong>{status || interaction !== 'all' ? ' y los filtros elegidos' : ''}.</>
                : 'Cambia los filtros o quítalos para ver todas las solicitudes.'}
              action={<button type="button" className="secondary" onClick={list.clear}>Limpiar filtros</button>} />
            : <StateMessage kind="empty" icon={<SearchIcon />} title="Aún no has enviado solicitudes."
              description="Busca perfiles en el Banco de Talentos y solicita su vinculación desde el perfil."
              action={<Link className="institution-button" to="/talent"><SearchIcon />Buscar talento</Link>} />
        : data && (
          <>
            <div className={`table-card${refreshing ? ' is-refreshing' : ''}`}>
              {/* T-S13-13: al buscar, filtrar o paginar, la tabla anterior se queda atenuada mientras llega la nueva. */}
              {refreshing && <p className="visually-hidden" role="status">Actualizando resultados…</p>}
              <div className="institution-table-wrapper" ref={tableMemory} aria-busy={refreshing} role="region" aria-label="Listado de solicitudes" tabIndex={0}>
                <table className="institution-table has-actions linkage-sent">
                  <caption className="visually-hidden">Solicitudes de vinculación enviadas</caption>
                  <thead><tr><th scope="col">Perfil</th><th scope="col">Oportunidad</th><th scope="col">Institución</th><th scope="col">Enviada</th><th scope="col">Estado</th><th scope="col"><span className="visually-hidden">Detalle</span></th></tr></thead>
                  <tbody key={location.search} className="rows-enter">
                    {data.items.map((item, index) => {
                      const headline = item.profile.headline ?? 'Perfil sin titular'
                      const href = `/linkage-requests/${item.id}`
                      // T-S12-04: el detalle, el perfil y la oportunidad regresan a esta bandeja con su filtro.
                      const back = backState('Volver a solicitudes', location)
                      return (
                        <tr key={item.id} data-href={href} style={rowIndex(index)}
                          className={[item.unread_count > 0 && 'has-unread', raised.has(item.id) && 'row-updated'].filter(Boolean).join(' ') || undefined} onClick={(event) => openRow(event, href, back)}>
                          {/* T-S8-15: lo esencial de cada columna; el periodo y el puesto quedan a un paso (perfil y cursor). */}
                          {/* T-S13-10: el perfil y la oportunidad son pastillas en su propia celda (sin columna Acciones). */}
                          <th scope="row">
                            <Link className="cell-pill" to={`/talent/${item.profile.public_id}`} state={back} aria-label={`Ver perfil: ${headline}`} title={headline}>
                              <span>{headline}</span><ChevronRightIcon />
                            </Link>
                            {item.profile.program && <span className="linkage-meta">{item.profile.program}</span>}
                          </th>
                          <td>
                            <Link className="cell-pill" to={`/opportunities/${item.opportunity.id}`} state={back}
                              aria-label={`Ver la oportunidad ${item.opportunity.title}`} title={item.opportunity.title}>
                              <span>{item.opportunity.title}</span><ChevronRightIcon />
                            </Link>
                          </td>
                          <td>
                            {item.institution.name}
                            {/* T-S12-05: el contacto es una acción del dato (la institución), no de la fila: sus íconos van
                                junto al nombre del responsable, discretos, y la columna Acciones queda para la fila. */}
                            <span className="linkage-meta cell-meta">
                              {item.institution.contact_name && (
                                <span title={item.institution.contact_position ?? undefined}>{item.institution.contact_name}</span>
                              )}
                              <span className="cell-actions">
                                {/* T-S13-08: la conversación es la primera vía de contacto, junto al correo y el teléfono, con
                                    sus mensajes sin leer. */}
                                <ConversationLink to={`/linkage-requests/${item.id}/chat`} state={back} counterpart={item.institution.name} count={item.unread_count} />
                                {/* T-S12-06: mailto: falla sin cliente de correo; el ícono ofrece copiar, webmail o la app. */}
                                <EmailMenu email={item.institution.contact_email} />
                                {item.institution.contact_phone && (
                                  <a href={`tel:${item.institution.contact_phone.replace(/[^\d+]/g, '')}`}
                                    aria-label={`Llamar al ${item.institution.contact_phone}`} title={item.institution.contact_phone}><PhoneIcon /></a>
                                )}
                              </span>
                            </span>
                          </td>
                          <td className="nowrap">
                            {dateFormat.format(new Date(item.created_at))}
                            {/* T-S13-09: explica por qué la fila está arriba con el orden por actividad. */}
                            {item.last_message_at && <span className="linkage-meta">{lastMessageLabel(item.last_message_at)}</span>}
                          </td>
                          <td>
                            <LinkageStatus status={item.status} />
                            {item.responded_at && <span className="linkage-meta">Respondida el {dateFormat.format(new Date(item.responded_at))}</span>}
                            {/* T-S13-10: cancelar es una acción del estado pendiente, discreta bajo él. */}
                            {item.status === 'PENDIENTE_INSTITUCION' && (
                              <button type="button" className="plain cell-cancel" disabled={mutation.pending}
                                aria-label={`Cancelar la solicitud de ${headline} para ${item.opportunity.title}`}
                                onClick={(event) => { origin.current = event.currentTarget; setCancelling(item) }}><CloseIcon />Cancelar solicitud</button>
                            )}
                          </td>
                          <td>
                            {/* HU-S13-02: la flecha es el control accesible de la fila, con su mismo destino. */}
                            <Link className="row-link row-open" to={href} state={back} title="Ver detalle"
                              aria-label={`Ver la solicitud de ${headline} para ${item.opportunity.title}`}><ChevronRightIcon /></Link>
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
      <ConfirmDialog open={cancelling !== null} origin={origin}
        title="¿Cancelar la solicitud?"
        description="La institución ya no podrá responderla. Podrás enviar una nueva solicitud para el mismo perfil y oportunidad más adelante."
        confirmLabel="Cancelar solicitud" onConfirm={() => { void cancel() }} onCancel={() => setCancelling(null)} />
    </section>
  )
}
