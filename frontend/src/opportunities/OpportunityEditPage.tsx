import { useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { ChevronLeftIcon } from '../ui/icons'
import { LoadingState } from '../ui/StateMessage'
import { getOpportunity, opportunityMessages, updateOpportunity } from './api'
import { OpportunityForm } from './OpportunityForm'
import { OpportunityLayout } from './OpportunityLayout'

function OpportunityEdit({ id }: { id: string }) {
  const navigate = useNavigate()
  const load = useCallback((signal: AbortSignal) => getOpportunity(id, signal), [id])
  const { data, loading, failure, refresh } = useApiRequest(load, opportunityMessages)
  const mutation = useApiMutation(opportunityMessages)

  return (
    <OpportunityLayout title="Editar oportunidad">
      {loading ? <LoadingState label="Cargando oportunidad…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page notFoundTitle="No encontramos esta oportunidad" />
        : data && (
          <OpportunityForm opportunity={data} pending={mutation.pending} failure={mutation.failure}
            submitLabel="Guardar cambios" cancelTo={`/opportunities/${data.id}`}
            onSubmit={(input) => mutation.submit(() => updateOpportunity(id, input), (opportunity) => {
              void navigate(`/opportunities/${opportunity.id}`, { replace: true, state: { notice: 'Oportunidad actualizada correctamente.' } })
            })} />
        )}
      <p className="institution-back"><Link className="plain" to="/opportunities"><ChevronLeftIcon />Volver a oportunidades</Link></p>
    </OpportunityLayout>
  )
}

export function OpportunityEditPage() {
  const { id = '' } = useParams()
  return <OpportunityEdit key={id} id={id} />
}
