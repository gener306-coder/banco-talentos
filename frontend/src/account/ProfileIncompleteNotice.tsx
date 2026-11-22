import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { INSTITUTION_PROFILE_INCOMPLETE_MESSAGE, PROFILE_INCOMPLETE_MESSAGE } from '../lib/useApiRequest'
import { Callout } from '../ui/Callout'
import { ChevronRightIcon } from '../ui/icons'

/**
 * HU-S14-03 CA-05 (M1): en lugar del formulario de publicar o solicitar, explica qué falta y lleva directo a la sección
 * del perfil en Mi cuenta. Lo usan el alta de oportunidades y el envío de solicitudes, y el 422 del servidor. HU-S16-08:
 * en la sesión de una institución, explica su mínimo (D6) para publicar alumnos, subir videos y aceptar solicitudes.
 */
export function ProfileIncompleteNotice() {
  const institution = useAuth().user?.role === 'INSTITUTION'
  return (
    <Callout tone="pending" label={institution ? 'Perfil de la institución incompleto' : 'Perfil de la empresa incompleto'}
      action={<Link className="pill-link" to="/account#organization">Completar perfil<ChevronRightIcon /></Link>}>
      <p>{institution ? INSTITUTION_PROFILE_INCOMPLETE_MESSAGE : PROFILE_INCOMPLETE_MESSAGE}</p>
    </Callout>
  )
}
