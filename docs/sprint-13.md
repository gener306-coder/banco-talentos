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
- No se filtra el texto automáticamente: la coordinación necesita teléfonos y direcciones de las organizaciones, y un filtro daría una falsa sensación de seguridad. El aviso fijo de privacidad de HU-S13-03 se retiró en T-S13-07 por decisión del responsable: la conversación solo existe tras la aceptación formal, cuando la institución y la empresa ya pueden compartir detalles de la vinculación.
- Sin archivos adjuntos.
- Los mensajes no se editan ni se borran (sin `updated_at` ni ruta `DELETE`; la base de datos lo impide).
- Una conversación ajena responde `404`, idéntico a una inexistente. Las respuestas llevan `Cache-Control: no-store, private`.

## Orden de implementación

1. **HU-S13-01** Hilo de mensajes: base de datos y API.
2. **HU-S13-02** Detalle de la solicitud para la empresa.
3. **HU-S13-03** Conversación en los detalles de ambos lados.
4. **HU-S13-04** Mensajes sin leer.
5. **HU-S13-05** Aviso agrupado por correo.
6. **HU-S13-06** Conversación en una vista dedicada (pivote de diseño sobre HU-S13-03, aprobado por el responsable el 17 de noviembre de 2026).
7. **T-S13-07** Diseño de mensajería de la conversación (rama `chore/ui-polish-chat-design`).
8. **T-S13-08** La conversación como bandeja real y avisos del navegador (aprobada por el responsable el 18 de noviembre de 2026, misma rama).
9. **T-S13-09** Bandejas manejables: búsqueda, interacción y orden por actividad (aprobada por el responsable y el Arquitecto el 18 de noviembre de 2026, misma rama).
10. **T-S13-10** Tablas sin columna Acciones y bandeja en vivo (pedida por el responsable el 18 de noviembre de 2026, misma rama).
11. **T-S13-11** Corrección móvil y auditoría visual de las bandejas (pedida por el responsable el 18 de noviembre de 2026, misma rama).
12. **T-S13-12** Memoria de las tablas al ir y volver (pedida por el responsable el 18 de noviembre de 2026, misma rama).
13. **T-S13-13** Movimiento y estados de las tablas (aprobada por el responsable el 18 de noviembre de 2026, misma rama).
14. **T-S13-14** Detalle de la solicitud sin duplicados (pedida por el responsable el 18 de noviembre de 2026, misma rama).
15. **T-S13-15** Barra lateral momentánea, navegación del detalle y botones táctiles de la fila (pedida por el responsable el 18 de noviembre de 2026, misma rama).
16. **T-S13-16 a T-S13-19** Afinaciones finales: tablas con flecha, navegación sin duplicados, movimiento y estados donde faltaban, auditoría visual (aprobadas por el responsable el 18 de noviembre de 2026, rama `chore/s13-final-polish`).

## Fuera de alcance

- Tiempo real (Reverb/WebSockets) y notificaciones push (Web Push). Los avisos del navegador de T-S13-08 salen de la consulta periódica con una pestaña abierta.
- Concluir o cancelar una vinculación ya aceptada.
- Archivos adjuntos, edición o borrado de mensajes y confirmaciones de lectura visibles para el otro lado.
- Acceso de la Secretaría o del administrador al contenido, e indicadores sobre conversaciones.

---

## HU-S13-01 — Hilo de mensajes: base de datos y API

**Estado:** Backend completado (17 de noviembre de 2026). Pest en verde: 53 pruebas en `tests/Feature/LinkageMessageTest.php`.  
**Diseño técnico y verificación:** `docs/HU-S13-01.md`  
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

**Estado:** Completada (17 de noviembre de 2026). Pest (`LinkageInboxTest`, detalle) y Vitest (`LinkageRequestDetailPage.test.tsx`, bandeja) en verde; ESLint y build limpios. La columna Acciones suma «Ver detalle» como control accesible de la fila (mismo destino) y conserva «Ver perfil» y «Oportunidad». El detalle deja `.linkage-conversation-slot` en las solicitudes aceptadas para HU-S13-03.  
**Diseño técnico y verificación:** `docs/HU-S13-02.md`  
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

**Estado:** Completada (17 de noviembre de 2026). Vitest (`LinkageConversation.test.tsx`: consulta periódica con intervalos falsos, pausa con la pestaña oculta, envío, marcador de lectura, solo lectura y auto-scroll) y Playwright (intercambio empresa ↔ institución en `talent-search.spec.ts`) en verde. El auto-scroll baja el hilo solo si la persona seguía el final o si envió el mensaje; si subió a leer, ofrece «Ver mensajes nuevos».  
**Diseño técnico y verificación:** `docs/HU-S13-03.md`  
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

**Estado:** Completada (17 de noviembre de 2026). Pest (`LinkageMessageTest`, «mensajes sin leer») y Vitest (`UnreadMessages.test.tsx`) en verde. El aviso va en la tarjeta «Solicitudes de vinculación» del inicio y en el enlace de la navegación de las vistas de solicitudes; la conversación avisa al contador al marcar como leído. El filtro «Con mensajes sin leer» vive en la URL (`unread=1`) y la exportación CSV de la institución no lo aplica (sigue filtrando solo por estado).  
**Diseño técnico y verificación:** `docs/HU-S13-04.md`  
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

**Estado:** Completada (17 de noviembre de 2026).  
**Diseño técnico y verificación:** `docs/HU-S13-05.md`  
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

---

## HU-S13-06 — Conversación en una vista dedicada

**Estado:** Completada (17 de noviembre de 2026).  
**Diseño técnico y verificación:** `docs/HU-S13-06.md`  
**Origen:** pivote de diseño del responsable y el Arquitecto sobre HU-S13-03 (ruta dedicada en lugar de un Sheet).  
**Rol:** `COMPANY`, `INSTITUTION`

### Historia de usuario

**COMO** empresa o institución  
**QUIERO** conversar en una vista dedicada que empiece con el mensaje con el que se abrió la solicitud  
**PARA** darle a la coordinación el lugar principal y abrirla directamente desde la bandeja.

### Criterios de aceptación

