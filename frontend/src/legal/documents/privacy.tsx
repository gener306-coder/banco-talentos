import { byRegime, dataProtectionLaw, legalConfig } from '../legalConfig'
import type { LegalConfig } from '../legalConfig'
import type { LegalDocument } from '../types'
import { LegalValue } from '../LegalValue'
import { PrivacySummary } from '../PrivacySummary'

export function privacyDocument(config: LegalConfig = legalConfig): LegalDocument {
  const { controller, dataProtection, authority } = config
  const channel = byRegime(config, {
    public_entity: 'la Unidad de Transparencia del responsable',
    private_entity: 'el área de datos personales del responsable',
    pending: 'el canal de datos personales del responsable',
  })

  return {
    slug: 'privacidad',
    title: 'Aviso de Privacidad Integral',
    shortTitle: 'Privacidad',
    usesConfig: true,
    lead: (
      <>
        Este aviso explica cómo el Banco de Talentos – Educación Dual trata los datos personales de las personas usuarias y de los
        alumnos que registran sus instituciones, conforme a la {dataProtectionLaw(config)}.
      </>
    ),
    intro: <PrivacySummary />,
    sections: [
      {
        id: 'responsable',
        title: 'Responsable',
        body: (
          <>
            <p>El responsable del tratamiento es <strong><LegalValue value={controller.name} /></strong>, con domicilio en <LegalValue value={controller.address} />.</p>
            {controller.website && <p>Sitio web: {controller.website}</p>}
          </>
        ),
      },
      {
        id: 'datos',
        title: 'Datos que tratamos',
        body: (
          <>
            <p>La plataforma solo trata los datos necesarios para la vinculación de educación dual:</p>
            <ul>
              <li><strong>Cuentas de usuario</strong> (Administración, Secretaría de Economía, instituciones y empresas): nombre, correo de acceso, rol, organización, quién creó la cuenta y fecha de sus cambios. Las contraseñas nunca se guardan en texto plano.</li>
              <li><strong>Perfil de la empresa</strong>, que la propia empresa captura y mantiene: razón social o nombre comercial, RFC, sector SCIAN, estado y municipio, y nombre, puesto, correo y teléfono de su contacto.</li>
              <li><strong>Perfil de la institución</strong>, que la propia institución mantiene: nombre oficial, clave de centro de trabajo (CCT) y nombre, puesto, correo y teléfono del contacto de su programa dual.</li>
              <li><strong>Expediente del alumno</strong>, que solo captura y administra su institución: nombre, matrícula, carrera, periodo, municipio, CV (habilidades, proyectos y certificaciones) y seguro social (número de seguridad social, tipo de seguro, aseguradora, póliza y comprobante de vigencia). Los alumnos no tienen cuenta en la plataforma.</li>
              <li><strong>Mensajes de vinculación</strong> entre la empresa y la institución de una solicitud aceptada.</li>
              <li><strong>Historias del Dual</strong>: videos promocionales que suben las instituciones, con su título y descripción.</li>
            </ul>
          </>
        ),
      },
      {
        id: 'privacidad-progresiva',
        title: 'Privacidad progresiva del alumno',
        body: (
          <>
            <p>La identidad del alumno se protege en cada etapa:</p>
            <ol>
              <li><strong>Búsqueda.</strong> La empresa ve un perfil disociado: un titular, la carrera, el periodo, sus habilidades, idiomas, proyectos y certificaciones, y la distancia aproximada en kilómetros. No ve nombre, matrícula, contacto, seguro social ni ubicación exacta.</li>
              <li><strong>Solicitud pendiente.</strong> El perfil sigue disociado. El mensaje con el que la empresa acompaña su solicitud no admite datos de contacto.</li>
              <li><strong>Vinculación aceptada.</strong> Solo entonces se abre la conversación entre la empresa y la institución. La plataforma nunca entrega a la empresa la identidad del alumno: la institución, que administra el expediente, decide qué datos estrictamente necesarios comparte por la conversación para coordinar la vinculación, con el consentimiento del alumno o de su tutor.</li>
            </ol>
          </>
        ),
      },
      {
        id: 'finalidades',
        title: 'Finalidades',
        body: (
          <>
            <p><strong>Finalidades primarias</strong>, necesarias para el servicio:</p>
            <ul>
              <li>Crear y administrar las cuentas y verificar la identidad de quien accede.</li>
              <li>Validar a las empresas y gestionar a las instituciones participantes.</li>
              <li>Publicar oportunidades duales, buscar talento y tramitar las solicitudes de vinculación.</li>
              <li>Permitir la conversación entre la empresa y la institución durante una vinculación.</li>
              <li>Enviar avisos de la cuenta: acceso, cambio de contraseña y mensajes nuevos.</li>
              <li>Mantener la seguridad y la trazabilidad de los cambios.</li>
            </ul>
            <p>
              <strong>Finalidad secundaria:</strong> elaborar reportes estadísticos para la Secretaría de Economía y Administración. Estos reportes
              solo contienen conteos agregados (por estado de la solicitud, por institución y por sector) y nunca identifican a una persona.
            </p>
          </>
        ),
      },
      {
        id: 'transferencias',
        title: 'Transferencias y encargados',
        body: (
          <>
            <p>
              No vendemos ni cedemos datos personales. Dentro de la plataforma, cada actor ve solo lo que su rol necesita, como se describe arriba.
              Fuera de ella, solo se comunican datos cuando una autoridad competente lo requiera conforme a la ley.
            </p>
            <p>Para operar, el responsable se apoya en estos encargados, que tratan los datos solo por su cuenta y bajo sus instrucciones:</p>
            <ul>
              {config.processors.map((processor) => (
                <li key={processor.name}><strong>{processor.name}</strong>: {processor.purpose} Ubicación: <LegalValue value={processor.location} />.</li>
              ))}
            </ul>
          </>
        ),
      },
      {
        id: 'seguridad',
        title: 'Medidas de seguridad',
        body: (
          <ul>
            <li><strong>Acceso por rol.</strong> Cada institución solo ve y modifica a sus propios alumnos. Las empresas no pueden modificar alumnos y la Secretaría no administra expedientes académicos.</li>
            <li><strong>Contraseñas.</strong> Se guardan con una función de hash y nunca se registran ni se devuelven. Cambiar o restablecer la contraseña cierra las demás sesiones abiertas de la cuenta.</li>
            <li><strong>Cifrado.</strong> En producción, la conexión viaja cifrada (HTTPS). El número de seguridad social y el número de póliza se guardan cifrados, y el comprobante del seguro se resguarda en un almacenamiento privado.</li>
            <li><strong>Bitácora inmutable.</strong> Cada cambio de cuentas y perfiles queda en una bitácora que no se puede editar ni borrar. Registra quién hizo el cambio y qué campos cambiaron, pero nunca sus valores ni contraseñas.</li>
            <li><strong>Conversaciones.</strong> Los mensajes no se pueden editar ni borrar. Los correos y avisos del navegador solo dicen que hay un mensaje nuevo, nunca su texto.</li>
            <li><strong>Videos.</strong> Al procesarlos se eliminan sus metadatos (por ejemplo, ubicación o dispositivo de grabación), y se sirven con enlaces firmados que vencen en pocas horas.</li>
          </ul>
        ),
      },
      {
        id: 'derechos',
        title: 'Derechos ARCO y revocación',
        body: (
          <>
            <p>
              Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición (ARCO), o revocar tu consentimiento,
              ante {channel} (<LegalValue value={dataProtection.channelName} />):
            </p>
            <ul>
              <li>Correo electrónico: <LegalValue value={dataProtection.email} /></li>
              {dataProtection.phone && <li>Teléfono: {dataProtection.phone}</li>}
              <li>Domicilio: <LegalValue value={dataProtection.address ?? controller.address} /></li>
              {dataProtection.hours && <li>Horario: {dataProtection.hours}</li>}
            </ul>
            <p>Tu solicitud debe incluir:</p>
            <ul>
              <li>tu nombre y un medio para recibir la respuesta;</li>
              <li>un documento que acredite tu identidad o, en su caso, la de tu representante;</li>
              <li>la descripción clara de los datos y del derecho que quieres ejercer.</li>
            </ul>
            <p>Plazo de respuesta: <LegalValue value={dataProtection.responseTerm} />.</p>
            <p>
              Los datos de un alumno los captura y corrige su institución. El alumno, o su madre, padre o tutor, puede pedir a su institución
              que los corrija o deje de usarlos, o dirigirse al canal anterior.
            </p>
            <p>Si consideras que tu derecho no fue atendido, puedes acudir a la autoridad garante: <LegalValue value={authority.name} />{authority.website ? ` (${authority.website})` : ''}.</p>
          </>
        ),
      },
      {
        id: 'cambios',
        title: 'Cambios a este aviso',
        body: (
          <p>
            Cualquier cambio a este aviso se publicará en esta misma página, con su fecha de actualización. Las tecnologías que la plataforma
            usa en tu navegador se describen en la política de cookies.
          </p>
        ),
      },
    ],
  }
}
