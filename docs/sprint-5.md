# Sprint 5 — Oportunidades de Educación Dual, Inicio Operativo y Solicitud Directa

Sprint vigente desde el 27 de octubre de 2026. Sprint anterior: [sprint-4.md](sprint-4.md) (histórico).

**Objetivo del Sprint:** completar los indicadores y avisos operativos del inicio por rol, permitir que las empresas publiquen y administren sus Oportunidades de Educación Dual, y habilitar el envío de solicitudes de vinculación directas desde la empresa hacia la institución educativa sobre perfiles anónimos (`public_id`), sin intermediación de la Secretaría de Economía y conservando en todo momento el anonimato del alumno frente a la empresa.

**Story Points:** 24 (HU-S5-01 a HU-S5-05), más una tarea técnica transversal de pruebas E2E.

## Fuera de alcance

Por decisión del responsable del proyecto (27 de octubre de 2026), este Sprint **no** incluye:

- Mediación o canalización por parte de la Secretaría de Economía en las solicitudes de vinculación (el contacto de interés es directo Empresa → Institución).
- Revelación de datos protegidos del alumno (`student_identities`, NSS/IMSS, enlaces externos o credenciales de certificaciones) a la empresa, ni siquiera al enviar una solicitud.
- Bandeja de recepción y respuesta (`ACEPTADA` / `RECHAZADA`) por parte de la institución educativa (pertenece al Sprint 6).
- Chat, mensajería interna o gestión de convenios posteriores: una vez que exista interés y respuesta institucional, la coordinación posterior ocurre fuera de la plataforma mediante los contactos registrados de la empresa y de la institución.

## Orden de implementación sugerido

1. **T-S5-01** Sesiones E2E reutilizables para `SECRETARY` y `COMPANY`.
2. **HU-S5-01** Indicadores y avisos operativos en el inicio por rol.
3. **HU-S5-02** Registro y gestión de Oportunidades de Educación Dual.
4. **HU-S5-03** Activación e inactivación de Oportunidades Duales (Baja lógica).
5. **HU-S5-04** Solicitud de vinculación directa a la institución desde el perfil anónimo.
6. **HU-S5-05** Bandeja empresarial de solicitudes de vinculación enviadas.

---

## T-S5-01 — Sesiones E2E reutilizables para Secretaría y Empresa

**Tipo:** Tarea técnica transversal (sin Story Points de Jira)  
**Origen:** prevención de bloqueo `429 Too Many Requests` en la suite Playwright.

El login aplica un límite de 5 intentos por minuto por correo. Igual que ya existen `e2e/admin.setup.ts` y `e2e/institution.setup.ts`, preparar `e2e/secretary.setup.ts` y `e2e/company.setup.ts` (o reutilizar contextos equivalentes en `playwright/.auth/`) para que los escenarios de empresas, buscador y oportunidades reutilicen la sesión sin agotar el límite de intentos de login.

---

## HU-S5-01 — Indicadores y avisos operativos en el inicio por rol

