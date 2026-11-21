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

**Estado:** Implementada (19 de noviembre de 2026), sin commit y pendiente de revisión. Pest 1631 en verde, Vitest 1193 en verde más las 3 fallas conocidas de descarga, Playwright 45 de 45.  
**Diseño técnico y verificación:** `docs/HU-S14-04.md`  
**Story Points:** 5  
**Rol:** `ADMIN` (consulta); todos generan eventos

### Historia de usuario

**COMO** administración del Banco de Talentos  
**QUIERO** ver en la bitácora quién cambió los datos de una cuenta, empresa o institución, y cuándo  
**PARA** mantener la trazabilidad ahora que las organizaciones editan su información.

### Criterios de aceptación

- **CA-01.** Las ediciones que `ADMIN` hace de instituciones y las que `SECRETARY` hace de empresas también insertan su evento (D8, alcance confirmado el 19 de noviembre), con los nombres de los campos que cambiaron.
- **CA-02.** La bitácora (HU-S7-03) incorpora los eventos de `account_audit_events`:
  - con sus tipos y filtro;
  - con la fecha, quién lo hizo y el recurso;
  - y con los nombres legibles de los campos («Contacto: correo», «Nombre comercial»).

  Nunca muestra valores, contraseñas ni datos del alumno.
- **CA-03.** Paginación y orden igual que la bitácora actual. La tabla sigue siendo inmutable.
- **CA-04.** Pruebas:
  - Pest: cada origen inserta su evento; la bitácora lista los eventos nuevos con lista explícita de campos y sin valores; filtro por tipo;
  - Vitest: los tipos nuevos en la vista.

---

## Tareas técnicas

### T-S14-01 — Recordatorio del perfil más discreto

**Estado:** Implementada (19 de noviembre de 2026), sin commit. Solicitada por el responsable tras revisar HU-S14-03: el aviso del inicio era grande e invasivo.

- **Inicio de la empresa:** el `Callout` de HU-S14-03 CA-04 se sustituye por un recordatorio de una sola línea (`ProfileNudge`). Toda la línea es un enlace de 44 px hacia `/account#organization`, con una barra de avance decorativa y uno de dos textos:
  - «Completa tu perfil para publicar oportunidades y enviar solicitudes.» sin el mínimo M1;
  - «Tu perfil está casi listo: faltan N datos.» con M1 cubierto.

  Sin ícono de alerta ni borde lateral. Como en las demás vistas, no enumera los detalles.
- **Mi cuenta, Perfil de la empresa:** recibe el detalle (`ProfileProgress`):
  - «N de 7 datos del perfil completos» con la barra;
  - qué habilita completarlos;
  - las fichas de los datos pendientes, con los necesarios para operar resaltados.

  Con el perfil completo solo lo confirma. Sustituye al `Callout` «Mantén tus datos al día».
- **Llegada por `#organization`:** el título de la sección ya no queda bajo el encabezado fijo (`scroll-margin-top`).
- **Pruebas:** Vitest (recordatorio, avance, perfil completo) y la E2E del onboarding ajustadas. Revisión visual a 1440 y 390 px.

### T-S14-02 — Corrección: el contacto vaciado se volvía a rellenar

**Estado:** Implementada (19 de noviembre de 2026), sin commit. Reportada por el responsable.

- **Falla:** al vaciar el nombre y el correo del contacto en Mi cuenta y guardar, el perfil los mostraba como faltantes. Al regresar, el formulario marcaba «Soy yo» y volvía a rellenar los datos de la cuenta, porque trataba cualquier contacto vacío como si fuera la primera captura.
- **Corrección:** la sugerencia de «Soy yo» con los datos precargados queda solo para el onboarding (`/welcome`, prop `suggestSelf`). En Mi cuenta, la casilla refleja el contacto guardado: se marca solo si su correo es el de la cuenta, también después de guardar. Un contacto vacío se respeta y la empresa puede marcar «Soy yo» para usar sus datos.
- **Pruebas:** regresión en Vitest (vaciar, guardar y volver sin que se rellene ni se marque) y la E2E del onboarding ajustada.

### T-S14-03 — Rediseño de Mi cuenta: perfil de lectura primero

**Estado:** Implementada (19 de noviembre de 2026) en `chore/ui-polish-account-profile`, sin commit. Solicitada por el responsable. Solo frontend: sin cambios de backend ni de contratos.

- **`UserAvatar` (`ui/UserAvatar.tsx`):** iniciales con el tinte de la marca y un anillo de 1 px, en tamaño `sm` para el menú de cuenta y `lg` (72 px) para Mi cuenta. Acepta `src` para una foto futura y es decorativo: el nombre siempre está escrito.
- **Tarjeta de identidad:**
  - avatar, nombre como `h2` y el lápiz «Editar nombre», que edita en su sitio (Enter guarda, Escape o «Cancelar» salen y el foco vuelve al lápiz);
  - rol y organización, y el correo en tono secundario;
  - con el nombre provisional muestra «Agrega tu nombre» en lugar de repetir el correo.
- **Acceso y seguridad:** filas con filete al estilo de Ajustes.
  - Correo de acceso, con a quién pedir el cambio.
  - Contraseña oculta, con la nota de que cambiarla cierra las demás sesiones y «Cambiar contraseña», que abre la hoja existente.
- **Perfil de la empresa o de la institución:**
  - ficha de lectura en dos columnas (una en el celular), agrupada en Datos generales, Ubicación y Contacto, con «Sin capturar» en lo vacío;
  - insignia «Perfil completo» o «Perfil incompleto» para la empresa;
  - «Editar» pasa la misma tarjeta al formulario existente, con «Guardar cambios» y «Cancelar»; al guardar vuelve a la lectura con una confirmación discreta;
  - la institución muestra sus datos oficiales en un bloque de solo lectura;
  - al llegar por `/account#organization` con datos faltantes, la empresa entra directo a la edición, con el avance a la vista y desplazamiento suave.
- **`ADMIN` y `SECRETARY`:** solo identidad y acceso.
- **El nombre es `h2`:** la página ya tiene un `h1` en el encabezado general, así que el nombre ocupa el nivel del título de la vista.
- **Pruebas:** Vitest (avatar, nombre provisional, edición del nombre con Enter, Escape y Cancelar, lectura y edición de la empresa y la institución, apertura automática, vista sin organización) y la E2E del onboarding ajustada. Revisión visual a 1440 y 390 px en claro y oscuro.

