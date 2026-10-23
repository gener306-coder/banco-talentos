import { useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { ChevronLeftIcon } from '../ui/icons'
import { LoadingState } from '../ui/StateMessage'
import { companyMessages, getCompany, updateCompany } from './api'
import { CompanyForm } from './CompanyForm'
import { CompanyLayout } from './CompanyLayout'

function CompanyEdit({ id }: { id: string }) {
  const navigate = useNavigate()
  const load = useCallback((signal: AbortSignal) => getCompany(id, signal), [id])
  const { data, loading, failure, refresh } = useApiRequest(load, companyMessages)
  const mutation = useApiMutation(companyMessages)

  return (
    <CompanyLayout title="Editar empresa">
      {loading ? <LoadingState label="Cargando empresa…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && (
          <CompanyForm company={data} pending={mutation.pending} failure={mutation.failure}
            submitLabel="Guardar cambios" cancelTo={`/companies/${data.id}`}
            onSubmit={(input) => mutation.submit(() => updateCompany(id, input), (company) => {
              void navigate(`/companies/${company.id}`, { replace: true, state: { notice: 'Empresa actualizada correctamente.' } })
            })} />
        )}
      <p className="institution-back"><Link className="plain" to="/companies"><ChevronLeftIcon />Volver a empresas</Link></p>
    </CompanyLayout>
  )
}

export function CompanyEditPage() {
  const { id = '' } = useParams()
  return <CompanyEdit key={id} id={id} />
}
