import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ManualSetupLink } from '../institutions/SetupLinkDelivery'
import { useApiMutation } from '../lib/useApiRequest'
import { ChevronRightIcon } from '../ui/icons'
import { companyMessages, createCompany } from './api'
import type { Company } from './api'
import { CompanyForm } from './CompanyForm'
import { CompanyLayout } from './CompanyLayout'

export function CompanyCreatePage() {
  const navigate = useNavigate()
  const { pending, failure, submit } = useApiMutation(companyMessages)
  // Entrega manual (HU-S2-01): el enlace vive solo en el estado de esta página, nunca en el historial del navegador.
  const [shared, setShared] = useState<{ company: Company; link: string } | null>(null)

  if (shared) {
    return (
      <CompanyLayout title="Nueva empresa">
        <p className="institution-success" role="status">
          Empresa registrada. Copia el enlace y compártelo con {shared.company.contact_name} para que establezca su contraseña.
        </p>
        <ManualSetupLink idPrefix="company" link={shared.link} />
        <p className="institution-back">
          <Link className="pill-link" to={`/companies/${shared.company.id}`}>Ver la empresa<ChevronRightIcon /></Link>
        </p>
      </CompanyLayout>
    )
  }

  return (
    <CompanyLayout title="Nueva empresa">
      <p>La empresa se registrará en estado ACTIVA, junto con la cuenta de su contacto.</p>
      <CompanyForm pending={pending} failure={failure} submitLabel="Registrar empresa" cancelTo="/companies"
        onSubmit={(input, method) => submit(() => createCompany(input, method), ({ company, setupDelivery, setupLink }) => {
          if (setupLink) {
            setShared({ company, link: setupLink })
            return
          }
          // T-S8-12: la cuenta del contacto ya existe; el aviso dice si su enlace salió o hay que reenviarlo.
          const notice = setupDelivery === 'sent'
            ? `Empresa registrada. Enviamos a ${company.contact_email} el enlace para establecer su contraseña.`
            : 'Empresa registrada, pero no pudimos enviar el enlace. Usa «Reenviar enlace».'
          void navigate(`/companies/${company.id}`, { replace: true, state: { notice } })
        })} />
    </CompanyLayout>
  )
}
