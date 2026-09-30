import { useNavigate } from 'react-router'
import { createInstitution } from './api'
import { InstitutionForm } from './InstitutionForm'
import { InstitutionLayout } from './InstitutionLayout'
import { useInstitutionMutation } from './useInstitutionRequest'

export function InstitutionCreatePage() {
  const navigate = useNavigate()
  const { pending, failure, submit } = useInstitutionMutation()

  return (
    <InstitutionLayout title="Nueva institución">
      <p>La institución se registrará en estado ACTIVA.</p>
      <InstitutionForm pending={pending} failure={failure} submitLabel="Crear institución" cancelTo="/institutions"
        onSubmit={(input) => submit(() => createInstitution(input), (institution) => {
          void navigate(`/institutions/${institution.id}`, { replace: true, state: { notice: 'Institución registrada correctamente.' } })
        })} />
    </InstitutionLayout>
  )
}