- **CA-01.** Rutas `/linkage-requests/:id/chat` y `/institution/linkage-requests/:id/chat`, con encabezado (regreso contextual, otra organización, oportunidad, estado y enlace al detalle), aviso de privacidad, hilo desplazable y campo de texto abajo.
- **CA-02.** El mensaje de la solicitud y la respuesta de la institución son las primeras burbujas, solo de presentación: no cambian el backend, el marcador de lectura ni la consulta periódica.
- **CA-03.** Solo `ACEPTADA` carga el hilo y permite escribir. En los demás estados la vista no consulta mensajes, muestra las burbujas de la solicitud y explica por qué no se puede escribir.
- **CA-04.** En ambas bandejas, el ícono de mensaje abre la vista con regreso a la bandeja filtrada; reemplaza la hoja de T-S12-06.
- **CA-05.** Los detalles ofrecen «Abrir conversación» en lugar de la conversación en línea.
- **CA-06.** El correo de HU-S13-05 enlaza a la vista de conversación.
- **CA-07.** Vitest, Pest y Playwright cubren lo anterior.

---

## T-S13-07 — Diseño de mensajería de la conversación

**Estado:** Completada (17 de noviembre de 2026). Solo presentación: sin cambios en el backend ni en la consulta periódica, el marcador de lectura o el envío.  
**Origen:** pedido del responsable y el Arquitecto: unir la usabilidad de Meta (WhatsApp, Messenger) con la estética de iOS Messages, con los tokens del sistema.  
**Rama:** `chore/ui-polish-chat-design`.

### Decisiones

- **Burbujas propias con `--accent-fill` y `--on-accent`**, no con `--tint`: `--tint` es un acento al 8 % de opacidad y con texto blanco no llega a 4.5:1. `--accent-fill`/`--on-accent` es la pareja de contraste verificada en los dos temas (la de los botones primarios y el número de no leídos).
- **Vidrio con el token `--glass`** (el de la barra superior) y `backdrop-filter`; no se escriben valores `rgba()`.
- **Píldora de radio `1.4rem`**: con una línea es una píldora completa; un radio de `9999px` recortaría las esquinas del texto cuando el campo crece a varias líneas.
- **La hora dentro de la burbuja al 80 % de opacidad**, en lugar del 70 % propuesto, para no perder contraste sobre el color de acento.
- **Separadores de día por sección:** cada separador se fija bajo el encabezado mientras su día está a la vista y cede el lugar al siguiente.
- **Segunda revisión del responsable (17 de noviembre de 2026):**
  - **Sin aviso de privacidad.** La conversación existe tras la aceptación formal y las organizaciones pueden compartir detalles. Además, el ícono del aviso se salía de su pastilla.
  - **Encabezado de una sola barra, estilo Marketplace,** con una franja de contexto para la oportunidad que se oculta en el celular.
  - **Contenedor de 56rem, de borde a borde en el celular.**
  - **Avatares e hilo al estilo Messenger.**
  - **Sin línea fija bajo el campo de texto.**
- **Tercera revisión del responsable (18 de noviembre de 2026):**
  - **El alumno y la oportunidad, siempre visibles y con su propio acceso,** para que la empresa distinga cada conversación. Van en dos tarjetas bajo la barra, que reemplazan la franja de la oportunidad. En el celular se apilan en una línea cada una y siguen visibles.
  - **Inspiración en Messenger, no copia.** De Messenger se toman la estructura (barra, hilo y píldora) y la agrupación. Las tarjetas siguen la identidad del Banco de Talentos: `--surface` con borde, ícono sobre `--tint` y botones `pill-link`.
  - **«Ver solicitud» con texto** en lugar del ícono «i», que era ambiguo. En el celular queda solo la flecha, con su nombre accesible.
  - **La oportunidad de la institución abre el detalle de la solicitud,** porque la institución no tiene ruta de oportunidades y su ficha completa vive en ese detalle.
- **Cuarta revisión del responsable (18 de noviembre de 2026):**
  - **Regreso a la conversación desde cualquier botón.** El detalle de la oportunidad y los dos detalles de la solicitud tenían el «Volver» al final de la página. Ahora, cuando se abren desde otro flujo, el regreso contextual («‹ Volver a la conversación») **toma el lugar de «Inicio»** en la navegación de la sección (`NavBackLink`) y no se repite al final. Sin regreso contextual se ven «Inicio» y el enlace de siempre al final. El perfil y el expediente ya lo tenían arriba. Una primera versión, con una pastilla aparte, se descartó en la revisión del responsable.
  - **Sin dos caminos a la conversación.** Si el detalle de la solicitud se abrió desde la conversación, se oculta «Abrir conversación», porque el regreso ya lleva a ella.
- **Quinta revisión del responsable (18 de noviembre de 2026, en el celular):**
  - **Conversación a pantalla completa en el celular (≤ 600 px).** Se ocultan la barra de la aplicación y la franja del coemblema de la Secretaría mientras la conversación está abierta. Así desaparecen el espacio entre la barra y el chat y el doble encabezado, y el hilo gana ese alto. El regreso de la conversación lleva a la bandeja, donde reaparecen, como en las apps de mensajería. En escritorio no cambia nada. El encabezado respeta el área segura superior (`env(safe-area-inset-top)`).
  - **El separador de día fijo ya no tapa mensajes.** Mientras se desplaza el hilo, se ve fijo bajo el encabezado. A los 1.2 s sin desplazarse se desvanece, como en WhatsApp. En su lugar dentro del hilo siempre se ve.
  - **El borrador se conserva** al ir a esas pantallas y volver. Se guarda en `sessionStorage` por lado y solicitud, y se borra al enviar. Si el almacenamiento no está disponible, no hay borrador.
  - **La conversación ocupa todo el alto disponible.** Mide su posición real bajo la barra de la aplicación (`--chat-offset`, que se recalcula al redimensionar) y deja 1rem abajo en escritorio y nada en el celular.
  - **Enter envía y Shift + Enter hace un salto de línea;** Ctrl/Cmd + Enter sigue enviando. En pantallas táctiles Enter es salto de línea y se envía con el botón, como en los chats móviles. Nunca se envía mientras el teclado compone una palabra.

### Criterios de aceptación

