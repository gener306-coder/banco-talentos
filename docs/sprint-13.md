# Sprint 13 — Mensajería de Vinculación

Sprint vigente desde el 17 de noviembre de 2026. Sprint anterior: [sprint-12.md](sprint-12.md) (histórico).

**Objetivo del Sprint:** que la coordinación posterior al «match» ocurra dentro de la plataforma. Cuando la institución acepta una solicitud de vinculación, la empresa y la institución conversan en un hilo de mensajes atado a esa solicitud, saben cuándo hay mensajes sin leer y reciben un aviso por correo si no están en la plataforma.

**Story Points:** 19 (HU-S13-01 a HU-S13-05).

**Rama:** `feat/hu-s13-linkage-messaging`.

**Referencia:** análisis previo en [design/sprint-13-messaging-proposal.md](design/sprint-13-messaging-proposal.md) (histórico; este archivo prevalece).

## Decisiones del responsable y el Arquitecto (17 de noviembre de 2026)

- **Modelo asíncrono.** API REST y consulta periódica desde el cliente. Sin Laravel Reverb, WebSockets ni Redis. El aviso por correo usa la cola `database` y el `worker` existentes. La API admite `after=<id>` para que una capa de tiempo real futura no obligue a reescribirla.
- **Marcador de lectura por lado.** La conversación es una bandeja compartida: si cualquier cuenta de la institución (o de la empresa) la leyó, queda leída para todo su lado. Se guarda en `linkage_requests.company_last_read_message_id` y `institution_last_read_message_id`.
- **Identidad del remitente.** El otro lado solo ve el nombre de la organización («Universidad X», «Empresa Y»), nunca la cuenta que escribió. El propio lado sí ve el nombre de su cuenta.
- **Solo en solicitudes ACEPTADAS.** En cualquier otro estado la conversación no existe. «Concluir vinculación» queda fuera de este Sprint.
- **El aviso por correo entra** (HU-S13-05): es la palanca de retención.
- **Un estado no válido responde 422** con el error en `status`, igual que la cancelación y la respuesta institucional.

## Reglas de privacidad

- Solo B2B: el alumno no participa. La Secretaría y el administrador no leen el contenido de las conversaciones (403).
- Ninguna respuesta contiene `sender_user_id`, `students.id`, la identidad del alumno ni datos protegidos. La empresa sigue conociendo al alumno solo por su `public_id`.
- La interfaz muestra un aviso fijo: «La empresa conoce al alumno solo por su perfil. No compartas datos personales del alumno por este medio.» No se filtra el texto automáticamente: la coordinación necesita teléfonos y direcciones de las organizaciones, y un filtro daría una falsa sensación de seguridad.
- Sin archivos adjuntos.
- Los mensajes no se editan ni se borran (sin `updated_at` ni ruta `DELETE`; la base de datos lo impide).
- Una conversación ajena responde `404`, idéntico a una inexistente. Las respuestas llevan `Cache-Control: no-store, private`.

## Orden de implementación

1. **HU-S13-01** Hilo de mensajes: base de datos y API.
2. **HU-S13-02** Detalle de la solicitud para la empresa.
3. **HU-S13-03** Conversación en los detalles de ambos lados.
4. **HU-S13-04** Mensajes sin leer.
5. **HU-S13-05** Aviso agrupado por correo.

## Fuera de alcance

- Tiempo real (Reverb/WebSockets) y notificaciones push.
- Concluir o cancelar una vinculación ya aceptada.
- Archivos adjuntos, edición o borrado de mensajes y confirmaciones de lectura visibles para el otro lado.
- Acceso de la Secretaría o del administrador al contenido, e indicadores sobre conversaciones.

---

## HU-S13-01 — Hilo de mensajes: base de datos y API

**Estado:** Backend completado (17 de noviembre de 2026). Pest en verde: 53 pruebas en `tests/Feature/LinkageMessageTest.php`.  
**Story Points:** 5  
**Rol:** `COMPANY`, `INSTITUTION`

