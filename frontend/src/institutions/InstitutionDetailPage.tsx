import { PendingLabel } from '../ui/forms'
import { useCallback, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { InstitutionAccountForm } from './InstitutionAccountForm'
import { InstitutionAccountsList } from './InstitutionAccountsList'
import { InstitutionAccountPasswordResetForm } from './InstitutionAccountPasswordResetForm'
import { InstitutionAccountSetupLinkForm } from './InstitutionAccountSetupLinkForm'
import { getInstitution, setInstitutionStatus, UNNAMED_INSTITUTION } from './api'
import { InstitutionLayout, InstitutionRequestError, InstitutionStatus } from './InstitutionLayout'
import { useInstitutionMutation, useInstitutionRequest } from './useInstitutionRequest'
import { useBackLink } from '../ui/backLink'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { PlusIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { LoadingState } from '../ui/StateMessage'
import '../companies/companies.css'

/** HU-S16-05: los datos que la institución invitada aún no captura se distinguen del resto, como en las empresas. */
const value = (text: string | null) => text || <span className="company-pending-value">Sin capturar</span>

function InstitutionDetail({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => getInstitution(id, signal), [id])
  const { data, loading, failure, refresh, setData } = useInstitutionRequest(load)
  const mutation = useInstitutionMutation()
  const location = useLocation()
  // T-S13-17: un solo regreso, arriba: al listado de origen (con su vista) o, sin él, al listado completo.
  const back = useBackLink({ to: '/institutions', label: 'Volver a instituciones' })
  const [notice, setNotice] = useState<string | null>(() => {
    const state: unknown = location.state
    return state && typeof state === 'object' && 'notice' in state && typeof state.notice === 'string' ? state.notice : null
  })

  const statusButton = useRef<HTMLButtonElement>(null)
  const [confirming, setConfirming] = useState(false)
  // Los formularios de cuentas viven en hojas: la vista muestra solo los datos y las acciones.
  const [sheet, setSheet] = useState<'create' | 'resend' | 'reset' | null>(null)
  // T-S19-02: al cerrar una hoja, el listado de cuentas se recarga (un alta o un reenvío pueden cambiarlo).
  const [accountsVersion, setAccountsVersion] = useState(0)
  const closeSheet = useCallback(() => { setSheet(null); setAccountsVersion((version) => version + 1) }, [])

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
    <InstitutionLayout title="Detalle de institución" back={back}>
      {loading ? <LoadingState label="Cargando institución…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && (
          <div className="content-enter">
            {notice && <p className="institution-success" role="status">{notice}</p>}
            {mutation.failure && <InstitutionRequestError failure={mutation.failure} />}
            <dl className="institution-details">
              <dt>Nombre</dt><dd>{data.name ?? <span className="company-pending-value">{UNNAMED_INSTITUTION}</span>}</dd>
              <dt>CCT</dt><dd>{value(data.cct)}</dd>
              <dt>Responsable</dt><dd>{value(data.contact_name)}</dd>
              <dt>Puesto o departamento</dt><dd>{data.contact_position ?? 'Sin registrar'}</dd>
              <dt>Correo de contacto</dt><dd>{value(data.contact_email)}</dd>
              <dt>Teléfono</dt><dd>{data.contact_phone ? <a href={`tel:${data.contact_phone.replace(/[^\d+]/g, '')}`}>{data.contact_phone}</a> : 'Sin registrar'}</dd>
              <dt>Estado</dt><dd><InstitutionStatus active={data.is_active} /></dd>
            </dl>
            <div className="actions" aria-busy={mutation.pending}>
              <Link className="institution-button secondary" to={`/institutions/${data.id}/edit`}>Editar institución</Link>
              <button type="button" ref={statusButton} disabled={mutation.pending} onClick={requestStatusChange}>
                <PendingLabel pending={mutation.pending} label={data.is_active ? 'Inactivar institución' : 'Activar institución'} pendingLabel="Guardando estado…" />
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
                  <InstitutionAccountsList institutionId={data.id} version={accountsVersion} />
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
          </div>
        )}
      <ConfirmDialog open={confirming} origin={statusButton}
        title="¿Inactivar la institución?"
        description="Sus cuentas no podrán iniciar sesión y las sesiones abiertas se cerrarán. Podrás reactivarla después."
        confirmLabel="Inactivar" onConfirm={() => { void changeStatus() }} onCancel={() => setConfirming(false)} />
    </InstitutionLayout>
  )
}

export function InstitutionDetailPage() {
  const { id = '' } = useParams()
  return <InstitutionDetail key={id} id={id} />
}
