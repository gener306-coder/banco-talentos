import { useSkeletonDelay } from './useSkeletonDelay'

/**
 * Papel de una celda en el celular (T-S14-08): debajo de 600 px cada fila de un listado se apila como una tarjeta.
 * - `title`: lo que identifica la fila; va primero.
 * - `name`: sigue al título en la misma línea (por ejemplo, el nombre después de los apellidos).
 * - `meta`: línea secundaria atenuada.
 * - `inline`: dato breve atenuado; varios seguidos comparten la línea, separados por un punto medio.
 * - `block`: contenido propio a todo el ancho (habilidades, recurso de la bitácora).
 * - `status`: pastillas de estado, juntas al pie.
 * - `actions`: botones de la fila, al pie.
 * - `open`: la flecha del detalle, fija a la derecha.
 */
export type CellRole = 'title' | 'name' | 'meta' | 'inline' | 'block' | 'status' | 'actions' | 'open'

/** Forma del hueso de una columna: imita lo que mostrará la celda. */
export type BoneShape = 'text' | 'text-meta' | 'pill' | 'pill-meta' | 'short' | 'mono' | 'status' | 'chips' | 'open' | 'actions'

export interface TableColumn {
  /** Encabezado visible; con `hidden`, solo para lectores de pantalla. */
  label: string
  hidden?: boolean
  role: CellRole
  bone: BoneShape
}

/** Encabezado de un listado a partir de sus columnas: lo comparten la tabla real y su esqueleto. */
export function TableHead({ columns }: { columns: readonly TableColumn[] }) {
  return (
    <thead>
      <tr>
        {columns.map((column) => (
          <th scope="col" key={column.label}>{column.hidden ? <span className="visually-hidden">{column.label}</span> : column.label}</th>
        ))}
      </tr>
    </thead>
  )
}

function Bones({ shape }: { shape: BoneShape }) {
  switch (shape) {
    case 'text-meta': return <><span className="bone-line"><span className="bone v" /></span><span className="bone-line meta"><span className="bone meta" /></span></>
    case 'pill-meta': return <><span className="bone-line pill"><span className="bone pill v" /></span><span className="bone-line meta"><span className="bone meta" /></span></>
    case 'pill': return <span className="bone-line pill"><span className="bone pill v" /></span>
    case 'chips': return <span className="bone-line chips"><span className="bone pill chip" /><span className="bone pill chip" /><span className="bone pill chip short" /></span>
    case 'status': return <span className="bone-line"><span className="bone pill status" /></span>
    case 'open': return <span className="bone open" />
    case 'actions': return <span className="bone-line actions"><span className="bone pill action" /><span className="bone pill action short" /></span>
    default: return <span className="bone-line"><span className={`bone ${shape === 'text' ? 'v' : shape}`} /></span>
  }
}

/**
 * Esqueleto de un listado a la medida (T-S14-08): la misma tarjeta, el mismo encabezado y una fila por resultado con
 * huesos que imitan cada columna, así que al llegar los datos nada cambia de lugar. El marco reserva el espacio desde el
 * primer pintado; los huesos solo se ven si la espera supera el retardo del esqueleto. La carga se anuncia en un
 * `role="status"`; la tabla es decorativa.
 */
export function TableSkeleton({ label, columns, tableClass, rows = 8, pager = false }: {
  label: string
  columns: readonly TableColumn[]
  tableClass: string
  rows?: number
  pager?: boolean
}) {
  const shown = useSkeletonDelay()
  return (
    <div className={`table-card table-skeleton${shown ? '' : ' is-waiting'}`} aria-busy="true">
      <p className="visually-hidden" role="status">{label}</p>
      <div className="institution-table-wrapper">
        <table className={`${tableClass} stack-mobile`} aria-hidden="true" data-testid={shown ? 'skeleton' : undefined}>
          <TableHead columns={columns} />
          <tbody>
            {Array.from({ length: rows }, (_, row) => (
              <tr key={row}>
                {columns.map((column) => column.role === 'title'
                  ? <th key={column.label} data-cell={column.role}><Bones shape={column.bone} /></th>
                  : <td key={column.label} data-cell={column.role}><Bones shape={column.bone} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pager && <div className="pager" aria-hidden="true"><span className="bone pager-bone" /></div>}
    </div>
  )
}
