# Sprint 14 — Mi cuenta y empresas autogestionadas

Sprint vigente desde el 18 de noviembre de 2026. Sprint anterior: [sprint-13.md](sprint-13.md) (histórico).

**Objetivo del Sprint:** dar autonomía operativa sin perder control ni trazabilidad.
- Cada persona gestiona su cuenta: nombre y contraseña.
- La Secretaría invita a las empresas con lo mínimo y cada empresa captura y mantiene todo su perfil (cambio de alcance del 19 de noviembre).
- Las instituciones mantienen el contacto de su programa dual; su nombre oficial y su CCT siguen bajo Administración.
- Todo cambio queda en una bitácora inmutable.

**Story Points:** 26 (HU-S14-01 a HU-S14-04).

**Rama:** `feat/s14-account-profile`.

## Decisiones del responsable y el Arquitecto (18 de noviembre de 2026)

- **D1.** Entran las tres historias: Mi cuenta, Perfil de la organización y Trazabilidad.
- **D2. El sector SCIAN se establece una sola vez** (sustituida el 19 de noviembre por M1 a M4):
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
- **D7** (sustituida el 19 de noviembre por M2). El nombre comercial de la empresa es **editable**, con bitácora y aviso por correo en cola a las cuentas activas de `SECRETARY`. El aviso solo se envía cuando el valor cambia de verdad.
- **D8.** La bitácora nueva registra **también** las ediciones de `ADMIN` y `SECRETARY` sobre empresas, instituciones y cuentas.
- **D9.** Una sola vista `/account` («Mi cuenta») con secciones separadas: Mi cuenta para todos los roles y Perfil de la organización para `COMPANY` e `INSTITUTION`.
- **D10.** `ADMIN` y `SECRETARY` también tienen acceso a `/account`, con su nombre y su contraseña.

## Cambio de alcance del 19 de noviembre de 2026

El responsable y el Arquitecto simplifican el alta de empresas y delegan la captura completa a cada empresa. **D2 (sector de un solo establecimiento) y D7 (aviso a la Secretaría por cambio de nombre comercial) quedan sustituidas** por:

- **M1. Mínimo para operar:** nombre visible de la empresa (comercial o razón social) y nombre y correo del contacto. El puesto y el teléfono del contacto son opcionales y no cuentan para el perfil completo (ajuste del 19 de noviembre, para no bloquear a las empresas existentes que no los capturaron). Se exige antes de publicar una oportunidad o enviar una solicitud de vinculación; `/talent` se explora libre desde el primer acceso.
- **M2. Sin aviso por correo a la Secretaría:** los cambios del perfil solo quedan en la bitácora.
- **M3. Nombre de la persona:** si la Secretaría no lo captura al invitar, la cuenta guarda el correo como nombre provisional; el onboarding lo detecta y pide el nombre real.
- **M4. Edición de la Secretaría:** conserva la edición del perfil completo, con todos los campos opcionales. El folio de validación (`validation_reference`) es exclusivo de la Secretaría y nunca se expone a la empresa.

Ajustes del mismo día:
- El onboarding guarda en parcial: solo valida el formato de lo capturado; «Necesario para operar» es una guía visual, no un bloqueo.
- El onboarding se considera terminado si la empresa lo guardó o pospuso, o si su perfil ya está completo; `/welcome` terminado redirige a `/`.
- Sin ubicación de la empresa ni municipio de origen, la búsqueda de talento no ofrece el radio (y el servidor responde `422` si llega).
- El menú de cuenta no repite el correo cuando el nombre es el provisional.

La regla de CLAUDE.md no cambia: la Secretaría sigue gestionando las empresas que valida y sus cuentas.

## Precisiones técnicas

- **Bitácora general e inmutable:** tabla `account_audit_events` con:
  - `id`;
  - `actor_id`, la cuenta que hizo el cambio;
  - `event`: `account_updated`, `password_changed`, `organization_profile_updated` o `company_invited`, con CHECK. Un solo evento para el perfil, que lista los campos que cambiaron;
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
2. **HU-S14-02** Alta ligera de empresas por invitación y perfil opcional.
3. **HU-S14-03** Perfil autogestionado y onboarding de la empresa.
4. **HU-S14-04** Trazabilidad de cambios en la bitácora.

Cada historia termina con su reporte y una revisión del responsable antes de iniciar la siguiente.

## Fuera de alcance

- Gestión de otras cuentas de la organización por la propia organización. Sigue en Administración y la Secretaría y requeriría una jerarquía interna y cambiar la política de CLAUDE.md.
- Cambio del correo de acceso, que requeriría verificar el correo nuevo.
- Ubicación de las instituciones.

---

## HU-S14-01 — Mi cuenta: nombre y contraseña

**Estado:** Completada (18 de noviembre de 2026). Pest con 17 pruebas en `tests/Feature/AccountTest.php` y Vitest con 5 en `src/account/AccountPage.test.tsx`.  
**Diseño técnico y verificación:** `docs/HU-S14-01.md`  
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

## HU-S14-02 — Alta ligera de empresas por invitación y perfil opcional

**Estado:** Completada (19 de noviembre de 2026), commit `36681eb`.  
**Diseño técnico y verificación:** `docs/HU-S14-02.md`  
**Story Points:** 8  
**Rol:** `SECRETARY` (invitación y edición); todos los consumidores de datos de empresa

