import { useCallback } from 'react'
import { Link } from 'react-router'
import { sectorName } from '../companies/catalogs'
import { InstitutionRequestError, InstitutionStatus } from '../institutions/InstitutionLayout'
import { LINKAGE_STATUSES } from '../linkage/api'
import { LinkageStatus } from '../linkage/LinkageStatus'
import { useApiRequest } from '../lib/useApiRequest'
import { CsvDownloadButton } from '../ui/CsvDownloadButton'
import { ChevronLeftIcon } from '../ui/icons'
import { LoadingState } from '../ui/StateMessage'
import { downloadDualProgramCsv, getDualProgramReport, reportMessages } from './api'
import type { DualProgramReport } from './api'
import '../institutions/institutions.css'
import './reports.css'

const count = new Intl.NumberFormat('es-MX')
const percent = new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 1 })
const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' })

/** CA-02: embudo de solicitudes con su proporción; la barra es decorativa y el porcentaje va en texto. */
function LinkageSummary({ summary }: { summary: DualProgramReport['linkage_summary'] }) {
  return (
    <section className="report-section" aria-labelledby="report-linkage-title">
      <h3 id="report-linkage-title">Solicitudes de vinculación</h3>
      <p className="report-total">{count.format(summary.total)} {summary.total === 1 ? 'solicitud registrada' : 'solicitudes registradas'}</p>
      <div className="institution-table-wrapper" role="region" aria-label="Solicitudes por estado" tabIndex={0}>
        <table className="institution-table report-table">
          <caption className="visually-hidden">Solicitudes de vinculación por estado</caption>
          <thead><tr><th scope="col">Estado</th><th scope="col">Solicitudes</th><th scope="col">Proporción</th></tr></thead>
          <tbody>
            {LINKAGE_STATUSES.map(({ value }) => {
              const total = summary.by_status[value]
              const share = summary.total === 0 ? 0 : total / summary.total
              return (
                <tr key={value}>
                  <th scope="row"><LinkageStatus status={value} /></th>
                  <td>{count.format(total)}</td>
                  <td>
                    <span className="report-share">
                      <span className="report-bar" aria-hidden="true"><span style={{ width: `${share * 100}%` }} /></span>
                      {percent.format(share)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function InstitutionParticipation({ items }: { items: DualProgramReport['by_institution'] }) {
  return (
    <section className="report-section" aria-labelledby="report-institutions-title">
      <h3 id="report-institutions-title">Participación por institución</h3>
      {items.length === 0
        ? <p className="notice-muted">Aún no hay instituciones registradas.</p>
        : (
          <div className="institution-table-wrapper" role="region" aria-label="Participación por institución" tabIndex={0}>
            <table className="institution-table report-table">
              <caption className="visually-hidden">Participación por institución educativa</caption>
              <thead>
                <tr>
                  <th scope="col">Institución</th><th scope="col">Estado</th><th scope="col">Alumnos activos</th>
                  <th scope="col">Perfiles buscables</th><th scope="col">Solicitudes recibidas</th><th scope="col">Solicitudes aceptadas</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">{item.name}</th>
                    <td><InstitutionStatus active={item.is_active} /></td>
                    <td>{count.format(item.active_students)}</td>
                    <td>{count.format(item.searchable_profiles)}</td>
                    <td>{count.format(item.received_requests)}</td>
                    <td>{count.format(item.accepted_requests)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  )
}

function SectorParticipation({ items }: { items: DualProgramReport['by_sector'] }) {
  return (
    <section className="report-section" aria-labelledby="report-sectors-title">
      <h3 id="report-sectors-title">Participación por sector SCIAN</h3>
      {items.length === 0
        ? <p className="notice-muted">Aún no hay empresas registradas.</p>
        : (
          <div className="institution-table-wrapper" role="region" aria-label="Participación por sector SCIAN" tabIndex={0}>
            <table className="institution-table report-table">
              <caption className="visually-hidden">Participación por sector SCIAN</caption>
              <thead>
                <tr>
                  <th scope="col">Sector</th><th scope="col">Empresas activas</th>
                  <th scope="col">Oportunidades activas</th><th scope="col">Solicitudes aceptadas</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.sector_code}>
                    <th scope="row"><span className="report-sector-code">{item.sector_code}</span> {sectorName(item.sector_code)}</th>
                    <td>{count.format(item.active_companies)}</td>
                    <td>{count.format(item.active_opportunities)}</td>
                    <td>{count.format(item.accepted_requests)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  )
}

/**
 * Reporte ejecutivo del programa de Educación Dual (HU-S7-01 CA-03) para ADMIN y SECRETARY: solo conteos agregados,
 * sin datos de alumnos ni de cuentas. **Descargar CSV** exporta el desglose (HU-S7-02).
 */
export function ReportsPage() {
  const load = useCallback((signal: AbortSignal) => getDualProgramReport(signal), [])
  const { data, loading, failure, refresh } = useApiRequest(load, reportMessages)

  return (
    <section className="card institutions" aria-labelledby="reports-title">
      <nav className="institution-navigation" aria-label="Navegación del reporte">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
      </nav>
      <h2 id="reports-title">Reporte ejecutivo</h2>
      <p>Seguimiento del programa de Educación Dual con conteos agregados. No incluye datos personales de alumnos.</p>
      {loading ? <LoadingState label="Cargando reporte…" variant="table" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && (
          <>
            <div className="report-toolbar">
              <p className="report-generated">Generado el {dateFormat.format(new Date(data.generated_at))}</p>
              {/* HU-S7-02 CA-04: el desglose por institución y por sector, sin datos personales. */}
              <CsvDownloadButton download={downloadDualProgramCsv} prefix="reporte-educacion-dual" messages={reportMessages} />
            </div>
            <LinkageSummary summary={data.linkage_summary} />
            <InstitutionParticipation items={data.by_institution} />
            <SectorParticipation items={data.by_sector} />
          </>
        )}
    </section>
  )
}