### T-S14-04 — Auditoría y refinamiento visual de Mi cuenta

**Estado:** Implementada (19 de noviembre de 2026) en `chore/ui-polish-account-profile`, sin commit. Solicitada por el responsable sobre T-S14-03. Solo frontend.

- **Avisos de confirmación:** `ui/Snackbar.tsx` y `ui/useSnackbar.tsx` sustituyen a los textos sueltos dentro de las tarjetas para «Nombre actualizado.», «Perfil actualizado.» y el cambio de contraseña.
  - Superficie invertida centrada abajo, respetando el área segura.
  - Entrada con el resorte del sistema y solo aparición con movimiento reducido.
  - `role="status"`, cierre manual de 44 px en el celular y pausa mientras el puntero o el foco están encima.
- **Carga:** `LoadingState` suma la variante `facts`, un esqueleto con la forma de la ficha (grupos y pares etiqueta-valor en dos columnas) en lugar del genérico.
- **Avance del perfil:** la barra vuelve a la cabecera de la tarjeta de la empresa (`ProfileScore`) con «N de 7 datos», o la insignia verde «Perfil completo». El detalle de abajo (`ProfileProgress compact`) dice qué falta sin repetir la cuenta.
- **Estados vacíos:**
  - una empresa sin ningún dato ve «Tu empresa aún no tiene perfil» con «Completar perfil», y no una ficha llena de «Sin capturar»; sin la lista de pendientes ni un «Editar» duplicado;
  - un grupo sin datos (ubicación o contacto) se resume en una línea.
- **Tipografía y jerarquía:**
  - nuevo token `--text-muted` (claro `#6b6a70`, 5.3:1; oscuro `#a9a6ae`, 7:1), definido en los dos temas, verificado en `tokens.test` y documentado en `identidad-visual.md`, porque en claro `--text` y `--text-strong` coinciden;
  - etiquetas en `--type-sm` atenuado, valores en `--type-base` con peso 500, encabezados de grupo en `--type-xs` en mayúsculas espaciadas y títulos de tarjeta en peso 600;
  - las filas de seguridad usan la misma escala que la ficha.
- **Disposición:** la cabecera de cada tarjeta agrupa el título y su estado, y deja «Editar» fijo arriba a la derecha en cualquier ancho. El lápiz se separa del nombre.
- **Transiciones:** el cambio entre lectura y edición del nombre y de la tarjeta entra con `content-enter`, sin movimiento con movimiento reducido. Los controles conservan la presión, el foco y el cursor del sistema.
- **Pruebas:** Vitest del esqueleto, el avance en la cabecera, el estado vacío, el grupo vacío y el cierre del aviso; los avisos se verifican en el `Snackbar`. Revisión visual a 1440 y 390 px en claro y oscuro.
- **E2E:** la spec del onboarding busca la confirmación en el aviso. En `talent-search.spec.ts`, la medición del ancho a 390 px usa `expect.poll`: medía justo después de cambiar el tamaño de la ventana y una vez falló con 435 px. Un desborde real sigue fallando.

### T-S14-05 — Corrección: la pastilla flotante de las Historias del Dual quedaba bajo el encabezado

**Estado:** Implementada (19 de noviembre de 2026) en `chore/ui-polish-account-profile`, sin commit. Reportada por el responsable.

- **Falla:** en el feed de Historias del Dual, la pastilla de orden (Más recientes, Al azar y Volver arriba) dejaba de verse al desplazarse en las cuentas de empresa e institución. Seguía flotando, pero a 8 px del borde, escondida bajo el encabezado fijo.
- **Causa:** `UnreadSummaryProvider` (T-S13-08, commit `a3628a8`) devolvía sus hijos sin proveedor mientras no había sesión y los envolvía en el proveedor al iniciarla. El cambio de tipo de elemento hacía que React volviera a montar todo el árbol: encabezado, contenido y página. `useAppBarHeight` seguía observando el encabezado desmontado y publicaba `--app-bar-height: 0px`. La variable también alinea el desplazamiento suave de las tablas (`stickyTop`), así que ese ajuste tampoco descontaba el encabezado en esas cuentas.
- **Corrección:**
  - el proveedor se renderiza siempre, con valor `null` sin cuenta de empresa o institución; el árbol queda estable y el inicio de sesión ya no vuelve a montar la app;
  - `useAppBarHeight` sigue al elemento con una referencia de callback, así que se reengancha si el encabezado se vuelve a montar por otra causa.
- **Pruebas:** `src/AppShell.test.tsx` comprueba que el encabezado y el contenido son los mismos nodos antes y después de cargar la sesión. Falla sin la corrección. En Chromium, `--app-bar-height` vale 67 px en el celular y 79 px en escritorio, y la pastilla flota a 75 px y 87 px.

### T-S14-06 — Menú de cuenta profesional, tema claro por defecto y cambio de tema animado

**Estado:** Completada (19 de noviembre de 2026, commit e3afd90). Solicitada por el responsable. Solo frontend.

- **Panel del menú:** en capas, al estilo de las grandes plataformas, con secciones separadas por filetes de 1 px:
  - identidad: avatar `md`, nombre, correo atenuado y la insignia del rol con la organización;
  - «Mi cuenta» como fila con ícono, la descripción «Perfil y seguridad» y un chevron que se desplaza al señalarla;
  - tema;
  - «Cerrar sesión» como fila terminal neutra, que se tiñe de peligro al señalarla.

  Filas de 44 px en pantallas táctiles, sombra en dos capas y entrada con el resorte desde la esquina del botón.
- **Tema:** tres mosaicos (Claro, Oscuro y Sistema), cada uno con:
  - la miniatura de la aplicación en ese tema (encabezado, tarjeta y acento de la marca; «Sistema» en dos mitades);
  - su ícono (sol, luna o monitor);
  - el elegido con el acento, el tinte y una marca que aparece con el resorte.

  Siguen siendo radios nativos: flechas del teclado y foco visible. Los colores fijos de las miniaturas son los tokens `--theme-preview-*`, definidos igual en ambos temas.
- **Celular (hasta 480 px):** el panel se compacta de 320×360 px a 280×295 px y conserva las zonas táctiles de 44 px. El tema pasa a un control segmentado de una sola fila (ícono y nombre, sin miniaturas), y el elegido se destaca como una pestaña elevada.
- **Tema claro por defecto:** sin elección guardada, la aplicación se ve en claro aunque el sistema esté en oscuro; «Sistema» se guarda como una elección más. `index.html` aplica la misma regla antes del primer pintado.
- **Cambio de tema animado:**
  - con View Transitions, el tema nuevo se revela en un círculo que crece desde el mosaico pulsado (520 ms);
  - sin ellas, colores y fondos se funden 400 ms (`.theme-fading`);
  - con movimiento reducido, o si el tema visible no cambia, se aplica al instante.