### Historia de usuario

**COMO** Secretaría de Economía  
**QUIERO** invitar a una empresa solo con el correo de su cuenta  
**PARA** darle acceso de inmediato y que ella capture su propio perfil.

### Criterios de aceptación

- **CA-01.** «Invitar empresa» (`POST /api/companies`) pide el **correo de la cuenta** (obligatorio, único) y, opcionales, un **nombre de referencia** de la empresa (se guarda como nombre comercial) y el **nombre de la persona** (sin él, la cuenta guarda el correo como nombre provisional, M3). Crea la empresa sin perfil y su cuenta `COMPANY` en una transacción y entrega el enlace de contraseña por correo o manual, como hoy. Registra `company_invited` en `account_audit_events`.
- **CA-02.** En `companies`, el perfil completo pasa a ser opcional en la base de datos: razón social, RFC, sector, estado, municipio, punto, nombre y correo del contacto. La ubicación es completa o ninguna (CHECK) y ningún texto se guarda vacío. El RFC, si llega, conserva formato y unicidad; vacío se normaliza a `null`. Se agrega `onboarding_dismissed_at` (las empresas existentes ya lo traen fijado).
- **CA-03.** La lista de empresas muestra el nombre visible o «Empresa sin nombre» con el correo de su cuenta, un estado («Acceso pendiente», «Perfil incompleto», «Perfil completo») y busca también por el correo de la cuenta. El detalle muestra «Sin capturar» en los campos vacíos. La edición de la Secretaría (M4) acepta todos los campos vacíos, con estado y municipio juntos.
- **CA-04.** Ningún consumidor falla con una empresa sin perfil: inicio, sesión, bandejas, detalle y CSV de la institución, chat, correo de mensajes, bitácora, reporte ejecutivo y su CSV (vacíos agrupados), precarga de la ubicación de oportunidades y búsqueda de talento.
- **CA-05.** Búsqueda de talento sin ubicación de la empresa ni municipio de origen: ordena por actualización reciente sin distancia; el filtro de radio se deshabilita y explica qué falta; el servidor responde `422` si llega `radius_km` sin origen.
- **CA-06.** Se retira el aviso por correo a la Secretaría por cambio de nombre comercial (M2).
- **CA-07.** Pruebas: Pest de la invitación, la edición opcional, el RFC, los CHECK y cada consumidor con una empresa vacía; Vitest de la invitación, la lista, el detalle y el radio sin origen.

## HU-S14-03 — Perfil autogestionado y onboarding de la empresa

**Estado:** Completada (19 de noviembre de 2026). Pest, Vitest y Playwright en verde; M1 sin el puesto del contacto.  
**Diseño técnico y verificación:** `docs/HU-S14-03.md`  
**Story Points:** 8  
**Rol:** `COMPANY` (perfil completo); `INSTITUTION` (contacto, sin cambios de alcance)

### Historia de usuario

**COMO** empresa invitada  
**QUIERO** completar mi perfil al entrar por primera vez, o más tarde, y mantenerlo desde mi cuenta  
**PARA** presentarme ante las instituciones y empezar a vincular sin depender de la Secretaría.

### Criterios de aceptación

- **CA-01.** `GET` y `PUT /api/organization/profile` resuelven la organización desde la sesión. La empresa edita todo su perfil (nombre comercial, razón social, RFC, sector, ubicación y contacto), incluido el sector las veces que quiera; nunca `validation_reference`, `is_active` ni `registered_by` (`422` por nombre). La institución edita solo su contacto; su nombre oficial y su CCT quedan en solo lectura.
- **CA-02.** El primer acceso de una empresa con el perfil incompleto y sin posponer lleva a `/welcome` («Completa el perfil de tu empresa»): guardado parcial sin campos obligatorios, «Completar más tarde» (`POST /api/organization/profile/postpone`) y sin bucles de redirección. Con el onboarding terminado, `/welcome` redirige a `/`.
- **CA-03.** El contacto para vinculación se precarga con el nombre y el correo de la cuenta («Soy yo»); si el nombre es el provisional, se pide el real y actualiza `users.name` en la misma transacción. Se puede asignar a otra persona.
- **CA-04.** Mientras falten datos, el inicio muestra un `Callout` con lo que falta, «Completar perfil» hacia `/account` y la ruta en texto para encontrarlo después.
- **CA-05.** Mínimo para operar (M1: nombre visible y nombre y correo del contacto): publicar una oportunidad o enviar una solicitud sin él responde `422` (`COMPANY_PROFILE_INCOMPLETE`) y la interfaz lo explica con un enlace a `/account`.
- **CA-06.** `/account` reúne Mi cuenta y el perfil de la organización con el mismo formulario del onboarding; responsive a 1440 y 390 px.
- **CA-07.** Cada guardado registra `organization_profile_updated` con los nombres de los campos que cambiaron (y `account_updated` si cambió el nombre de la cuenta); sin cambios, no registra nada.
- **CA-08.** Pruebas: Pest (anti-IDOR, campos internos, onboarding, posponer, M1, bitácora sin valores, sin correos), Vitest (onboarding, recordatorio, bloqueo) y E2E (invitación, onboarding, posponer, bloqueo, completar y publicar).

## HU-S14-04 — Trazabilidad de cambios en la bitácora

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