**Estado:** Completada (27 de octubre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S5-01.md`  
**Story Points:** 3  
**Rol:** `ADMIN`, `SECRETARY`, `INSTITUTION`, `COMPANY`

### Historia de usuario

**COMO** usuario autenticado del sistema  
**QUIERO** ver en mi página de inicio contadores actualizados de los recursos a mi cargo y avisos de acciones pendientes  
**PARA** conocer de un vistazo el estado operativo de mi organización al entrar al Banco de Talentos.

### Criterios de aceptación

- **CA-01.** El endpoint `GET /api/dashboard` requiere sesión activa (`auth:sanctum`, `active`) y devuelve únicamente los indicadores que corresponden al rol y organización de la cuenta autenticada, con `Cache-Control: no-store, private`.
- **CA-02.** Para `ADMIN` devuelve: total de instituciones activas, total de instituciones inactivas y total de cuentas `SECRETARY` activas o pendientes.
- **CA-03.** Para `SECRETARY` devuelve: total de empresas activas, total de empresas inactivas y total de cuentas `SECRETARY` pendientes de configurar su primera contraseña.
- **CA-04.** Para `INSTITUTION` (con institución activa vinculada) devuelve: total de alumnos propios activos, total de alumnos propios con expediente público completo (visibles en el buscador) y total de alumnos propios con «Municipio por confirmar» (`pending_municipality` / `legacy_municipality` sin `municipality_code`). Nunca cuenta alumnos de otra institución.
- **CA-05.** Para `COMPANY` (con empresa activa vinculada) devuelve: total de perfiles disponibles actualmente en el Banco de Talentos (mismo universo de HU-S4-05 CA-02).
- **CA-06.** Una cuenta `INSTITUTION` o `COMPANY` sin organización vinculada no consulta ni recibe conteos de organizaciones ajenas.
- **CA-07.** La página de inicio (`/`) muestra los contadores dentro de las tarjetas o resumen de cada rol y, para `INSTITUTION`, presenta un aviso con enlace al padrón cuando existan alumnos con «Municipio por confirmar». Si la consulta de indicadores falla, el inicio sigue permitiendo navegar a las secciones del rol sin bloquear la pantalla.

---

## HU-S5-02 — Registro y gestión de Oportunidades de Educación Dual

**Estado:** Completada (28 de octubre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S5-02.md`  
**Story Points:** 8  
**Rol:** `COMPANY`

### Historia de usuario

**COMO** usuario de una Empresa activa  
**QUIERO** registrar, consultar y editar las Oportunidades de Educación Dual de mi empresa  
**PARA** definir los proyectos, perfiles y lugares disponibles a los que podré vincular alumnos del Banco de Talentos.

### Criterios de aceptación

- **CA-01.** Solo cuentas `COMPANY` con empresa activa acceden a `/api/opportunities` y a las vistas `/opportunities`. Los demás roles reciben `403`, y una empresa inactiva recibe `401 COMPANY_INACTIVE`.
- **CA-02.** [Aislamiento y Anti-IDOR] Al crear una oportunidad, el servidor asigna automáticamente el `company_id` de la sesión y registra la cuenta creadora (`created_by`). Al listar, consultar o editar, una empresa solo ve y modifica sus propias oportunidades; una oportunidad ajena o inexistente responde `404` «La oportunidad no existe.».
- **CA-03.** [Campos de la oportunidad] El registro y la edición solicitan:
  - **Obligatorios:** título del proyecto u oportunidad (hasta 150 caracteres), carrera o programa requerido (hasta 150), periodo mínimo aceptado (tipo `semester` / `four_month` y número de 1 a 15, o solo número mínimo de 1 a 15 coherente con el buscador), número de lugares/vacantes (entero entre 1 y 50), modalidad o disponibilidad de reubicación, estado y municipio del catálogo INEGI (HU-S4-04), y descripción de actividades/objetivos (hasta 1500 caracteres).
  - **Opcionales:** habilidades requeridas (hasta 15 etiquetas del catálogo compartido `skills`, reutilizando la normalización de HU-S3-01) e idioma con nivel mínimo MCER/Nativo (`CvLanguage` y `LanguageLevel`).
- **CA-04.** [Sin datos de contacto en campos libres] El título, la carrera y la descripción rechazan URLs, correos, teléfonos y dominios mediante la regla `NoContactInformation` (HU-S3-01), para evitar que se publiquen canales de contacto fuera del flujo institucional.
- **CA-05.** [Ubicación espacial] El servidor deriva la columna `location` (`geography(Point, 4326)`) desde la cabecera del municipio elegido (HU-S4-04), por defecto precargado en la interfaz con el estado y municipio de la empresa. La API no acepta coordenadas del cliente ni expone el punto.
- **CA-06.** El listado de oportunidades de la empresa está paginado (20 por página), ordenado de la más reciente a la más antigua, y muestra título, carrera, municipio, vacantes, estado (`ACTIVA` / `INACTIVA`) y habilidades principales.
- **CA-07.** La interfaz ofrece **Oportunidades Duales** desde el inicio de `COMPANY` (`/opportunities`, `/opportunities/new`, `/opportunities/:id`, `/opportunities/:id/edit`), con validación en línea, selector de habilidades e idioma y tokens semánticos de la identidad visual.

---

## HU-S5-03 — Activación e inactivación de Oportunidades Duales (Baja lógica)

**Estado:** Completada (28 de octubre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S5-03.md`  
**Story Points:** 3  
**Rol:** `COMPANY`  
**Dependencia:** HU-S5-02

### Historia de usuario

**COMO** usuario de una Empresa activa  
**QUIERO** inactivar o reactivar una Oportunidad de Educación Dual de mi empresa  
**PARA** pausar oportunidades que ya cubrieron sus lugares sin perder el historial de solicitudes asociadas.

### Criterios de aceptación

- **CA-01.** Toda oportunidad nace con `is_active = true`. La ruta `PATCH /api/opportunities/{id}/status` acepta únicamente `{is_active: true | false}` (booleano estricto); cualquier otro campo responde `422`.
- **CA-02.** No existe eliminación física (`DELETE` responde `405`).
- **CA-03.** La acción respeta el aislamiento por empresa (Anti-IDOR: una oportunidad ajena o inexistente responde `404` idéntico sin modificar nada).
- **CA-04.** En la interfaz, inactivar una oportunidad solicita confirmación mediante `ConfirmDialog`; reactivarla cambia el estado directamente. Una oportunidad inactiva sigue siendo consultable y editable por su empresa, pero no podrá elegirse para nuevas solicitudes de vinculación (HU-S5-04).

---

## HU-S5-04 — Solicitud de vinculación directa a la Institución

**Estado:** Completada (28 de octubre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S5-04.md`  
**Story Points:** 5  
**Rol:** `COMPANY`  
**Dependencias:** HU-S4-05, HU-S5-02, HU-S5-03

### Historia de usuario

**COMO** usuario de una Empresa activa  
**QUIERO** enviar una solicitud de vinculación directa a la institución educativa desde el perfil anónimo de un alumno, asociándola a una de mis Oportunidades Duales activas  
**PARA** manifestar formalmente el interés de mi empresa en integrar a ese perfil a un proyecto de Educación Dual.

### Criterios de aceptación

- **CA-01.** Solo cuentas `COMPANY` con empresa activa pueden crear solicitudes de vinculación (`POST /api/linkage-requests`). Los demás roles reciben `403`.
- **CA-02.** [Vinculación sobre perfil anónimo] La petición identifica al alumno exclusivamente por su `public_id` (UUID v4) y a la oportunidad por su `opportunity_id`, más un mensaje opcional de hasta 500 caracteres (validado con `NoContactInformation`).
- **CA-03.** [Validaciones de integridad] El servidor verifica dentro de una transacción que:
  - el alumno exista, esté `ACTIVO`, pertenezca a una institución `ACTIVA` y tenga su expediente público capturado (mismo universo de HU-S4-05); si no cumple, responde `404` «El perfil no existe.»;
  - la oportunidad exista, pertenezca a la empresa de la sesión y esté `ACTIVA`; si es ajena o inexistente responde `422` en `opportunity_id`, y si está inactiva responde `422` indicando que solo se pueden usar oportunidades activas;
  - no exista ya una solicitud activa (`PENDIENTE_INSTITUCION` o `ACEPTADA`) de la misma empresa para el mismo alumno y la misma oportunidad (`422` «Ya enviaste una solicitud para este perfil en esa oportunidad.»).
- **CA-04.** [Trato directo sin Secretaría] La solicitud se guarda directamente con estado `PENDIENTE_INSTITUCION`, vinculada a la empresa, la oportunidad, el alumno (`student_id`), la institución del alumno (`institution_id`) y la cuenta `COMPANY` que la envió (`requested_by`).
- **CA-05.** [Privacidad intacta] Ni la respuesta del alta ni el perfil `/talent/:public_id` revelan datos protegidos del alumno (`student_identities`, NSS/IMSS, enlaces externos ni credenciales).
- **CA-06.** [Interfaz en el perfil público] En `/talent/:public_id`, el botón **Solicitar vinculación** abre una hoja (`Sheet`) donde la empresa elige una de sus oportunidades activas, escribe un mensaje opcional y envía la solicitud. Si la empresa aún no tiene oportunidades activas, la hoja informa de ello y ofrece un enlace a `/opportunities/new`.

---

## HU-S5-05 — Bandeja empresarial de solicitudes de vinculación enviadas

**Estado:** Completada (28 de octubre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S5-05.md`  
**Story Points:** 5  
**Rol:** `COMPANY`  
**Dependencia:** HU-S5-04

### Historia de usuario

**COMO** usuario de una Empresa activa  
**QUIERO** consultar el listado y el estado de las solicitudes de vinculación que mi empresa ha enviado a las instituciones educativas, y poder cancelar las que sigan pendientes  
**PARA** dar seguimiento a los perfiles solicitados y conocer el contacto institucional para coordinar el proceso fuera de la plataforma.

### Criterios de aceptación

- **CA-01.** `GET /api/linkage-requests` devuelve exclusivamente las solicitudes de la empresa de la sesión (Anti-IDOR), paginadas de 20 en 20 y ordenadas de la más reciente a la más antigua, con filtro opcional por estado (`status`).
- **CA-02.** Cada elemento incluye: identificador de la solicitud, estado (`PENDIENTE_INSTITUCION`, `ACEPTADA`, `RECHAZADA`, `CANCELADA`), fecha de envío, resumen de la oportunidad (`id`, `title`), resumen anónimo del perfil (`public_id`, `headline`, `program`, `period_type`, `period_number`) y datos de la institución educativa (`name` y `contact_email`) para la coordinación externa. Nunca incluye matrícula, nombre del alumno ni datos protegidos.
- **CA-03.** [Cancelación] La empresa puede cancelar una solicitud propia mientras esté en `PENDIENTE_INSTITUCION` (`PATCH /api/linkage-requests/{id}/cancel`). Si la solicitud es de otra empresa o no existe responde `404`; si ya no está pendiente responde `422`.
- **CA-04.** En `/talent/:public_id`, si la empresa ya tiene solicitudes enviadas para ese perfil, se muestra un aviso con las oportunidades para las que ya lo solicitó.
- **CA-05.** La interfaz ofrece **Solicitudes de vinculación** (`/linkage-requests`) desde el inicio de `COMPANY`, con filtro por estado, enlace al perfil anónimo y a la oportunidad, correo de contacto de la institución y confirmación con `ConfirmDialog` al cancelar una solicitud pendiente.