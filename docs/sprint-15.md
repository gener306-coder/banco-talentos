# Sprint 15 — Apartado legal y de transparencia

Sprint vigente desde el 20 de noviembre de 2026. Sprint anterior: [sprint-14.md](sprint-14.md) (histórico).

**Objetivo del Sprint:** que cualquier persona, con o sin sesión, conozca cómo se tratan sus datos y las reglas de uso, con documentos fieles al funcionamiento real de la plataforma y al marco mexicano vigente (LFPDPPP de 2025 o LGPDPPSO, sin referencias al extinto INAI).

**Story Points:** 16 (HU-S15-01 a HU-S15-04).

**Rama:** `feat/s15-legal`.

## Decisiones del responsable y el Arquitecto (20 de noviembre de 2026)

- **D1. Publicable sin datos jurídicos específicos** (redacción actualizada por T-S15-02): el régimen (ente público con LGPDPPSO o particular con LFPDPPP) y los datos jurídicos específicos se definen después con el cliente. `frontend/src/legal/legalConfig.ts` trae valores operativos (responsable: Administración del Banco de Talentos; programa: Banco de Talentos – Educación Dual), y los datos jurídicos opcionales vacíos se omiten o se sustituyen por una redacción operativa. No hay alertas de borrador ni marcadores visibles: la plataforma ya es publicable.
- **D2.** El footer **sí** se muestra en `/welcome`: es donde la empresa entrega datos y conviene tener a mano el Aviso de Privacidad.
- **D3.** El aviso simplificado de los accesos es **informativo**: no registra aceptación. Las finalidades secundarias son estadísticas agregadas y disociadas, que no son datos personales.
- **D4. Sprint solo de frontend:** sin migraciones ni endpoints. Los hallazgos de backend van a las notas previas a producción.

## Hechos verificados que sustentan los documentos

Auditoría del 20 de noviembre de 2026 sobre `main` (a0b9622):

- **Cookies:** `banco-de-talentos-session` (sesión en base de datos, 120 minutos, `HttpOnly`, `SameSite=Lax`, sin «recordarme») y `XSRF-TOKEN` de Sanctum. No hay otras.
- **Almacenamiento del navegador:**
  - `localStorage`: `bt-theme` y `linkage-notifications-dismissed`;
  - `sessionStorage`: `table-memory` y `linkage-draft:{rol}:{id}`.
- **Otras tecnologías:** `BroadcastChannel` `bt-unread` y `/notifications-sw.js`, que solo atiende el clic de los avisos (sin `fetch`, `push` ni caché).
- **El respaldo WebM no usa almacenamiento:** es una segunda fuente del video.
- **Sin terceros:** no hay analítica, CDN ni fuentes externas. Los encargados posibles son el proveedor de correo, el hospedaje y el almacenamiento opcional de medios.
- **Contraseñas y sesiones:** las contraseñas se guardan con hash. Cambiarlas cierra las demás sesiones. Solo `nss` y `policy_number` se cifran en reposo. El comprobante del seguro vive en un disco privado.
- **Bitácora:** `account_audit_events` guarda solo nombres de campos y es inmutable (trigger).
- **Videos:** se les quitan los metadatos y se sirven con URLs firmadas que vencen entre 1 y 2 horas.
- **Avisos:** los correos y avisos del navegador nunca incluyen el texto del mensaje.
- **Vinculación:** la empresa nunca recibe la identidad del alumno de forma automática. El mensaje inicial no admite datos de contacto. Tras la aceptación se abre la conversación, inmutable. Con `BAJA` la conversación queda en solo lectura.
- **Reportes:** solo conteos agregados.

## Orden de implementación

1. **HU-S15-01** Configuración legal centralizada y Aviso de Privacidad Integral.
2. **HU-S15-02** Términos y Condiciones; Cookies y tecnologías técnicas.
3. **HU-S15-03** Footer y rutas legales públicas.
4. **HU-S15-04** Aviso simplificado en los accesos y coherencia de textos.