- **Pruebas:** Vitest de `theme.test.ts` (predeterminado claro, Sistema guardado, revelado circular, fundido de respaldo y movimiento reducido) y del menú en `SessionPage.test.tsx`; `e2e/theme.spec.ts` ajustada al nuevo predeterminado. Revisión visual a 1440 y 390 px en claro, oscuro y sistema, y a mitad de la animación.


### T-S14-07 — Auditoría de los inicios por rol: esqueletos a la medida, jerarquía y transiciones

**Estado:** Completada (19 de noviembre de 2026, commit 33f1594). Solicitada por el responsable. Solo frontend.

- **Hallazgos de la auditoría (los cuatro roles, 1440 y 390 px):**
  - mientras cargaban los indicadores, el inicio quedaba en blanco: el resumen no tenía esqueleto y las tarjetas de acceso esperaban ocultas a los datos;
  - al llegar los datos, todo aparecía de golpe y empujaba el contenido; el carrusel de la empresa hacía lo mismo;
  - el error de los indicadores no ofrecía reintentar;
  - sin títulos de sección, el resumen y los accesos se leían como un solo bloque;
  - la acción principal ocupaba una fila propia bajo el saludo, y en el celular los indicadores formaban una columna de seis tarjetas altas;
  - en la empresa, las Historias (inspiracional) iban antes que su resumen (accionable).
- **Esqueletos a la medida:**
  - `useSkeletonDelay` (nuevo, `ui/useSkeletonDelay.ts`): el esqueleto reserva su alto desde el primer pintado, pero sus huesos solo se ven si la espera pasa de `SKELETON_DELAY_MS`; una carga rápida no parpadea;
  - resumen: una tarjeta por indicador del rol (6, 5, 4 o 3), con la misma retícula, y la carga anunciada en un `role="status"` oculto;
  - carrusel de la empresa: encabezado, la historia actual con el borde de la siguiente y el pie; si no hay historias o falla, desaparece como antes;
  - las tarjetas de acceso ya no esperan a los datos: se revelan en cascada al entrar en pantalla.
- **Jerarquía y disposición:**
  - encabezado con la fecha del día, el saludo y el rol con la organización en tono secundario; la acción principal sube a la derecha del saludo en pantallas anchas y va a todo el ancho en el celular;
  - títulos de sección discretos en mayúsculas espaciadas («Indicadores» y «Accesos»), como en Mi cuenta;
  - indicadores con `auto-fit` (la fila se llena sin huecos con cualquier número) y etiquetas en `--text-muted`; en el celular, dos por fila, y si el número es impar el último ocupa la fila;
  - descripciones de las tarjetas y avisos en `--text-muted`; tarjetas más compactas en el celular;
  - la búsqueda de talento de la empresa es un panel sobre `--surface-muted`, y su resumen va antes que las Historias.
- **Estados:** si los indicadores fallan, un aviso discreto (borde punteado, `role="status"`) con «Reintentar»; las secciones siguen disponibles. Las cifras entran con `content-enter` y conservan el conteo de T-S12-11; con movimiento reducido no hay animación.
- **Pruebas:**
  - Vitest de `SessionPage.test.tsx`: esqueleto con una tarjeta por indicador y tarjetas reveladas sin esperar los datos; aviso con «Reintentar» que vuelve a pedir los indicadores y los muestra;
  - Vitest de `DualStoriesSpotlight.test.tsx`: esqueleto del carrusel mientras carga;
  - `e2e/home-dashboard.spec.ts`: el error deja el aviso con «Reintentar» y sin cifras.
  
  Revisión visual de los cuatro roles a 1440 y 390 px, cargado, cargando y con error, en claro y oscuro, sin desborde horizontal.

### T-S14-08 — Auditoría de los listados: esqueletos a la medida, tarjetas en el celular y consistencia

**Estado:** Implementada (19 de noviembre de 2026) en `chore/ui-polish-lists`, sin commit. Solicitada por el responsable. Solo frontend.

Alcance: los ocho listados principales (instituciones, cuentas de la Secretaría, bitácora, empresas, alumnos, solicitudes recibidas por la institución, oportunidades y solicitudes enviadas por la empresa).

- **Hallazgos de la auditoría (con los datos de la simulación, a 1440 y 390 px):**
  - el esqueleto era el mismo para todos: cinco columnas fijas y seis renglones delgados, sin la tarjeta ni el encabezado de la tabla; al llegar los datos aparecían el marco, el encabezado y filas de otra altura, y todo saltaba;
  - en el celular las tablas se desplazaban de lado: el estado y la flecha del detalle quedaban fuera de la vista y los nombres se partían en tres renglones;
  - en la bandeja de la institución, «Descargar CSV» quedaba solo en un segundo renglón de la barra de filtros, y el ícono de la conversación bajaba a su propia línea con nombres largos de empresa;
  - el margen superior de «Inicio» variaba 16 px entre vistas;
  - el programa de cada oportunidad se pegaba al título y se partía a media frase;
  - los totales del pie no tenían separador de miles («2369 alumnos»), y las descripciones usaban el mismo tono que el contenido.
- **Esqueleto a la medida (`ui/TableSkeleton.tsx`, nuevo):**
  - cada listado declara sus columnas una vez (`TableColumn`) y de ahí salen el encabezado de la tabla (`TableHead`) y su esqueleto;
  - el esqueleto dibuja la misma tarjeta, el mismo encabezado real y ocho filas con huesos que imitan cada columna: texto con su línea secundaria, pastilla del alumno o del perfil, clave monoespaciada, habilidades, estado, acciones y flecha; con paginación, también el pie;
  - el marco reserva el espacio desde el primer pintado y los huesos aparecen si la espera pasa de 300 ms (`useSkeletonDelay`); la carga se anuncia en un `role="status"`.
