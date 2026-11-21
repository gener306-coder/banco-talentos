import { legalConfig } from '../legalConfig'
import type { LegalConfig } from '../legalConfig'
import type { LegalDocument } from '../types'

export function termsDocument(config: LegalConfig = legalConfig): LegalDocument {
  const { controller, jurisdiction } = config
  return {
    slug: 'terminos',
    title: 'Términos y Condiciones',
    shortTitle: 'Términos',
    lead: (
      <>
        Estas condiciones regulan el uso del {config.programName}, cuyo responsable es <strong>{controller.name}</strong>. Al usar la
        plataforma, cada organización y cada persona usuaria las acepta.
      </>
    ),
    sections: [
      {
        id: 'objeto',
        title: 'Qué es la plataforma',
        body: (
          <>
            <p>
              Es un servicio de vinculación entre organizaciones (B2B) para el modelo de educación dual. Conecta a instituciones educativas,
              empresas validadas por la Secretaría de Economía y a la propia Secretaría.
            </p>
            <p>
              No es una bolsa de trabajo abierta ni un intermediario laboral. No contrata, no selecciona personal ni garantiza vinculaciones,
              y no es parte de los convenios que acuerden la institución, la empresa y el alumno.
            </p>
          </>
        ),
      },
      {
        id: 'cuentas',
        title: 'Cuentas y acceso',
        body: (
          <ul>
            <li>Administración crea las cuentas de las instituciones y de la Secretaría. La Secretaría crea las de las empresas que valida y las de su personal.</li>
            <li>Cada cuenta es personal. Su titular cuida su contraseña y responde por lo que se haga con ella.</li>
            <li>Los alumnos no tienen cuenta: los registra y administra su institución.</li>
          </ul>
        ),
      },
      {
        id: 'responsabilidades',
        title: 'Responsabilidades de cada organización',
        body: (
          <>
            <h4>Instituciones y empresas</h4>
            <ul>
              <li>Mantienen su perfil completo, veraz y actualizado: nombre, CCT o RFC, ubicación y contacto, según corresponda.</li>
            </ul>
            <h4>Instituciones</h4>
            <ul>
              <li>Antes de registrar a un alumno, obtienen su consentimiento o, si es menor de edad, el de su madre, padre o tutor, y lo informan de este tratamiento.</li>
              <li>Mantienen exacto el expediente del alumno.</li>
              <li>Al aceptar una vinculación, comparten con la empresa solo los datos estrictamente necesarios para coordinarla.</li>
            </ul>
            <h4>Empresas</h4>
            <ul>
              <li>Tratan como confidencial todo lo que conocen de los alumnos y lo usan solo para la vinculación de que se trate.</li>
              <li>No intentan identificar a un alumno a partir de su perfil disociado ni cruzar sus datos con otras fuentes.</li>
              <li>No extraen datos de forma masiva o automatizada (scraping) ni los copian a otros sistemas.</li>
              <li>Publican solo oportunidades reales del modelo dual.</li>
            </ul>
            <h4>Administración y Secretaría</h4>
            <ul>
              <li>Administración gestiona las instituciones y sus cuentas y las cuentas de la Secretaría. La Secretaría valida y gestiona a las empresas y sus cuentas.</li>
              <li>Ninguna sustituye a la institución ni a la empresa durante una vinculación.</li>
            </ul>
          </>
        ),
      },
      {
        id: 'suspension',
        title: 'Suspensión de cuentas y contenidos',
        body: (
          <>
            <p>
              Administración puede inactivar instituciones, sus cuentas y las de la Secretaría. La Secretaría puede inactivar a las empresas
              que valida y sus cuentas. Las dos pueden hacerlo ante el incumplimiento de estas condiciones, datos falsos o un uso que ponga en
              riesgo a los alumnos.
            </p>
            <p>Administración también puede retirar de la galería una Historia del Dual inapropiada. Una inactivación no borra el historial.</p>
          </>
        ),
      },
      {
        id: 'conversaciones',
        title: 'Conversaciones y baja de una vinculación',
        body: (
          <ul>
            <li>La conversación se habilita cuando la institución acepta la solicitud.</li>
            <li>Los mensajes no se pueden editar ni borrar: el historial queda como constancia de lo acordado.</li>
            <li>Cualquiera de las dos partes puede dar de baja una vinculación aceptada, con un motivo obligatorio. La solicitud queda en estado <strong>BAJA</strong>, el lugar de la oportunidad se libera y la conversación se conserva en solo lectura.</li>
          </ul>
        ),
      },
      {
        id: 'propiedad-intelectual',
        title: 'Propiedad intelectual',
        body: (
          <>
            <p>El software, el diseño y las marcas de la plataforma pertenecen a sus titulares.</p>
            <p>
              Cada institución conserva los derechos sobre las Historias del Dual que sube y autoriza su exhibición dentro de la plataforma.
              Antes de subir un video, la institución garantiza que cuenta con la autorización de quienes aparecen en él (de su madre, padre
              o tutor, si son menores de edad) y con los derechos de la música y los materiales que incluye.
            </p>
          </>
        ),
      },
      {
        id: 'disponibilidad',
        title: 'Disponibilidad',
        body: (
          <p>
            Procuramos que la plataforma esté disponible de forma continua, pero puede interrumpirse por mantenimiento o causas ajenas.
            No garantizamos un servicio ininterrumpido ni libre de errores.
          </p>
        ),
      },
      {
        id: 'cambios',
        title: 'Cambios a estas condiciones',
        body: <p>Cualquier cambio se publicará en esta página con su fecha de actualización. Seguir usando la plataforma después de un cambio implica aceptarlo.</p>,
      },
      {
        id: 'jurisdiccion',
        title: 'Ley aplicable y jurisdicción',
        body: (
          <p>
            Estas condiciones se rigen por {jurisdiction.governingLaw ?? 'la legislación mexicana aplicable'}.
            {jurisdiction.courts && ` Para cualquier controversia, las partes se someten a ${jurisdiction.courts}.`}
          </p>
        ),
      },
    ],
  }
}
