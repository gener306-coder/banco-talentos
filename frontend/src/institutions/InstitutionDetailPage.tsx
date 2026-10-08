import { useCallback, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { InstitutionAccountForm } from './InstitutionAccountForm'
import { InstitutionAccountPasswordResetForm } from './InstitutionAccountPasswordResetForm'
import { InstitutionAccountSetupLinkForm } from './InstitutionAccountSetupLinkForm'
import { getInstitution, setInstitutionStatus } from './api'
import { InstitutionLayout, InstitutionRequestError, InstitutionStatus } from './InstitutionLayout'
import { useInstitutionMutation, useInstitutionRequest } from './useInstitutionRequest'

function InstitutionDetail({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => getInstitution(id, signal), [id])
  const { data, loading, failure, refresh, setData } = useInstitutionRequest(load)
  const mutation = useInstitutionMutation()
  const location = useLocation()
  const [notice, setNotice] = useState<string | null>(() => {
    const state: unknown = location.state
    return state && typeof state === 'object' && 'notice' in state && typeof state.notice === 'string' ? state.notice : null
  })

  async function changeStatus() {
    if (!data || mutation.pending) return
    setNotice(null)
    await mutation.submit(() => setInstitutionStatus(id, !data.is_active), (updated) => {
      setData(updated)
      setNotice(updated.is_active ? 'Institución activada correctamente.' : 'Institución inactivada correctamente.')
    })
  }

  return (
    <InstitutionLayout title="Detalle de institución">
      {loading ? <p role="status">Cargando institución…</p>
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} />
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
              <button type="button" disabled={mutation.pending} onClick={() => { void changeStatus() }}>
                {mutation.pending ? 'Guardando estado…' : data.is_active ? 'Inactivar institución' : 'Activar institución'}
              </button>
            </div>
            {data.is_active
              ? <>
                <InstitutionAccountForm institutionId={data.id} disabled={mutation.pending} />
                <InstitutionAccountSetupLinkForm institutionId={data.id} disabled={mutation.pending} />
                <InstitutionAccountPasswordResetForm institutionId={data.id} disabled={mutation.pending} />
              </>
              : <p className="notice">Activa la institución para crear una cuenta institucional.</p>}
          </>
        )}
      <p className="institution-back"><Link to="/institutions">Volver a instituciones</Link></p>
    </InstitutionLayout>
  )
}

export function InstitutionDetailPage() {
  const { id = '' } = useParams()
  return <InstitutionDetail key={id} id={id} />
}