## Fuera de alcance

- Registro de la aceptación de los términos (D3).
- Banner de cookies: no hace falta, porque no hay cookies que no sean técnicas.
- Cambios de backend, versión imprimible o PDF, traducciones e historial de versiones del aviso.

---

## HU-S15-01 — Configuración legal centralizada y Aviso de Privacidad Integral

**Estado:** Completada (20 de noviembre de 2026) en `feat/s15-legal`.  
**Diseño técnico y verificación:** [HU-S15-01.md](HU-S15-01.md)  
**Story Points:** 5  
**Rol:** público (con o sin sesión); el área jurídica mantiene la configuración

### Historia de usuario

**COMO** persona que usa o consulta el Banco de Talentos  
**QUIERO** leer un Aviso de Privacidad claro y fiel a lo que hace la plataforma  
**PARA** saber qué datos se tratan, para qué, quién los ve y cómo ejercer mis derechos.

### Criterios de aceptación

- **CA-01.** `frontend/src/legal/legalConfig.ts` es el único archivo con datos jurídicos:
  - régimen (`public_entity`, `private_entity` o `null`);
  - responsable y domicilio;
  - canal ARCO (Unidad de Transparencia o área de datos personales), con correo, teléfono, horario y plazo;
  - autoridad garante vigente;
  - ley aplicable y jurisdicción;
  - encargados;
  - versión y fecha de última actualización.
- **CA-02.** `missingLegalFields()` lista los datos jurídicos vacíos y `byRegime()` elige el texto según el régimen. Desde T-S15-02, `missingLegalFields()` es solo una utilidad interna: los datos vacíos se omiten o se redactan de forma operativa, sin avisos de borrador.
- **CA-03.** `/legal/privacidad` empieza con un resumen tipo «etiquetas de privacidad» por actor: instituciones, empresas, Secretaría y Administración, y alumnos sin cuenta.
- **CA-04.** El inventario de datos coincide con el sistema real: cuentas de los cuatro roles, perfiles autogestionados de empresas (con RFC y ubicación) e instituciones (con CCT y contacto), expediente y comprobante de seguro de los alumnos, mensajes de vinculación y videos promocionales.
- **CA-05.** Describe la privacidad progresiva: perfil disociado durante la búsqueda y la solicitud pendiente, sin transferencia automática de identidad, y comunicación de los datos necesarios por decisión de la institución una vez aceptada la vinculación.
- **CA-06.** Separa las finalidades primarias de las secundarias (estadística agregada y disociada) e incluye transferencias y encargados. Las medidas de seguridad enumeradas son solo las verificadas: roles, hash de contraseñas, cifrado de NSS y póliza, cierre de sesiones al cambiar la contraseña, bitácora inmutable sin valores y avisos sin texto de los mensajes.
- **CA-07.** Incluye el procedimiento de derechos ARCO y la revocación, con los datos de la configuración.
- **CA-08.** Ningún texto de la interfaz menciona al INAI. Una prueba recorre `src/` para impedirlo.

## HU-S15-02 — Términos y Condiciones; Cookies y tecnologías técnicas

**Estado:** Completada (20 de noviembre de 2026) en `feat/s15-legal`.  
**Diseño técnico y verificación:** [HU-S15-02.md](HU-S15-02.md)  
**Story Points:** 3  
**Rol:** público (con o sin sesión)

### Historia de usuario

**COMO** organización usuaria del Banco de Talentos  
**QUIERO** conocer las reglas de uso y las tecnologías que guarda mi navegador  
**PARA** operar sabiendo mis obligaciones y sin rastreadores ocultos.

### Criterios de aceptación

- **CA-01.** `/legal/terminos` cubre:
  - la naturaleza B2B de vinculación: no es intermediario laboral ni bolsa de trabajo abierta;
  - las responsabilidades de cada rol: veracidad de los perfiles autogestionados; consentimiento del alumno o su tutor y minimización de datos por la institución; confidencialidad y prohibición de scraping y re-identificación para las empresas;
  - las facultades de suspensión de Administración y de la Secretaría.
