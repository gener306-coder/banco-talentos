import { Link } from 'react-router'
import { listInstitutions } from './api'
import { InstitutionLayout, InstitutionRequestError, InstitutionStatus } from './InstitutionLayout'
import { useInstitutionRequest } from './useInstitutionRequest'

export function InstitutionsPage() {
  const { data, loading, failure, refresh } = useInstitutionRequest(listInstitutions)

  return (
    <InstitutionLayout title="Instituciones">
      <div className="institution-toolbar">
        <p>Consulta y administra las instituciones educativas registradas.</p>
        <Link className="institution-button" to="/institutions/new">Nueva institución</Link>
      </div>
      {loading ? <p role="status">Cargando instituciones…</p>
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} />
        : data && data.length === 0 ? <p role="status">No hay instituciones registradas.</p>
        : data && (
          <div className="institution-table-wrapper" role="region" aria-label="Listado de instituciones" tabIndex={0}>
            <table className="institution-table">
              <caption className="visually-hidden">Instituciones registradas</caption>
              <thead><tr><th scope="col">Nombre</th><th scope="col">CCT</th><th scope="col">Correo de contacto</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
              <tbody>
                {data.map((institution) => (
                  <tr key={institution.id}>
                    <th scope="row">{institution.name}</th>
                    <td>{institution.cct}</td>
                    <td>{institution.contact_email}</td>
                    <td><InstitutionStatus active={institution.is_active} /></td>
                    <td><Link to={`/institutions/${institution.id}`} aria-label={`Ver detalle de ${institution.name}`}>Ver detalle</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </InstitutionLayout>
  )
}
