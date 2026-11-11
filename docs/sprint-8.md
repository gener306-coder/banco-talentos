# Sprint 8 — Afinación previa al despliegue

Sprint vigente del 29 al 31 de octubre de 2026; cerrado con todas sus historias y tareas completadas. Sprint anterior: [sprint-7.md](sprint-7.md) (histórico). Sprint siguiente: [sprint-9.md](sprint-9.md).

**Objetivo del Sprint:** afinar la usabilidad y el rendimiento del sistema antes del despliegue, empezando por el módulo de alumnos. La institución podrá encontrar a cualquier alumno por matrícula o nombre, con una tabla coherente con el resto del sistema, y completar el expediente justo después de registrarlo. Se aplican además las recomendaciones de la simulación de carga ([simulacion-carga.md](simulacion-carga.md)).

**Story Points:** 13 (HU-S8-01 a HU-S8-03; HU-S8-03 se aprobó durante el Sprint), más tareas técnicas: T-S8-01 (opcional, 2) y las afinaciones T-S8-02 y T-S8-03.

## Fuera de alcance

- Búsqueda que ignore acentos (por ejemplo, que «Lopez» encuentre «López»): requiere la extensión `unaccent` de PostgreSQL. Puede proponerse como afinación posterior.
- Cambios en el expediente, el CV o el seguro facultativo más allá de cómo se llega a ellos.
- Concurrencia y despliegue en un servidor de producción.

## Orden de implementación sugerido

1. **HU-S8-01** Búsqueda y filtrado del padrón de alumnos.
2. **HU-S8-02** Continuar con el expediente después de registrar un alumno.
3. **T-S8-01** Reporte ejecutivo con una sola agregación (opcional).
4. **T-S8-02**, **T-S8-03** y **HU-S8-03**: afinaciones pedidas durante el Sprint (filtros de los listados, logotipo y modo oscuro).

---

## HU-S8-01 — Búsqueda y filtrado del padrón de alumnos