- **CA-02.** Describe la conversación inmutable, la baja de una vinculación (`BAJA`) con el historial en solo lectura, la propiedad intelectual (incluidos los videos de las instituciones), la disponibilidad, las modificaciones y la jurisdicción.
- **CA-03.** `/legal/cookies` declara que no hay cookies publicitarias, analítica ni rastreadores de terceros, y que por eso no hay banner.
- **CA-04.** El inventario de cookies, almacenamiento local, `BroadcastChannel` y service worker sale de `frontend/src/legal/technologies.ts`, que importa las constantes reales del código. Una prueba falla si el código usa almacenamiento del navegador, `BroadcastChannel`, service workers o `document.cookie` en un archivo que el inventario no declara.

## HU-S15-03 — Footer y rutas legales públicas

**Estado:** Completada (20 de noviembre de 2026) en `feat/s15-legal`.  
**Diseño técnico y verificación:** [HU-S15-03.md](HU-S15-03.md)  
**Story Points:** 5  
**Rol:** todos y visitantes sin sesión

### Historia de usuario

**COMO** persona que navega la plataforma  
**QUIERO** un pie de página discreto con los documentos legales y poder leerlos con o sin sesión  
**PARA** consultarlos en cualquier momento y volver a donde estaba.

### Criterios de aceptación

- **CA-01.** `/legal/privacidad`, `/legal/terminos` y `/legal/cookies` funcionan con y sin sesión, sin pasar por `ProtectedRoute` y sin redirigir a `/login`. Con sesión se ven los menús de la barra. Un documento desconocido redirige a `/legal/privacidad`.
- **CA-02.** «Volver» regresa a la vista de origen. Sin origen, va al inicio (con sesión) o al inicio de sesión (sin sesión). Cambiar de documento conserva el origen.
- **CA-03.** El artículo se limita a `--content-readable`:
  - desde 960 px, el índice es `sticky` bajo la barra (`--app-bar-height`);
  - en pantallas estrechas, el índice es colapsable;
  - los títulos de sección no quedan bajo la barra al saltar a ellos.
- **CA-04.** `AppFooter` se muestra en todas las vistas salvo las conversaciones (`.../chat`, de alto `100dvh`) y el feed `/promocion`. Aparece y desaparece sin volver a montar el encabezado ni el contenido.
- **CA-05.** Estilo del footer:
  - borde superior `1px solid var(--border)` y texto `--text-muted`;
  - claro y oscuro;
  - sin desborde a 390 px y enlaces de al menos 44 px de alto;
  - queda al fondo en las vistas cortas.
- **CA-06.** Solo tokens semánticos dentro de `@layer` (`tokens.test.ts`) y sin comillas angulares en los textos (`copy.test.ts`).

## HU-S15-04 — Aviso simplificado en los accesos y coherencia de textos

**Estado:** Completada (20 de noviembre de 2026) en `feat/s15-legal`.  
**Diseño técnico y verificación:** [HU-S15-04.md](HU-S15-04.md)  
**Story Points:** 3  
**Rol:** todos

### Historia de usuario

**COMO** persona que entra a la plataforma  
**QUIERO** ver quién trata mis datos y dónde consultar el aviso completo, y que la interfaz no contradiga el aviso  
**PARA** confiar en lo que la plataforma dice de mis datos.

### Criterios de aceptación

- **CA-01.** El inicio de sesión y las pantallas de creación y restablecimiento de contraseña muestran una nota discreta con:
  - el responsable;
  - la finalidad principal;
  - enlaces al Aviso de Privacidad y a los Términos y Condiciones, con regreso a la pantalla de origen.