- **CA-01.** Mensajes consecutivos del mismo remitente con menos de 5 minutos entre sí forman un grupo: 2px entre burbujas y solo la primera lleva la «cola» (esquina superior del lado del remitente, 4px); las demás esquinas, 18px. Solo la primera nombra al remitente. Las burbujas de la solicitud nunca se agrupan.
- **CA-02.** Separador por día («Hoy», «Ayer», «12 nov», con el año si es otro), fijo bajo el encabezado al desplazarse (desde CA-18, solo mientras se desplaza), con fondo de vidrio y `--type-xs` en negrita.
- **CA-03.** El encabezado y el campo de texto flotan sobre el hilo con `--glass` y desenfoque de 12px; el hilo pasa por debajo, con un relleno igual a sus alturas medidas para que nada quede tapado.
- **CA-04.** Campo de texto en forma de píldora que crece hasta unas 6 líneas, con un botón circular de enviar a la derecha que solo se habilita con texto. Ctrl/Cmd + Enter sigue enviando (desde CA-16, también Enter).
- **CA-05.** La hora va dentro de la burbuja, abajo a la derecha. Las burbujas de la solicitud son más tenues (`--surface-muted` con borde `--border`) y conservan su etiqueta.
- **CA-06.** El auto-scroll y «Ver mensajes nuevos» siguen funcionando con el nuevo relleno. Vitest cubre la agrupación, los separadores, el botón de enviar y las alturas; ESLint y build limpios.
- **CA-07.** Encabezado de una sola barra (~56px), como un chat de Marketplace:
  - botón-ícono de regreso contextual;
  - avatar con las iniciales de la otra organización;
  - su nombre (encabezado accesible «Conversación con …») y, debajo, un punto de color con «Solicitud {estado}»;
  - botón «Ver solicitud».

  Sin aviso de privacidad. La franja de la oportunidad fue sustituida por las tarjetas de CA-10.
- **CA-08.** Hilo al estilo Messenger:
  - el remitente va sobre el grupo, fuera de la burbuja;
  - del otro lado, un avatar con iniciales acompaña la última burbuja de cada grupo y las demás reservan su espacio;
  - las burbujas ocupan hasta el 70 % del ancho (85 % en el celular).
- **CA-09.** Contenedor de hasta 56rem, de borde a borde en el celular. Bajo el campo de texto no hay una línea fija: «Ctrl + Enter para enviar» es su descripción accesible y el contador aparece desde 1800 caracteres. La franja de solo lectura ocupa una línea.
- **CA-10.** Bajo la barra, dos tarjetas («Tema de la conversación»). Cada una lleva un ícono, un rótulo, el dato principal, un dato secundario y su botón:

  | Lado | Tarjeta del alumno | Tarjeta de la oportunidad |
  | --- | --- | --- |
  | Empresa | «Perfil del alumno»: el titular, con su programa y su periodo; «Ver perfil» lleva a `/talent/:public_id`. | El título y la fecha de la solicitud; «Ver oportunidad» lleva a `/opportunities/:id`. |
  | Institución | «Alumno»: el nombre completo, con la matrícula y el programa; «Ver expediente» lleva a `/students/:id`. | El título, el programa y las vacantes; «Ver oportunidad» lleva al detalle de la solicitud. |
- **CA-11.** Los botones tienen un nombre accesible específico («Ver perfil: {titular}», «Ver la oportunidad {título}», «Ver expediente de {nombre}») y regresan a la conversación («Volver a la conversación»).
- **CA-12.** En escritorio, las tarjetas van en dos columnas. En el celular se apilan en una línea cada una, sin el dato secundario y siempre visibles. Los textos largos se recortan con puntos suspensivos y muestran el texto completo en `title`.
- **CA-13.** «Ver perfil», «Ver expediente», «Ver oportunidad» y «Ver solicitud» abren su pantalla con «Volver a la conversación», que regresa al chat. En los detalles, ese regreso sustituye a «Inicio» en la navegación y no se repite al final. Un detalle de la solicitud abierto desde la conversación no muestra «Abrir conversación».
- **CA-14.** Lo escrito y no enviado se recupera al volver a la conversación en la misma pestaña, y se descarta al enviarlo.
- **CA-15.** Sin espacio sobrante bajo la conversación.
- **CA-16.** Enter envía; Shift + Enter hace un salto de línea; en pantallas táctiles, Enter es salto de línea. La descripción accesible del campo lo explica («Enter para enviar; Shift + Enter para un salto de línea.»).
- **CA-17.** En el celular, la conversación ocupa toda la pantalla, sin la barra de la aplicación ni la franja del coemblema y sin espacio sobre su encabezado.
- **CA-18.** El separador de día fijo bajo el encabezado solo se ve mientras se desplaza el hilo; 1.2 s después se desvanece. El separador en su lugar dentro del hilo no cambia.

## T-S13-08 — La conversación como bandeja real y avisos del navegador

**Estado:** Completada (18 de noviembre de 2026), sin commit.  
**Origen:** pedido del responsable. Quiere que el ícono del chat en las tablas se vea más y vaya junto al correo como vía de contacto, que la tabla muestre cuántos mensajes llegaron, como una bandeja real, y avisos del navegador que abran el chat. El responsable aprobó el plan con tres ajustes obligatorios: una sola consulta, la barra de la fila en la celda y la limpieza al cambiar de cuenta.  
**Rama:** `chore/ui-polish-chat-design`.

### Decisiones

- **Sin infraestructura nueva.** No hay Web Push, VAPID ni servidor de envío, por la misma razón que se descartó Reverb. Los avisos salen de la consulta periódica del resumen mientras haya una pestaña abierta, aunque esté en segundo plano. Con todo cerrado queda el correo de HU-S13-05.
- **Una sola consulta.** `UnreadSummaryProvider`, montado en el shell con sesión, es la única consulta de `…/unread-summary`, y de ella se alimentan:
  - el contador del menú;
  - el título de la pestaña;
  - los avisos.

  Se actualiza al navegar, cada 60 s (también con la pestaña oculta, que es cuando sirve el aviso), con `visibilitychange`/`focus` y con `LINKAGE_READ_EVENT`. Solo corre mientras algo la usa: un contador en la pantalla o los avisos permitidos. Sin eso no hay peticiones.
- **Resumen con las conversaciones con novedades.** El resumen agrega `items`, con hasta 10 conversaciones de la más reciente a la más antigua. Cada una lleva `id`, `counterpart_name`, `opportunity_title`, `unread_count` y `last_message_id`. Solo trae nombres de organización y títulos de oportunidad, que los dos lados ya ven.
- **Línea base.** La primera respuesta de cada cuenta no genera avisos. Después se avisa cada conversación cuyo último mensaje sin leer es más reciente que el conocido, salvo la que la persona tiene abierta y a la vista. Al cambiar de cuenta o cerrar sesión se reinicia la línea base y el título de la pestaña vuelve a su valor base.
- **Privacidad del aviso.** El título es «Mensaje nuevo de {organización}» o «N mensajes nuevos de {organización}», y el cuerpo es «Oportunidad: {título}». **Nunca** lleva el texto del mensaje ni datos del alumno, porque aparece en la pantalla de bloqueo. Lleva un `tag` por conversación, para que un aviso nuevo reemplace al anterior y varias pestañas no lo dupliquen.
- **Clic en el aviso.**
  - El service worker mínimo `public/notifications-sw.js` (sin manejador de `fetch`, no cachea nada) muestra el aviso con `showNotification`, lo único que admite Chrome en Android.
  - Al hacer clic, enfoca la pestaña y le pide abrir el chat (`postMessage`); si no hay pestaña, abre una.
  - Sin service worker se usa `new Notification()`.
  - Solo se aceptan rutas de conversación.
