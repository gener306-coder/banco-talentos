import { useCallback, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { InstitutionRequestError, InstitutionStatus } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { stateName } from '../students/catalogs'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ChevronLeftIcon } from '../ui/icons'
import { LoadingState } from '../ui/StateMessage'
import { companyMessages, getCompany, setCompanyStatus } from './api'
import { sectorName } from './catalogs'
import { CompanyLayout } from './CompanyLayout'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

function CompanyDetail({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => getCompany(id, signal), [id])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, companyMessages)
  const mutation = useApiMutation(companyMessages)
  const location = useLocation()
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
    <CompanyLayout title="Detalle de empresa">
      {loading ? <LoadingState label="Cargando empresa…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && (
          <>
            {notice && <p className="institution-success" role="status">{notice}</p>}
            {mutation.failure && <InstitutionRequestError failure={mutation.failure} />}
            <dl className="company-details">
              <dt>Razón social</dt><dd>{data.legal_name}</dd>
              {data.trade_name && <><dt>Nombre comercial</dt><dd>{data.trade_name}</dd></>}
              <dt>RFC</dt><dd>{data.rfc}</dd>
              <dt>Sector económico</dt><dd>{data.sector_code} · {sectorName(data.sector_code)}</dd>
              <dt>Ubicación</dt><dd>{data.municipality ?? data.municipality_code}, {stateName(data.state_code)}</dd>
              <dt>Contacto del programa dual</dt>
              <dd>{data.contact_name} · {data.contact_email}{data.contact_phone && ` · ${data.contact_phone}`}</dd>
              {data.validation_reference && <><dt>Folio u oficio de validación</dt><dd>{data.validation_reference}</dd></>}
              <dt>Registrada por</dt><dd>{data.registered_by.name}, el {dateFormat.format(new Date(data.created_at))}</dd>
              <dt>Estado</dt><dd><InstitutionStatus active={data.is_active} /></dd>
            </dl>
            <div className="actions" aria-busy={mutation.pending}>
              <Link className="institution-button secondary" to={`/companies/${data.id}/edit`}>Editar empresa</Link>
              <button type="button" ref={statusButton} disabled={mutation.pending} onClick={requestStatusChange}>
                {mutation.pending ? 'Guardando estado…' : data.is_active ? 'Inactivar empresa' : 'Activar empresa'}
              </button>
            </div>
          </>
        )}
      <ConfirmDialog open={confirming} origin={statusButton}
        title="¿Inactivar la empresa?"
        description="Sus cuentas no podrán iniciar sesión y las sesiones abiertas se cerrarán. No se borra ningún dato y podrás reactivarla después."
        confirmLabel="Inactivar" onConfirm={() => { void changeStatus() }} onCancel={() => setConfirming(false)} />
      <p className="institution-back"><Link className="plain" to="/companies"><ChevronLeftIcon />Volver a empresas</Link></p>
    </CompanyLayout>
  )
}

export function CompanyDetailPage() {
  const { id = '' } = useParams()
  return <CompanyDetail key={id} id={id} />
}