- **CA-02.** Con la solicitud aceptada o dada de baja, la nota de privacidad del detalle de la institución deja de afirmar que la empresa no conoce al alumno. En su lugar, recuerda compartir solo los datos necesarios y con consentimiento.
- **CA-03.** Con la solicitud aceptada o dada de baja, la nota del detalle de la empresa indica que la institución puede compartirle datos necesarios y que debe tratarlos con confidencialidad. En los demás estados, ambas notas conservan el texto actual.
- **CA-04.** Pruebas de Vitest y Playwright: acceso público, navegación entre documentos, footer por ruta, ausencia del INAI, aviso simplificado y recorridos a 1440 y 390 px en claro y oscuro.

---

## Tareas técnicas

### T-S15-01 — Auditoría y refinamiento visual del apartado legal

**Estado:** Implementada (20 de noviembre de 2026). Solicitada por el responsable sobre HU-S15-01 a HU-S15-04. Solo frontend.

- **Hallazgos de la auditoría (1440 y 390 px, en claro y oscuro):**
  - el título y la introducción iban al ancho de la tarjeta, y el artículo empezaba 17 rem más a la derecha, así que la columna de lectura no estaba alineada;
  - a 390 px el selector de documentos se partía en dos renglones («Aviso de Privacidad» solo y los otros dos debajo);
  - el índice no decía en qué sección ibas, y en el celular desaparecía al bajar, porque solo existía arriba del artículo;
  - en el celular, la tabla de cookies se desplazaba de lado y partía los nombres en tres renglones;
  - los datos jurídicos pendientes se leían como texto («El responsable del tratamiento es Pendiente de definir»);
  - el aviso de borrador aparecía en Cookies, que no usa datos jurídicos;
  - «Versión 1.0» quedaba sola en un renglón y la introducción ocupaba ocho renglones grandes en el celular;
  - el aviso simplificado se pegaba al botón principal.
- **Esqueletos:** los documentos son estáticos y se pintan al instante, sin consultar la API, así que no llevan esqueleto. Un esqueleto ahí solo agregaría un parpadeo.
- **Disposición:**
  - desde 960 px, el índice ocupa la izquierda desde el título y el encabezado comparte la columna de lectura con el artículo;
  - el regreso y el selector de documentos van en una barra superior.
- **Control segmentado:** con los nombres cortos (Privacidad, Términos y Cookies), en una sola fila también a 390 px. El documento actual va en una superficie elevada con el acento, y los segmentos miden 44 px.
- **Índice que sigue la lectura:** la sección en lectura (la última cuyo título pasó el primer tercio de la ventana) lleva `aria-current="location"` y el tinte de la marca.
  - En el celular es una barra translúcida fija bajo el encabezado que nombra la sección actual y se despliega para saltar a otra.
  - Se cierra al elegir una sección, con Esc (devolviendo el foco) o al tocar fuera.
- **Datos pendientes:** `LegalValue` los mostraba como una marca con el tono de estado inactivo, y el aviso de borrador solo aparecía en los documentos que usan `legalConfig` (`usesConfig`). T-S15-02 retiró las marcas, el aviso, `LegalValue` y `usesConfig`.
- **Cookies en el celular:** una tarjeta por tecnología, con el nombre monoespaciado, el tipo en una pastilla, la finalidad y la duración con su etiqueta. El encabezado de la tabla sigue en el documento para los lectores de pantalla.
- **Tipografía:**
  - título del documento en `--type-2xl` (`--type-xl` en el celular) e introducción en `--type-lg` (`--type-base` en el celular);
  - subtítulos de grupo en mayúsculas espaciadas;
  - viñetas en `--text-muted`;
  - fecha y versión sin partirse.
- **Aviso simplificado:** separado del formulario por un filete.
- **Pruebas:**
  - Vitest: borrador solo en privacidad y términos, marcas de pendiente, sección actual marcada y cierre con Esc y al tocar fuera;
  - E2E: el selector usa los nombres cortos.

  Revisión visual a 1440 y 390 px en claro y oscuro: arriba, a media lectura, al final, con el índice desplegado, y en el inicio de sesión y el restablecimiento.

