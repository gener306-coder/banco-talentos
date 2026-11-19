# Sprint 14 — Mi cuenta y perfil de la organización

Sprint vigente desde el 18 de noviembre de 2026. Sprint anterior: [sprint-13.md](sprint-13.md) (histórico).

**Objetivo del Sprint:** dar autonomía operativa sin perder control ni trazabilidad.
- Cada persona gestiona su cuenta: nombre y contraseña.
- Empresas e instituciones mantienen sus datos operativos (nombre comercial, ubicación, contacto y, una sola vez, el sector).
- Los datos legales y oficiales siguen bajo Administración y la Secretaría.
- Todo cambio queda en una bitácora inmutable.

**Story Points:** 18 (HU-S14-01 a HU-S14-03).

**Rama:** `feat/s14-account-profile`.

## Decisiones del responsable y el Arquitecto (18 de noviembre de 2026)

- **D1.** Entran las tres historias: Mi cuenta, Perfil de la organización y Trazabilidad.
- **D2. El sector SCIAN se establece una sola vez:**
  - en el alta y la edición de empresas de la Secretaría, `sector_code` pasa a ser **opcional** (nullable en la base de datos), con el texto de ayuda «Si lo dejas vacío, la empresa podrá establecerlo desde su perfil»;
  - en `/account` (lado `COMPANY`), si el sector está vacío, la empresa lo elige del catálogo SCIAN con el aviso de que, una vez guardado, solo la Secretaría podrá cambiarlo, y lo confirma con `ConfirmDialog`;
  - una vez establecido, queda en solo lectura para la empresa: el backend responde `422` si ya tiene valor y usa `lockForUpdate` para evitar carreras;
  - la Secretaría siempre puede asignarlo o corregirlo desde su módulo;
  - el reporte ejecutivo por sector (HU-S7-01) agrupa los vacíos como «Sin sector asignado», sin perder empresas en los totales;
  - el inicio de la empresa muestra un `Callout` discreto, solo con el sector vacío, con enlace a `/account`.
- **D3.** El nombre oficial de la institución queda en **solo lectura**, porque está ligado al CCT.
- **D4.** La ubicación de las instituciones queda **fuera de alcance**: no existe en el esquema.
- **D5.** El correo de acceso queda en **solo lectura** en esta fase.
- **D6.** Cambiar la contraseña **cierra las demás sesiones** abiertas de la cuenta y envía un correo de aviso por la cola existente.
- **D7.** El nombre comercial de la empresa es **editable**, con bitácora y aviso por correo en cola a las cuentas activas de `SECRETARY`. El aviso solo se envía cuando el valor cambia de verdad.
- **D8.** La bitácora nueva registra **también** las ediciones de `ADMIN` y `SECRETARY` sobre empresas, instituciones y cuentas.
- **D9.** Una sola vista `/account` («Mi cuenta») con secciones separadas: Mi cuenta para todos los roles y Perfil de la organización para `COMPANY` e `INSTITUTION`.
- **D10.** `ADMIN` y `SECRETARY` también tienen acceso a `/account`, con su nombre y su contraseña.

## Precisiones técnicas

- **Bitácora general e inmutable:** tabla `account_audit_events` con:
  - `id`;
  - `actor_id`, la cuenta que hizo el cambio;
  - `event`: `account_updated`, `password_changed`, `profile_updated` o `sector_established`, con CHECK;
  - `subject_type`, que acepta solo `user`, `company` o `institution`, con CHECK;
  - `subject_id`;
  - `changed_fields`, la lista de **nombres** de campos;
  - `created_at`.

  **Nunca** guarda valores de contacto ni contraseñas. Un trigger de PostgreSQL `BEFORE UPDATE OR DELETE` (creado con `CREATE OR REPLACE FUNCTION`, el mismo patrón que `linkage_messages`) garantiza que solo admite inserciones.
- **Al cambiar la contraseña, se invalidan todas las sesiones:** `PUT /api/me/password`
  - regenera la sesión actual;
  - borra las demás filas del usuario en `sessions`;
  - rota `remember_token` en `users`, para invalidar las sesiones persistentes en otros dispositivos.

## Reglas de seguridad