- **Tarjetas en el celular (600 px o menos):** cada fila se apila como una tarjeta; cada celda declara su papel con `data-cell`:
  - lo que identifica va primero y resaltado (apellidos y nombre en una línea: «Aguilar Ávila, Fernanda»);
  - los datos breves van atenuados en una línea, separados por un punto medio («Polotitlán · 5 lugares»);
  - las pastillas de estado van al pie, las acciones de cuenta lado a lado y la flecha fija a la derecha;
  - donde hace falta, se agrega la unidad que da el encabezado («lugares», «Alta:», «Recibida el», «Enviada el»);
  - volver de una fila o recibir mensajes tiñe la tarjeta completa;
  - el encabezado sigue en el documento para los lectores de pantalla.
- **Consistencia:**
  - «Descargar CSV» sube junto a la descripción de la bandeja, como la acción principal de los demás listados, y la búsqueda y los tres selectores caben en una fila;
  - el ícono de la conversación se queda junto al nombre de la empresa;
  - el mismo margen de «Inicio» en todas las vistas;
  - las descripciones van en `--text-muted`, con un ancho de lectura de 62 caracteres;
  - el programa de la oportunidad va en su propia línea atenuada;
  - los totales del pie llevan separador de miles.
- **Pruebas:**
  - Vitest de `src/ui/TableSkeleton.test.tsx` (nuevo): marco y encabezado inmediatos, huesos tras el retardo, papeles y formas de cada celda, y encabezado compartido;
  - `Institutions.test.tsx`: la tabla real lleva `stack-mobile` y los papeles de sus celdas;
  - las pruebas existentes de los ocho listados siguen pasando.
  
  Revisión visual de los ocho listados con los datos de la simulación, a 1440 y 390 px, cargados y cargando, en claro y oscuro, sin desborde horizontal.
- **Limitación:** en el celular las filas se muestran con `display: flex`. Los navegadores actuales conservan la semántica de tabla para los lectores de pantalla, pero algunos lectores antiguos podrían leerlas como texto corrido.

### T-S14-09 — Corrección: el nombre de la cuenta volvía al anterior después de cambiarlo

**Estado:** Implementada (19 de noviembre de 2026) en `chore/ui-polish-lists`, sin commit. Reportada por el responsable: un cambio de nombre se veía un momento y después regresaba al anterior.

- **Causa:** el nombre de la persona vive en dos lugares, la cuenta (`users.name`) y el contacto de la empresa (`companies.contact_name`). «Soy yo» los unía en una sola dirección y con una copia vieja:
  - al renombrarse en Tu perfil, solo cambiaba la cuenta; el contacto conservaba el nombre anterior y la ficha de la empresa lo seguía mostrando;
  - al guardar después cualquier otro dato del perfil de la empresa (por ejemplo, el teléfono), el formulario mandaba siempre el nombre del contacto como `account_name`, aunque nadie lo hubiera tocado, y el servidor devolvía la cuenta al nombre anterior. La bitácora de la simulación lo muestra: un `account_updated` de nombre seguido de guardados del perfil sin cambio de contacto.

  Es de la misma familia que T-S14-02: el formulario tomaba los datos de la cuenta como si fueran del contacto, y no al revés.
- **Corrección en el servidor:**
  - `PATCH /api/me`: si la persona es el contacto de su empresa (el correo del contacto es el de la cuenta, sin distinguir mayúsculas), el contacto se renombra en la misma transacción y la bitácora registra `organization_profile_updated` con `["contact_name"]`. Si el contacto es otra persona, no se toca;
  - `PUT /api/organization/profile`: `account_name` solo renombra la cuenta si el nombre del contacto cambió en ese guardado o la cuenta aún tiene el nombre provisional (M3). Una copia vieja ya no revierte nada.
- **Corrección en la interfaz:**
  - el formulario manda `account_name` solo si el nombre se corrigió en él;
  - al renombrarse con el formulario abierto, el campo que no se ha tocado sigue al nombre nuevo;
  - la ficha de la empresa se vuelve a leer al cambiar el nombre de la cuenta.
- **Pruebas:**
  - Pest `AccountTest`: renombrarse actualiza el contacto propio, con sus dos eventos, y deja intacto el de otra persona;
  - Pest `OrganizationProfileTest`: un `account_name` viejo con el contacto sin cambios no revierte la cuenta, y corregir el contacto sí la corrige;
  - Vitest `AccountPage.test.tsx`: renombrarse y luego guardar el perfil no revierte el nombre; el formulario abierto sigue al nombre nuevo; una copia vieja no manda `account_name`; corregir el nombre en el formulario sí lo manda;
  - `OrganizationProfile.test.tsx`: ajustada, porque esperaba `account_name` aunque el nombre no cambiara.

  Las dos pruebas de Vitest que reproducen la reversión (renombrarse y guardar después; copia vieja del formulario) fallaban antes de la corrección.

### Auditoría del flujo de oportunidades (19 de noviembre de 2026)

El responsable pidió auditar la lógica y el flujo de las oportunidades duales. Hallazgos y decisiones:

| Tema | Hallazgo | Decisión |
| --- | --- | --- |
| Habilidades | El catálogo es abierto y compartido: lo que se escribe en una oportunidad o un CV se agrega para todos, con el tipo (técnica o blanda) de quien lo crea primero. Por eso el buscador, que solo elige del catálogo, encuentra después esas habilidades. Riesgos: errores de captura y duplicados. | Sin cambios, por decisión del responsable. |
| Periodo mínimo | La oportunidad pedía tipo y número, pero nunca se validaban, y el filtro del buscador compara solo el número. El selector de tipo sugería excluir al plan cuatrimestral. | T-S14-10: solo el número. |
| Lugares | Al aceptar se bloqueaba solo la solicitud, sin contar las aceptadas: varias instituciones podían exceder los lugares, también a la vez. La empresa podía bajar los lugares por debajo de los cubiertos. | T-S14-11: control atómico del cupo. |
| Alumno aceptado varias veces | Un alumno puede quedar aceptado en varias oportunidades a la vez, sin que la institución lo vea al responder. | T-S14-12: aviso a la institución. |
| Lugar ocupado para siempre | Una aceptada era final y nunca liberaba su lugar. | T-S14-13: baja por la institución o la empresa. |

### T-S14-10 — Periodo mínimo sin tipo

**Estado:** Implementada (19 de noviembre de 2026) en `feat/s14-opportunity-rules`; publicada en `main`. Solicitada por el responsable.