### Historia de usuario

**COMO** empresa o institución con una solicitud de vinculación aceptada  
**QUIERO** intercambiar mensajes con la otra organización dentro de la plataforma  
**PARA** coordinar la vinculación sin salir de ella.

### Criterios de aceptación

- **CA-01.** Tabla `linkage_messages` (`id`, `linkage_request_id`, `sender_party` `COMPANY`|`INSTITUTION` con CHECK, `sender_user_id`, `body` de 1 a 2000 caracteres sin ser solo espacios, `created_at`), sin polimorfismo. La base de datos rechaza actualizar o borrar un mensaje. `linkage_requests` gana `last_message_at`, `company_last_read_message_id` e `institution_last_read_message_id`.
- **CA-02.** Endpoints con los mismos middlewares que cada bandeja:
  - Empresa: `GET|POST /api/linkage-requests/{id}/messages` y `POST /api/linkage-requests/{id}/messages/read`.
  - Institución: los mismos bajo `/api/institution/linkage-requests/{id}/…`.
  El lado del remitente lo fija el servidor según la sesión, nunca el cliente.
- **CA-03.** Aislamiento: cada consulta se filtra por la empresa o la institución de la sesión. Una solicitud ajena o inexistente responde `404` con el mismo cuerpo. Las cuentas `ADMIN` y `SECRETARY` reciben `403`.
- **CA-04.** Estado: leer, enviar y marcar como leído solo en solicitudes `ACEPTADA`; en `PENDIENTE_INSTITUCION`, `RECHAZADA` o `CANCELADA` responde `422` con el error en `status`.
- **CA-05.** Solo lectura: si la otra organización está inactiva, se puede leer y marcar como leído, pero enviar responde `422`. `GET` lo informa con `meta.can_write`.
- **CA-06.** `GET` devuelve los mensajes en orden cronológico, de 100 en 100, con `after=<id>` y `meta.has_more`. Cada mensaje lleva `id`, `sender_party`, `sender_name` (la organización, resuelta desde la solicitud), `is_own`, `account_name` (solo en los propios; `null` en los del otro lado), `body` y `created_at`. Nunca `sender_user_id`.
- **CA-07.** `POST …/messages` acepta solo `body` (otros campos se rechazan con su nombre), responde `201`, actualiza `last_message_at` y deja leído para el lado que envía todo lo anterior. Límite `throttle:linkage-messages`: 30 envíos por minuto por cuenta.
- **CA-08.** `POST …/messages/read` recibe `last_read_message_id`, que debe pertenecer a la conversación. El marcador es por lado y solo avanza: un valor anterior no lo retrocede.
- **CA-09.** Pest cubre: acceso por rol y CSRF, aislamiento entre empresas e instituciones, bloqueo por estado, solo lectura, campos expuestos, validaciones, inmutabilidad en la base de datos, marcador compartido por lado que no retrocede, paginación con `after` y límite de envío.

---

## HU-S13-02 — Detalle de la solicitud para la empresa

**Estado:** Pendiente  
**Story Points:** 3  
**Rol:** `COMPANY`

### Historia de usuario

**COMO** empresa  
**QUIERO** abrir cada solicitud de vinculación en su propia pantalla  
**PARA** tener en un solo lugar su resumen, el contacto de la institución y la conversación.

### Criterios de aceptación

- **CA-01.** `GET /api/linkage-requests/{id}` devuelve la solicitud de la empresa de la sesión con la misma lista explícita de campos de la bandeja. Una ajena o inexistente responde `404`.
- **CA-02.** Ruta `/linkage-requests/:id` con el resumen del perfil anónimo, la oportunidad, el estado, el mensaje enviado, la respuesta de la institución y su contacto. La cancelación sigue disponible mientras esté pendiente.
- **CA-03.** Las filas de la bandeja `/linkage-requests` abren el detalle con el patrón de filas clicables de T-S12-04, y el detalle regresa a la bandeja con sus filtros.
- **CA-04.** Pest cubre el aislamiento del detalle; Vitest, la navegación desde la fila y el regreso.

