import { useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { getInstitution, updateInstitution } from './api'
import { InstitutionForm } from './InstitutionForm'
import { InstitutionLayout, InstitutionRequestError } from './InstitutionLayout'
import { useInstitutionMutation, useInstitutionRequest } from './useInstitutionRequest'

function InstitutionEdit({ id }: { id: string }) {
  const navigate = useNavigate()
  const load = useCallback((signal: AbortSignal) => getInstitution(id, signal), [id])
  const { data, loading, failure, refresh } = useInstitutionRequest(load)
  const mutation = useInstitutionMutation()

  return (
    <InstitutionLayout title="Editar institución">
      {loading ? <p role="status">Cargando institución…</p>
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} />
        : data && (
          <InstitutionForm initialValue={data} pending={mutation.pending} failure={mutation.failure}
            submitLabel="Guardar cambios" cancelTo={`/institutions/${data.id}`}
            onSubmit={(input) => mutation.submit(() => updateInstitution(id, input), (institution) => {
              void navigate(`/institutions/${institution.id}`, { replace: true, state: { notice: 'Institución actualizada correctamente.' } })
            })} />
        )}
      <p className="institution-back"><Link to="/institutions">Volver a instituciones</Link></p>
    </InstitutionLayout>
  )
}

export function InstitutionEditPage() {
  const { id = '' } = useParams()
  return <InstitutionEdit key={id} id={id} />
}
