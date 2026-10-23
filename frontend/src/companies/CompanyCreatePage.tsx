import { useNavigate } from 'react-router'
import { useApiMutation } from '../lib/useApiRequest'
import { companyMessages, createCompany } from './api'
import { CompanyForm } from './CompanyForm'
import { CompanyLayout } from './CompanyLayout'

export function CompanyCreatePage() {
  const navigate = useNavigate()
  const { pending, failure, submit } = useApiMutation(companyMessages)

  return (
    <CompanyLayout title="Nueva empresa">
      <p>La empresa se registrará en estado ACTIVA.</p>
      <CompanyForm pending={pending} failure={failure} submitLabel="Registrar empresa" cancelTo="/companies"
        onSubmit={(input) => submit(() => createCompany(input), (company) => {
          void navigate(`/companies/${company.id}`, { replace: true, state: { notice: 'Empresa registrada correctamente.' } })
        })} />
    </CompanyLayout>
  )
}
