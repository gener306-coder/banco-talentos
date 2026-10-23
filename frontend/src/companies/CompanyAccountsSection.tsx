import { useCallback, useState } from 'react'
import { SetupAccountForm, SetupLinkResendForm } from '../accounts/SetupAccountForms'
import type { SetupAccountStatus } from '../accounts/api'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { PlusIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { LoadingState } from '../ui/StateMessage'
import { companyMessages, createCompanyAccount, listCompanyAccounts, resendCompanyAccountSetup } from './api'

const statusLabels: Record<SetupAccountStatus, string> = { active: 'ACTIVA', pending: 'PENDIENTE', inactive: 'INACTIVA' }

/**
 * Cuentas de acceso de la empresa (HU-S4-03): listado con su estado (CA-06) y, si la empresa está activa, alta y
 * reenvío del enlace en hojas (CA-01, CA-02).
 */
export function CompanyAccountsSection({ companyId, active }: { companyId: number; active: boolean }) {
  const load = useCallback((signal: AbortSignal) => listCompanyAccounts(companyId, signal), [companyId])
  const { data, loading, failure, refresh } = useApiRequest(load, companyMessages)
  const [sheet, setSheet] = useState<{ kind: 'create' } | { kind: 'resend'; email: string } | null>(null)
  const closeSheet = useCallback(() => setSheet(null), [])
  const create = useCallback((input: Parameters<typeof createCompanyAccount>[1]) => createCompanyAccount(companyId, input), [companyId])
  const resend = useCallback((input: Parameters<typeof resendCompanyAccountSetup>[1]) => resendCompanyAccountSetup(companyId, input), [companyId])

  return (
    <section className="institution-accounts" aria-labelledby="company-accounts-title">
      <h3 id="company-accounts-title">Cuentas de la empresa</h3>
      <p>Personal de la empresa que podrá entrar al Banco de Talentos. Cada persona establece su propia contraseña.</p>
      {active
        ? (
          <div className="actions">
            <button type="button" onClick={() => setSheet({ kind: 'create' })}><PlusIcon />Nueva cuenta de la empresa</button>
            <button type="button" className="secondary" onClick={() => setSheet({ kind: 'resend', email: '' })}>Reenviar enlace</button>
          </div>
        )
        : <p className="notice">Activa la empresa para crear cuentas o reenviar enlaces. Mientras esté inactiva, sus cuentas no pueden iniciar sesión.</p>}
      {loading ? <LoadingState label="Cargando cuentas…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} />
        : data && (data.length === 0
          ? <p className="notice-muted">La empresa aún no tiene cuentas.</p>
          : (
            <div className="institution-table-wrapper" role="region" aria-label="Listado de cuentas de la empresa" tabIndex={0}>
              <table className="institution-table">
                <caption className="visually-hidden">Cuentas de la empresa</caption>
                <thead><tr><th scope="col">Nombre</th><th scope="col">Correo de acceso</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
                <tbody>
                  {data.map((account) => (
                    <tr key={account.id}>
                      <th scope="row">{account.name}</th>
                      <td>{account.email}</td>
                      <td><span className={`institution-status ${account.status}`}>{statusLabels[account.status]}</span></td>
                      <td>{active && account.status === 'pending' && (
                        <button type="button" className="secondary" aria-label={`Reenviar enlace a ${account.name}`}
                          onClick={() => setSheet({ kind: 'resend', email: account.email })}>Reenviar enlace</button>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      <Sheet open={sheet?.kind === 'create'} onClose={closeSheet} labelledBy="company-account-title">
        <SetupAccountForm idPrefix="company-account" title="Nueva cuenta de la empresa" submitLabel="Crear cuenta de la empresa"
          intro="La cuenta se vinculará a esta empresa. La persona titular establecerá su propia contraseña mediante un enlace de configuración."
          messages={companyMessages} create={create} onCreated={() => { void refresh() }} />
      </Sheet>
      <Sheet open={sheet?.kind === 'resend'} onClose={closeSheet} labelledBy="company-setup-link-title">
        {sheet?.kind === 'resend' && (
          <SetupLinkResendForm key={sheet.email} idPrefix="company-setup-link" initialEmail={sheet.email} messages={companyMessages}
            intro="Mientras la cuenta siga pendiente de su primera contraseña puedes reenviar el enlace. El nuevo enlace sustituye al anterior."
            resend={resend} />
        )}
      </Sheet>
    </section>
  )
}