- **Rutas y campos:**
  - las rutas de perfil y cuenta resuelven la cuenta y la organización **desde la sesión** y nunca aceptan un id en la ruta ni en el cuerpo;
  - cada FormRequest tiene una lista explícita de campos y rechaza los demás con `422`. Así, `email`, `role`, `legal_name`, `rfc`, `name` de la institución, `cct` o `is_active` nunca entran.
- **Peticiones:**
  - límite por usuario en el perfil y, más estricto, en la contraseña;
  - las respuestas autenticadas llevan `Cache-Control: no-store, private`.
- **Política de contraseña:** la política existente (`InstitutionPasswordRules`: mínimo 12 caracteres y confirmada) y la contraseña actual obligatoria. Ninguna contraseña se registra ni se devuelve.
- **Textos de la interfaz:** sin comillas angulares (`copy.test.ts`) y solo tokens semánticos.

## Orden de implementación

1. **HU-S14-01** Mi cuenta: nombre y contraseña.
2. **HU-S14-02** Perfil de la organización.
3. **HU-S14-03** Trazabilidad de cambios en la bitácora.

## Fuera de alcance

- Gestión de otras cuentas de la organización por la propia organización. Sigue en Administración y la Secretaría y requeriría una jerarquía interna y cambiar la política de CLAUDE.md.
- Cambio del correo de acceso, que requeriría verificar el correo nuevo.
- Ubicación de las instituciones.

---

## HU-S14-01 — Mi cuenta: nombre y contraseña

**Estado:** Pendiente.  
**Story Points:** 5  
**Rol:** todos (`ADMIN`, `SECRETARY`, `INSTITUTION`, `COMPANY`)

### Historia de usuario

**COMO** persona con una cuenta en el Banco de Talentos  
**QUIERO** corregir mi nombre y cambiar mi contraseña desde el menú de cuenta  
**PARA** mantener mi acceso seguro sin depender de Administración ni de la Secretaría.

### Criterios de aceptación

- **CA-01.** El menú de cuenta ofrece «Mi cuenta», que lleva a `/account`. La vista muestra:
  - el nombre, editable;
  - el correo de acceso, en solo lectura, con la indicación de a quién pedir un cambio;
  - el rol y la organización.
- **CA-02.** `PATCH /api/me` acepta solo `name` (de 1 a 120 caracteres, recortado y no solo espacios). Cualquier otro campo responde `422`. Al guardar, el menú muestra el nombre nuevo.
- **CA-03.** `PUT /api/me/password` exige:
  - `current_password` correcta, o responde `422` en `current_password`;
  - `password` y `password_confirmation` con la política existente;
  - una contraseña nueva distinta de la actual.
- **CA-04.** Al cambiar la contraseña:
  - se regenera la sesión actual y la persona sigue dentro;
  - se borran sus demás sesiones y se rota `remember_token`;
  - se invalidan sus tokens de restablecimiento pendientes;
  - se encola el correo «Tu contraseña cambió», sin la contraseña.
- **CA-05.** Límite de peticiones: más estricto en la contraseña (frena la adivinación de la contraseña actual) y moderado en el nombre. Las dos rutas exigen sesión, cuenta activa y CSRF.
- **CA-06.** Cada cambio inserta un evento en `account_audit_events` (`account_updated` con `["name"]` o `password_changed` sin campos), con el actor y `subject_type = 'user'`. La tabla rechaza actualizar o borrar filas en la base de datos.
- **CA-07.** Cambiar la contraseña se hace en una `Sheet` con la contraseña actual, la nueva y su confirmación, mostrar u ocultar y `PendingLabel`. Los errores van junto a cada campo. Al terminar, se ve el aviso de éxito.
- **CA-08.** Pruebas:
  - Pest: acceso por rol y CSRF; lista explícita de campos; contraseña actual incorrecta; política; igual a la actual; sesiones borradas y `remember_token` rotado; tokens invalidados; correo encolado; throttle; inmutabilidad de la bitácora;
  - Vitest: el enlace del menú, la vista y la `Sheet`.

## HU-S14-02 — Perfil de la organización

**Estado:** Pendiente.  
**Story Points:** 8  
**Rol:** `COMPANY`, `INSTITUTION` (edición); `SECRETARY` (sector opcional en su módulo)

