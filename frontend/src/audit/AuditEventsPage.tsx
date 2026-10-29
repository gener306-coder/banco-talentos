import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { roleLabels } from '../auth/api'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '../ui/icons'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { AUDIT_EVENT_TYPES, auditEventLabel, auditMessages, listAuditEvents } from './api'
import type { AuditEvent, AuditEventType } from './api'
import '../institutions/institutions.css'
import '../linkage/linkage.css'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

/** Descripción pública del recurso (CA-03): nunca el alumno de una solicitud. */
function describe(event: AuditEvent): string {
  switch (event.type) {
    case 'account_created':
      return `Cuenta de ${roleLabels[event.resource.role]}: ${event.resource.name} (${event.resource.email})`
    case 'company_registered':
      return `Empresa: ${event.resource.legal_name}`
    case 'opportunity_created':
      return `Oportunidad: «${event.resource.title}»`
    case 'linkage_requested':
      return `Solicitud #${event.resource.id} de ${event.resource.company} a ${event.resource.institution}`
    case 'linkage_responded':
      return `Solicitud #${event.resource.id} de ${event.resource.company} a ${event.resource.institution}: ${event.resource.status === 'ACEPTADA' ? 'aceptada' : 'rechazada'}`
  }
}

/**
 * Bitácora de trazabilidad para ADMIN (HU-S7-03 CA-01 a CA-03): altas de cuentas, empresas y oportunidades, y
 * solicitudes de vinculación con su respuesta, de la más reciente a la más antigua, con filtro por tipo.
 */
export function AuditEventsPage() {
  const [page, setPage] = useState(1)
  const [type, setType] = useState<AuditEventType | ''>('')
  const load = useCallback((signal: AbortSignal) => listAuditEvents({ page, type }, signal), [page, type])
  const { data, loading, failure, refresh } = useApiRequest(load, auditMessages)

  return (
    <section className="card institutions" aria-labelledby="audit-events-title">
      <nav className="institution-navigation" aria-label="Navegación de la bitácora">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
      </nav>
      <h2 id="audit-events-title">Bitácora</h2>
      <p>Eventos registrados en el Banco de Talentos y la cuenta que los realizó. No incluye contraseñas ni datos personales de alumnos.</p>
      <form className="table-search" role="search" aria-label="Filtrar eventos" onSubmit={(event) => event.preventDefault()}>
        <div className="table-search-filter">
          <label htmlFor="audit-type-filter">Tipo de evento</label>
          <select id="audit-type-filter" value={type} onChange={(event) => { setPage(1); setType(event.target.value as AuditEventType | '') }}>
            <option value="">Todos los eventos</option>
            {AUDIT_EVENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      </form>
      {loading ? <LoadingState label="Cargando bitácora…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.items.length === 0
          ? <StateMessage kind="empty" icon={<SearchIcon />}
            title={type ? 'Ningún evento de ese tipo.' : 'Aún no hay eventos registrados.'}
            description={type ? 'Elige otro tipo o revisa todos los eventos.' : 'Aparecerán aquí cuando se creen cuentas, empresas, oportunidades o solicitudes.'} />
        : data && (
          <>
            <div className="institution-table-wrapper" role="region" aria-label="Listado de eventos" tabIndex={0}>
              <table className="institution-table">
                <caption className="visually-hidden">Eventos de la bitácora</caption>
                <thead><tr><th scope="col">Fecha</th><th scope="col">Evento</th><th scope="col">Realizó</th><th scope="col">Recurso</th></tr></thead>
                <tbody>
                  {data.items.map((event) => (
                    <tr key={`${event.type}-${event.resource.id}`}>
                      <td><time dateTime={event.occurred_at}>{dateFormat.format(new Date(event.occurred_at))}</time></td>
                      <th scope="row">{auditEventLabel(event.type)}</th>
                      <td>
                        {event.actor.name}
                        <span className="linkage-profile-meta">{roleLabels[event.actor.role]}</span>
                      </td>
                      <td>{describe(event)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.lastPage > 1 && (
              <div className="pager">
                <p>Página {data.page} de {data.lastPage} · {data.total} eventos</p>
                <div className="actions">
                  <button type="button" className="secondary" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeftIcon />Anterior</button>
                  <button type="button" className="secondary" disabled={data.page >= data.lastPage} onClick={() => setPage(data.page + 1)}>Siguiente<ChevronRightIcon /></button>
                </div>
              </div>
            )}
          </>
        )}
    </section>
  )
}
