import { Link } from 'react-router'
import { PROFILE_INCOMPLETE_MESSAGE } from '../lib/useApiRequest'
import { Callout } from '../ui/Callout'
import { ChevronRightIcon } from '../ui/icons'

/**
 * HU-S14-03 CA-05 (M1): en lugar del formulario de publicar o solicitar, explica qué falta y lleva directo a la sección
 * del perfil en Mi cuenta. Lo usan el alta de oportunidades y el envío de solicitudes, y el 422 del servidor.
 */
export function ProfileIncompleteNotice() {
  return (
    <Callout tone="pending" label="Perfil de la empresa incompleto"
      action={<Link className="pill-link" to="/account#organization">Completar perfil<ChevronRightIcon /></Link>}>
      <p>{PROFILE_INCOMPLETE_MESSAGE}</p>
    </Callout>
  )
}
