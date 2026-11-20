import { isFull, placesLabel } from './api'

/**
 * Lugares de una oportunidad (T-S14-11): «2 de 5 lugares cubiertos» y, con el cupo lleno, la etiqueta «Cupo lleno».
 * Lo usan el listado y el detalle de la empresa y el detalle de la institución.
 */
export function PlacesStatus({ opportunity }: { opportunity: { vacancies: number; accepted_count: number } }) {
  return (
    <span className="places-status">
      <span>{placesLabel(opportunity)}</span>
      {isFull(opportunity) && <span className="places-full">Cupo lleno</span>}
    </span>
  )
}