### Historia de usuario

**COMO** empresa o institución  
**QUIERO** mantener mis datos operativos desde mi cuenta  
**PARA** que la información que ven las demás organizaciones esté al día sin pedirlo a la Secretaría o a Administración.

### Criterios de aceptación

- **CA-01.** `GET` y `PUT /api/organization/profile` resuelven la organización desde la sesión. Datos según el lado:

  | | Empresa | Institución |
  |---|---|---|
  | **Solo lectura** | Razón social y RFC; el sector, una vez establecido | Nombre oficial y CCT |
  | **Editable** | Nombre comercial; estado y municipio del catálogo INEGI; nombre, puesto, correo y teléfono del contacto | Nombre, puesto, correo y teléfono del responsable del programa dual |

  Un campo fuera de la lista responde `422`.
- **CA-02.** **Sector (D2):**
  - `sector_code` es nullable en la base de datos y opcional en el formulario de la Secretaría, con su texto de ayuda;
  - la empresa lo establece una sola vez, tras un `ConfirmDialog`;
  - con el sector ya establecido, la petición responde `422`, verificado con `lockForUpdate`;
  - la Secretaría puede asignarlo y corregirlo siempre;
  - el reporte por sector agrupa los vacíos como «Sin sector asignado» y los totales no pierden empresas;
  - las vistas que muestran el sector toleran el vacío;
  - el inicio de la empresa sin sector muestra un `Callout` con enlace a `/account`.
- **CA-03.** El cambio se refleja en lo que consume estos datos: bandejas, chat, avisos, correo de mensajes, detalle de la solicitud, CSV y el menú de cuenta.
- **CA-04.** Cuando el nombre comercial cambia de valor (no al guardar el mismo), se encola un aviso por correo a las cuentas activas de `SECRETARY`.
- **CA-05.** Cada guardado inserta en `account_audit_events`:
  - `profile_updated`, con los nombres de los campos que cambiaron;
  - `sector_established`, cuando la empresa fija su sector.

  Si nada cambió, no se inserta ningún evento.
- **CA-06.** La interfaz de `/account` añade la sección «Perfil de la empresa» o «Perfil de la institución»:
  - los datos de solo lectura, con un `Callout` que explica a quién pedir un cambio;
  - el formulario editable, con `MunicipalityCombobox` en la empresa, `PendingLabel` y los errores junto a cada campo;
  - funciona a 1440 y a 390 px.
- **CA-07.** Pruebas:
  - Pest: anti-IDOR (ids ignorados o rechazados); campos protegidos; validaciones; sector una sola vez con su carrera; reporte con «Sin sector asignado»; aviso de nombre comercial solo si cambia; throttle; bitácora sin valores;
  - Vitest y E2E: una empresa cambia su contacto y la institución lo ve en el detalle de la solicitud.

## HU-S14-03 — Trazabilidad de cambios en la bitácora

**Estado:** Pendiente.  
**Story Points:** 5  
**Rol:** `ADMIN` (consulta); todos generan eventos

### Historia de usuario

**COMO** administración del Banco de Talentos  
**QUIERO** ver en la bitácora quién cambió los datos de una cuenta, empresa o institución, y cuándo  
**PARA** mantener la trazabilidad ahora que las organizaciones editan su información.

### Criterios de aceptación

- **CA-01.** Las ediciones que `ADMIN` hace de instituciones y cuentas institucionales, y las que `SECRETARY` hace de empresas y sus cuentas, también insertan su evento (D8), con los nombres de los campos que cambiaron.
- **CA-02.** La bitácora (HU-S7-03) incorpora los eventos de `account_audit_events`:
  - con sus tipos y filtro;
  - con la fecha, quién lo hizo y el recurso;
  - y con los nombres legibles de los campos («Contacto: correo», «Nombre comercial»).

  Nunca muestra valores, contraseñas ni datos del alumno.
- **CA-03.** Paginación y orden igual que la bitácora actual. La tabla sigue siendo inmutable.
- **CA-04.** Pruebas:
  - Pest: cada origen inserta su evento; la bitácora lista los eventos nuevos con lista explícita de campos y sin valores; filtro por tipo;
  - Vitest: los tipos nuevos en la vista.