**Estado:** Completada (29 de octubre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S8-01.md`  
**Story Points:** 5  
**Rol:** `INSTITUTION`

### Historia de usuario

**COMO** institución educativa  
**QUIERO** buscar a mis alumnos por matrícula o nombre y filtrarlos por estado  
**PARA** encontrar a cualquiera sin recorrer el padrón página por página.

### Criterios de aceptación

- **CA-01.** [Búsqueda y filtro en la API]
  - `GET /api/students` acepta `q`, de hasta 100 caracteres, y busca sin distinguir mayúsculas en la matrícula, los nombres y los dos apellidos.
  - La búsqueda es literal: `%` y `_` no actúan como comodines, igual que la de Empresas.
  - Acepta también `status`, con los valores `active` o `inactive`.
  - Un parámetro inválido responde `422`.
- **CA-02.** [Aislamiento y orden] Solo devuelve alumnos de la institución de la sesión, ordenados por apellidos y nombre y paginados de 50 en 50, como hoy. El total y el número de páginas reflejan la búsqueda y el filtro.
- **CA-03.** [Buscador en la interfaz]
  - En `/students` hay un campo «Buscar por matrícula o nombre» y un selector «Estado» (todos, activos o inactivos) sobre la tabla, con el mismo patrón que el listado de Empresas.
  - Al buscar o filtrar se vuelve a la página 1, y el contador muestra los resultados.
  - Si nada coincide, aparece «Ningún alumno coincide con la búsqueda.» con una acción para limpiar los filtros.
- **CA-04.** [Tabla coherente con el sistema]
  - La tabla agrega la columna «Acciones», con el enlace «Ver detalle» con el mismo estilo y nombre accesible que en Instituciones y Empresas («Ver detalle de {apellidos}, {nombre}»).
  - La fila completa abre el detalle con el puntero.
  - Los apellidos dejan de ser el enlace.
- **CA-05.** [Rendimiento] Se agrega el índice `students (institution_id, is_active)` que recomendó la simulación de carga. En la simulación, con unos 43 000 alumnos y una institución de unos 4000, el padrón con búsqueda responde con un p95 menor de 3 s.

---

## HU-S8-02 — Continuar con el expediente después de registrar un alumno

**Estado:** Completada (29 de octubre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S8-02.md`  
**Story Points:** 3  
**Rol:** `INSTITUTION`  
**Dependencia:** ninguna (puede hacerse antes o después de HU-S8-01)

### Historia de usuario

**COMO** institución educativa  
**QUIERO** que, al registrar un alumno, se me ofrezca completar su expediente de inmediato  
**PARA** no tener que buscarlo en el padrón para capturar sus demás datos.

### Criterios de aceptación

- **CA-01.** [Pregunta al registrar]
  - Al guardar el registro básico (matrícula y nombre), la hoja confirma «Alumno registrado: {nombre}» y pregunta qué sigue, con dos acciones:
    - **Completar expediente**, la acción principal;
    - **Registrar otro alumno**, que limpia el formulario para el siguiente, como hoy.
  - Cerrar la hoja también es válido.
- **CA-02.** [Completar expediente] Cierra la hoja y abre el detalle del alumno recién creado (`/students/:id`) con el foco en la sección «Expediente público». Desde ahí siguen disponibles el seguro facultativo y el CV profesional.
- **CA-03.** [Padrón actualizado] Al volver, el padrón incluye al alumno nuevo, con o sin búsqueda activa.
- **CA-04.** [Accesibilidad]
  - La confirmación se anuncia con `role="status"` y el foco pasa a **Completar expediente**.
  - Todo el flujo funciona solo con teclado.
  - No cambia la API.

---

## T-S8-01 — Reporte ejecutivo con una sola agregación (opcional)

**Estado:** Completada (29 de octubre de 2026)  
**Story Points:** 2  
**Rol:** `ADMIN`, `SECRETARY`

Segunda recomendación de la simulación de carga:
- **Hoy:** el reporte ejecutivo (HU-S7-01) calcula los conteos por institución con 4 subconsultas por institución, y recorre la tabla de alumnos 2 veces por cada una (32 recorridos con 16 instituciones).
- **Cambio:** reescribirlos como una sola agregación por institución, con el mismo contrato y las mismas pruebas de HU-S7-01, y volver a medir con `sh scripts/simulation.sh benchmark`.

### Criterios de aceptación

- **CA-01.** La respuesta de `GET /api/reports/dual-program` y de su CSV es idéntica a la actual. Las pruebas de HU-S7-01 y HU-S7-02 siguen pasando.
- **CA-02.** La tabla de alumnos se recorre una sola vez, sin importar cuántas instituciones haya.
- **CA-03.** En la simulación, el p95 del reporte baja respecto a la medición del 29 de octubre de 2026 (371–385 ms).

### Resultado

- **Cambio aplicado:** `ReportController::byInstitution()` cuenta los alumnos activos y buscables con una sola agregación `GROUP BY institution_id` con `count(*) FILTER (…)`, y las solicitudes recibidas y aceptadas con otra. La condición de «buscable» sale de `Student::SEARCHABLE_COLUMNS`, la misma constante que usa `scopeSearchable()`, para que el reporte, el buscador y el inicio no diverjan.
- **Medición en la simulación** (42 712 alumnos, 16 instituciones, 20 peticiones HTTP):
  - reporte: de 371–385 ms a **68.6 ms** de p95 (p50 56.6 ms);
  - CSV: de 376 ms a **62.3 ms** de p95.
  - La agregación de alumnos tarda 13 ms en PostgreSQL.
- **Pruebas:** las de HU-S7-01, HU-S7-02 y el inicio pasan sin cambios. Una prueba Pest nueva comprueba que, con 1 o con 12 instituciones, la tabla de alumnos se consulta una vez y la de solicitudes dos (resumen por estado y conteo por institución).

---

## T-S8-02 — Distribución de los filtros sobre los listados

**Estado:** Completada (29 de octubre de 2026)  
**Origen:** afinación pedida por el responsable durante el Sprint, después de aprobarlo.  
**Rol:** todos los que tienen listados con filtros

**Problema:**
- **Vistas afectadas:** Alumnos, Empresas, las bandejas de solicitudes de la institución y de la empresa, y la Bitácora.
- **Qué se veía:** el buscador y el selector de estado salían apilados en columna, centrados y con huecos de unos 250 px, y la tabla quedaba muy abajo.
- **Causa:** la regla global `form { display: flex; flex-direction: column }` de `index.css`. Los formularios de filtro (`.table-search`, `.company-search`, `.linkage-filter`) declaraban `display: flex` sin fijar la dirección, así que heredaban la columna y su `flex-basis` se convertía en altura. Ocurría desde HU-S4-02 en Empresas y desde HU-S5-05 en las bandejas.

**Corrección:**
- **Un solo estilo compartido** `.table-search` en `ui/ui.css`, con `flex-direction: row`:
  - una fila alineada a la izquierda: campo de búsqueda flexible (`.table-search-field`, hasta 28 rem), filtros de ancho fijo (`.table-search-filter`) y botón;
  - en pantallas de menos de 40 rem los campos ocupan el ancho completo, uno debajo de otro.
- **Clases antiguas eliminadas:** `.company-search` y `.linkage-filter`.
- **Bandeja de la institución:** la nueva `.list-toolbar` pone el filtro a la izquierda y **Descargar CSV** a la derecha, en la misma fila sobre la tabla.
- **Verificación:** capturas en escritorio (1440 px) y móvil (390 px) de las nueve vistas de listado en la simulación de carga, antes y después. El buscador de talento, Oportunidades e Instituciones ya se veían bien y no cambian.

---

## T-S8-03 — Logotipo de mejor calidad y tamaños en el encabezado

**Estado:** Completada (29 de octubre de 2026)  
**Origen:** afinación pedida por el responsable, que entregó el logotipo a color de mejor calidad y su versión blanca para fondo oscuro.

- `logo.png` y `logob.png` se recortaron con la misma caja (sin margen transparente sobrante) y se redujeron a 404 × 480 px, de unos 750 KB a unos 130 KB cada uno.
- Encabezado: el logotipo pasa de 44 px, en los que además el dibujo quedaba encogido por el margen, a **56 px** (44 px en móvil). Login: de 128 a **144 px**.
- `width`/`height` actualizados a 404 × 480 en `App.tsx` y `LoginPage.tsx`, y la guía `docs/design/identidad-visual.md` al día.
- Verificado con capturas en escritorio y en móvil, en claro y con la demostración del tema oscuro.

---

## HU-S8-03 — Modo oscuro con el logotipo para fondo oscuro

**Estado:** Completada (29 de octubre de 2026). Aprobada por el responsable el mismo día.  
**Diseño técnico y verificación:** `docs/HU-S8-03.md`  
**Story Points:** 5  
**Rol:** todos

**COMO** usuario del Banco de Talentos  
**QUIERO** poder usar la aplicación en modo oscuro, con el logotipo blanco de Nodologístico  
**PARA** trabajar con comodidad según la preferencia de mi sistema o la que elija.

### Criterios de aceptación
- **CA-01. Activación.**
  - Se recupera la activación preparada en el commit `0ac5ccc`: `src/ui/theme.ts`, el script previo al pintado de `index.html`, `watchTheme()` en `main.tsx` y el selector **Tema: Sistema / Claro / Oscuro** en el menú de cuenta.
  - Por defecto la aplicación sigue la preferencia del sistema.
  - La elección se guarda en el navegador y el tema se aplica antes del primer pintado, sin destello claro.
- **CA-02. Logotipo.**
  - En tema oscuro se muestra `logob.png` en lugar de `logo.png`, sin pastilla clara, en el encabezado y en el login, con el mismo tamaño.
  - En claro todo queda igual que hoy.
- **CA-03. Secretaría de Economía.**
  - Su logotipo se mantiene sin cambios en ambos temas, por decisión del responsable.
  - Advertencia: el subtítulo negro «Secretaría de Economía» apenas se distingue sobre el gris oscuro. Una variante oficial para fondo oscuro tendría que pedirse a la Secretaría, porque incluye el Escudo Nacional.
- **CA-04. Contraste y regresión.**
  - Los tokens oscuros ya existentes cumplen el contraste, y lo verifica `src/ui/tokens.test.ts`.
  - `e2e/theme.spec.ts` vuelve a comprobar el tema oscuro, la persistencia del selector y el logotipo correcto en cada tema.
  - Se revisan con capturas las vistas principales en ambos temas.

---

## T-S8-04 — Campos del login con iconos, ejemplos y mostrar contraseña

**Estado:** Completada (29 de octubre de 2026)  
**Origen:** afinación pedida por el responsable durante el Sprint.  
**Rol:** todos (pantalla pública `/login`)

- **Iconos:** sobre en «Correo electrónico» y candado en «Contraseña», dentro del campo a la izquierda. Son decorativos (`aria-hidden`); las etiquetas visibles no cambian.
- **Ejemplos:** `nombre@ejemplo.com` e «Ingresa tu contraseña» como `placeholder`, sin sustituir a las etiquetas.
- **Mostrar contraseña:** botón con ojo a la derecha del campo, nombre accesible «Mostrar contraseña» y `aria-pressed`. Al enviar, la contraseña vuelve a ocultarse junto con el borrado del campo.
- **Estilos:** `.input-with-icon` en `ui/ui.css`, solo con tokens semánticos; iconos `MailIcon`, `EyeIcon` y `EyeOffIcon` en `ui/icons.tsx`.
- **Casilla «Recordar»:** evaluada y descartada por el responsable. La aplicación no guarda contraseñas; de eso se encarga el gestor del navegador (`autocomplete`). Tampoco se agrega «Mantener la sesión iniciada», por el riesgo en equipos compartidos.
- **Verificación:** prueba nueva en `App.test.tsx`; capturas en escritorio claro y oscuro y en móvil (390 px).

---

## Actualización posterior al cierre (5 de noviembre de 2026)

Afinaciones pedidas y aprobadas por el responsable el 5 de noviembre de 2026, durante el Sprint 9. Se registran aquí por su indicación, como actualización del Sprint de afinaciones.

### T-S8-05 — «Ver detalle» en las solicitudes recibidas

**Estado:** Completada (5 de noviembre de 2026)  
**Rol:** `INSTITUTION`

- El enlace usa `pill-link` con flecha, igual que los demás listados.

### T-S8-06 — Puesto del contacto y correo sin salir de la plataforma

**Estado:** Completada (5 de noviembre de 2026)  
**Rol:** `SECRETARY` (captura), `INSTITUTION` (consulta), `COMPANY` (correo de la institución)

- **Campo:** `companies.contact_position`, «Puesto o departamento del contacto (opcional)», hasta 120 caracteres.
- **Consulta:** aparece en el detalle de la empresa, en el detalle de la solicitud recibida y en el CSV de solicitudes de la institución.
- **Correo:** los enlaces `mailto:` se abren en otra pestaña (`target="_blank"`). La aplicación que responde es la predeterminada del usuario; para Gmail web, debe estar configurado como gestor de correo en el navegador.

### T-S8-07 — Seguros distintos del IMSS

**Estado:** Completada (5 de noviembre de 2026)  
**Rol:** `INSTITUTION`

- **Tipo:** `student_social_security.insurance_type`, `IMSS` u `OTHER`. Lo existente queda como `IMSS`.
- **IMSS:** el NSS conserva sus 11 dígitos, su dígito verificador y su unicidad por institución.
- **Otro seguro:** aseguradora obligatoria (`insurer_name`, hasta 120 caracteres) y número de póliza o afiliación opcional, de formato libre (`policy_number`, hasta 40 caracteres, cifrado).
- **Completo:** basta el número o el comprobante en PDF, para cualquier tipo. El aviso de la solicitud recibida solo aparece si faltan ambos, y sigue sin bloquear la decisión.
- **Cambio de tipo:** al guardarlo se borran el número y la aseguradora del tipo anterior. El comprobante se conserva hasta que se reemplace. La subida se habilita al guardar el tipo elegido, para que el PDF no quede asociado al tipo anterior.
- **Privacidad:** igual que el NSS, estos datos son de resguardo exclusivo de la institución. La API de la solicitud recibida entrega el tipo, la aseguradora y si existe número, nunca el número.

### T-S8-08 — Avisos del inicio que llevan al filtro exacto

**Estado:** Completada (5 de noviembre de 2026)  
**Rol:** `INSTITUTION`

- **Revisar el padrón:** abre el padrón filtrado por lo mismo que cuenta el aviso. T-S8-09 sustituyó el criterio de municipio por el de datos faltantes.
- **Solicitudes pendientes:** «Revisar solicitudes» abre `/institution/linkage-requests?status=PENDIENTE_INSTITUCION`.
- **URL:** ambos filtros viven en la URL, así que se conservan al recargar y al volver con el navegador.
- **Estilo:** acción `pill-link` con flecha, sin fondo ni subrayado, con el texto y la flecha resaltados en el color de su aviso. Ambos avisos llevan el remarque izquierdo en su propio color. El dato clave del aviso va en negritas, sin comillas.

### T-S8-09 — Datos faltantes del alumno

**Estado:** Completada (5 de noviembre de 2026)  
**Rol:** `INSTITUTION`

- **Criterio:** a un alumno le faltan datos si no tiene capturado algún campo del expediente público (`Student::PROFILE_ATTRIBUTES`) o si su seguro no tiene número ni comprobante. El seguro cuenta porque es requisito indispensable para que el alumno participe. El CV no cuenta. Un municipio por confirmar cuenta como municipio faltante.
- **Inicio:** el indicador `pending_municipality_students` pasa a `missing_data_students` («Datos faltantes») y el aviso dice «n alumnos tienen **datos faltantes**». Solo cuenta alumnos activos: uno dado de baja no requiere acción.
- **Padrón:** el filtro «Municipio» se sustituye por «Datos faltantes» (`/students?data=missing`), para no confundirlo con el estado o municipio geográfico. «Revisar el padrón» abre `/students?data=missing&status=active`; el filtro «Estado» también vive en la URL, y el padrón permite consultar a los inactivos. `Student::withMissingData` es la condición del aviso y del filtro.
- **Detalle:** `GET /api/students/{id}` entrega `missing_data`, con las claves de lo que falta. El aviso aparece bajo el nombre del alumno y se actualiza al guardar el expediente o el seguro.
- **Privacidad:** `missing_data` solo existe en los endpoints de la institución.
- **Inicio sin correo:** el saludo ya no repite el correo de la cuenta, que sigue en el menú de cuenta del encabezado.

### T-S8-10 — Pendientes del inicio como tarjetas

**Estado:** Completada (10 de noviembre de 2026)  
**Rol:** `INSTITUTION`

- **Problema:** en pantallas anchas la acción de cada aviso quedaba en el extremo derecho, lejos de su texto, y como enlace suelto se distinguía poco.
- **Distribución:** los avisos pasan a la lista «Por atender»: tarjetas en dos columnas en escritorio y apiladas en móvil. Cada una muestra el ícono de su sección, el conteo como título, el motivo en una línea y la acción con flecha debajo, junto al texto.
- **Interacción:** toda la tarjeta es clicable, pero el enlace conserva como nombre accesible solo su acción («Revisar solicitudes», «Revisar el padrón»). El foco del teclado rodea la tarjeta completa.
- **Color:** cada tarjeta conserva el remarque izquierdo y la superficie de su aviso: acento para solicitudes, tono de pendiente para datos faltantes.

### T-S8-11 — Registrar una institución crea la cuenta de su responsable

**Estado:** Completada (10 de noviembre de 2026)  
**Rol:** `ADMIN`

- **Problema:** el correo de contacto de la institución solo se guardaba. La cuenta institucional se creaba aparte, desde el detalle.
- **Responsable:** la institución guarda el nombre (`contact_name`, obligatorio al registrar y al editar, hasta 120 caracteres) y el puesto o departamento opcional (`contact_position`, hasta 120) de su persona responsable, como el contacto de las empresas. Las instituciones anteriores lo completan la primera vez que se editan.
- **Alta:** `POST /api/institutions`, en la misma transacción, crea la institución y la cuenta `INSTITUTION` del responsable, con su nombre y el correo de contacto.
- **Entrega del enlace:** `delivery_method` es opcional, con las mismas opciones que **Nueva cuenta institucional** (HU-S2-01):
  - `email`, por omisión: se envía después del commit y responde `setup_delivery` `sent` o `pending`, sin el enlace. Con `pending`, el aviso pide usar **Reenviar enlace**.
  - `manual`: responde `setup_delivery: manual` y `setup_url`, y no envía correo. La página de alta se queda abierta con el enlace para copiar y un acceso a la institución. El enlace solo vive en el estado de la página, nunca en el historial del navegador.
- **Correo:** se normaliza a minúsculas y no puede pertenecer a otra cuenta de ningún rol. Si ya existe, no se registra ni la institución ni la cuenta, también ante dos altas simultáneas.
- **Edición:** no crea cuentas ni envía enlaces; `delivery_method` está prohibido. Cambiar el correo de contacto, o el nombre del responsable, no modifica la cuenta. **Nueva cuenta institucional** sigue disponible para más cuentas, con la misma lógica (`App\Services\InstitutionAccounts`).
- **Teléfono:** `institutions.contact_phone`, opcional, con la misma validación que el de las empresas (`App\Rules\PhoneNumber`: 10 a 15 dígitos).
- **Dónde se ve:** el detalle de la institución muestra responsable, puesto, correo y teléfono. En sus solicitudes de vinculación, la empresa ve «Responsable · Puesto», el correo y el teléfono, con enlaces `mailto:` y `tel:`.
- **Bitácora:** la cuenta creada registra `created_by`, como cualquier otra.

### T-S8-12 — Registrar una empresa crea la cuenta de su contacto

**Estado:** Completada (10 de noviembre de 2026)  
**Rol:** `SECRETARY`

- **Problema:** como pasaba con las instituciones antes de T-S8-11, el correo del contacto de la empresa solo se guardaba. La cuenta `COMPANY` se creaba aparte, en «Cuentas de la empresa».
- **Alta:** `POST /api/companies` (`StoreCompanyRequest`), en la misma transacción, crea la empresa y la cuenta `COMPANY` de su contacto, con el nombre y el correo del contacto. El puesto opcional ya existía (T-S8-06).
- **Entrega del enlace:** `delivery_method` es opcional, con las mismas opciones que en las cuentas (HU-S2-01):
  - `email`, por omisión: se envía después del commit y responde `setup_delivery` `sent` o `pending`, sin el enlace.
  - `manual`: responde `setup_url` y no envía correo. La página de registro se queda abierta con el enlace para copiar y «Ver la empresa». El enlace solo vive en el estado de la página.
- **Correo:** no puede pertenecer a otra cuenta de ningún rol. Si ya existe, no se registra ni la empresa ni la cuenta, también ante dos altas simultáneas.
- **Edición:** `CompanyRequest` prohíbe `delivery_method` y no crea cuentas. Cambiar el nombre o el correo del contacto no modifica la cuenta. **Cuentas de la empresa** sigue disponible para más cuentas, con la misma lógica (`App\Services\CompanyAccounts`).
- **Detalle:** la cuenta del contacto aparece en «Cuentas de la empresa» como PENDIENTE hasta que establece su contraseña.

### T-S8-13 — Avisos de resultado con la identidad visual

**Estado:** Completada (11 de noviembre de 2026)  
**Rol:** todos

- **Problema:** los avisos de éxito (`.institution-success`) y de error (`.notice`) eran bloques de esquinas rectas, sin ícono y con poco espacio. Son los que aparecen al subir, guardar, editar, eliminar o cuando algo falla, y desentonaban con las tarjetas, los botones y los pendientes del inicio.
- **Diseño:** tarjeta con esquinas de 12 px, borde suave y el remarque izquierdo de 4 px en su color (verde de éxito o rojo de error), como los pendientes del inicio (T-S8-10). Llevan un ícono (palomita en círculo o alerta), más espacio interior y texto de 0.92 rem.
- **Alcance:** se cambian las dos clases una sola vez, así que los avisos de toda la aplicación cambian sin tocar cada pantalla. El ícono es una máscara pintada con el token del aviso y queda fuera del flujo, así que los avisos con enlaces o botones se acomodan igual.
- **Nombre resaltado:** el nombre de lo que cambió (un video, una oportunidad, una certificación) ya no va entre «», sino en `strong.notice-subject`: negritas y un fondo suave del color del aviso, que se distingue aunque la fuente del sistema no tenga peso negrita. Las citas literales, como el mensaje de una solicitud, conservan sus comillas.
- **Accesibilidad:** conservan `role="status"` o `role="alert"`; con contraste alto, el borde toma el color del texto, y con movimiento reducido se mantiene la entrada sin animación.

### T-S8-14 — Tablas en tarjeta

**Estado:** Completada (11 de noviembre de 2026)  
**Rol:** `INSTITUTION`

- **Problema:** las tablas eran bloques planos con un encabezado gris, sin la forma de tarjeta, los radios ni las insignias del resto de la interfaz. Hay dos estilos: `.data-table` (padrón) e `.institution-table` (las demás).
- **Propuesta elegida:** «Tabla en tarjeta», entre tres opciones (también «encabezado institucional» y «filas como tarjetas»). Se probó primero en el padrón de alumnos y, aprobada, se aplicó a las once tablas: alumnos, instituciones, empresas y sus cuentas, oportunidades, las dos bandejas de solicitudes, cuentas de la Secretaría, bitácora y los tres cuadros del reporte.
- **Columna de acciones:** las tablas con acciones se marcan con `has-actions`. Su última columna mide lo que su contenido y centra el encabezado sobre los botones; si hay varios, quedan en una línea.
- **Diseño:** la tabla y su paginación comparten una `.table-card` con esquinas de 14 px. El encabezado lleva el tinte de marca y etiquetas pequeñas en mayúsculas en el color de acento. Las filas tienen separadores finos, el texto centrado verticalmente y un fondo al pasar el cursor. Los apellidos van en peso 600 y la matrícula en monoespaciada, y «Ver detalle» queda alineado a la derecha. La paginación queda en el pie de la tarjeta.
- **Estado:** la insignia `StudentStatus` suma un punto de color delante del texto, también en el detalle del alumno y en la solicitud.
- **Sin cambios de contenido:** se conservan los textos, los roles, los nombres accesibles y el desplazamiento horizontal en móvil.

### T-S8-15 — Bandejas de solicitudes sin saturar

**Estado:** Completada (11 de noviembre de 2026)  
**Rol:** `INSTITUTION`, `COMPANY`

- **Problema:** las columnas «Alumno» y «Oportunidad» juntaban el nombre, la matrícula, la carrera, el periodo y la carrera de la oportunidad, que casi siempre repetía la del alumno. Con los anchos de tabla, los nombres se partían en varias líneas.
- **Alumno:** el nombre como dato principal y debajo solo la matrícula, en monoespaciada y discreta, que es como la institución identifica al alumno. La carrera y el periodo siguen en el detalle de la solicitud.
- **Oportunidad:** solo el título, en dos líneas como máximo; el título completo aparece al pasar el cursor.
- **Empresa:** conserva el municipio debajo del nombre. Alumno y empresa tienen un ancho mínimo para mantenerse en una línea, y la fecha no se parte.
- **Bandeja de la empresa:** el perfil muestra el titular y solo la carrera; el periodo está en el perfil. La oportunidad, el título en dos líneas. La institución muestra su nombre y el responsable, con el puesto al pasar el cursor. Como la empresa no tiene un detalle de la solicitud, el correo y el teléfono siguen en la fila, pero como dos accesos redondos («Escribir a…» y «Llamar al…») en lugar de dos líneas de texto. La respuesta de la institución se recorta a dos líneas y se lee completa al pasar el cursor.
- **Sin cambios:** la API, la exportación CSV, el filtro y el detalle.

### T-S8-16 — Acciones de cuentas que se distinguen por su consecuencia

**Estado:** Completada (11 de noviembre de 2026)  
**Rol:** `ADMIN`, `SECRETARY`

- **Problema:** en las cuentas de la Secretaría y en las de cada empresa, «Restablecer contraseña», «Inactivar» y «Activar» eran la misma pastilla de tinte, así que quitar el acceso se veía igual que una acción de apoyo.
- **Tonos:**
  - Restablecer contraseña y Reenviar enlace: acciones de apoyo, en la pastilla de tinte de marca, con ícono de llave o de sobre.
  - Inactivar: quita el acceso, aunque se puede deshacer. Contorno en el color de peligro, sin relleno, con un candado; al pasar el cursor toma la superficie de peligro.
  - Activar: devuelve el acceso. Tono de éxito con palomita.
- **Alcance:** el componente compartido `useAccountAccess` y el reenvío de la fila, así que aplica igual en las dos tablas de cuentas. Los nombres accesibles y las confirmaciones no cambian.

### Prueba intermitente del CV

`StudentCvTest › validates the certifications without writing them` falló una vez en la suite completa y pasa sola. Sus datasets calculaban fechas relativas («mañana», «el año siguiente») al recolectar las pruebas. Ahora son closures que Pest resuelve al ejecutar cada caso, con el reloj de la aplicación, así que siempre son futuras respecto a la validación. No se reprodujo el fallo, así que la causa exacta queda sin confirmar.

---

## Afinaciones pendientes

Espacio para registrar las siguientes afinaciones antes de convertirlas en historias.

- (vacío)
