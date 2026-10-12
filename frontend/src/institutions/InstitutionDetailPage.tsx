import { useCallback, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { InstitutionAccountForm } from './InstitutionAccountForm'
import { InstitutionAccountPasswordResetForm } from './InstitutionAccountPasswordResetForm'
import { InstitutionAccountSetupLinkForm } from './InstitutionAccountSetupLinkForm'
import { getInstitution, setInstitutionStatus } from './api'
import { InstitutionLayout, InstitutionRequestError, InstitutionStatus } from './InstitutionLayout'
import { useInstitutionMutation, useInstitutionRequest } from './useInstitutionRequest'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ChevronLeftIcon, PlusIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { LoadingState } from '../ui/StateMessage'

function InstitutionDetail({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => getInstitution(id, signal), [id])
  const { data, loading, failure, refresh, setData } = useInstitutionRequest(load)
  const mutation = useInstitutionMutation()
  const location = useLocation()
  const [notice, setNotice] = useState<string | null>(() => {
    const state: unknown = location.state
    return state && typeof state === 'object' && 'notice' in state && typeof state.notice === 'string' ? state.notice : null
  })

  const statusButton = useRef<HTMLButtonElement>(null)
  const [confirming, setConfirming] = useState(false)
  // Los formularios de cuentas viven en hojas: la vista muestra solo los datos y las acciones.
  const [sheet, setSheet] = useState<'create' | 'resend' | 'reset' | null>(null)
  const closeSheet = useCallback(() => setSheet(null), [])

  // Inactivar bloquea el acceso de las cuentas: se confirma. Activar no tiene consecuencias que confirmar.
  function requestStatusChange() {
    if (!data || mutation.pending) return
    if (data.is_active) setConfirming(true)
    else void changeStatus()
  }

  async function changeStatus() {
    setConfirming(false)
    if (!data || mutation.pending) return
    setNotice(null)
    await mutation.submit(() => setInstitutionStatus(id, !data.is_active), (updated) => {
      setData(updated)
      setNotice(updated.is_active ? 'Institución activada correctamente.' : 'Institución inactivada correctamente.')
    })
  }

  return (
    <InstitutionLayout title="Detalle de institución">
      {loading ? <LoadingState label="Cargando institución…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && (
          <>
            {notice && <p className="institution-success" role="status">{notice}</p>}
            {mutation.failure && <InstitutionRequestError failure={mutation.failure} />}
            <dl className="institution-details">
              <dt>Nombre</dt><dd>{data.name}</dd>
              <dt>CCT</dt><dd>{data.cct}</dd>
              <dt>Correo de contacto</dt><dd>{data.contact_email}</dd>
              <dt>Estado</dt><dd><InstitutionStatus active={data.is_active} /></dd>
            </dl>
            <div className="actions" aria-busy={mutation.pending}>
              <Link className="institution-button secondary" to={`/institutions/${data.id}/edit`}>Editar institución</Link>
              <button type="button" ref={statusButton} disabled={mutation.pending} onClick={requestStatusChange}>
                {mutation.pending ? 'Guardando estado…' : data.is_active ? 'Inactivar institución' : 'Activar institución'}
              </button>
            </div>
            {data.is_active
              ? <>
                <section className="institution-accounts" aria-labelledby="institution-accounts-title">
                  <h3 id="institution-accounts-title">Cuentas institucionales</h3>
                  <p>Crea cuentas vinculadas a esta institución y gestiona sus enlaces de acceso.</p>
                  <div className="actions">
                    <button type="button" disabled={mutation.pending} onClick={() => setSheet('create')}><PlusIcon />Nueva cuenta institucional</button>
                    <button type="button" className="secondary" disabled={mutation.pending} onClick={() => setSheet('resend')}>Reenviar enlace</button>
                    <button type="button" className="secondary" disabled={mutation.pending} onClick={() => setSheet('reset')}>Restablecer contraseña</button>
                  </div>
                </section>
                <Sheet open={sheet === 'create'} onClose={closeSheet} labelledBy="institution-account-title">
                  <InstitutionAccountForm institutionId={data.id} disabled={mutation.pending} />
                </Sheet>
                <Sheet open={sheet === 'resend'} onClose={closeSheet} labelledBy="institution-account-setup-link-title">
                  <InstitutionAccountSetupLinkForm institutionId={data.id} disabled={mutation.pending} />
                </Sheet>
                <Sheet open={sheet === 'reset'} onClose={closeSheet} labelledBy="institution-account-password-reset-title">
                  <InstitutionAccountPasswordResetForm institutionId={data.id} disabled={mutation.pending} />
                </Sheet>
              </>
              : <p className="notice">Activa la institución para crear una cuenta institucional.</p>}
          </>
        )}
      <ConfirmDialog open={confirming} origin={statusButton}
        title="¿Inactivar la institución?"
        description="Sus cuentas no podrán iniciar sesión y las sesiones abiertas se cerrarán. Podrás reactivarla después."
        confirmLabel="Inactivar" onConfirm={() => { void changeStatus() }} onCancel={() => setConfirming(false)} />
      <p className="institution-back"><Link className="plain" to="/institutions"><ChevronLeftIcon />Volver a instituciones</Link></p>
    </InstitutionLayout>
  )
}

export function InstitutionDetailPage() {
  const { id = '' } = useParams()
  return <InstitutionDetail key={id} id={id} />
}
