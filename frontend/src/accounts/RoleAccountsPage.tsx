import { TableHead, TableSkeleton } from '../ui/TableSkeleton'
import type { TableColumn } from '../ui/TableSkeleton'
import { useCallback, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useAccountAccess } from '../accounts/useAccountAccess'
import { useAuth } from '../auth/useAuth'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { ChevronLeftIcon, ChevronRightIcon, MailIcon, PlusIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { useTableMemory } from '../ui/useTableMemory'
import { rowIndex } from '../ui/tableMotion'

import { useListParams } from '../ui/useListParams'
import type { ReactNode } from 'react'
import type { FailureMessages } from '../lib/useApiRequest'
import type { SetupAccount, SetupAccountStatus } from './api'
import '../institutions/institutions.css'

/** Página de cuentas de un rol sin organización invitado con enlace: la Secretaría (HU-S4-01) y Administración (HU-S16-02). */
export interface RoleAccountsConfig {
  /** Prefijo de los ids del título y de las hojas. */
  id: string
  title: string
  /** Sustantivo en las etiquetas: «Navegación de cuentas de la Secretaría», «Listado de cuentas de la Secretaría». */
  noun: string
  intro: string
  createLabel: string
  messages: FailureMessages
  list: (page: number, signal: AbortSignal) => Promise<{ accounts: SetupAccount[]; page: number; lastPage: number; total: number }>
  statusPath: (id: number) => string
  resetPath: string
  createForm: (onCreated: () => void) => ReactNode
  resendForm: (initialEmail: string) => ReactNode
  /** Ids de los títulos de las hojas, para su nombre accesible. */
  createTitleId: string
  resendTitleId: string
}

const statusLabels: Record<SetupAccountStatus, string> = { active: 'ACTIVA', pending: 'PENDIENTE', inactive: 'INACTIVA' }
const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })

/** Totales del pie con separador de miles (T-S14-08): «2,369 alumnos». */
const countFormat = new Intl.NumberFormat('es-MX')

/** Columnas del listado (T-S14-08): las comparten la tabla y su esqueleto. */
const columns: readonly TableColumn[] = [
  { label: 'Nombre', role: 'title', bone: 'text' },
  { label: 'Correo de acceso', role: 'meta', bone: 'text' },
  { label: 'Estado', role: 'status', bone: 'status' },
  { label: 'Alta', role: 'meta', bone: 'short' },
  { label: 'Acciones', role: 'actions', bone: 'actions' },
]

/**
 * Listado con su estado, alta y reenvío del enlace en hojas, e inactivación, activación y restablecimiento de
 * contraseña (HU-S4-01 CA-05, CA-08; HU-S6-04 CA-04; HU-S16-02).
 */
export function RoleAccountsPage({ config }: { config: RoleAccountsConfig }) {
  // T-S12-05: la página vive en la URL; recargar o compartir la vista la conserva.
  const { page, setPage } = useListParams()
  const { list } = config
  const load = useCallback((signal: AbortSignal) => list(page, signal), [list, page])
  const { data, loading, failure, refresh, setData, pending } = useApiRequest(load, config.messages)
  // T-S13-18: con un resultado a la vista, una consulta nueva lo atenúa en lugar de desmontarlo.
  const refreshing = pending && data !== null
  const tableMemory = useTableMemory(page)
  const location = useLocation()
  const { user } = useAuth()
  const access = useAccountAccess({
    statusPath: (account) => config.statusPath(account.id),
    resetPath: config.resetPath,
    messages: config.messages,
    selfId: user?.id,
    onUpdated: (updated) => setData((current) => current && { ...current, accounts: current.accounts.map((account) => account.id === updated.id ? updated : account) }),
  })
  const [sheet, setSheet] = useState<{ kind: 'create' } | { kind: 'resend'; email: string } | null>(null)
  const closeSheet = useCallback(() => setSheet(null), [])

  return (
    <section className="card institutions" aria-labelledby={`${config.id}-title`}>
      <nav className="institution-navigation" aria-label={`Navegación de cuentas ${config.noun}`}>
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
      </nav>
      <h2 id={`${config.id}-title`}>{config.title}</h2>
      <div className="institution-toolbar">
        <p>{config.intro}</p>
        <div className="actions">
          <button type="button" onClick={() => setSheet({ kind: 'create' })}><PlusIcon />{config.createLabel}</button>
          <button type="button" className="secondary" onClick={() => setSheet({ kind: 'resend', email: '' })}>Reenviar enlace</button>
        </div>
      </div>
      {access.feedback}
      {loading && !data ? <TableSkeleton label="Cargando cuentas…" columns={columns} tableClass="institution-table has-actions" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && (
          <>
            <div className={`table-card${refreshing ? ' is-refreshing' : ''}`}>
              {/* T-S13-18: al filtrar o paginar, la tabla anterior se queda atenuada mientras llega la nueva. */}
              {refreshing && <p className="visually-hidden" role="status">Actualizando resultados…</p>}
              <div className="institution-table-wrapper" ref={tableMemory} aria-busy={refreshing} role="region" aria-label={`Listado de cuentas ${config.noun}`} tabIndex={0}>
                <table className="institution-table has-actions stack-mobile">
                  <caption className="visually-hidden">{config.title}</caption>
                  <TableHead columns={columns} />
                  <tbody key={location.search} className="rows-enter">
                    {data.accounts.map((account, index) => (
                      <tr key={account.id} style={rowIndex(index)}>
                        <th scope="row" data-cell="title">{account.name}</th>
                        <td data-cell="meta">{account.email}</td>
                        <td data-cell="status"><span className={`institution-status ${account.status}`}>{statusLabels[account.status]}</span></td>
                        <td data-cell="meta"><span className="unit">Alta: </span>{dateFormat.format(new Date(account.created_at))}</td>
                        <td data-cell="actions">
                          <div className="actions">
                            {account.status === 'pending' && (
                              <button type="button" className="account-action" aria-label={`Reenviar enlace a ${account.name}`}
                                onClick={() => setSheet({ kind: 'resend', email: account.email })}><MailIcon />Reenviar enlace</button>
                            )}
                            {access.rowActions(account)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.lastPage > 1 && (
                <div className="pager">
                  <p>Página {data.page} de {countFormat.format(data.lastPage)} · {countFormat.format(data.total)} cuentas</p>
                  <div className="actions">
                    <button type="button" className="secondary" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeftIcon />Anterior</button>
                    <button type="button" className="secondary" disabled={data.page >= data.lastPage} onClick={() => setPage(data.page + 1)}>Siguiente<ChevronRightIcon /></button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      {access.dialog}
      <Sheet open={sheet?.kind === 'create'} onClose={closeSheet} labelledBy={config.createTitleId}>
        {config.createForm(() => { void refresh() })}
      </Sheet>
      <Sheet open={sheet?.kind === 'resend'} onClose={closeSheet} labelledBy={config.resendTitleId}>
        {/* key: cada apertura parte del correo de la fila elegida. */}
        {sheet?.kind === 'resend' && <div key={sheet.email}>{config.resendForm(sheet.email)}</div>}
      </Sheet>
    </section>
  )
}
