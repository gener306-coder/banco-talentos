import { TableHead, TableSkeleton } from '../ui/TableSkeleton'
import type { TableColumn } from '../ui/TableSkeleton'
import { Link } from 'react-router'
import { BuildingIcon, ChevronRightIcon, PlusIcon } from '../ui/icons'
import { StateMessage } from '../ui/StateMessage'
import { useRowNavigation } from '../ui/useRowNavigation'
import { useTableMemory } from '../ui/useTableMemory'
import { rowIndex } from '../ui/tableMotion'
import { listInstitutions } from './api'
import { InstitutionLayout, InstitutionRequestError, InstitutionStatus } from './InstitutionLayout'
import { useInstitutionRequest } from './useInstitutionRequest'

/** Columnas del listado (T-S14-08): las comparten la tabla y su esqueleto. */
const columns: readonly TableColumn[] = [
  { label: 'Nombre', role: 'title', bone: 'text' },
  { label: 'CCT', role: 'inline', bone: 'mono' },
  { label: 'Correo de contacto', role: 'meta', bone: 'text' },
  { label: 'Estado', role: 'status', bone: 'status' },
  { label: 'Detalle', hidden: true, role: 'open', bone: 'open' },
]

export function InstitutionsPage() {
  const { data, loading, failure, refresh, pending } = useInstitutionRequest(listInstitutions)
  // T-S13-13: con un resultado a la vista, una consulta nueva lo atenúa en lugar de desmontarlo.
  const refreshing = pending && data !== null

  // Toda la fila abre el detalle con el puntero; el enlace «Ver detalle» sigue siendo el control accesible (HU-S8-01).
  const openRow = useRowNavigation()
  // T-S13-12: al volver de una fila, la tabla recupera su posición y la fila parpadea.
  const tableMemory = useTableMemory()

  return (
    <InstitutionLayout title="Instituciones">
      <div className="institution-toolbar">
        <p>Consulta y administra las instituciones educativas registradas.</p>
        <Link className="institution-button" to="/institutions/new"><PlusIcon />Nueva institución</Link>
      </div>
      {loading && !data ? <TableSkeleton label="Cargando instituciones…" columns={columns} tableClass="institution-table has-actions" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.length === 0
          ? <StateMessage kind="empty" icon={<BuildingIcon />} title="No hay instituciones registradas."
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
                <tbody className="rows-enter">
                  {data.map((institution, index) => {
                    const href = `/institutions/${institution.id}`
                    return (
                      <tr key={institution.id} data-href={href} style={rowIndex(index)} onClick={(event) => openRow(event, href)}>
                        <th scope="row" data-cell="title">{institution.name}</th>
                        <td data-cell="inline">{institution.cct}</td>
                        <td data-cell="meta">{institution.contact_email}</td>
                        <td data-cell="status"><InstitutionStatus active={institution.is_active} /></td>
                        <td data-cell="open"><Link className="row-link row-open" to={href} aria-label={`Ver detalle de ${institution.name}`} title="Ver detalle"><ChevronRightIcon /></Link></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </InstitutionLayout>
  )
}
