# Propuesta: Mensajería de Vinculación (candidata a Sprint 13)

**Estado:** histórico. Aprobada con decisiones el 17 de noviembre de 2026; la fuente de verdad es `docs/sprint-13.md`. No autoriza desarrollo: solo podrá implementarse lo que se
copie al archivo del Sprint vigente.
**Fecha:** 17 de noviembre de 2026

## Objetivo

Crear un canal de comunicación interno entre la Empresa y la Institución, atado a una solicitud de vinculación
aceptada, para que la coordinación posterior al «match» ocurra dentro de la plataforma.

## 0. Hallazgos del código que cambian el planteamiento

1. **La empresa nunca ve la identidad del alumno, ni siquiera cuando la solicitud se acepta.**
   `LinkageRequestController::item()` solo le entrega el perfil anónimo (`public_id`, titular, programa, periodo) y
   el contacto del responsable de la institución. La identidad es justamente lo que el chat pondría en riesgo: bastaría
   con que alguien de la institución escribiera el nombre, la CURP o el teléfono del alumno. Esto pesa más en el diseño
   que la parte técnica.
2. **ACEPTADA es un estado final.** La empresa solo puede cancelar mientras la solicitud está pendiente
   (`LinkageRequestStatus`). «Cancelar después de aceptada» no existe hoy. Habría que crear un estado nuevo, y eso es
   una decisión de producto aparte (ver §4).
3. **La empresa no tiene una pantalla de detalle de la solicitud.** Solo existe la bandeja `/linkage-requests`.
   `OpportunityDetailPage` no sirve como lugar para el chat: una oportunidad tiene muchas solicitudes. La institución
   sí tiene `InstitutionLinkageRequestDetailPage`.
4. **Ya existe todo lo necesario para un esquema asíncrono:** cola `database`, el servicio `worker`, correo (Mailpit
   en local), consultas periódicas en `InstitutionVideosPage` y límites de envío por ruta (`throttle:linkage-requests`).

## 1. Producto (UX/UI)

### Dónde vive la conversación

No la pondría en una pestaña. La aplicación organiza los detalles en secciones apiladas y usa `Sheet` para
formularios secundarios.

- **Institución:** una sección «Conversación con la empresa» en `InstitutionLinkageRequestDetailPage`, debajo de la
  decisión. Solo aparece si la solicitud está aceptada.
- **Empresa:** una pantalla nueva `/linkage-requests/:id` con el resumen de la solicitud, el contacto de la
  institución y la misma sección de conversación. En la bandeja, la fila se vuelve clicable con el mismo patrón de
  T-S12-04. Es la pieza más grande del alcance, pero sin ella la empresa no tiene dónde conversar.
- La conversación usa un solo componente para ambos lados: mensajes cronológicos, el propio alineado distinto al
  ajeno, y un campo de texto con contador. Sin archivos adjuntos en el MVP, porque un CV adjunto filtraría identidad.
- Arriba del campo de texto, un `Callout` fijo: *«La empresa conoce al alumno solo por su perfil. No compartas datos
  personales del alumno por este medio.»* Es la única protección viable: un filtro automático de datos personales
  daría falsos positivos y una falsa sensación de seguridad.

### Cómo avisamos de mensajes nuevos

1. **Badge en el menú** («Solicitudes · 3»), con el número de *conversaciones* que tienen mensajes sin leer, no de
   mensajes.
2. **Un punto o etiqueta «Nuevo» en la fila** de cada bandeja, y la opción de ordenar o filtrar por «con mensajes sin
   leer».
3. **Aviso por correo agrupado** cuando el destinatario no está en la plataforma, como máximo uno por conversación
   cada N horas y solo si sigue sin leer. Esto es lo que de verdad hace volver a los usuarios. Sin correo, el badge
   solo lo ve quien ya entró.

## 2. Arquitectura: tiempo real o asíncrono

| | Reverb / WebSockets | REST + consulta periódica |
|---|---|---|
| Infraestructura | Otro proceso permanente, WebSocket con TLS en el proxy y conexiones de larga duración. Para escalar en horizontal, Reverb usa **Redis**, que CLAUDE.md descarta para el MVP. | Ninguna nueva: misma API, misma base de datos, mismo worker. |
| Complejidad | Autorización de canales privados, Echo en el frontend, reconexión, pruebas más difíciles en Pest y Playwright. | Endpoints como los que ya existen, probados con los patrones actuales. |
| Beneficio real | Latencia menor a un segundo. | Latencia de unos 10–20 s con la conversación abierta. |
| Fit con el uso | Coordinación B2B: pocos mensajes, separados por minutos u horas. Se parece más al correo que a WhatsApp. | Encaja. |

**Recomendación: asíncrono.**

- Con la conversación abierta y la pestaña visible, se consulta cada ~15 s con `GET …/messages?after=<último id>`.
  La consulta se pausa con `document.hidden`. Casi siempre responde vacía y usa un índice, así que el costo en
  PostgreSQL es despreciable.
- El badge se actualiza al navegar, al volver a la pestaña y cada ~60 s.
- El correo sale por la cola existente.
- La API queda lista para tiempo real: si algún día se justifica Reverb, solo se agrega una capa que avisa «hay
  mensajes nuevos» y el cliente reutiliza el mismo `after=`. No se reescribe nada.

## 3. Modelo de datos

```
linkage_messages
  id                  bigserial PK
  linkage_request_id  bigint NOT NULL FK linkage_requests ON DELETE RESTRICT
  sender_party        varchar(20) NOT NULL CHECK (sender_party IN ('COMPANY','INSTITUTION'))
  sender_user_id      bigint NOT NULL FK users ON DELETE RESTRICT
  body                varchar(2000) NOT NULL CHECK (length(btrim(body)) > 0)
  created_at          timestamptz NOT NULL
  INDEX (linkage_request_id, id)

linkage_requests  (columnas nuevas)
  last_message_at                   timestamptz NULL
  company_last_read_message_id      bigint NULL
  institution_last_read_message_id  bigint NULL
```

