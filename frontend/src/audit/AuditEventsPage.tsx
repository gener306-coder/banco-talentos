import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { roleLabels } from '../auth/api'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '../ui/icons'
import { useTableMemory } from '../ui/useTableMemory'
import { rowIndex } from '../ui/tableMotion'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { useListParams } from '../ui/useListParams'
import { AUDIT_EVENT_TYPES, auditEventLabel, auditMessages, fieldLabel, listAuditEvents } from './api'
import type { AuditEvent, AuditEventType, ChangeResource } from './api'
import '../institutions/institutions.css'
import '../linkage/linkage.css'
import './audit.css'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

const subjectLabels = { company: 'Empresa', institution: 'Institución' } as const

/** HU-S14-04: a quién afectó el cambio y qué campos cambiaron, sin sus valores. */
function describeChange(resource: ChangeResource): string {
  return resource.subjectType === 'user'
    ? `Cuenta de ${roleLabels[resource.role ?? 'ADMIN']}: ${resource.name}`
    : `${subjectLabels[resource.subjectType]}: ${resource.name}`
}

/** Descripción pública del recurso (CA-03): nunca el alumno de una solicitud. */
function describe(event: AuditEvent): ReactNode {
  switch (event.type) {
    case 'account_created':
      return `Cuenta de ${roleLabels[event.resource.role]}: ${event.resource.name} (${event.resource.email})`
    case 'company_registered':
      return `Empresa: ${event.resource.name}`
    case 'opportunity_created':
      return `Oportunidad: ${event.resource.title}`
    case 'linkage_requested':
      return `Solicitud #${event.resource.id} de ${event.resource.company} a ${event.resource.institution}`
    case 'linkage_responded':
      return `Solicitud #${event.resource.id} de ${event.resource.company} a ${event.resource.institution}: ${event.resource.status === 'ACEPTADA' ? 'aceptada' : 'rechazada'}`
    case 'company_invited':
    case 'password_changed':
      return describeChange(event.resource)
    case 'account_updated':
    case 'organization_profile_updated': {
      const resource = event.resource
      return (
        <>
          {describeChange(resource)}
          {resource.fields.length > 0 && (
            <span className="audit-fields">Cambió: {resource.fields.map((field) => fieldLabel(field, resource.subjectType)).join(', ')}</span>
          )}
        </>
      )
    }
  }
}

/**
 * Bitácora de trazabilidad para ADMIN (HU-S7-03 CA-01 a CA-03): altas de cuentas, empresas y oportunidades, y
 * solicitudes de vinculación con su respuesta, de la más reciente a la más antigua, con filtro por tipo.
 */
export function AuditEventsPage() {
  // T-S12-05: el tipo y la página viven en la URL; recargar o compartir la vista la conserva.
  const list = useListParams()
  const typeParam = list.get('type')
  const type: AuditEventType | '' = AUDIT_EVENT_TYPES.find((item) => item.value === typeParam)?.value ?? ''
  const { page, setPage } = list
  const load = useCallback((signal: AbortSignal) => listAuditEvents({ page, type }, signal), [page, type])
  const { data, loading, failure, refresh, pending } = useApiRequest(load, auditMessages)
  // T-S13-18: con un resultado a la vista, una consulta nueva lo atenúa en lugar de desmontarlo.
  const refreshing = pending && data !== null
  const tableMemory = useTableMemory(page)
  const location = useLocation()

  return (
    <section className="card institutions" aria-labelledby="audit-events-title">
      <nav className="institution-navigation" aria-label="Navegación de la bitácora">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
      </nav>
      <h2 id="audit-events-title">Bitácora</h2>
      <p>Eventos registrados en el Banco de Talentos y la cuenta que los realizó. De los cambios solo se indica qué campos cambiaron, nunca sus valores. No incluye contraseñas ni datos personales de alumnos.</p>
      <form className="table-search" role="search" aria-label="Filtrar eventos" onSubmit={(event) => event.preventDefault()}>
        <div className="table-search-filter">
          <label htmlFor="audit-type-filter">Tipo de evento</label>
          <select id="audit-type-filter" value={type} onChange={(event) => { list.update({ type: event.target.value }) }}>
            <option value="">Todos los eventos</option>
            {AUDIT_EVENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      </form>
      {loading && !data ? <LoadingState label="Cargando bitácora…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.items.length === 0
          ? <StateMessage kind="empty" icon={<SearchIcon />}
            title={type ? 'Ningún evento de ese tipo.' : 'Aún no hay eventos registrados.'}
            description={type ? 'Elige otro tipo o revisa todos los eventos.' : 'Aparecerán aquí cuando se creen o cambien cuentas, empresas, oportunidades o solicitudes.'} />
        : data && (
          <>
            <div className={`table-card${refreshing ? ' is-refreshing' : ''}`}>
              {/* T-S13-18: al filtrar o paginar, la tabla anterior se queda atenuada mientras llega la nueva. */}
              {refreshing && <p className="visually-hidden" role="status">Actualizando resultados…</p>}
              <div className="institution-table-wrapper" ref={tableMemory} aria-busy={refreshing} role="region" aria-label="Listado de eventos" tabIndex={0}>
                <table className="institution-table audit-table">
                  <caption className="visually-hidden">Eventos de la bitácora</caption>
                  <thead><tr><th scope="col">Fecha</th><th scope="col">Evento</th><th scope="col">Realizó</th><th scope="col">Recurso</th></tr></thead>
                  <tbody key={location.search} className="rows-enter">
                    {data.items.map((event, index) => (
                      // Un mismo recurso puede tener varios eventos del mismo tipo (p. ej. cambios de contraseña).
                      <tr key={`${event.type}-${event.resource.id}-${event.occurred_at}-${index}`} style={rowIndex(index)}>
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
            </div>
          </>
        )}
    </section>
  )
}