- **Migración** `2026_11_20_000001_drop_period_type_from_opportunities`: elimina `opportunities.period_type` y su CHECK. El periodo del alumno no cambia.
- **Contrato:** `POST` y `PUT /api/opportunities` ya no piden `period_type`; si llega, se ignora. Las respuestas de la oportunidad y del detalle de la solicitud de la institución dejan de incluirlo. `period_number` sigue de 1 a 15.
- **Interfaz:**
  - el formulario pide «Periodo mínimo» con opciones «6.º o posterior» y la ayuda «Semestre o cuatrimestre, según el plan de estudios del alumno»;
  - el detalle de la empresa y el de la institución muestran «6.º o posterior, semestre o cuatrimestre».
- **Pruebas:**
  - Pest `OpportunityTest`: un `period_type` enviado se ignora, no se devuelve y la columna ya no existe; los datos de prueba de las oportunidades lo dejan de enviar;
  - Vitest: el formulario sin el selector de tipo y con su ayuda, y el detalle;
  - E2E `opportunities.spec.ts` y `support/company.ts`, ajustadas.

### T-S14-11 — Control atómico de los lugares de una oportunidad

**Estado:** Implementada (19 de noviembre de 2026) en `feat/s14-opportunity-rules`; publicada en `main`. Solicitada por el responsable.

- **Aceptar** (`PATCH /api/institution/linkage-requests/{id}/decision` con ACEPTADA), en una transacción y en este orden fijo:
  1. se lee la solicitud propia (anti-IDOR);
  2. se bloquea la oportunidad (`FOR UPDATE`);
  3. se bloquea la solicitud y se comprueba que siga pendiente;
  4. se cuentan las aceptadas de todas las instituciones;
  5. con el cupo lleno, responde `422` («La oportunidad ya cubrió sus N lugares. Puedes rechazar la solicitud.») sin cambios.

  Dos aceptaciones simultáneas se ordenan y la segunda recibe el `422`. Rechazar nunca bloquea la oportunidad.
- **Enviar una solicitud** (`POST /api/linkage-requests`): con el cupo lleno responde `422` en `opportunity_id` («… Amplía los lugares para enviar más solicitudes.»). El `FOR SHARE` que ya tomaba sobre la oportunidad espera a una aceptación en curso.
- **Editar la oportunidad:** reducir los lugares nunca los deja por debajo de los cubiertos (`422` en `vacancies`); la fila se bloquea antes de contar. Solo se valida cuando los lugares bajan: una oportunidad con más aceptadas que lugares, de antes de la regla, sigue editable en lo demás.
- **Contrato:** `accepted_count` (lugares cubiertos) en el listado, el detalle y las opciones de la oportunidad, y en la oportunidad de la bandeja y del detalle de la institución. La bandeja lo carga en la misma consulta, sin una por fila.
- **Interfaz:**
  - «2 de 5 lugares cubiertos» y la etiqueta «Cupo lleno» (`PlacesStatus`) en el listado y el detalle de la empresa y en el detalle de la institución;
  - en el formulario de edición, la ayuda «Ya hay N lugares cubiertos: los lugares no pueden ser menos» y la validación local;
  - en la hoja de solicitud, las oportunidades llenas aparecen deshabilitadas con «Cupo lleno»;
  - si todas están llenas, el perfil explica que se pueden ampliar los lugares y enlaza a las oportunidades;
  - en el detalle de la institución, con el cupo lleno, «Aceptar solicitud» se deshabilita con su explicación y «Rechazar» sigue disponible. Si otra institución cubrió el último lugar mientras decidía, se muestra el aviso del servidor con «Actualizar solicitud».
- **Pruebas:**
  - Pest `LinkageDecisionTest`: aceptar hasta llenar el cupo, la siguiente con `422` sin cambios y rechazar permitido; las aceptadas de otras instituciones cuentan; el orden de bloqueo (oportunidad, solicitud y conteo) verificado con `DB::listen`; rechazar no bloquea la oportunidad;
  - Pest `LinkageRequestTest`: solicitud con el cupo lleno con `422` y permitida tras ampliar; opciones con los lugares;
  - Pest `OpportunityTest`: `accepted_count`, y lugares por debajo de los cubiertos con `422`;
  - Vitest: disponibilidad con el cupo lleno, opción deshabilitada, aviso del perfil, botón deshabilitado y `422` de la carrera en el detalle de la institución, ayuda y validación de los lugares;
  - E2E `opportunity-places.spec.ts` (nueva): con 1 lugar, la institución acepta una solicitud, la segunda ya no se puede aceptar, y la empresa ve «1 de 1 lugar cubierto» y «Cupo lleno».
- **Concurrencia real (simulación):** dos instituciones distintas aceptaron a la vez, desde dos navegadores con sesiones propias y sincronizados al mismo milisegundo, el último lugar de la oportunidad 609 (2 lugares, 1 cubierto):
  - una recibió `200` con 2 de 2 lugares cubiertos;
  - la otra recibió `422` («La oportunidad ya cubrió sus 2 lugares») y tardó 191 ms contra 138, esperando el bloqueo;
  - en la base quedaron exactamente 2 aceptadas.

  Después se devolvieron las dos solicitudes a pendiente y se restauraron las contraseñas de las cuentas usadas.
- **Datos anteriores a la regla:** la simulación tenía 260 oportunidades con más aceptadas que lugares, generadas antes de esta regla; lo mismo podría haber en datos reales. Se tratan como cupo lleno: no admiten más aceptaciones ni solicitudes y siguen editables. Las aceptadas no se tocan.
- **Migración aplicada en la simulación** y cola reiniciada.

### T-S14-12 — Aviso de otras vinculaciones aceptadas del alumno

**Estado:** Implementada (20 de noviembre de 2026) en `feat/s14-opportunity-rules`; publicada en `main`. Solicitada por el responsable (opción «Avisar a la institución»).

- **Contrato:** el detalle de la institución (`GET /api/institution/linkage-requests/{id}`) agrega `student_accepted_elsewhere`: las otras solicitudes ACEPTADAS del mismo alumno, solo de la institución de la sesión, con `id`, `company` (nombre visible o «Empresa sin nombre»), `opportunity` y `responded_at`. No incluye la solicitud consultada ni ningún dato del alumno.
- **Interfaz:** mientras la solicitud está pendiente, la sección «Responder solicitud» muestra una nota discreta con cada empresa y oportunidad y la sugerencia de considerar la disponibilidad del alumno. Aceptar sigue permitido: la institución decide.
- **Pruebas:** Pest `LinkageTerminationTest` (otras aceptadas, sin la actual y con los campos exactos); Vitest (la nota y el botón habilitado).

### T-S14-13 — Baja de una vinculación aceptada