- **Permiso desde un clic.** En las dos bandejas, sobre la tabla, aparece la invitación con «Activar avisos» y «Ahora no».
  - Con el permiso bloqueado, explica cómo activarlo y se puede descartar.
  - No aparece con el permiso concedido, sin soporte o en una conexión que no es segura.
- **Tabla.**
  - En la empresa, el chat es la primera vía de contacto junto al correo y el teléfono de la institución.
  - En la institución, que no tiene el correo de la empresa en la lista, el chat va junto al nombre de la empresa.
  - Con mensajes sin leer, el ícono toma el color de acento y muestra el número (rojo `--danger-border`/`--on-danger`, `99+`).
  - La fila lleva una barra de acento en la primera celda (`box-shadow` en la celda y no en la fila, para Safari y `border-collapse`) y el dato principal en negrita.
  - La marca «Nuevo» sale de la columna Estado; sigue en el botón del detalle.

### Criterios de aceptación

- **CA-01.** En la tabla de la empresa, el ícono de la conversación va junto al correo y el teléfono de la institución. En la de la institución va junto al nombre de la empresa. Ya no aparece en la columna Estado.
- **CA-02.** Con mensajes sin leer, el ícono se resalta, muestra cuántos son (con `99+` a partir de 100) y su nombre accesible lo dice («…: 2 mensajes sin leer»). La fila se marca con la barra de acento y su dato principal va en negrita.
- **CA-03.** El resumen incluye `items` con las conversaciones con novedades del lado: propias, aceptadas y con mensajes sin leer, como máximo 10 y en orden. No incluye el texto de los mensajes ni datos del alumno. Pest cubre los dos lados, el orden, el límite, las ajenas, las pendientes y las leídas.
- **CA-04.** Una sola consulta del resumen alimenta el contador del menú, el título de la pestaña («(N) …») y los avisos, y no se consulta si nada la usa.
- **CA-05.** Con el permiso concedido llega un aviso por cada conversación con mensajes nuevos posteriores a la línea base, salvo la conversación abierta y visible. El clic abre esa conversación.
- **CA-06.** Al cambiar de cuenta o cerrar sesión se reinician la línea base y el título.
- **CA-07.** La invitación pide el permiso desde un clic, recuerda «Ahora no», explica el bloqueo y no aparece sin soporte o sin contexto seguro.

### Limitaciones

- Sin una pestaña abierta de la plataforma no hay aviso del navegador; queda el correo de HU-S13-05.
- Los avisos exigen un contexto seguro (HTTPS o `localhost`). En el celular por `http://192.168.1.70:5180` no están disponibles. En iOS solo funcionan si la página se instala en la pantalla de inicio.
- Hasta 60 s de retraso, el intervalo de la consulta. Los navegadores pueden espaciar más los temporizadores de una pestaña en segundo plano.

## T-S13-09 — Bandejas manejables: búsqueda, interacción y orden

**Estado:** Completada (18 de noviembre de 2026), sin commit.  
**Origen:** el responsable y el Arquitecto. Con decenas o cientos de vinculaciones, una conversación retomada en una solicitud antigua se perdía en la tabla, y no se podía buscar por la otra organización ni ordenar por fecha o actividad. Se decidió **no** crear una bandeja de mensajes aparte, que fragmentaría el seguimiento junto al correo y el teléfono, sino potenciar las bandejas actuales.  
**Rama:** `chore/ui-polish-chat-design`.

### Contrato

`GET /api/linkage-requests` (empresa), `GET /api/institution/linkage-requests` (institución) y su `export.csv` aceptan, además de `status` y `page`, los parámetros siguientes. Un valor inválido responde `422`.

| Parámetro | Valores | Detalle |
| --- | --- | --- |
| `sort` | `activity` (predeterminado), `created_desc`, `created_asc` | `activity` ordena por `GREATEST(created_at AT TIME ZONE 'UTC', responded_at, last_message_at) DESC, id DESC`. Un mensaje o la respuesta de la institución suben la solicitud. Los otros dos ordenan por la fecha de la solicitud, con `id` como desempate. |
| `q` | texto, hasta 100 caracteres | Cada palabra debe aparecer en algún campo. Se descartan las repetidas y se procesan como máximo 8. No distingue acentos ni mayúsculas (`talent_search_text()`), y `%` y `_` se buscan literalmente. |
| `interaction` | `all` (predeterminado), `conversation`, `unread` | `conversation`: hay mensajes en el hilo, leídos o no (`last_message_at` no nulo). `unread`: con mensajes sin leer. Reemplaza a `unread=1` de HU-S13-04. |

Campos donde busca `q`:
- **Empresa:** el nombre de la institución, el título de la oportunidad y el titular público del perfil (`headline_search`). **Nunca** busca en el nombre, los apellidos, la matrícula ni otro dato privado del alumno, y no consulta `student_identities`.
- **Institución:** el nombre comercial o la razón social de la empresa, el título de la oportunidad, y el nombre, los apellidos o la matrícula de sus propios alumnos.

Respuesta:
- Cada elemento de las dos bandejas, y el detalle de la empresa, que reutiliza el mismo elemento, agrega `last_message_at`.
- El detalle de la institución no lo incluye.

### Decisiones

- **Sin filtro aparte por institución en la empresa.** La búsqueda ya encuentra por el nombre de la institución, sin endpoint ni catálogo nuevos, y un `<select>` con decenas de instituciones se usa mal en el celular. Si una empresa llega a trabajar con muchas instituciones, se agregaría un combobox con búsqueda, no un `<select>`.
- **`GREATEST` y no `COALESCE(last_message_at, created_at)`.** Así la respuesta de la institución también cuenta como actividad. `created_at` es `timestamp` sin zona, guardado en UTC, y la conversión explícita `AT TIME ZONE 'UTC'` hace la expresión IMMUTABLE, como exige un índice.
- **Índices de expresión** `linkage_requests_company_activity_index` y `…_institution_activity_index`, sobre `(organización, actividad DESC, id DESC)`, para paginar el orden predeterminado. La búsqueda recorre solo las solicitudes de la organización; los trigramas no se justifican aún.
- **El CSV descarga lo que muestra la tabla:** el mismo estado, búsqueda, interacción y orden.
- **Barra de la bandeja** (`LinkageInboxFilters`):
  - en escritorio, buscar, Estado, Interacción y Ordenar por en una fila, con «Limpiar filtros» si hay filtros activos y «Descargar CSV» a la derecha;
  - a 600 px o menos, el buscador queda visible y los demás controles van a una hoja con «Filtros (n)». La hoja tiene «Ver resultados» y «Limpiar filtros»;
  - vaciar el buscador (o su × nativa) quita la búsqueda de la URL sin enviarla.
