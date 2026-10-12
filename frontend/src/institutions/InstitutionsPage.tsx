import type { MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { BuildingIcon, ChevronRightIcon, PlusIcon } from '../ui/icons'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { listInstitutions } from './api'
import { InstitutionLayout, InstitutionRequestError, InstitutionStatus } from './InstitutionLayout'
import { useInstitutionRequest } from './useInstitutionRequest'

export function InstitutionsPage() {
  const { data, loading, failure, refresh } = useInstitutionRequest(listInstitutions)
  const navigate = useNavigate()

  // Toda la fila abre el detalle con el puntero; el enlace «Ver detalle» sigue siendo el control accesible.
  function openRow(event: MouseEvent<HTMLTableRowElement>, href: string) {
    if (event.defaultPrevented || (event.target as HTMLElement).closest('a, button')) return
    if (window.getSelection()?.toString()) return
    navigate(href)
  }

  return (
    <InstitutionLayout title="Instituciones">
      <div className="institution-toolbar">
        <p>Consulta y administra las instituciones educativas registradas.</p>
        <Link className="institution-button" to="/institutions/new"><PlusIcon />Nueva institución</Link>
      </div>
      {loading ? <LoadingState label="Cargando instituciones…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && data.length === 0
          ? <StateMessage kind="empty" icon={<BuildingIcon />} title="No hay instituciones registradas."
            description="Registra la primera institución para empezar a crear sus cuentas y enlaces de configuración."
            action={<Link className="institution-button" to="/institutions/new"><PlusIcon />Registrar la primera institución</Link>} />
        : data && (
          <div className="institution-table-wrapper" role="region" aria-label="Listado de instituciones" tabIndex={0}>
            <table className="institution-table">
              <caption className="visually-hidden">Instituciones registradas</caption>
              <thead><tr><th scope="col">Nombre</th><th scope="col">CCT</th><th scope="col">Correo de contacto</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
              <tbody>
                {data.map((institution) => {
                  const href = `/institutions/${institution.id}`
                  return (
                    <tr key={institution.id} data-href={href} onClick={(event) => openRow(event, href)}>
                      <th scope="row">{institution.name}</th>
                      <td>{institution.cct}</td>
                      <td>{institution.contact_email}</td>
                      <td><InstitutionStatus active={institution.is_active} /></td>
                      <td><Link className="pill-link" to={href} aria-label={`Ver detalle de ${institution.name}`}>Ver detalle<ChevronRightIcon /></Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
    </InstitutionLayout>
  )
}