**Estado:** Implementada (20 de noviembre de 2026) en `feat/s14-opportunity-rules`; publicada en `main`. Solicitada por el responsable (opción «Baja por cualquiera»).

- **Migración** `2026_11_20_000002_add_termination_to_linkage_requests`:
  - estado nuevo `BAJA` («Dada de baja») en el CHECK de `status`;
  - columnas `terminated_at`, `terminated_by` (FK a `users`), `terminated_party` (`COMPANY` o `INSTITUTION`) y `termination_reason`;
  - un CHECK exige que, con `BAJA`, estén los cuatro datos de la baja, y sin ella, ninguno.
- **Contrato:** `PATCH /api/institution/linkage-requests/{id}/termination` y `PATCH /api/linkage-requests/{id}/termination`, con `{reason}` obligatorio (hasta 500 caracteres, sin datos de contacto, sin otros campos).
  - Solo procede una solicitud propia (si es ajena o no existe, `404`) y ACEPTADA (si no, `422` sin cambios). La fila se bloquea, así que las dos partes no pueden darla de baja a la vez.
  - Las respuestas agregan `termination` con `at`, `party`, `reason` y `by`; `by` (la cuenta que la registró) solo llega al lado que la registró.
- **Efectos:**
  - la baja libera el lugar, porque la oportunidad solo cuenta las ACEPTADAS, y una solicitud pendiente de la misma oportunidad se puede aceptar de nuevo;
  - la conversación conserva su historial en solo lectura: se puede consultar y marcar como leída, pero no escribir (`422`), y `can_write` es falso;
  - la bandeja, su filtro de estado, el CSV y el reporte ejecutivo incluyen «Dada de baja»;
  - como una cancelada, no impide volver a solicitar el perfil para esa oportunidad.
- **Interfaz:**
  - en el detalle de la institución y en el de la empresa, con la solicitud aceptada, la sección «Baja de la vinculación» explica cuándo usarla y ofrece «Dar de baja». Abre una hoja con el motivo obligatorio y la validación local de datos de contacto;
  - después, la sección muestra quién la registró («Tu institución (nombre)» o «La empresa»), la fecha, el motivo y que el lugar quedó libre;
  - la conversación muestra el historial con el aviso de solo lectura y deja de consultarse cada 15 s;
  - el estado usa los tokens de estado inactivo.
- **Pruebas:**
  - Pest `LinkageTerminationTest`:
    - la institución y la empresa dan de baja, con el lado y la cuenta registrados;
    - el otro lado no ve la cuenta;
    - el lugar se libera y una pendiente ya se puede aceptar;
    - pendiente, rechazada o cancelada responden `422`;
    - una solicitud ajena responde `404`;
    - sin CSRF, `419`;
    - un motivo vacío o con un correo, o un campo ajeno, responden `422`;
    - la conversación queda en solo lectura;
    - el CHECK de la base impide una baja sin sus datos.
  - Pest: contratos de la bandeja, el detalle y el reporte con `termination` y `BAJA`.
  - Vitest: baja desde la institución (validaciones, petición y resultado), baja registrada por la empresa vista por la institución, baja desde la empresa, sin baja en una pendiente, y la conversación dada de baja en solo lectura sin consultas periódicas.
- **Verificación:** Pest completo 1652 de 1652; E2E 46 de 46 (`reports.spec.ts` ajustada: el embudo tiene la fila «Dada de baja»); migración aplicada en la simulación.
- **Fuera de alcance:** la baja no envía aviso por correo; el otro lado la ve en su bandeja y en el detalle. La bitácora (`/audit-events`) no la registra; la fila guarda quién, cuándo y por qué.


### T-S14-14 — Cada vista empieza arriba

**Estado:** Implementada (20 de noviembre de 2026) en `feat/s14-opportunity-rules`; publicada en `main`. Reportada por el responsable: al entrar a un apartado del panel, las tablas y el feed no empezaban desde arriba.

- **Causa:** al cambiar de ruta nadie regresaba la página arriba, así que la vista nueva heredaba el desplazamiento de la anterior. Por ejemplo, desde el inicio con la vista bajada, `/talent` arrancaba en 265 px y `/linkage-requests` en 355 px.
- **Corrección** (`useRouteTransition` en `App.tsx`): toda navegación nueva (`PUSH` o `REPLACE`) a otra ruta lleva la página arriba.
  - Volver con «Atrás» (`POP`) lo deja al navegador y a la memoria de las tablas (T-S13-12), que devuelve la fila a su lugar.
  - Una URL con ancla (`#organization`) ubica su propia sección.
- **Verificación:**
  - en la simulación, entrando desde el inicio arriba y abajo, las tres secciones de la empresa, las tres de la institución y el feed de Historias empiezan en 0 px, a 1440 y 390 px;
  - Vitest de `AppShell.test.tsx` comprueba el regreso arriba al entrar a una sección y al volver al inicio por su enlace.
- **Entorno de desarrollo:** tenía 7 migraciones pendientes, de `2026_11_17_000001` (mensajes) a `2026_11_20_000002` (baja). Con el código actual, varias pantallas fallaban ahí; por ejemplo, registrar una oportunidad exigía el tipo de periodo que ya no existe. Se aplicaron y se reinició la cola.
- **E2E:** `support/students.ts` (`publishStudent`) espera a que el CV esté listo, comprueba el titular escrito y espera la respuesta de su guardado. Fallaba de forma intermitente con la máquina cargada. Suite completa: 46 de 46.

### T-S14-15 — Control de la institución sobre sus datos

**Estado:** Implementada (20 de noviembre de 2026) en `feat/s14-institution-profile`; publicada en `main`. Solicitada por el responsable: aplicar a la institución las mismas reglas de control que tiene la empresa sobre su perfil.

- **Decisiones del responsable:**
  - la institución edita su nombre oficial y su CCT;
  - su contacto se vincula con la cuenta («Soy yo»), con la corrección de T-S14-09;
  - el formato del CCT se valida solo cuando se escribe uno nuevo;
  - el administrador conserva la edición, como la Secretaría con las empresas (M4);
  - cada cambio queda en la bitácora, sin avisos por correo (M2).
