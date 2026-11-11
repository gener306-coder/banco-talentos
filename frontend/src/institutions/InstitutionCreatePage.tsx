import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { createInstitution } from './api'
import type { Institution } from './api'
import { InstitutionForm } from './InstitutionForm'
import { InstitutionLayout } from './InstitutionLayout'
import { ManualSetupLink } from './SetupLinkDelivery'
import { useInstitutionMutation } from './useInstitutionRequest'
import { ChevronRightIcon } from '../ui/icons'

export function InstitutionCreatePage() {
  const navigate = useNavigate()
  const { pending, failure, submit } = useInstitutionMutation()
  // Entrega manual (HU-S2-01): el enlace vive solo en el estado de esta página, nunca en el historial del navegador.
  const [shared, setShared] = useState<{ institution: Institution; link: string } | null>(null)

  if (shared) {
    return (
      <InstitutionLayout title="Nueva institución">
        <p className="institution-success" role="status">
          Institución registrada. Copia el enlace y compártelo con {shared.institution.contact_name} para que establezca su contraseña.
        </p>
        <ManualSetupLink idPrefix="institution" link={shared.link} />
        <p className="institution-back">
          <Link className="pill-link" to={`/institutions/${shared.institution.id}`}>Ver la institución<ChevronRightIcon /></Link>
        </p>
      </InstitutionLayout>
    )
  }

  return (
    <InstitutionLayout title="Nueva institución">
      <p>La institución se registrará en estado ACTIVA, junto con la cuenta de su persona responsable.</p>
      <InstitutionForm pending={pending} failure={failure} submitLabel="Crear institución" cancelTo="/institutions"
        onSubmit={(input) => submit(() => createInstitution(input), ({ institution, setupDelivery, setupLink }) => {
          if (setupLink) {
            setShared({ institution, link: setupLink })
            return
          }
          // T-S8-11: la cuenta del responsable ya existe; el aviso dice si su enlace salió o hay que reenviarlo.
          const notice = setupDelivery === 'sent'
            ? `Institución registrada. Enviamos a ${institution.contact_email} el enlace para establecer su contraseña.`
            : 'Institución registrada, pero no pudimos enviar el enlace. Usa «Reenviar enlace».'
          void navigate(`/institutions/${institution.id}`, { replace: true, state: { notice } })
        })} />
    </InstitutionLayout>
  )
}