- **Todo en la URL** (`useListParams`): cambiar un filtro o el orden vuelve a la página 1. El regreso desde el chat, el detalle, el perfil o la oportunidad recupera la misma vista.
- **La fila explica su posición** con una línea discreta: «Último mensaje: hoy, 10:42», «ayer…» o «12 nov».
- **Compatible con T-S13-08:** el chat junto al correo con su contador, la fila resaltada y los avisos no cambian. Al volver del chat después de escribir, la solicitud aparece arriba.

### Criterios de aceptación

- **CA-01.** Por defecto, las dos bandejas se ordenan por actividad. Un mensaje nuevo o la respuesta de la institución suben la solicitud. `created_desc` y `created_asc` ordenan por la fecha de la solicitud.
- **CA-02.** La empresa busca por la institución, la oportunidad y el titular. Pest comprueba que buscar el nombre, el apellido o la matrícula reales del alumno no encuentra la solicitud y que la respuesta no los contiene.
- **CA-03.** La institución busca por la empresa (nombre comercial o razón social), la oportunidad y el nombre o la matrícula de sus alumnos, nunca en solicitudes de otra institución.
- **CA-04.** Interacción: Todas, Con conversación y Con mensajes sin leer.
- **CA-05.** Un `sort`, una `interaction` o una `q` inválidos (más de 100 caracteres) responden `422` con su mensaje. Con más de 8 palabras únicas, solo se procesan las primeras 8.
- **CA-06.** El CSV de la institución respeta los filtros, la búsqueda y el orden.
- **CA-07.** En la barra, los controles van sincronizados con la URL y vuelven a la página 1. Aparece «Limpiar filtros» cuando hay filtros activos, y vaciar el buscador quita la búsqueda. Una URL antigua con `?unread=1` se traduce a `interaction=unread`.
- **CA-08.** A 390 px, el buscador queda visible y la hoja «Filtros (n)» contiene los selectores, «Ver resultados» y «Limpiar filtros».
- **CA-09.** La fila muestra cuándo fue el último mensaje. Sin coincidencias, un solo vacío ofrece «Limpiar filtros».

### Limitaciones

- La búsqueda es por subcadena, no aproximada: una palabra mal escrita no coincide.
- Las solicitudes no se reordenan solas mientras la bandeja está abierta: el orden se recalcula al cargarla, al cambiar un filtro o al volver de otra pantalla.

## T-S13-10 — Tablas sin columna Acciones y bandeja en vivo

**Estado:** Completada (18 de noviembre de 2026), sin commit.  
**Origen:** revisión del responsable en la simulación.
- En escritorio, la columna Acciones de la bandeja de la empresa, con cuatro pastillas apiladas, se salía de la tabla y obligaba a bajar hasta la barra de desplazamiento horizontal.
- Cuando llegaba un mensaje, el aviso del navegador aparecía, pero la tabla no cambiaba hasta recargar la página.

**Rama:** `chore/ui-polish-chat-design`.

### Decisiones

- **Sin columna Acciones.**
  - **Empresa:** el titular del perfil y el título de la oportunidad son pastillas `cell-pill` en su propia celda (`--tint`, `--accent`, flecha, dos líneas como máximo, con el texto completo en `title`). Conservan sus nombres accesibles «Ver perfil: …» y «Ver la oportunidad …».
  - **Institución:** el nombre del alumno es una pastilla a su expediente («Ver expediente de …»). La oportunidad sigue como texto, porque la institución no tiene una ruta de oportunidades y su ficha completa está en el detalle de la solicitud.
- **Detalle con una flecha.** La última columna se reduce a una flecha `row-open` de 2.25 rem, que sigue siendo el control accesible de la fila («Ver la solicitud de …»). La fila completa sigue abriendo el detalle con el puntero.
- **Cancelar bajo el estado.** «Cancelar solicitud» es una acción de texto en `--danger-text`, bajo el estado Pendiente de la institución, con la misma confirmación (HU-S5-05 CA-03). También se puede cancelar desde el detalle.
- **Bandeja en vivo, sin infraestructura nueva.**
  - `useLiveInbox` escucha la consulta única del resumen de T-S13-08, la misma que dispara los avisos. Cuando cambian las conversaciones con novedades, sus últimos mensajes o su número, vuelve a pedir la tabla con la misma vista y la reemplaza sin mostrar la carga.
  - Así el contador, la fila resaltada, el último mensaje y el orden por actividad se actualizan a la vez que llega el aviso: cada 60 s, al volver a la pestaña o al navegar.
  - La primera respuesta del resumen es la línea base, y sin novedades la tabla no se vuelve a pedir.

### Criterios de aceptación

- **CA-01.** Las dos bandejas no tienen columna Acciones. En la de la empresa, el perfil y la oportunidad son pastillas que llevan a su pantalla y regresan a la bandeja con su vista; en la de la institución, el alumno lleva a su expediente.
- **CA-02.** El detalle se abre con la fila o con la flecha de la última columna, que conserva su nombre accesible.
- **CA-03.** Una solicitud pendiente se cancela desde «Cancelar solicitud», bajo su estado, con confirmación.
- **CA-04.** Cuando llegan mensajes nuevos, la fila muestra su contador sin recargar la página ni mostrar la carga. Sin novedades, la tabla no se vuelve a pedir.

### Limitaciones

- La actualización tiene el mismo retraso que los avisos (hasta 60 s, más en una pestaña en segundo plano), porque no hay tiempo real (decisión del Sprint).

## T-S13-11 — Corrección móvil y auditoría visual de las bandejas

**Estado:** Completada (18 de noviembre de 2026), sin commit.  
**Origen:** revisión del responsable en el celular.
- La hoja «Filtros» parecía vacía.
- La página tenía una barra de desplazamiento horizontal: al deslizarla, el contenido desaparecía y quedaba una mitad en blanco.
- «Cancelar solicitud» se veía subrayado.

**Rama:** `chore/ui-polish-chat-design`.

### Causa raíz