- **Contrato:** `PUT /api/organization/profile` de la institución admite `name`, `cct`, `contact_*` y `account_name`.
  - Nombre oficial y CCT obligatorios si se envían; un guardado solo del contacto los conserva.
  - CCT único entre instituciones, normalizado (mayúsculas, sin espacios ni guiones).
  - Formato de la SEP (`App\Rules\WorkCenterKey`): 2 dígitos de la entidad, 3 letras, 4 dígitos y 1 letra. Se exige solo a un CCT nuevo; uno anterior a la regla, incluso con guiones o minúsculas, se conserva tal cual mientras equivalga al registrado.
  - El contacto conserva su nombre y correo obligatorios.
  - Cualquier otro campo, `422`.
  - `organization_profile_updated` registra los campos que cambiaron, ahora también `name` y `cct`.
- **«Soy yo» (T-S14-09):**
  - `account_name` renombra la cuenta de la institución solo si el nombre del responsable cambió en ese guardado (o la cuenta tiene el nombre provisional);
  - `PATCH /api/me` renombra al responsable si es la misma persona (el correo del contacto es el de la cuenta).
- **Administración:** el alta y la edición de instituciones normalizan el CCT con la misma regla; el formato se exige en el alta y, en la edición, solo si el CCT cambia.
  - **Cambio de una regla anterior:** el CCT ya no se guarda tal cual. Antes «exact-cct» y «Exact-Cct» convivían; ahora la unicidad se aplica al valor normalizado.
- **Interfaz:**
  - Mi cuenta de la institución muestra «Datos de la institución» (nombre oficial y CCT) sin la nota «Los mantiene la Administración»;
  - «Editar» abre en la tarjeta el nombre oficial, el CCT (con la ayuda del formato, validación al salir del campo y mayúsculas) y el responsable con «Soy yo»;
  - al guardar, la sesión refleja el nombre de la institución (Tu perfil y el menú) y, si cambió, el de la cuenta.
  - La lógica de «Soy yo» se extrajo a `account/useSelfContact.ts`, que comparten la empresa y la institución; el formulario de la empresa no cambia de comportamiento.
- **Pruebas:**
  - Pest `OrganizationProfileTest`: corrección de nombre y CCT normalizado con su bitácora; CCT inválido, repetido (también en minúsculas) o heredado sin cambiar; nombre vacío; «Soy yo» sin revertir con una copia vieja; la institución sigue sin capturar datos de empresa;
  - Pest `AccountTest`: renombrar la cuenta actualiza al responsable de la institución;
  - Pest `InstitutionTest`: normalización, formato y unicidad normalizada en el alta, y un CCT heredado conservado al editar otros datos;
  - Vitest: ficha y edición de la institución, formato en línea, carga útil normalizada sin `account_name`, «Soy yo» que sí renombra, y la sesión con el nombre nuevo;
  - E2E `institution-profile.spec.ts` (nueva): la institución corrige su nombre y su CCT y Administración los ve en su listado. Las specs que dan de alta instituciones usan `randomCct()` con el formato SEP.

  Revisión visual de la tarjeta a 1440 y 390 px, en claro y oscuro, sin desborde horizontal. Verificación: Pest completo 1657 de 1657 y E2E 47 de 47.

### T-S14-16 — Avisos del inicio de la institución, en una línea

**Estado:** Implementada (20 de noviembre de 2026) en `feat/s14-alerts-messages`; publicada en `main`. Solicitada por el responsable: los avisos de la institución ocupaban mucho espacio, como antes el del perfil de la empresa.

- **Antes:** «3 solicitudes de vinculación pendientes» y «9 alumnos con datos faltantes» eran dos tarjetas grandes, con borde lateral, descripción y enlace, que ocupaban casi un tercio de la pantalla.
- **Ahora** (`HomeTask`): cada aviso es una línea discreta, como el recordatorio del perfil (T-S14-01).
  - Pastilla de 44 px toda tocable, con el ícono en una chapa pequeña, el conteo («129 solicitudes esperan tu respuesta», «1,337 alumnos con datos por completar») y «Revisar ›» al final.
  - Uno junto al otro en pantallas anchas y apilados en el celular. El tono de marca es para las solicitudes y el de estado inactivo para los datos faltantes.
  - El enlace se anuncia por su acción («Revisar solicitudes», «Revisar el padrón») y el conteo es su descripción accesible. El detalle vive en la bandeja y en el padrón.
- **Pruebas:** Vitest de `SessionPage.test.tsx` (textos, descripción accesible, destino y clases); E2E de `home-dashboard.spec.ts` y `talent-search.spec.ts` con los textos nuevos.

### T-S14-17 — Mensajes sin leer en la barra superior, en tiempo casi real

**Estado:** Implementada (20 de noviembre de 2026) en `feat/s14-alerts-messages`; publicada en `main`. Solicitada por el responsable para empresa e institución.

- **Decisión del responsable:** consulta frecuente por ahora, con la opción de usar WebSockets en producción más adelante.
- **Transporte** (`linkage/unreadTransport.ts`, nuevo):
  - el resumen (`…/unread-summary`, sin cambios de contrato) se consulta cada 10 s con la pestaña visible y cada 60 s oculta, para los avisos del navegador;
  - también al instante al volver a la pestaña o a la ventana, al marcar una conversación como leída y al navegar;
  - las pestañas abiertas comparten el resultado por `BroadcastChannel`.
  - `UnreadSummaryProvider` usa este transporte. Es el único punto que sabe cómo llega el resumen: para WebSockets (Laravel Reverb, sin Redis en una instancia), otro transporte con la misma firma escucharía un evento de difusión en el canal privado de la organización y llamaría a `refresh()`, sin cambiar la interfaz.
- **Barra superior** (`ui/MessagesMenu.tsx`, nuevo), junto al menú de cuenta, solo para empresa e institución:
  - ícono de mensajes de 44 px con la insignia del número de conversaciones sin leer (rebota al cambiar; «99+»). Nombre accesible «Mensajes sin leer: 3 conversaciones» o «Mensajes, sin pendientes»;
  - el panel, con el lenguaje del menú de cuenta, lista cada conversación (la otra organización, la oportunidad y cuántos mensajes) con enlace a su chat, más «Ver todas las solicitudes». Sin pendientes: «Estás al día»;
  - se cierra con Esc, con un clic fuera o al navegar.
- **Aviso breve al llegar un mensaje:**
  - Snackbar global (`ui/SnackbarProvider.tsx`; `Snackbar` admite ahora ícono y acción) con «Mensaje nuevo de …» y «Ver», que abre la conversación; con varias conversaciones, «Mensajes nuevos en N conversaciones» y «Ver» abre el panel;
  - lo que ya estaba sin leer al entrar no se avisa, ni la conversación abierta y a la vista;
  - con la pestaña a la vista avisa la Snackbar; el aviso del navegador (`LinkageNotifier`) queda para cuando la pestaña está oculta, así no se duplican.