Diferencias con la propuesta original (`sender_type`, `sender_id`, `body`, `read_at`):

- **Sin `sender_type`/`sender_id` polimórfico.** Siempre escribe una cuenta (`users`). El lado (`sender_party`) lo
  fija el servidor según el rol de la sesión, nunca el cliente, y queda protegido con un CHECK, como `status`. Así
  cumplimos «toda acción registra quién la hizo» sin relaciones polimórficas.
- **Sin `read_at` por mensaje.** Una institución o empresa tiene **varias cuentas**: un `read_at` único no dice quién
  leyó, y uno por cuenta multiplica las filas. Propongo un **marcador de lectura por lado**: si cualquier cuenta de la
  institución abrió la conversación, queda leída para la institución, como una bandeja compartida. Los no leídos se
  calculan así: `id > marcador_propio AND sender_party <> mi_lado`. Son dos columnas y no hace falta otra tabla.
- **Los mensajes no se editan ni se borran.** No hay `updated_at` ni ruta `DELETE`, lo cual es coherente con la
  convención del proyecto. La conversación es el registro de lo acordado.

**Privacidad:** `sender_user_id` no sale hacia el otro lado, igual que hoy se oculta `responded_by` a la empresa. El
otro lado ve «Universidad X» o «Empresa Y»; tu propio lado ve el nombre de la cuenta.

### API (lista explícita de campos, regla anti-IDOR con 404)

- Empresa: `GET|POST /linkage-requests/{id}/messages`, `POST /linkage-requests/{id}/messages/read`.
- Institución: las mismas bajo `/institution/linkage-requests/{id}/…`.
- `unread_count` en los elementos de ambas bandejas y un `GET …/unread-summary` ligero para el badge.
- Marcar como leído es un `POST` explícito con el último id visto, no un efecto secundario del `GET`.
- Límite de envío propio (`throttle:linkage-messages`), texto plano y React escapa al mostrar.
- Respuestas con `Cache-Control: no-store, private`, como el resto de las autenticadas.

## 4. Reglas de negocio

- **Solo cuando la solicitud está ACEPTADA.** En PENDIENTE, abrir el chat convertiría la decisión en una negociación
  y presionaría a la institución. Además, el mensaje de la solicitud y la nota de respuesta ya cubren esa etapa. En
  RECHAZADA y CANCELADA la conversación nunca existe. Escribir en cualquier otro estado responde 422 (o 409, a
  decidir).
- **Solo lectura, conservando el historial**, cuando la empresa o la institución están inactivas. No escribirle a
  alguien que ya no puede entrar a la plataforma.
- **No se cierra al dar de baja la oportunidad.** Muchas veces se da de baja porque ya se cubrió la vacante, y justo
  entonces sigue la coordinación.
- **Cancelar o concluir una vinculación ya aceptada** no existe hoy. Si lo quieren, es una historia aparte con un
  estado nuevo (por ejemplo `CONCLUIDA`), y al entrar en él la conversación pasaría a solo lectura. No la mezclaría
  con el Sprint 13.
- **Solo B2B:** el alumno no participa. **La Secretaría y el administrador no leen el contenido**, porque «la
  Secretaría no administra expedientes» y el administrador «no sustituye a los actores». A lo sumo, más adelante, un
  indicador agregado (vinculaciones con conversación activa), sin contenido.

## 5. Alcance sugerido para el Sprint 13

| Historia | Contenido | Tamaño |
|---|---|---|
| HU-S13-01 | Tabla, reglas de estado, endpoints de ambos lados, aislamiento y límite de envío (Pest) | M |
| HU-S13-02 | Detalle de la solicitud para la empresa (`/linkage-requests/:id`) y fila clicable | M |
| HU-S13-03 | Componente de conversación en ambos detalles, consulta cada 15 s y aviso de privacidad | M |
| HU-S13-04 | No leídos: marcadores, badge en el menú y punto en las bandejas | S–M |
| HU-S13-05 | Aviso agrupado por correo vía cola (opcional, recortable) | S |

Pruebas mínimas: aislamiento (una conversación ajena responde 404), bloqueo por estado, campos explícitos sin
`sender_user_id` hacia el otro lado, límite de envío, conteo de no leídos (Pest); componente de conversación y badge
(Vitest); un flujo completo empresa ↔ institución (Playwright).

## 6. Recomendación

Abrir el Sprint 13 en la versión asíncrona: **no agrega ningún componente al despliegue en la nube**, así que no
retrasa ni complica la fase de infraestructura. Lo único que comparte con ella es el SMTP en producción, que ya hace
falta para los enlaces de contraseña.

Salvedades:

- La empresa ya ve el correo y el teléfono del responsable de la institución, así que la retención no está
  garantizada. El chat solo compite si es más cómodo que el correo, y eso depende sobre todo de HU-S13-04 y HU-S13-05.
- Si se prefiere validar antes con usuarios reales, desplegar primero también es razonable: el diseño no cambia por
  hacerlo después.

## 7. Decisiones pendientes del responsable y el Arquitecto

1. ¿Marcador de lectura por lado (recomendado) o por cuenta?
2. ¿El otro lado ve el nombre de la cuenta que escribió o solo el de la organización?
3. ¿Entra el aviso por correo (HU-S13-05) o se recorta?
4. ¿El estado «concluir vinculación» entra como historia aparte o se queda fuera por ahora?
5. ¿Escribir en una solicitud que no está aceptada responde 422 o 409?