Los textos para lectores de pantalla (`.visually-hidden`, `position: absolute`) de las columnas que quedan fuera de la vista se ubicaban respecto a la página y no respecto al contenedor desplazable de la tabla, que no estaba posicionado. Uno llegaba a `x = 1009 px` a 390 px de ancho.

El documento se ensanchaba y el navegador móvil alejaba la vista para que cupiera. Por eso aparecían la barra horizontal y la mitad en blanco, y la hoja de Filtros, que es `position: fixed`, se abría fuera de la pantalla (`top ≈ 1750 px`). La hoja sí tenía los filtros.

Se reprodujo en Chromium a 390 px con el modo móvil, con la API simulada desde Playwright.

### Decisiones

- **`position: relative` en `.institution-table-wrapper` y `.data-table-wrapper`** (`ui/ui.css`). El contenedor desplazable pasa a ser el bloque contenedor de lo posicionado dentro de la tabla. Corrige todas las tablas de la aplicación, no solo las bandejas. Verificado: `scrollWidth` igual al ancho de la ventana a 390, 820 y 1440 px, en las dos bandejas.
- **Barra de escritorio en una sola fila:**
  - las reglas de `LinkageInboxFilters` se prefijan con `.linkage-inbox-bar`, porque las genéricas de `.table-search` de `ui.css` se cargan después y las desacomodaban;
  - la etiqueta del buscador va en una línea;
  - los tres selectores van juntos y bajan juntos debajo del buscador a 900 px o menos;
  - «Descargar CSV» queda a la derecha, sin margen propio.
- **Celular:**
  - el botón «Buscar» es solo el ícono, en la misma fila que el campo, y conserva su nombre accesible;
  - «Filtros» usa un ícono de controles (`FiltersIcon`) en lugar de la lupa;
  - en la hoja, el título va en `--type-lg` y «Ver resultados» ocupa el ancho;
  - «Descargar CSV» va alineado junto a «Filtros».
- **Aviso de los avisos del navegador:** el ícono y el texto comparten la fila también en el celular, y el cierre va fijo arriba a la derecha, sin ocupar una línea suelta.
- **Cancelar solicitud:**
  - sin subrayado en ningún estado;
  - lleva el ícono ×, el tono `--danger-text` y, al pasar el puntero, la superficie `--danger-surface`, como una pastilla.
- **Pastillas de la fila:**
  - letra `--type-sm`, como las demás pastillas (`pill-link`);
  - se recalibró el ancho mínimo de las columnas para que el titular y la oportunidad muestren más texto antes de recortarse, sin desbordar la tabla a 1440 px.

### Criterios de aceptación

- **CA-01.** A 390 px, la página no tiene desplazamiento horizontal ni zona en blanco, y la hoja Filtros se abre en la pantalla con sus tres selectores.
- **CA-02.** A 1440 px, la barra de la bandeja va en una sola fila (en la institución, «Descargar CSV» a la derecha) y la tabla no se desborda.
- **CA-03.** «Cancelar solicitud» no se subraya. El aviso de los avisos del navegador no deja su cierre en una línea suelta.

## T-S13-12 — Memoria de las tablas al ir y volver

**Estado:** Completada (18 de noviembre de 2026), sin commit.  
**Origen:** pedido del responsable. Al abrir una fila o uno de sus botones y regresar, la tabla volvía al principio y no quedaba referencia de qué fila se había tocado.  
**Rama:** `chore/ui-polish-chat-design`.

### Decisiones

- **Un solo hook, `ui/useTableMemory.ts`**, en las seis tablas con filas clicables: solicitudes de la empresa y de la institución, alumnos, empresas, instituciones y oportunidades. Se conecta con `ref` al contenedor desplazable, y las filas se identifican por su `data-href`.
- **Qué recuerda:** al tocar la fila o un enlace interno de ella (detalle, perfil, oportunidad, expediente, chat), justo antes de navegar, guarda:
  - qué fila era y a qué altura de la pantalla estaba;
  - el desplazamiento vertical y el horizontal de la tabla;
  - si se usó el teclado.

  No recuerda los botones que no navegan (Cancelar, correo, teléfono) ni los clics con tecla modificadora (abrir en otra pestaña).
- **Al volver al mismo listado** (misma ruta y mismos filtros, con «Volver» o con el botón Atrás del navegador):
  - la fila reaparece a la misma altura de la pantalla, aunque la tabla haya cambiado de orden (por ejemplo, por actividad);
  - si la fila ya no está, se recupera el desplazamiento;
  - todo ocurre antes de pintar, sin saltos visibles.
- **Referencia visual:** la fila parpadea dos veces con `--tint-hover` (1.6 s). Con `prefers-reduced-motion` no hay animación: la fila conserva un tinte fijo y breve.
- **Accesibilidad:** si la fila se abrió con el teclado, el foco vuelve a su control (`.row-link`, la flecha o «Ver detalle»). Con el puntero no se mueve el foco, para no mostrar un anillo inesperado.
- **Almacenamiento:** `sessionStorage` (solo esa pestaña). Se consume una vez y caduca a los 30 min. Si no está disponible, la tabla abre como siempre.

### Criterios de aceptación

- **CA-01.** Al volver de una fila (con «Volver» o con Atrás), la tabla queda en la posición anterior y la fila tocada a la misma altura, con un parpadeo breve.
- **CA-02.** Con el teclado, el foco vuelve al control de la fila.
- **CA-03.** Otro listado, otros filtros, un botón que no navega o un clic para otra pestaña no restauran nada.
- **CA-04.** Se aplica en las seis tablas con filas clicables.

**Verificado:** en Chromium a 1440 px, con 20 filas, la fila 14 vuelve a la misma altura de la pantalla (252 px antes y después) y se resalta.

## T-S13-13 — Movimiento y estados de las tablas

**Estado:** Completada (18 de noviembre de 2026), sin commit.  
**Origen:** pedido del responsable: revisar la estética de las transiciones al buscar, filtrar, paginar y volver, y de los estados de los controles y los vacíos. En especial, que el regreso de T-S13-12 no se sienta rígido: que vuelva al principio y baje rápido y limpio hasta la fila.  
**Rama:** `chore/ui-polish-chat-design`.

### Decisiones

- **La tabla se actualiza sin desmontarse.** Al buscar, filtrar, ordenar o paginar no había ninguna señal de carga. `useApiRequest` solo marcaba la primera carga y la tabla anterior quedaba inmóvil hasta que llegaba la nueva.
  - `useApiRequest` agrega `pending`, que compara la consulta vigente con la última que terminó. No cambia nada para quien no lo usa.
  - Mientras `pending` está activo, la tabla anterior se atenúa (`.table-card.is-refreshing`, opacidad 0.55 en 150 ms) y no responde a clics.
  - Una barra fina de progreso de 2 px con `--accent` aparece arriba si la espera pasa de 150 ms. Una respuesta rápida no parpadea.
  - La región lleva `aria-busy` y un estado oculto anuncia «Actualizando resultados…».
  - El esqueleto queda solo para la primera carga.
  - **Verificado en Chromium:** con 1.5 s de espera, la tarjeta mantiene su altura (2053 px antes y durante) y no aparece el esqueleto.
