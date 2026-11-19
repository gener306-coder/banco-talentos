import { PendingLabel } from '../ui/forms'
import { useCallback, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { InstitutionRequestError, InstitutionStatus } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { stateName } from '../students/catalogs'
import { useBackLink } from '../ui/backLink'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { LoadingState } from '../ui/StateMessage'
import { companyMessages, getCompany, setCompanyStatus } from './api'
import { NOT_CAPTURED, NO_SECTOR, sectorLabel, UNNAMED_COMPANY } from './catalogs'
import { CompanyAccountsSection } from './CompanyAccountsSection'
import { CompanyLayout } from './CompanyLayout'
import { CompanyProfileStatus } from './CompanyProfileStatus'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

/** HU-S14-02 CA-03: un dato que la empresa aún no captura se ve como tal, no como un hueco. */
const value = (text: string | null | undefined) => text || <span className="company-pending-value">{NOT_CAPTURED}</span>

function CompanyDetail({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => getCompany(id, signal), [id])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, companyMessages)
  const mutation = useApiMutation(companyMessages)
  const location = useLocation()
  // T-S12-05: regresa al listado con la búsqueda y la página de origen.
  const back = useBackLink({ to: '/companies', label: 'Volver a empresas' })
  const [notice, setNotice] = useState<string | null>(() => {
    const state: unknown = location.state
    return state && typeof state === 'object' && 'notice' in state && typeof state.notice === 'string' ? state.notice : null
  })
  const statusButton = useRef<HTMLButtonElement>(null)
  const [confirming, setConfirming] = useState(false)

  // Inactivar bloquea el acceso de sus cuentas: se confirma. Activar no tiene consecuencias que confirmar.
  function requestStatusChange() {
    if (!data || mutation.pending) return
    if (data.is_active) setConfirming(true)
    else void changeStatus()
  }

  async function changeStatus() {
    setConfirming(false)
    if (!data || mutation.pending) return
    setNotice(null)
    await mutation.submit(() => setCompanyStatus(id, !data.is_active), (updated) => {
      setData(updated)
      setNotice(updated.is_active ? 'Empresa activada correctamente.' : 'Empresa inactivada correctamente.')
    })
  }

  return (
    <CompanyLayout title="Detalle de empresa" back={back}>
      {loading ? <LoadingState label="Cargando empresa…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && (
          <div className="content-enter">
            {notice && <p className="institution-success" role="status">{notice}</p>}
            {mutation.failure && <InstitutionRequestError failure={mutation.failure} />}
            <dl className="company-details">
              <dt>Empresa</dt><dd>{data.name ?? <span className="company-pending-value">{UNNAMED_COMPANY}</span>}</dd>
              <dt>Perfil</dt><dd><CompanyProfileStatus status={data.profile_status} /></dd>
              <dt>Correo de la cuenta</dt><dd>{value(data.account_email)}</dd>
              <dt>Razón social</dt><dd>{value(data.legal_name)}</dd>
              <dt>Nombre comercial</dt><dd>{value(data.trade_name)}</dd>
              <dt>RFC</dt><dd>{value(data.rfc)}</dd>
              <dt>Sector económico</dt><dd>{data.sector_code ? sectorLabel(data.sector_code) : <span className="company-pending-value">{NO_SECTOR}</span>}</dd>
              <dt>Ubicación</dt><dd>{data.state_code ? `${data.municipality ?? data.municipality_code}, ${stateName(data.state_code)}` : value(null)}</dd>
              <dt>Contacto del programa dual</dt>
              <dd>{value([data.contact_name, data.contact_position, data.contact_email, data.contact_phone].filter(Boolean).join(' · '))}</dd>
              {data.validation_reference && <><dt>Folio u oficio de validación</dt><dd>{data.validation_reference}</dd></>}
              <dt>Registrada por</dt><dd>{data.registered_by.name}, el {dateFormat.format(new Date(data.created_at))}</dd>
              <dt>Estado</dt><dd><InstitutionStatus active={data.is_active} /></dd>
            </dl>
            <div className="actions" aria-busy={mutation.pending}>
              <Link className="institution-button secondary" to={`/companies/${data.id}/edit`}>Editar empresa</Link>
              <button type="button" ref={statusButton} disabled={mutation.pending} onClick={requestStatusChange}>
                <PendingLabel pending={mutation.pending} label={data.is_active ? 'Inactivar empresa' : 'Activar empresa'} pendingLabel="Guardando estado…" />
              </button>
            </div>
            <CompanyAccountsSection companyId={data.id} active={data.is_active} />
          </div>
        )}
      <ConfirmDialog open={confirming} origin={statusButton}
        title="¿Inactivar la empresa?"
        description="Sus cuentas no podrán iniciar sesión y las sesiones abiertas se cerrarán. No se borra ningún dato y podrás reactivarla después."
        confirmLabel="Inactivar" onConfirm={() => { void changeStatus() }} onCancel={() => setConfirming(false)} />
    </CompanyLayout>
  )
}

export function CompanyDetailPage() {
  const { id = '' } = useParams()
  return <CompanyDetail key={id} id={id} />
}