### T-S15-02 — Apartado legal listo para producción, sin borrador

**Estado:** Implementada (20 de noviembre de 2026) en `feat/s15-legal`. Solicitada por el responsable. Solo frontend.

- **Configuración (`legalConfig.ts`):**
  - valores operativos: `controller.name` (Administración del Banco de Talentos) y `programName` (Banco de Talentos – Educación Dual);
  - datos jurídicos específicos opcionales, `null` o `[]` por defecto: `regime`, `controller.address` y `shortName`, canal ARCO (`channelName`, `email`, `phone`, `address`, `hours`, `responseTerm`), `authority`, `jurisdiction` y `processors`;
  - se elimina `PENDING`;
  - `missingLegalFields()` queda como utilidad interna, sin efecto en la interfaz;
  - `footerOwner()` evita repetir el programa en el footer.
- **Documentos sin borrador:** se retiran el `Callout` de borrador, `LegalValue` (con sus estilos) y `usesConfig`. Cada dato opcional con valor se muestra; sin valor, se omite su línea o se usa una redacción operativa:
  - sin régimen: «conforme a los principios y la legislación vigentes en México en materia de protección de datos personales»;
  - sin canal ARCO dedicado: las solicitudes se atienden a través del responsable, Administración del Banco de Talentos, y en el caso de los alumnos, mediante su institución educativa. El plazo y la autoridad garante se omiten;
  - sin encargados detallados: una mención general a los proveedores técnicos de hospedaje, correo electrónico y almacenamiento de medios;
  - sin ley ni tribunales: «Estas condiciones se rigen por la legislación mexicana aplicable».
- **Rótulos en lugar de frases con artículo:** «Responsable del tratamiento: …», «Responsable de tus datos: …» y «cuyo responsable es …». Así se leen igual con el responsable operativo o con una razón social.
- **Detalles de la revisión visual:**
  - el párrafo de los alumnos remite al canal anterior solo si existe; si no, «dirigirse directamente al responsable»;
  - el separador de la fecha y la versión queda pegado a la fecha, así que a 390 px el segundo renglón ya no empieza con «·».
- **Footer:** «© 2026 Banco de Talentos – Educación Dual». Con un nombre corto distinto del programa: «© 2026 Nombre corto · Banco de Talentos – Educación Dual».
- **Pruebas:**
  - Vitest:
    - con la configuración predeterminada, ni los documentos, ni el aviso simplificado, ni el footer muestran «Pendiente de definir» ni «Borrador»;
    - la redacción operativa del Aviso;
    - con una configuración completa (`legal/testing.ts`), los documentos, el aviso simplificado y el footer muestran cada dato (`documents.test.tsx` y `ui/AppFooter.test.tsx`, nuevos);
  - E2E: el Aviso, sin borrador ni marcadores.

---

## Notas previas a producción

No se implementan en este Sprint. Se revisan antes del despliegue:

1. **Opcional, con el área jurídica:** ampliar `frontend/src/legal/legalConfig.ts` con el régimen, el domicilio, el canal ARCO dedicado, la autoridad garante, los tribunales y la lista de encargados. La plataforma ya es publicable sin alertas de borrador. Cada dato que se capture aparece en los documentos, y `missingLegalFields()` indica cuáles faltan.
2. Configurar `SESSION_SECURE_COOKIE=true` en producción (`.env.example` lo trae en `false`). El Aviso de Privacidad afirma que, en producción, la sesión viaja solo por HTTPS.
3. Si cambia `SESSION_COOKIE`, actualizar `frontend/src/legal/technologies.ts`.
4. Confirmar con el área jurídica quién es responsable de los datos de los alumnos y si la plataforma actúa como encargada de las instituciones.
5. Valorar cifrar en reposo más campos de identidad del alumno. Hoy solo `nss` y `policy_number` están cifrados, y el aviso no afirma más.
6. La redacción final de los plazos ARCO y de la licencia sobre los videos la valida el área jurídica.
