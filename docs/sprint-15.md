# Sprint 15 — Apartado legal y de transparencia

Sprint vigente desde el 20 de noviembre de 2026. Sprint anterior: [sprint-14.md](sprint-14.md) (histórico).

**Objetivo del Sprint:** que cualquier persona, con o sin sesión, conozca cómo se tratan sus datos y las reglas de uso, con documentos fieles al funcionamiento real de la plataforma y al marco mexicano vigente (LFPDPPP de 2025 o LGPDPPSO, sin referencias al extinto INAI).

**Story Points:** 16 (HU-S15-01 a HU-S15-04).

**Rama:** `feat/s15-legal`.

## Decisiones del responsable y el Arquitecto (20 de noviembre de 2026)

- **D1. Régimen pendiente:** el régimen (ente público con LGPDPPSO o particular con LFPDPPP) y los datos del responsable se definen con el cliente. `frontend/src/legal/legalConfig.ts` nace con `regime: null` y marcadores visibles. No bloquea el desarrollo ni el despliegue.
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
- **CA-02.** `missingLegalFields()` lista los campos pendientes y `byRegime()` elige el texto según el régimen. Mientras falte algún dato, cada documento muestra un aviso de borrador y los marcadores se ven en el texto.
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

## Notas previas a producción

No se implementan en este Sprint. Se revisan antes del despliegue:

1. Completar `frontend/src/legal/legalConfig.ts` (régimen, responsable, canal ARCO, autoridad, jurisdicción y encargados) hasta que `missingLegalFields()` quede vacío y desaparezca el aviso de borrador.
2. Configurar `SESSION_SECURE_COOKIE=true` en producción (`.env.example` lo trae en `false`). El Aviso de Privacidad afirma que, en producción, la sesión viaja solo por HTTPS.
3. Si cambia `SESSION_COOKIE`, actualizar `frontend/src/legal/technologies.ts`.
4. Confirmar con el área jurídica quién es responsable de los datos de los alumnos y si la plataforma actúa como encargada de las instituciones.
5. Valorar cifrar en reposo más campos de identidad del alumno. Hoy solo `nss` y `policy_number` están cifrados, y el aviso no afirma más.
6. La redacción final de los plazos ARCO y de la licencia sobre los videos la valida el área jurídica.
