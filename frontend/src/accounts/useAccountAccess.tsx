import { useRef, useState } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import type { FailureMessages } from '../lib/useApiRequest'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { setSetupAccountStatus, startSetupAccountPasswordReset } from './api'
import type { SetupAccount } from './api'

type Pending = { kind: 'deactivate' | 'reset'; account: SetupAccount }

/**
 * Acciones de acceso de las cuentas SECRETARY y COMPANY (HU-S6-04 CA-04): **Inactivar** (con `ConfirmDialog`),
 * **Activar** y **Restablecer contraseña** (también confirmado, porque envía un correo). Una cuenta pendiente de su
 * primera contraseña se gestiona con su enlace; la propia cuenta de la sesión no se puede inactivar.
 */
export function useAccountAccess({ statusPath, resetPath, messages, selfId, onUpdated }: {
  statusPath: (account: SetupAccount) => string
  resetPath: string
  messages: FailureMessages
  selfId?: number
  onUpdated: (account: SetupAccount) => void
}) {
  const mutation = useApiMutation(messages)
  const [confirming, setConfirming] = useState<Pending | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const origin = useRef<HTMLButtonElement | null>(null)

  async function activate(account: SetupAccount) {
    setNotice(null)
    await mutation.submit(() => setSetupAccountStatus(statusPath(account), true), (updated) => {
      onUpdated(updated)
      setNotice(`Cuenta de ${updated.name} activada correctamente.`)
    })
  }

  async function confirm() {
    const target = confirming
    setConfirming(null)
    if (!target || mutation.pending) return
    setNotice(null)
    if (target.kind === 'deactivate') {
      await mutation.submit(() => setSetupAccountStatus(statusPath(target.account), false), (updated) => {
        onUpdated(updated)
        setNotice(`Cuenta de ${updated.name} inactivada correctamente. Su sesión abierta se cerrará en su siguiente acción.`)
      })
    } else {
      await mutation.submit(() => startSetupAccountPasswordReset(resetPath, target.account.email), (delivery) => setNotice(delivery === 'pending'
        ? 'El envío del correo sigue sin confirmarse. Espera un minuto y vuelve a iniciar el restablecimiento.'
        : `Se envió el enlace de restablecimiento a ${target.account.email}. La contraseña actual sigue vigente hasta que la persona titular establezca una nueva.`))
    }
  }

  function open(kind: Pending['kind'], account: SetupAccount, button: HTMLButtonElement) {
    origin.current = button
    setConfirming({ kind, account })
  }

  function rowActions(account: SetupAccount, enabled = true) {
    if (!enabled || account.status === 'pending') return null
    if (account.status === 'inactive') {
      return (
        <button type="button" className="secondary" disabled={mutation.pending} aria-label={`Activar la cuenta de ${account.name}`}
          onClick={() => { void activate(account) }}>Activar</button>
      )
    }
    return (
      <>
        <button type="button" className="secondary" disabled={mutation.pending} aria-label={`Restablecer la contraseña de ${account.name}`}
          onClick={(event) => open('reset', account, event.currentTarget)}>Restablecer contraseña</button>
        {account.id !== selfId && (
          <button type="button" className="secondary" disabled={mutation.pending} aria-label={`Inactivar la cuenta de ${account.name}`}
            onClick={(event) => open('deactivate', account, event.currentTarget)}>Inactivar</button>
        )}
      </>
    )
  }

  const errors = mutation.failure && [...(mutation.failure.errors.is_active ?? []), ...(mutation.failure.errors.email ?? []), ...(mutation.failure.errors.company ?? [])]
  const feedback = (
    <>
      {notice && <p className="institution-success" role="status">{notice}</p>}
      {mutation.failure && (errors?.length ? <p className="notice" role="alert">{errors.join(' ')}</p> : <InstitutionRequestError failure={mutation.failure} />)}
    </>
  )

  const dialog = (
    <ConfirmDialog open={confirming !== null} origin={origin}
      title={confirming?.kind === 'reset' ? '¿Restablecer la contraseña?' : '¿Inactivar la cuenta?'}
      description={confirming?.kind === 'reset'
        ? `Se enviará a ${confirming.account.email} un enlace de un solo uso, válido 60 minutos, para que la persona titular establezca una nueva contraseña.`
        : `${confirming?.account.name ?? 'La cuenta'} no podrá iniciar sesión y su sesión abierta se cerrará. No se borra ningún dato y podrás activarla después.`}
      confirmLabel={confirming?.kind === 'reset' ? 'Enviar enlace' : 'Inactivar'}
      onConfirm={() => { void confirm() }} onCancel={() => setConfirming(null)} />
  )

  return { rowActions, feedback, dialog }
}
