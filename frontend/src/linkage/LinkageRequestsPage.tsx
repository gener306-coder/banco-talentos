import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmailMenu } from '../ui/EmailMenu'
import { ChevronLeftIcon, ChevronRightIcon, MessageIcon, PhoneIcon, SearchIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { backState } from '../ui/backLink'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { useListParams } from '../ui/useListParams'
import { useRowNavigation } from '../ui/useRowNavigation'
import { cancelLinkageRequest, LINKAGE_STATUSES, linkageMessages, listLinkageRequests } from './api'
import type { LinkageInboxItem, LinkageStatus as Status } from './api'
import { LinkageStatus } from './LinkageStatus'
import '../institutions/institutions.css'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })

/**
 * Bandeja de solicitudes de vinculación enviadas por la empresa (HU-S5-05 CA-05): filtro por estado, fila clicable al perfil
 * anónimo y pastillas al perfil y a la oportunidad (T-S12-04), correo de contacto de la institución y cancelación confirmada de las pendientes. Muestra
 * la fecha y el mensaje de la respuesta institucional (HU-S6-02 CA-04).
 */
export function LinkageRequestsPage() {
  // T-S12-04 y T-S12-05: el estado y la página viven en la URL, como en la bandeja de la institución, para que el regreso
  // desde el perfil o la oportunidad recupere la misma vista. Cambiar el filtro vuelve a la página 1.
  const list = useListParams()
  const statusParam = list.get('status')
  const status: Status | '' = LINKAGE_STATUSES.find((item) => item.value === statusParam)?.value ?? ''
  const { page, setPage } = list
  const location = useLocation()
  const openRow = useRowNavigation()
  const load = useCallback((signal: AbortSignal) => listLinkageRequests({ page, status }, signal), [page, status])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, linkageMessages)
  const mutation = useApiMutation(linkageMessages)
  const [cancelling, setCancelling] = useState<LinkageInboxItem | null>(null)
  const [notice, setNotice] = useState<ReactNode>(null)
  // T-S12-06: solicitud cuyo mensaje de respuesta se lee completo. La hoja vive fuera de la tabla: su contenido no
  // está dentro de ninguna fila y su clic nunca la abre.
  const [reading, setReading] = useState<LinkageInboxItem | null>(null)
  const messageOrigin = useRef<HTMLButtonElement | null>(null)
  const closeMessage = useCallback(() => { setReading(null); messageOrigin.current?.focus() }, [])
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
      <p>Solicitudes que tu empresa envió a las instituciones educativas. La coordinación posterior ocurre fuera de la plataforma con el contacto de cada institución.</p>
      <form className="table-search" role="search" aria-label="Filtrar solicitudes" onSubmit={(event) => event.preventDefault()}>
        <div className="table-search-filter">
          <label htmlFor="linkage-status-filter">Estado</label>
          <select id="linkage-status-filter" value={status}
            onChange={(event) => {
              setNotice(null)
              list.update({ status: event.target.value })
            }}>
            <option value="">Todos los estados</option>
            {LINKAGE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      </form>
      {notice && <p className="institution-success" role="status">{notice}</p>}
      {cancelError && <p className="notice" role="alert">{cancelError}</p>}
      {loading ? <LoadingState label="Cargando solicitudes…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.items.length === 0
          ? status
            ? <StateMessage kind="empty" icon={<SearchIcon />} title="Ninguna solicitud con ese estado."
              description="Elige otro estado o revisa todas las solicitudes." />
            : <StateMessage kind="empty" icon={<SearchIcon />} title="Aún no has enviado solicitudes."
              description="Busca perfiles en el Banco de Talentos y solicita su vinculación desde el perfil."
              action={<Link className="institution-button" to="/talent"><SearchIcon />Buscar talento</Link>} />
        : data && (
          <>
            <div className="table-card">
              <div className="institution-table-wrapper" role="region" aria-label="Listado de solicitudes" tabIndex={0}>
                <table className="institution-table has-actions linkage-sent">
                  <caption className="visually-hidden">Solicitudes de vinculación enviadas</caption>
                  <thead><tr><th scope="col">Perfil</th><th scope="col">Oportunidad</th><th scope="col">Institución</th><th scope="col">Enviada</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
                  <tbody>
                    {data.items.map((item) => {
                      const headline = item.profile.headline ?? 'Perfil sin titular'
                      const profileHref = `/talent/${item.profile.public_id}`
                      // T-S12-04: el perfil y la oportunidad regresan a esta bandeja con su filtro.
                      const back = backState('Volver a solicitudes', location)
                      return (
                        <tr key={item.id} data-href={profileHref} onClick={(event) => openRow(event, profileHref, back)}>
                          {/* T-S8-15: lo esencial de cada columna; el periodo y el puesto quedan a un paso (perfil y cursor). */}
                          <th scope="row">
                            {headline}
                            {item.profile.program && <span className="linkage-meta">{item.profile.program}</span>}
                          </th>
                          <td><span className="linkage-title" title={item.opportunity.title}>{item.opportunity.title}</span></td>
                          <td>
                            {item.institution.name}
                            {/* T-S12-05: el contacto es una acción del dato (la institución), no de la fila: sus íconos van
                                junto al nombre del responsable, discretos, y la columna Acciones queda para la fila. */}
                            <span className="linkage-meta cell-meta">
                              {item.institution.contact_name && (
                                <span title={item.institution.contact_position ?? undefined}>{item.institution.contact_name}</span>
                              )}
                              <span className="cell-actions">
                                {/* T-S12-06: mailto: falla sin cliente de correo; el ícono ofrece copiar, webmail o la app. */}
                                <EmailMenu email={item.institution.contact_email} />
                                {item.institution.contact_phone && (
                                  <a href={`tel:${item.institution.contact_phone.replace(/[^\d+]/g, '')}`}
                                    aria-label={`Llamar al ${item.institution.contact_phone}`} title={item.institution.contact_phone}><PhoneIcon /></a>
                                )}
                              </span>
                            </span>
                          </td>
                          <td className="nowrap">{dateFormat.format(new Date(item.created_at))}</td>
                          <td>
                            {/* Respuesta de la institución (HU-S6-02 CA-04). T-S12-06: el mensaje no se trunca en la celda;
                                un ícono junto al estado lo abre completo en una hoja. */}
                            <span className="cell-meta">
                              <LinkageStatus status={item.status} />
                              {item.response_message && (
                                <span className="cell-actions">
                                  <button type="button" aria-haspopup="dialog" aria-label={`Leer el mensaje de ${item.institution.name}`}
                                    title="Mensaje de la institución" onClick={(event) => { messageOrigin.current = event.currentTarget; setReading(item) }}>
                                    <MessageIcon />
                                  </button>
                                </span>
                              )}
                            </span>
                            {item.responded_at && <span className="linkage-meta">Respondida el {dateFormat.format(new Date(item.responded_at))}</span>}
                          </td>
                          <td>
                            <div className="actions">
                              <Link className="pill-link row-link" to={profileHref} state={back} aria-label={`Ver perfil: ${headline}`}>Ver perfil<ChevronRightIcon /></Link>
                              <Link className="pill-link" to={`/opportunities/${item.opportunity.id}`} state={back}
                                aria-label={`Ver la oportunidad ${item.opportunity.title}`}>Oportunidad<ChevronRightIcon /></Link>
                              {item.status === 'PENDIENTE_INSTITUCION' && (
                                <button type="button" className="account-action danger" disabled={mutation.pending}
                                  aria-label={`Cancelar la solicitud de ${headline} para ${item.opportunity.title}`}
                                  onClick={(event) => { origin.current = event.currentTarget; setCancelling(item) }}>Cancelar</button>
                              )}
                            </div>
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
      <Sheet open={reading !== null} onClose={closeMessage} labelledBy="linkage-message-title">
        {reading && (
          <div className="linkage-message">
            <h3 id="linkage-message-title">Mensaje de la institución</h3>
            <p className="linkage-message-meta">
              <strong>{reading.institution.name}</strong> · <LinkageStatus status={reading.status} />
              {reading.responded_at && <> · Respondida el {dateFormat.format(new Date(reading.responded_at))}</>}
            </p>
            <p className="linkage-message-meta">Solicitud para <strong>{reading.opportunity.title}</strong></p>
            <blockquote className="linkage-message-text">{reading.response_message}</blockquote>
          </div>
        )}
      </Sheet>
    </section>
  )
}
