import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { periodLabel } from '../students/catalogs'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '../ui/icons'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { cancelLinkageRequest, LINKAGE_STATUSES, linkageMessages, listLinkageRequests } from './api'
import type { LinkageInboxItem, LinkageStatus as Status } from './api'
import { LinkageStatus } from './LinkageStatus'
import '../institutions/institutions.css'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })

/**
 * Bandeja de solicitudes de vinculación enviadas por la empresa (HU-S5-05 CA-05): filtro por estado, enlaces al perfil
 * anónimo y a la oportunidad, correo de contacto de la institución y cancelación confirmada de las pendientes.
 */
export function LinkageRequestsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<Status | ''>('')
  const load = useCallback((signal: AbortSignal) => listLinkageRequests({ page, status }, signal), [page, status])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, linkageMessages)
  const mutation = useApiMutation(linkageMessages)
  const [cancelling, setCancelling] = useState<LinkageInboxItem | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const origin = useRef<HTMLButtonElement | null>(null)

  async function cancel() {
    const target = cancelling
    setCancelling(null)
    if (!target || mutation.pending) return
    setNotice(null)
    await mutation.submit(() => cancelLinkageRequest(target.id), (updated) => {
      setData((current) => current && { ...current, items: current.items.map((item) => item.id === updated.id ? updated : item) })
      setNotice(`Solicitud para «${updated.opportunity.title}» cancelada correctamente.`)
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
      <form className="linkage-filter" role="search" aria-label="Filtrar solicitudes" onSubmit={(event) => event.preventDefault()}>
        <div>
          <label htmlFor="linkage-status-filter">Estado</label>
          <select id="linkage-status-filter" value={status}
            onChange={(event) => { setPage(1); setNotice(null); setStatus(event.target.value as Status | '') }}>
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
            <div className="institution-table-wrapper" role="region" aria-label="Listado de solicitudes" tabIndex={0}>
              <table className="institution-table">
                <caption className="visually-hidden">Solicitudes de vinculación enviadas</caption>
                <thead><tr><th scope="col">Perfil</th><th scope="col">Oportunidad</th><th scope="col">Institución</th><th scope="col">Enviada</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
                <tbody>
                  {data.items.map((item) => {
                    const headline = item.profile.headline ?? 'Perfil sin titular'
                    return (
                      <tr key={item.id}>
                        <th scope="row">
                          <Link to={`/talent/${item.profile.public_id}`}>{headline}</Link>
                          <span className="linkage-profile-meta">
                            {[item.profile.program, item.profile.period_type && item.profile.period_number ? periodLabel(item.profile.period_type, item.profile.period_number) : null].filter(Boolean).join(' · ')}
                          </span>
                        </th>
                        <td><Link to={`/opportunities/${item.opportunity.id}`}>{item.opportunity.title}</Link></td>
                        <td>{item.institution.name}<a className="linkage-profile-meta" href={`mailto:${item.institution.contact_email}`}>{item.institution.contact_email}</a></td>
                        <td>{dateFormat.format(new Date(item.created_at))}</td>
                        <td><LinkageStatus status={item.status} /></td>
                        <td>
                          {item.status === 'PENDIENTE_INSTITUCION'
                            ? (
                              <button type="button" className="secondary" disabled={mutation.pending}
                                aria-label={`Cancelar la solicitud de ${headline} para ${item.opportunity.title}`}
                                onClick={(event) => { origin.current = event.currentTarget; setCancelling(item) }}>Cancelar</button>
                            )
                            : '—'}
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
      <ConfirmDialog open={cancelling !== null} origin={origin}
        title="¿Cancelar la solicitud?"
        description="La institución ya no podrá responderla. Podrás enviar una nueva solicitud para el mismo perfil y oportunidad más adelante."
        confirmLabel="Cancelar solicitud" onConfirm={() => { void cancel() }} onCancel={() => setCancelling(null)} />
    </section>
  )
}
