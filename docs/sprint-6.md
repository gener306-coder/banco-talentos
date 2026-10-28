# Sprint 6 — Bandeja Institucional, Respuesta de Vinculación y Cierre de Cuentas

Sprint vigente desde el 28 de octubre de 2026. Sprint anterior: [sprint-5.md](sprint-5.md) (histórico).

**Objetivo del Sprint:** cerrar el flujo principal de Educación Dual de punta a punta permitiendo que las instituciones educativas consulten las solicitudes de vinculación enviadas por las empresas, identifiquen internamente al alumno solicitado junto con el estado de su Seguro Facultativo (IMSS), y acepten o rechacen la solicitud para coordinar el proceso fuera de la plataforma. Además, actualizar los indicadores operativos del inicio y completar la inactivación y el restablecimiento de contraseña para cuentas de Secretaría y de Empresa.

**Story Points:** 22 (HU-S6-01 a HU-S6-04).

## Fuera de alcance

- Revelar a la empresa datos protegidos del alumno (`student_identities`, NSS, comprobante IMSS, enlaces externos o credenciales de certificaciones), incluso cuando la solicitud pasa a `ACEPTADA`. La coordinación posterior ocurre fuera de la plataforma entre el contacto de la institución y el contacto del programa dual de la empresa.
- Mensajería o chat interno posterior a la decisión institucional.

## Orden de implementación sugerido

1. **HU-S6-01** Bandeja institucional de solicitudes recibidas con cruce de identidad e IMSS.
2. **HU-S6-02** Respuesta institucional (`ACEPTADA` / `RECHAZADA`) y actualización en la bandeja empresarial.
3. **HU-S6-03** Indicadores de oportunidades y solicitudes de vinculación en el inicio por rol.
4. **HU-S6-04** Inactivación y restablecimiento de contraseña para cuentas `SECRETARY` y `COMPANY`.

---

## HU-S6-01 — Bandeja institucional de solicitudes de vinculación e identificación del alumno

**Estado:** Pendiente  
**Diseño técnico y verificación:** `docs/HU-S6-01.md`  
**Story Points:** 8  
**Rol:** `INSTITUTION`

### Historia de usuario

**COMO** usuario de una Institución Educativa activa  
**QUIERO** consultar las solicitudes de vinculación enviadas por las empresas para los alumnos de mi institución, viendo su identidad real, el estado de su Seguro Facultativo y los datos de la empresa y oportunidad  
**PARA** evaluar internamente cada solicitud con el expediente completo del alumno antes de dar una respuesta.

### Criterios de aceptación

- **CA-01.** Solo cuentas `INSTITUTION` con institución activa vinculada (`auth:sanctum`, `active`, `role:INSTITUTION`, `institution.member`) acceden a `GET /api/institution/linkage-requests` y `GET /api/institution/linkage-requests/{id}`, así como a las vistas `/institution/linkage-requests` y `/institution/linkage-requests/:id`. Los demás roles reciben `403`.
- **CA-02.** [Aislamiento Anti-IDOR] El listado y el detalle filtran siempre por `linkage_requests.institution_id` de la sesión. Una solicitud dirigida a otra institución o inexistente responde `404` «La solicitud no existe.».
- **CA-03.** El listado está paginado de 20 en 20, ordenado de la más reciente a la más antigua (`created_at DESC, id DESC`), y permite filtrar opcionalmente por `status` (`PENDIENTE_INSTITUCION`, `ACEPTADA`, `RECHAZADA`, `CANCELADA`).
- **CA-04.** [Cruce interno de identidad] Cada elemento del listado incluye: `id`, `status`, `created_at`, resumen de la empresa (`name` comercial o razón social, `municipality`), resumen de la oportunidad (`title`, `program`, `vacancies`), e **identidad interna del alumno** (`student_id`, `enrollment_number`, `given_names`, `first_surname`, `second_surname`, `is_active`, `program`, `period_type`, `period_number`).
- **CA-05.** [Detalle completo para evaluación] El detalle `GET /api/institution/linkage-requests/{id}` incluye además:
  - mensaje enviado por la empresa (`message`);
  - datos completos de la empresa y de su contacto del programa dual (`legal_name`, `trade_name`, `sector_code`, `state_code`, `municipality`, `contact_name`, `contact_email`, `contact_phone`);
  - datos completos de la oportunidad (`title`, `program`, `period_type`, `period_number`, `vacancies`, `can_relocate`, `state_code`, `municipality`, `description`, `skills`, `language_code`, `min_level`, `is_active`);
  - **indicador interno del Seguro Facultativo (IMSS)** del alumno: `social_security: { has_nss: boolean, has_document: boolean }` (sin exponer el NSS en texto ni la ruta del PDF, los cuales se consultan en la ficha del alumno `/students/:id`).
