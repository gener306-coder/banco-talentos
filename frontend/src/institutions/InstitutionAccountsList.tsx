import { useCallback, useEffect, useState } from 'react'
import { AccountEmailCell } from '../accounts/AccountEmailCell'
import type { SetupAccount, SetupAccountStatus } from '../accounts/api'
import { CorrectEmailForm } from '../accounts/CorrectEmailForm'
import { useApiRequest } from '../lib/useApiRequest'
import { PencilIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { LoadingState } from '../ui/StateMessage'
import { rowIndex } from '../ui/tableMotion'
import { institutionAccountEmailPath, listInstitutionAccounts } from './accountsApi'
import { InstitutionRequestError } from './InstitutionLayout'

const statusLabels: Record<SetupAccountStatus, string> = { active: 'ACTIVA', pending: 'PENDIENTE', inactive: 'INACTIVA' }
const NO_MESSAGES = {}

/**
 * T-S19-02: cuentas de la institución con su estado. Antes solo se podía reenviar o restablecer escribiendo el correo, así
 * que un error de dedo al invitar no se veía; ahora la cuenta pendiente se reconoce y su correo se corrige aquí.
 * `version` cambia al cerrar las hojas de alta y reenvío para recargar el listado.
 */
export function InstitutionAccountsList({ institutionId, version }: { institutionId: number; version: number }) {
  const load = useCallback((signal: AbortSignal) => listInstitutionAccounts(institutionId, signal), [institutionId])
  const { data, loading, failure, refresh, setData } = useApiRequest(load)
  const [editing, setEditing] = useState<SetupAccount | null>(null)
  const close = useCallback(() => setEditing(null), [])

  useEffect(() => { if (version > 0) void refresh() }, [version, refresh])

  if (loading && !data) return <LoadingState label="Cargando cuentas…" variant="table" />
  if (failure) return <InstitutionRequestError failure={failure} retry={refresh} />
  if (!data) return null
  if (data.length === 0) return <p className="notice-muted">La institución aún no tiene cuentas.</p>

  return (
    <>
      <div className="table-card">
        <div className="institution-table-wrapper" role="region" aria-label="Listado de cuentas institucionales" tabIndex={0}>
          <table className="institution-table has-actions">
            <caption className="visually-hidden">Cuentas institucionales</caption>
            <thead><tr><th scope="col">Nombre</th><th scope="col">Correo de acceso</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
            <tbody className="rows-enter">
              {data.map((account, index) => (
                <tr key={account.id} style={rowIndex(index)}>
                  <th scope="row">{account.name}</th>
                  <td><AccountEmailCell account={account} /></td>
                  <td><span className={`institution-status ${account.status}`}>{statusLabels[account.status]}</span></td>
                  <td>
                    <div className="actions">
                      {account.status === 'pending' && (
                        <button type="button" className="account-action" aria-label={`Corregir el correo de ${account.name}`}
                          onClick={() => setEditing(account)}><PencilIcon />Corregir correo</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Sheet open={editing !== null} onClose={close} labelledBy="institution-account-email-title">
        {editing && (
          <CorrectEmailForm key={editing.id} idPrefix="institution-account-email" account={editing}
            path={institutionAccountEmailPath(institutionId, editing.id)} messages={NO_MESSAGES}
            onCorrected={(updated) => setData((current) => current && current.map((account) => account.id === updated.id ? updated : account))} />
        )}
      </Sheet>
    </>
  )
}