---

## HU-S13-03 — Conversación en los detalles de ambos lados

**Estado:** Pendiente  
**Story Points:** 5  
**Rol:** `COMPANY`, `INSTITUTION`

### Historia de usuario

**COMO** empresa o institución con una vinculación aceptada  
**QUIERO** ver y escribir la conversación desde el detalle de la solicitud  
**PARA** coordinar sin cambiar de herramienta.

### Criterios de aceptación

- **CA-01.** Un solo componente de conversación, en `InstitutionLinkageRequestDetailPage` («Conversación con la empresa») y en el detalle de la empresa («Conversación con la institución»), visible solo en solicitudes `ACEPTADA`.
- **CA-02.** Mensajes en orden cronológico, los propios distinguidos de los ajenos, con la organización, la fecha y, en los propios, la cuenta. Campo de texto con contador de 2000 caracteres. Enviar no duplica el mensaje si se pulsa dos veces.
- **CA-03.** `Callout` fijo con el aviso de privacidad del Sprint.
- **CA-04.** Con la conversación abierta y la pestaña visible, consulta los mensajes nuevos cada 15 s con `after`; se detiene con la pestaña oculta y al salir. Marca como leído el último mensaje visible.
- **CA-05.** En solo lectura, oculta el campo de texto y explica por qué.
- **CA-06.** Usa los tokens semánticos y funciona a 390 px. Vitest cubre el envío, la consulta periódica (pausa incluida), el marcado como leído y la solo lectura. Playwright cubre un intercambio completo entre empresa e institución.

---

## HU-S13-04 — Mensajes sin leer

**Estado:** Pendiente  
**Story Points:** 3  
**Rol:** `COMPANY`, `INSTITUTION`

### Historia de usuario

**COMO** empresa o institución  
**QUIERO** saber qué conversaciones tienen mensajes sin leer  
**PARA** responder a tiempo sin revisar cada solicitud.

### Criterios de aceptación

- **CA-01.** Sin leer es todo mensaje del otro lado posterior al marcador del propio lado.
- **CA-02.** Los elementos de ambas bandejas incluyen `unread_count`. `GET …/unread-summary` devuelve el número de conversaciones con mensajes sin leer, con una consulta acotada a la organización de la sesión.
- **CA-03.** El menú muestra el número de conversaciones sin leer junto a «Solicitudes». Se actualiza al navegar, al volver a la pestaña y cada 60 s con la pestaña visible.
- **CA-04.** Las filas con mensajes sin leer muestran una marca «Nuevo» y las bandejas admiten un filtro «Con mensajes sin leer».
- **CA-05.** Pest cubre el conteo por lado y el aislamiento; Vitest, el badge y la marca.

---

## HU-S13-05 — Aviso agrupado por correo

**Estado:** Pendiente  
**Story Points:** 3  
**Rol:** `COMPANY`, `INSTITUTION`

### Historia de usuario

**COMO** empresa o institución  
**QUIERO** recibir un correo cuando me escriben y no estoy en la plataforma  
**PARA** no dejar una vinculación sin respuesta.

### Criterios de aceptación

- **CA-01.** Al recibir un mensaje, se encola un aviso para las cuentas activas del lado receptor. Sale por la cola existente, con un retraso de unos minutos, y solo si la conversación sigue sin leer para ese lado.
- **CA-02.** Como máximo un aviso por conversación y lado cada 6 horas, aunque lleguen varios mensajes.
- **CA-03.** El correo nombra a la organización remitente y la oportunidad, y enlaza al detalle de la solicitud. No incluye el texto del mensaje ni datos del alumno.
- **CA-04.** Pest cubre el envío, la agrupación, la cancelación al leer y que el correo no contenga el texto ni datos del alumno.