- **CA-06.** La interfaz ofrece **Solicitudes de vinculación** desde el inicio de `INSTITUTION`, muestra en el detalle un aviso si al alumno le falta capturar su NSS o comprobante del IMSS (con enlace a `/students/:id`), y presenta los datos de contacto de la empresa (`mailto:` y teléfono) para la coordinación externa.

---

## HU-S6-02 — Respuesta institucional (`ACEPTADA` / `RECHAZADA`) a solicitudes de vinculación

**Estado:** Pendiente  
**Diseño técnico y verificación:** `docs/HU-S6-02.md`  
**Story Points:** 5  
**Rol:** `INSTITUTION`, `COMPANY`  
**Dependencia:** HU-S6-01

### Historia de usuario

**COMO** usuario de una Institución Educativa activa  
**QUIERO** aceptar o rechazar una solicitud de vinculación pendiente con una nota opcional de respuesta  
**PARA** informar a la empresa la decisión de la institución y dar paso a la coordinación del proceso de Educación Dual.

### Criterios de aceptación

- **CA-01.** La ruta `PATCH /api/institution/linkage-requests/{id}/decision` (protegida para `INSTITUTION` con `institution.member`) acepta `status` (`ACEPTADA` o `RECHAZADA`) y `response_message` opcional de hasta 500 caracteres (validado con `NoContactInformation` para no incluir enlaces ni teléfonos no institucionales en el campo libre). Cualquier otro estado o campo responde `422`.
- **CA-02.** [Concurrencia y elegibilidad] Dentro de una transacción con bloqueo de fila (`FOR UPDATE`), el servidor verifica que la solicitud pertenezca a la institución de la sesión (`404` si es ajena o no existe) y que su estado actual sea `PENDIENTE_INSTITUCION`. Si ya fue `ACEPTADA`, `RECHAZADA` o `CANCELADA` por la empresa, responde `422` en `status` («Solo puedes responder solicitudes pendientes.») sin modificar nada.
- **CA-03.** [Auditoría de respuesta] Al guardar la decisión se registran `responded_by` (FK a `users`, cuenta `INSTITUTION` que respondió) y `responded_at` (`timestamptz`).
- **CA-04.** [Visibilidad para la empresa sin exponer datos del alumno] En `GET /api/linkage-requests` (bandeja de `COMPANY`, HU-S5-05) se añaden `responded_at` y `response_message` a cada elemento, sin exponer `responded_by` (identidad del personal institucional) ni ningún dato protegido del alumno.
- **CA-05.** En el detalle `/institution/linkage-requests/:id`, mientras la solicitud está `PENDIENTE_INSTITUCION`, la institución dispone de la sección **Responder solicitud** para elegir **Aceptar solicitud** o **Rechazar solicitud**, escribir un mensaje opcional y confirmar la decisión mediante `ConfirmDialog`. Una vez respondida o cancelada, muestra el estado final, la fecha de respuesta, quién respondió (solo visible para la institución) y el mensaje registrado.

---

## HU-S6-03 — Indicadores de vinculación en el inicio por rol

**Estado:** Pendiente  
**Diseño técnico y verificación:** `docs/HU-S6-03.md`  
**Story Points:** 3  
**Rol:** `ADMIN`, `SECRETARY`, `INSTITUTION`, `COMPANY`  
**Dependencias:** HU-S5-01, HU-S6-02

