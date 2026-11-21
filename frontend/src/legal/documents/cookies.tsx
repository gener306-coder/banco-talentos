import { browserTechnologies } from '../technologies'
import type { LegalDocument } from '../types'

export function cookiesDocument(): LegalDocument {
  return {
    slug: 'cookies',
    title: 'Cookies y tecnologías técnicas',
    shortTitle: 'Cookies',
    lead: (
      <>
        El Banco de Talentos <strong>no usa cookies publicitarias, analítica ni rastreadores de terceros</strong>. Solo usa las tecnologías
        estrictamente necesarias para que funcione, y por eso no te pide aceptar cookies con un banner.
      </>
    ),
    sections: [
      {
        id: 'sin-rastreo',
        title: 'Lo que no hacemos',
        body: (
          <ul>
            <li>No mostramos publicidad ni compartimos tu actividad con redes publicitarias.</li>
            <li>No usamos herramientas de analítica ni píxeles de seguimiento.</li>
            <li>No cargamos fuentes, scripts ni recursos de otros dominios, y no enviamos la página de origen a otros sitios.</li>
          </ul>
        ),
      },
      {
        id: 'inventario',
        title: 'Tecnologías que usamos',
        body: (
          <>
            <p>Esta es la lista completa. Ninguna sirve para identificarte fuera de la plataforma.</p>
            <div className="legal-table-wrapper">
              <table className="legal-table">
                <caption className="visually-hidden">Cookies y almacenamiento del navegador</caption>
                <thead>
                  <tr><th scope="col">Nombre</th><th scope="col">Tipo</th><th scope="col">Para qué</th><th scope="col">Duración</th></tr>
                </thead>
                <tbody>
                  {browserTechnologies.map((technology) => (
                    <tr key={technology.name}>
                      <th scope="row"><code>{technology.name}</code></th>
                      <td>{technology.kind}</td>
                      <td>{technology.purpose}</td>
                      <td>{technology.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ),
      },
      {
        id: 'avisos',
        title: 'Avisos del navegador',
        body: (
          <p>
            Los avisos de mensajes nuevos solo se activan si tú das permiso. Muestran el nombre de la organización y la oportunidad, nunca el
            texto del mensaje. Puedes retirar el permiso cuando quieras desde la configuración del sitio en tu navegador.
          </p>
        ),
      },
      {
        id: 'control',
        title: 'Cómo borrarlas',
        body: (
          <p>
            Puedes borrar estas cookies y el almacenamiento del sitio desde la configuración de privacidad de tu navegador. Si borras la cookie
            de sesión, tendrás que volver a iniciar sesión. Si borras el almacenamiento, la plataforma volverá al tema claro y te ofrecerá de
            nuevo activar los avisos.
          </p>
        ),
      },
    ],
  }
}
