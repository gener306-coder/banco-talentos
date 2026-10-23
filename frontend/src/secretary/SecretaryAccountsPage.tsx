import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { LoadingState } from '../ui/StateMessage'
import { listSecretaryAccounts, secretaryMessages } from './api'
import type { SecretaryAccountStatus } from './api'
import { SecretaryAccountForm, SecretarySetupLinkForm } from './SecretaryAccountForms'
import '../institutions/institutions.css'

const statusLabels: Record<SecretaryAccountStatus, string> = { active: 'ACTIVA', pending: 'PENDIENTE', inactive: 'INACTIVA' }
const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })

/**
 * Cuentas de la Secretaría de Economía (HU-S4-01 CA-05, CA-08): listado con su estado, alta y reenvío del enlace
 * en hojas. Disponible para ADMIN y SECRETARY.
 */
export function SecretaryAccountsPage() {
  const [page, setPage] = useState(1)
  const load = useCallback((signal: AbortSignal) => listSecretaryAccounts(page, signal), [page])
  const { data, loading, failure, refresh } = useApiRequest(load, secretaryMessages)
  const [sheet, setSheet] = useState<{ kind: 'create' } | { kind: 'resend'; email: string } | null>(null)
  const closeSheet = useCallback(() => setSheet(null), [])

  return (
    <section className="card institutions" aria-labelledby="secretary-accounts-title">
      <nav className="institution-navigation" aria-label="Navegación de cuentas de la Secretaría">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
      </nav>
      <h2 id="secretary-accounts-title">Cuentas de la Secretaría</h2>
      <div className="institution-toolbar">
        <p>Personal de la Secretaría de Economía que valida y registra a las empresas.</p>
        <div className="actions">
          <button type="button" onClick={() => setSheet({ kind: 'create' })}><PlusIcon />Nueva cuenta de la Secretaría</button>
          <button type="button" className="secondary" onClick={() => setSheet({ kind: 'resend', email: '' })}>Reenviar enlace</button>
        </div>
      </div>
      {loading ? <LoadingState label="Cargando cuentas…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && (
          <>
            <div className="institution-table-wrapper" role="region" aria-label="Listado de cuentas de la Secretaría" tabIndex={0}>
              <table className="institution-table">
                <caption className="visually-hidden">Cuentas de la Secretaría</caption>
                <thead><tr><th scope="col">Nombre</th><th scope="col">Correo de acceso</th><th scope="col">Estado</th><th scope="col">Alta</th><th scope="col">Acciones</th></tr></thead>
                <tbody>
                  {data.accounts.map((account) => (
                    <tr key={account.id}>
                      <th scope="row">{account.name}</th>
                      <td>{account.email}</td>
                      <td><span className={`institution-status ${account.status}`}>{statusLabels[account.status]}</span></td>
                      <td>{dateFormat.format(new Date(account.created_at))}</td>
                      <td>{account.status === 'pending' && (
                        <button type="button" className="secondary" aria-label={`Reenviar enlace a ${account.name}`}
                          onClick={() => setSheet({ kind: 'resend', email: account.email })}>Reenviar enlace</button>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.lastPage > 1 && (
              <div className="pager">
                <p>Página {data.page} de {data.lastPage} · {data.total} cuentas</p>
                <div className="actions">
                  <button type="button" className="secondary" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeftIcon />Anterior</button>
                  <button type="button" className="secondary" disabled={data.page >= data.lastPage} onClick={() => setPage(data.page + 1)}>Siguiente<ChevronRightIcon /></button>
                </div>
              </div>
            )}
          </>
        )}
      <Sheet open={sheet?.kind === 'create'} onClose={closeSheet} labelledBy="secretary-account-title">
        <SecretaryAccountForm onCreated={() => { void refresh() }} />
      </Sheet>
      <Sheet open={sheet?.kind === 'resend'} onClose={closeSheet} labelledBy="secretary-setup-link-title">
        {/* key: cada apertura parte del correo de la fila elegida. */}
        {sheet?.kind === 'resend' && <SecretarySetupLinkForm key={sheet.email} initialEmail={sheet.email} />}
      </Sheet>
    </section>
  )
}