- **Entrada de resultados.** El `tbody` lleva `key` con la búsqueda de la URL. Cada resultado nuevo entra con un ascenso de 6 px escalonado (`row-enter`, 320 ms con `--spring`, 30 ms por fila hasta 10). La actualización en vivo, que no cambia la URL, no vuelve a animar la tabla.
- **Actualización en vivo con señal.** Al recargar en silencio (T-S13-10), las filas cuyo contador subió pulsan una vez con el tinte (`row-updated`, 1.6 s) y su contador da un rebote. Las filas nuevas ya entran con su animación.
- **Regreso a la fila (ajuste de T-S13-12).** La vista parte del principio y `smoothScrollTo` (nuevo, en `ui/scroll.ts`) baja hasta dejar la fila a su altura anterior:
  - el movimiento dura de 280 a 600 ms según la distancia, con `easeOutCubic` y `requestAnimationFrame`;
  - cede el control si la persona desplaza, toca o usa el teclado;
  - el parpadeo empieza al llegar;
  - se descuenta la traslación de la animación de entrada para medir la posición final;
  - **verificado en Chromium:** la fila queda exactamente donde estaba (252 px antes y después) y el desplazamiento sigue la curva 0 → 38 → 772 → 1268 → 1535 → 1566 px en unos 400 ms.
- **Cambio de página.** La vista sube con la misma animación hasta el inicio de la tabla, debajo de la barra fija.
- **Barra de filtros:**
  - «Limpiar filtros» va en la línea de la etiqueta del buscador, así que aparecer o desaparecer no cambia la altura de la barra; entra con `chip-in`;
  - el número de «Filtros (n)» rebota al cambiar;
  - «Buscar» y «Ver resultados» muestran un spinner del mismo tamaño que el ícono mientras llega el resultado.
- **Vacío con búsqueda:** nombra lo buscado con el resaltado de marca (`notice-subject`) y aclara si además hay filtros. Ofrece «Limpiar filtros».
- **Movimiento reducido:** el regreso salta directo, las filas no se animan, el pulso pasa a un tinte fijo y la barra de progreso queda estática.
- **Corrección encontrada por el E2E: dos cambios seguidos de la URL ya no se pisan.** Al buscar y elegir un filtro enseguida, a menos de 50 ms, la búsqueda se perdía. React Router aplica la navegación como transición, y `useListParams.update` partía de los parámetros de la última vista pintada. Ahora parte del último valor que escribió. Hay una prueba en `ui/useListParams.test.tsx` y se verificó en Chromium.
- **Alcance:**
  - **Las dos bandejas:** todo lo anterior.
  - **Alumnos, empresas, instituciones y oportunidades:** la plantilla compartida (recarga atenuada, entrada de filas, regreso animado y subida al cambiar de página). No tienen consulta en vivo.

### Criterios de aceptación

- **CA-01.** Buscar, filtrar, ordenar o paginar no desmonta la tabla. El resultado anterior se atenúa, con barra de progreso si la espera pasa de 150 ms, y el nuevo entra con su animación.
- **CA-02.** Al volver de una fila, la vista baja animada desde el principio hasta dejar la fila donde estaba y luego la hace parpadear. Con movimiento reducido salta directo, y si la persona desplaza mientras baja, la animación le cede el control.
- **CA-03.** En la actualización en vivo, la fila cuyo contador subió pulsa una vez.
- **CA-04.** Al cambiar de página, la vista sube al inicio de la tabla.
- **CA-05.** «Limpiar filtros» no desplaza la barra. «Buscar» indica la espera. El vacío con búsqueda nombra lo buscado.

## T-S13-14 — Detalle de la solicitud sin duplicados

**Estado:** Completada (18 de noviembre de 2026), sin commit.  
**Origen:** revisión del responsable. Al abrir el detalle desde la bandeja, la navegación mostraba «‹ Volver a solicitudes» y «Solicitudes de vinculación», que llevan al mismo lugar. Además, el detalle repetía como texto estático los mensajes que la conversación ya muestra.  
**Rama:** `chore/ui-polish-chat-design`.

### Decisiones

- **Un solo camino a la bandeja.** Si el regreso contextual ya lleva a la bandeja (con o sin filtros), la navegación del detalle no muestra «Solicitudes de vinculación». Aplica en la empresa (`LinkageRequestDetailPage`) y en la institución (`InstitutionLinkageLayout`).
  - Sin regreso contextual, por ejemplo al entrar directo, el enlace sigue con su contador de no leídos.
  - Si se llega desde la conversación, el enlace también sigue, porque el regreso lleva al chat y no a la bandeja.
- **Sin mensajes estáticos en los detalles.** Se quitan, porque la conversación los muestra como primeras burbujas (HU-S13-06):
  - empresa: «Mensaje de tu empresa» y «Mensaje de la institución»;
  - institución: «Mensaje de la empresa» y el «Mensaje para la empresa» del resumen de la respuesta.

  Se conservan las fechas de envío y respuesta, y quién respondió. «Abrir conversación» sigue siendo el acceso a esos mensajes, incluso con la solicitud pendiente, cuando el chat muestra solo el mensaje de la empresa.

### Criterios de aceptación

- **CA-01.** El detalle abierto desde la bandeja no repite el enlace «Solicitudes de vinculación», en los dos lados.
- **CA-02.** Los detalles de los dos lados no muestran el texto del mensaje de la solicitud ni el de la respuesta; se leen en la conversación.

## T-S13-15 — Barra lateral momentánea, navegación del detalle y botones táctiles

**Estado:** Completada (18 de noviembre de 2026), sin commit.  
**Origen:** revisión del responsable.
- Al filtrar o recargar, aparecía una barra lateral en la tabla que luego se escondía.
- «Buscar talento» no tiene sentido en el detalle de una solicitud.
- En el celular, los botones de mensaje y correo de la fila eran demasiado pequeños para tocarlos con comodidad.

**Rama:** `chore/ui-polish-chat-design`.

### Decisiones