### Historia de usuario

**COMO** usuario autenticado del sistema  
**QUIERO** ver en mi página de inicio el estado de las oportunidades y solicitudes de vinculación que me corresponden  
**PARA** identificar de inmediato si tengo solicitudes pendientes de atender o el avance general del programa dual.

### Criterios de aceptación

- **CA-01.** `GET /api/dashboard` amplía sus métricas por rol conservando el aislamiento estricto de HU-S5-01:
  - `INSTITUTION`: añade `pending_linkage_requests` (solicitudes de su institución en `PENDIENTE_INSTITUCION`).
  - `COMPANY`: añade `active_opportunities` (oportunidades activas de su empresa) y `pending_linkage_requests` (solicitudes de su empresa en `PENDIENTE_INSTITUCION`).
  - `SECRETARY` y `ADMIN`: añaden `active_opportunities` (de empresas activas) y `accepted_linkage_requests` (total de vinculaciones `ACEPTADA` en el sistema).
- **CA-02.** En la interfaz de inicio (`/`), cada rol visualiza sus nuevos contadores y, para `INSTITUTION`, cuando `pending_linkage_requests > 0`, se muestra un aviso destacado con enlace directo a `/institution/linkage-requests`.

---

## HU-S6-04 — Inactivación y restablecimiento de contraseña para cuentas `SECRETARY` y `COMPANY`

**Estado:** Pendiente  
**Diseño técnico y verificación:** `docs/HU-S6-04.md`  
**Story Points:** 6  
**Rol:** `ADMIN`, `SECRETARY`  
**Dependencias:** HU-S1-04, HU-S4-01, HU-S4-03

### Historia de usuario

**COMO** Administrador o usuario de la Secretaría de Economía  
**QUIERO** activar o inactivar cuentas individuales de la Secretaría y de las empresas, así como iniciar su restablecimiento seguro de contraseña por correo  
**PARA** revocar el acceso de personal que cause baja o ayudarles a recuperar su cuenta sin conocer ni escribir su contraseña.

### Criterios de aceptación

- **CA-01.** [Estado de cuentas `SECRETARY`] `ADMIN` y `SECRETARY` pueden cambiar el estado (`PATCH /api/secretary-accounts/{id}/status` con `{is_active: true | false}`) de una cuenta `SECRETARY` que ya haya configurado su contraseña. No se permite desactivar la propia cuenta de la sesión (`422` «No puedes inactivar tu propia cuenta.»). Una cuenta desactivada pierde su sesión abierta en la siguiente petición (`401`) y no puede iniciar sesión.
- **CA-02.** [Restablecimiento de cuentas `SECRETARY`] `ADMIN` y `SECRETARY` pueden iniciar el restablecimiento por correo (`POST /api/secretary-accounts/password-reset/start` con `{email}`) para una cuenta `SECRETARY` activa con contraseña ya establecida, reutilizando las reglas de seguridad de HU-S1-04 (enlace de un solo uso de 60 minutos por correo, intervalo mínimo de 60 segundos, cierre de sesiones abiertas al cambiar la contraseña en `/reset-password`).
- **CA-03.** [Estado y restablecimiento de cuentas `COMPANY`] Desde una empresa activa, `SECRETARY` puede activar o inactivar una cuenta `COMPANY` de esa empresa (`PATCH /api/companies/{id}/accounts/{accountId}/status` con `{is_active: true | false}`) e iniciar su restablecimiento de contraseña por correo (`POST /api/companies/{id}/accounts/password-reset/start` con `{email}`). Si la cuenta no pertenece a esa empresa responde `404`.
- **CA-04.** En `/secretary-accounts` y en el detalle de empresa (`/companies/:id`), la interfaz ofrece las acciones de **Inactivar / Activar** (con `ConfirmDialog` al inactivar) y **Restablecer contraseña**, respetando los tokens semánticos de la identidad visual.