- **Pruebas:**
  - Vitest:
    - `unreadTransport.test.ts` (nuevo): 10 s, 60 s, consulta al volver, `refresh` y `stop`, y sincronización entre pestañas;
    - `MessagesMenu.test.tsx` (nuevo): insignia, panel con enlaces, estado vacío, Esc, sin el menú para ADMIN ni SECRETARY, aviso con «Ver», sin aviso en la línea base ni en la conversación abierta;
    - ajustadas: `UnreadMessages` (10 s a la vista), `LinkageNotifier` (sin aviso del navegador con la pestaña visible), `App.test` (dos botones en la barra) y las pruebas de alumnos, que responden el resumen aparte.
  - E2E `talent-search.spec.ts`: el mensaje de la institución aparece en la barra de la empresa y su panel lleva a la conversación; al leerla, la barra queda sin pendientes.
- **Revisión visual** en la simulación (con el resumen simulado para ver la lista y el aviso) a 1440 y 390 px, en claro y oscuro, sin desborde horizontal.
- **Verificación:** Vitest completo, salvo las descargas conocidas; E2E 47 de 47. Sin cambios en el backend.

### T-S14-18 — Videos que no se reproducían en algunos navegadores: versión WebM de respaldo

**Estado:** Implementada (20 de noviembre de 2026) en `feat/s14-videos-carousel`; publicada en `main`. Reportada por el responsable: con la cuenta de la Secretaría, los videos del feed no se reproducían.

- **Causa (verificada):** no dependía del rol, sino del navegador.
  - Los videos se procesan en MP4 H.264 (`VideoProcessor`, `libx264`). El Firefox de Fedora del equipo del responsable trae `ffmpeg-free` sin `openh264` y no decodifica H.264: `canPlayType` responde «probably», pero la reproducción falla con `MEDIA_ERR_DECODE` («Failed to decode media»).
  - En la simulación, con Chromium, el mismo video se reproduce igual con la Secretaría que con la empresa.
  - Una versión WebM (VP9 y Opus) del mismo video sí se reproduce en ese Firefox, tanto local como servida por la simulación con su URL firmada.
- **Corrección:**
  - **Procesamiento:** el job genera, además del MP4, una versión WebM (VP9 CRF 34 y Opus 96k) a partir del MP4 ya procesado, con sus mismas medidas y sin metadatos. Si solo esa conversión falla, el video queda listo con su MP4 (se registra el motivo).
  - **Migración** `2026_11_20_000003_add_webm_to_institution_videos`: `webm_path` opcional.
  - **Servicio:** la ruta firmada de medios sirve `.webm` (`video/webm`, con Range). La galería y la gestión de videos de la institución agregan `webm_url` (o `null`). Al eliminar un video también se borra su WebM.
  - **Reproductor:** usa el MP4, que se decodifica por hardware casi en todos lados, incluido Safari. Si el navegador no puede decodificarlo (error de formato 3 o 4) y hay WebM, cambia a él sin mostrar el error, sigue reproduciendo y lo recuerda para los demás videos de la sesión. Un error de red o de URL vencida conserva su «Reintentar».
  - **Videos existentes:** el comando `php artisan videos:webm [--limit=N]` genera el WebM de los videos listos que no lo tienen; un fallo no detiene a los demás. Se aplicó en la simulación (10 de 10).
- **Costo:** el procesamiento tarda más (VP9 es más lento que H.264) y cada video ocupa más espacio en el disco de medios (los dos formatos).
- **Pruebas:**
  - Pest:
    - `ProcessInstitutionVideoTest`: WebM generado con VP9 y Opus, sin metadatos; falla solo del WebM con el video listo; y con ffmpeg real, un WebM VP9 y Opus con las mismas medidas y sin ubicación;
    - `PromotionalVideoGalleryTest`: `webm_url` firmada, `video/webm` con 206 y 403 sin firma;
    - `InstitutionVideoManagementTest`: el contrato y el borrado del WebM;
    - `GenerateVideoWebmTest` (nueva): el comando, sus fallos y `--limit`.
  - Vitest `VideoPlayerFallback.test.tsx` (nuevo): cambio a WebM ante un error de decodificación y preferencia recordada; sin cambio ante un error de red; sin WebM, o si el WebM también falla, se muestra el error.

### T-S14-19 — Carrusel de Historias del Dual también para la institución y la Secretaría

**Estado:** Implementada (20 de noviembre de 2026) en `feat/s14-videos-carousel`; publicada en `main`. Solicitada por el responsable (opción «Agregarlo en los tres»).

- **Inicio:** el carrusel aparece en el inicio de la empresa, la institución y la Secretaría (no el del administrador).
- **Institución:** puede consultar la galería (`GET /promotional-videos`) y el feed `/promocion`, con las historias de todas las instituciones activas. Solo lectura: inactivar sigue siendo exclusivo del administrador, y no ve las acciones de la empresa.
- **Pruebas:**
  - Pest: la institución consulta la galería con las historias de todas las instituciones;
  - Vitest: el carrusel en el inicio de la institución y de la Secretaría, y no en el del administrador; la institución ve el feed sin acciones de empresa ni de moderación;
  - las pruebas del inicio de la Secretaría y de la institución responden la galería aparte.

### T-S14-20 — Las 3 pruebas de descarga que fallaban

**Estado:** Implementada (20 de noviembre de 2026) en `feat/s14-videos-carousel`; publicada en `main`. Solicitada por el responsable.

- **Causa:** las tres pruebas (CSV de la bandeja de la institución, CSV del reporte ejecutivo y comprobante PDF del seguro) armaban la respuesta simulada con `new Response(new Blob([...]))`. El `Blob` de jsdom no tiene `.stream()`, que el `Response` de Node necesita, así que fallaban antes de llegar a la aplicación.
- **Implicación:** no había un error en la aplicación, pero esas descargas no se verificaban en Vitest (las de CSV sí en la E2E).
- **Corrección:** el cuerpo va como texto con su `Content-Type`, como lo entrega el servidor. Las tres pasan, y Vitest completo ya no tiene fallas conocidas.

**Verificación de T-S14-18 a T-S14-20:** Pest completo 1663 de 1663, E2E 47 de 47 y Vitest completo sin fallas conocidas. Las migraciones se aplicaron en la simulación y en desarrollo, y `videos:webm` en la simulación.