- **Causa de la barra:** el contenedor de la tabla tenía `overflow-x: auto` y, por regla de CSS, el eje vertical también pasaba a `auto`. El ascenso de 6 px de las filas al entrar (`row-enter`, T-S13-13) lo desbordaba durante la animación y aparecía una barra vertical. Medido en Chromium: 6 px de desborde durante unos 300 ms.
  - **Corrección:** `overflow-y: hidden` en `.institution-table-wrapper` y `.data-table-wrapper`. La tabla solo se desplaza en horizontal y la animación se conserva.
- **Detalle de la solicitud (empresa):** se quita «Buscar talento» de su navegación. Sigue en la bandeja y en el menú.
- **Botones táctiles de la fila:** con `pointer: coarse` o a 600 px o menos:
  - las vías de contacto (chat, correo y teléfono) miden 44 px, la medida mínima recomendada para un dedo;
  - llevan fondo `--tint` y radio de 0.85 rem, para que se lean como botones;
  - los íconos miden 1.25 rem y hay 0.5 rem entre botones, para no tocar el vecino;
  - el chat con mensajes sin leer conserva su relleno de acento y su contador;
  - la flecha del detalle también mide 44 px;
  - en escritorio no cambia nada.

### Criterios de aceptación

- **CA-01.** Al filtrar, buscar o recargar, la tabla no muestra una barra de desplazamiento vertical momentánea.
- **CA-02.** El detalle de la solicitud de la empresa no ofrece «Buscar talento».
- **CA-03.** En pantallas táctiles, los botones de chat, correo, teléfono y detalle de la fila miden al menos 44 px, con fondo visible y separación entre ellos.

## T-S13-16 a T-S13-19 — Afinaciones finales (auditoría general)

**Estado:** Completadas (18 de noviembre de 2026), sin commit.  
**Origen:** el responsable pidió llevar a toda la aplicación los principios aplicados en las bandejas, como últimas afinaciones:
- sin columna Acciones cuando solo sirve para ver el detalle;
- persistencia al ir y volver;
- sin navegación repetida;
- revisar y completar movimiento, estados, tamaños y posiciones.

Se registran como tareas técnicas del Sprint 13, no como un Sprint nuevo: son ajustes de presentación transversales, sin historias ni backend.  
**Rama:** `chore/s13-final-polish`.

### T-S13-16 — Tablas con la flecha en lugar de «Acciones»

- **Dónde:** instituciones, empresas, alumnos y oportunidades. Su columna «Acciones» solo tenía «Ver detalle».
- **Cómo queda:** la columna pasa a ser la flecha `.row-open` de T-S13-10:
  - encabezado visualmente oculto «Detalle»;
  - 2.25 rem en escritorio y 44 px en pantallas táctiles;
  - conserva el nombre accesible «Ver detalle de …».
- **La fila completa** sigue abriendo el detalle.
- **`.row-open` se mueve a `ui/ui.css`**, para que todas las tablas la compartan.
- **Las tablas de cuentas** (Secretaría y empresa) conservan su columna, porque tienen acciones reales: reenviar el enlace e inactivar.

### T-S13-17 — Navegación sin duplicados

- **Un solo regreso, arriba.** Los layouts de instituciones, empresas, oportunidades y la bandeja de la institución reciben `back` y muestran solo `NavBackLink`:
  - los listados, «‹ Inicio»;
  - el detalle, «‹ Volver a {sección}», con el regreso contextual si lo hay;
  - la edición, «‹ Volver a la institución» (la empresa o la oportunidad);
  - el alta, «‹ Volver a {sección}».
- **Lo que se quita:**
  - el enlace de cada sección a sí misma;
  - el segundo regreso al final de diez pantallas (`.institution-back`);
  - en el detalle de la solicitud de la empresa, «Solicitudes de vinculación». El regreso único lleva a la bandeja o, si se llegó desde ella, a la conversación.
- **Bandejas sin enlaces a otras secciones:** se quitan «Buscar talento» (empresa) y «Alumnos» (institución), que ya están en el inicio y el menú. «Buscar talento» sigue como acción del vacío de la bandeja de la empresa, donde sí es el siguiente paso.

### T-S13-18 — Movimiento y estados donde faltaban

- **Plantilla de tabla de T-S13-12/13** en la bitácora, las cuentas de la Secretaría y las cuentas de la empresa:
  - recarga atenuada con barra de progreso y `aria-busy`;
  - entrada escalonada de las filas;
  - subida al inicio de la tabla al cambiar de página.
- **Botones con espera:** siete botones solo cambiaban el texto mientras esperaban (Inactivar, Activar o Reactivar, Aceptar solicitud y Cerrar sesión). Ahora usan `PendingLabel`, con su spinner, como los formularios.
- **Detalles que entran suave:** el contenido cargado de los detalles (institución, empresa, oportunidad, alumno, perfil de talento y las dos solicitudes) entra con `content-enter` (opacidad, 4 px, 280 ms con `--spring`) en lugar de reemplazar el esqueleto de golpe. Con movimiento reducido no hay animación.

### T-S13-19 — Auditoría visual

- **Cómo se revisó:** con Chromium a 1440 y a 390 px, y la API simulada. Pantallas: instituciones (listado, detalle y edición), empresas (listado y detalle), alumnos, oportunidades (listado y detalle) y bitácora.
- **Resultado en las 18 vistas:**
  - ningún desbordamiento horizontal (`scrollWidth` igual al ancho de la ventana);
  - un solo regreso arriba y ninguno al final;
  - ningún control de menos de 32 px en el contenido.
- **Corrección: buscadores del celular** (`.table-search`, `ui/ui.css`). Cada control ocupaba su fila y «Buscar» una fila entera; en Alumnos, la barra empujaba la tabla unos 300 px. Ahora:
  - el campo y «Buscar», solo con el ícono y de 44 px pero con el mismo nombre accesible, comparten la primera fila;
  - los filtros van de dos en dos debajo, ocupando el ancho;
  - sin campo de búsqueda (como en la bitácora), el filtro ocupa todo el ancho.
  
  En Alumnos, la barra pasa de unos 300 px a unos 150 px.

### Criterios de aceptación

- **CA-01.** Ninguna tabla tiene una columna «Acciones» que solo sirva para ver el detalle; la flecha conserva su nombre accesible.
- **CA-02.** Cada pantalla tiene un solo regreso, arriba, y ningún enlace a sí misma ni a secciones ajenas a su tarea.
- **CA-03.** La bitácora y las tablas de cuentas recargan sin saltos y animan sus filas; los botones de estado muestran su spinner; los detalles entran suave.
- **CA-04.** A 390 px, los buscadores no ocupan una fila por control y ninguna vista auditada se desborda.

