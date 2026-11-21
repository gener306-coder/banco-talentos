import { Link, useLocation } from 'react-router'
import { backState } from '../ui/backLink'
import { legalConfig } from './legalConfig'
import type { LegalConfig } from './legalConfig'
import './legal.css'

/**
 * Aviso de privacidad simplificado de los accesos (HU-S15-04): responsable, finalidad principal y dónde consultar el
 * aviso integral. Es informativo (docs/sprint-15.md, D3); los documentos regresan a esta misma pantalla.
 * El responsable va como rótulo (T-S15-02): se lee igual con el responsable operativo o con una razón social.
 */
export function SimplifiedNotice({ backLabel, config = legalConfig }: { backLabel: string; config?: LegalConfig }) {
  const location = useLocation()
  const state = backState(backLabel, location)
  return (
    <p className="legal-note">
      Responsable de tus datos: {config.controller.name}. Los usamos para administrar tu cuenta y la vinculación de educación
      dual. Consulta el <Link to="/legal/privacidad" state={state}>Aviso de Privacidad</Link> y
      los <Link to="/legal/terminos" state={state}>Términos y Condiciones</Link>.
    </p>
  )
}
