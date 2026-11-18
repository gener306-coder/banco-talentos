import { Link } from 'react-router'
import type { BackTarget } from './backLink'
import { ChevronLeftIcon } from './icons'

/**
 * Primer enlace de la navegación de una sección (T-S13-07). Si la página se abrió desde otro flujo, toma el lugar de
 * «Inicio» con su regreso contextual («Volver a la conversación»); si no, es «Inicio».
 */
export function NavBackLink({ back }: { back?: BackTarget }) {
  return back
    ? <Link className="plain" to={back.to} state={back.state}><ChevronLeftIcon />{back.label}</Link>
    : <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
}
