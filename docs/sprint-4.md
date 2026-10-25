# Sprint 4 — Empresas y Buscador de Talento Anónimo

Sprint vigente desde el 21 de octubre de 2026. Sprint anterior: [sprint-3.md](sprint-3.md) (histórico).

**Objetivo del Sprint:** abrir el Banco de Talentos a las empresas. La Secretaría de Economía registra a las empresas que ya validó y les crea cuentas de acceso. Las empresas exploran perfiles anónimos de alumnos con filtros por habilidades, idiomas, datos académicos y distancia. Para que la distancia sea real, la ubicación pasa de un punto por estado a un punto por municipio con el catálogo del INEGI (PostGIS, Fase B).

**Story Points:** 24 (HU-S4-01 a HU-S4-05), más dos tareas técnicas transversales.

## Fuera de alcance

Por decisión del responsable del proyecto con el cliente (21 de octubre de 2026), y sujeto a validación jurídica, este Sprint **no** incluye:

- Ningún mecanismo de «match»: solicitudes de contacto, aceptación o rechazo por la institución, ni revelación de datos protegidos a las empresas.
- Campos de contacto personal del alumno (correo, teléfono u otros).
- Mapa interactivo en el buscador.
- Restablecimiento de contraseña y desactivación de cuentas `SECRETARY` y `COMPANY`. El restablecimiento de HU-S1-04 sigue limitado a cuentas `INSTITUTION`.

## Orden de implementación sugerido

1. **T-01** Extensión PostGIS por migración.
2. **T-02** Sesiones y caché en base de datos.
3. **HU-S4-04** Catálogo de municipios. Va antes que las empresas porque la empresa se ubica por municipio.
4. **HU-S4-01** Cuentas de la Secretaría.
5. **HU-S4-02** Registro de empresas.
6. **HU-S4-03** Cuentas de empresa.
7. **HU-S4-05** Buscador anónimo.

---

## HU-S4-01 — Cuentas de la Secretaría de Economía

**Estado:** Completada (22 de octubre de 2026)  
**Diseño técnico y verificación:** [HU-S4-01.md](HU-S4-01.md)  
**Story Points:** 3  
**Rol:** `ADMIN`, `SECRETARY`

### Historia de usuario

**COMO** Administrador o usuario de la Secretaría de Economía  
**QUIERO** crear cuentas `SECRETARY` para el personal de la Secretaría  
**PARA** que la Secretaría pueda operar el registro de empresas en producción sin depender del Administrador para cada alta.

### Criterios de aceptación

- **CA-01.** `ADMIN` y `SECRETARY` pueden crear cuentas `SECRETARY` indicando nombre y correo de acceso. El servidor asigna el rol. Ningún campo de la petición permite elegir otro rol, institución o empresa.
- **CA-02.** `SECRETARY` no puede crear cuentas `ADMIN` ni `INSTITUTION`, ni modificar cuentas existentes. Cualquier intento responde `403` y no escribe nada.
- **CA-03.** La persona titular establece su contraseña mediante un enlace de un solo uso que caduca en 60 minutos. El enlace se puede enviar por correo o generar para copiarlo, con las mismas reglas de HU-S1-03 y HU-S2-01, reutilizando el mecanismo existente. Quien crea la cuenta nunca define ni ve la contraseña.
- **CA-04.** Mientras la cuenta siga pendiente de su primera contraseña, `ADMIN` y `SECRETARY` pueden reenviar el enlace. El reenvío invalida el anterior y aplica un límite de frecuencia.
- **CA-05.** `ADMIN` y `SECRETARY` pueden listar las cuentas `SECRETARY` con nombre, correo, estado (activa o pendiente de contraseña) y fecha de alta.
- **CA-06.** [Auditoría] Cada cuenta registra qué usuario la creó (`created_by`). Cada enlace manual queda en el log con el usuario que lo generó, sin el token ni la URL.
- **CA-07.** El correo de acceso es único en todo el sistema. Uno repetido responde `422`.
- **CA-08.** La interfaz ofrece la sección **Cuentas de la Secretaría** a `ADMIN` y a `SECRETARY`, con los componentes y tokens de [design/identidad-visual.md](design/identidad-visual.md).

## HU-S4-02 — Registro y gestión de empresas validadas

**Estado:** Completada (22 de octubre de 2026)  
**Diseño técnico y verificación:** [HU-S4-02.md](HU-S4-02.md)  
**Story Points:** 5  
**Rol:** `SECRETARY`

### Historia de usuario

**COMO** usuario de la Secretaría de Economía  
**QUIERO** registrar y mantener las empresas que ya validé  
**PARA** que puedan participar en el Banco de Talentos con un alta rápida, sin trámites repetidos dentro del sistema.

### Criterios de aceptación

- **CA-01.** Solo `SECRETARY` puede listar, registrar, consultar, editar y activar o inactivar empresas. `ADMIN`, `INSTITUTION` y `COMPANY` reciben `403`.
- **CA-02.** [Alta mínima] El registro pide:
  - Obligatorios: razón social (hasta 200), RFC, sector económico, estado y municipio del catálogo de HU-S4-04, nombre del contacto del programa dual (hasta 120) y su correo.
  - Opcionales: nombre comercial (hasta 150), teléfono del contacto (hasta 20) y folio u oficio de validación de la Secretaría (hasta 60).
  - No se pide domicilio ni se suben documentos: la evidencia de validación queda en los expedientes de la Secretaría.
- **CA-03.** [RFC] Se valida el formato: 12 caracteres para persona moral y 13 para persona física. Se guarda en mayúsculas. Es único aun entre empresas inactivas; uno repetido responde `422`.
- **CA-04.** [Sector] El sector es un catálogo fijo de los sectores SCIAN a 2 dígitos. Un valor fuera del catálogo responde `422`.
- **CA-05.** [Ubicación] El servidor deriva el punto PostGIS de la empresa desde su municipio, con la misma regla que los alumnos (HU-S4-04). La API no acepta coordenadas y no expone el punto.
- **CA-06.** [Auditoría] La empresa registra la cuenta `SECRETARY` que la dio de alta (`registered_by`).
- **CA-07.** [Baja lógica] No existe eliminación física. Inactivar una empresa, tras una confirmación, impide el inicio de sesión de sus cuentas e invalida sus sesiones abiertas en la siguiente petición (ver HU-S4-03). Reactivarla devuelve el acceso.
- **CA-08.** El listado incluye empresas activas e inactivas, paginado, con búsqueda por razón social, nombre comercial o RFC.
- **CA-09.** La interfaz ofrece **Empresas** a `SECRETARY`, con validación en línea, errores del servidor junto a su campo y los tokens de la identidad visual.

## HU-S4-03 — Cuentas de acceso de empresa

**Estado:** Completada (22 de octubre de 2026)  
**Diseño técnico y verificación:** [HU-S4-03.md](HU-S4-03.md)  
**Story Points:** 3  
**Rol:** `SECRETARY`

### Historia de usuario

**COMO** usuario de la Secretaría de Economía  
**QUIERO** crear las cuentas de acceso del personal de una empresa registrada  
**PARA** que la empresa pueda entrar al Banco de Talentos.

### Criterios de aceptación

- **CA-01.** Desde el detalle de una empresa **activa**, `SECRETARY` crea cuentas indicando nombre y correo de acceso. El servidor asigna el rol `COMPANY` y la empresa del detalle; ningún campo de la petición permite cambiarlos. Una empresa inactiva o inexistente no admite altas.
- **CA-02.** La contraseña se establece con el mismo enlace de un solo uso, de 60 minutos y entregado por correo o de forma manual, que en HU-S4-01. También incluye el reenvío mientras la cuenta esté pendiente.
- **CA-03.** [Integridad] La base de datos garantiza la coherencia entre rol y organización: `COMPANY` tiene empresa y no institución, `INSTITUTION` tiene institución y no empresa, y `ADMIN` y `SECRETARY` no tienen ninguna.
- **CA-04.** [Empresa inactiva] Con credenciales correctas, una cuenta de una empresa inactiva recibe `401` con código `COMPANY_INACTIVE`, y una sesión abierta pierde acceso en su siguiente petición, igual que `INSTITUTION_INACTIVE`.
- **CA-05.** Tras iniciar sesión, `GET /api/me` incluye la empresa vinculada con su nombre visible y sin datos internos de validación.
- **CA-06.** El detalle de la empresa lista sus cuentas con nombre, correo y estado. Cada cuenta registra quién la creó.

## HU-S4-04 — Catálogo INEGI de municipios y ubicación por municipio (PostGIS, Fase B)

**Estado:** Completada (21 de octubre de 2026)  
**Diseño técnico y verificación:** [HU-S4-04.md](HU-S4-04.md)  
**Story Points:** 5  
**Rol:** `INSTITUTION`, más un catálogo de lectura para todos los roles autenticados

### Historia de usuario

**COMO** usuario de una Institución Educativa  
**QUIERO** seleccionar el municipio de mis alumnos de un catálogo oficial  
**PARA** que las empresas puedan encontrarlos por distancia real y no solo por estado.

### Criterios de aceptación

- **CA-01.** [Fuente fija] El catálogo de municipios proviene del **Catálogo Único de Claves de Áreas Geoestadísticas Estatales, Municipales y Localidades del INEGI**, en la edición estable más reciente disponible (por ejemplo, el corte de 2023 o 2024).
  - Se versiona en el repositorio como CSV con: clave del estado, clave del municipio, nombre y coordenadas de la cabecera municipal.
  - La edición exacta, su fecha de corte y el número de municipios quedan documentados.
  - Una prueba verifica que se cargó ese número exacto de municipios.
- **CA-02.** [Atribución legal] La documentación cita la fuente («Fuente: INEGI, Catálogo Único de Claves de Áreas Geoestadísticas Estatales, Municipales y Localidades, edición …») conforme a los Términos de Libre Uso de la Información del INEGI.
- **CA-03.** [Carga reproducible] Una migración carga el catálogo de forma idempotente, con upsert por clave. Funciona igual en desarrollo, pruebas y una base administrada (RDS), sin pasos manuales.
- **CA-04.** [Punto por municipio] Al guardar el expediente, el servidor deriva `students.location` de la cabecera del municipio elegido, en la misma transacción. El cliente sigue sin poder enviar coordenadas; `latitude`, `longitude` y `location` se descartan.
- **CA-05.** [Coherencia] El municipio se guarda por su clave INEGI y debe pertenecer al estado elegido. Un municipio inexistente o de otro estado responde `422`.
- **CA-06.** [Migración de datos] Los municipios capturados como texto libre se asignan automáticamente cuando su nombre normalizado coincide con uno del catálogo dentro del mismo estado.
  - Los que no coinciden conservan el punto del estado (Fase A) y aparecen en el detalle del alumno como «Municipio por confirmar» hasta que la institución lo elija.
  - Ningún expediente pierde su estado ni su ubicación.
- **CA-07.** [API de catálogo] Cualquier rol autenticado puede consultar los municipios de un estado, ordenados por nombre. La respuesta es cacheable (`Cache-Control: public`). Una clave de estado inválida responde `404`.
- **CA-08.** [Interfaz] El expediente muestra un selector de municipio con filtro por texto, que depende del estado elegido y tiene en cuenta que hay estados con más de 500 municipios. Cambiar de estado limpia el municipio.
- **CA-09.** [Anti-IDOR] Se conservan todas las reglas de HU-S2-03: un alumno de otra institución responde igual que uno inexistente (`404`).

## HU-S4-05 — Buscador de talento anónimo (vista exploratoria)

**Estado:** Completada (22 de octubre de 2026)  
**Diseño técnico y verificación:** [HU-S4-05.md](HU-S4-05.md)  
**Story Points:** 8  
**Rol:** `COMPANY`

### Historia de usuario

**COMO** usuario de una Empresa  
**QUIERO** buscar perfiles de alumnos con filtros por habilidades, idiomas, datos académicos y distancia  
**PARA** conocer el talento disponible para el programa dual sin acceder a datos personales.

### Criterios de aceptación

- **CA-01.** Solo `COMPANY`, con empresa activa, accede al buscador. Los demás roles reciben `403`.
- **CA-02.** [Universo] Solo aparecen alumnos que cumplen todo lo siguiente:
  - están `ACTIVO` (HU-S2-04);
  - pertenecen a una institución activa;
  - tienen su expediente público capturado.
- **CA-03.** [Filtros] Se puede filtrar por cualquier combinación de:
  - habilidades, todas requeridas;
  - idioma con nivel mínimo (MCER o Nativo);
  - carrera, por texto;
  - periodo mínimo;
  - disponibilidad para el programa dual;
  - disponibilidad para reubicarse;
  - al menos una certificación revisada por la institución;
  - estado;
  - radio de 10, 25, 50, 100 o 200 km.
- **CA-04.** [Radio] El origen del radio es el municipio de la empresa o, si el usuario lo elige, otro municipio del catálogo. Nunca se aceptan coordenadas del cliente. La distancia se muestra redondeada a múltiplos de 5 km.
- **CA-05.** [Tarjeta anónima] Cada resultado es una tarjeta con:
  - identificador público, titular, carrera y periodo;
  - **nombre de la institución**;
  - estado, municipio y distancia aproximada;
  - habilidades principales, idiomas con nivel, número de certificaciones revisadas;
  - disponibilidad dual y de reubicación.
- **CA-06.** [Perfil público] Al abrir una tarjeta se ve el CV público completo: habilidades, idiomas, certificaciones con fecha y si están revisadas, y proyectos. **No hay botón de «Contactar»** ni ninguna otra acción sobre el perfil.
- **CA-07.** [Datos protegidos] Las respuestas para empresas **nunca** incluyen:
  - matrícula, nombre ni ningún dato de `student_identities`;
  - NSS ni comprobante del IMSS;
  - enlaces externos, credenciales de certificaciones ni quién revisó una certificación;
  - el punto PostGIS ni el identificador interno del alumno.

  Se construyen con una lista explícita de campos públicos, y una prueba verifica la ausencia de cada dato protegido.
- **CA-08.** [Identificador opaco] Las empresas solo ven un identificador público aleatorio del alumno (UUID v4), nunca `students.id`. Un identificador inexistente, de un alumno inactivo o de una institución inactiva responde `404` idéntico.
- **CA-09.** [Desempeño y abuso] La búsqueda está paginada (20 por página) y ordenada por distancia y luego por actualización reciente. Cada filtro aprovecha los índices existentes. Hay un límite de frecuencia por cuenta para impedir la extracción masiva.
- **CA-10.** [Interfaz] Vista de lista con panel de filtros y tarjetas. **Sin mapa interactivo.** Es usable con teclado y lector de pantalla, se adapta a móvil y usa los tokens de la identidad visual.

> **Nota formal de privacidad — Visibilidad de la institución en la tarjeta anónima (21 de octubre de 2026)**
>
> Por decisión del responsable del proyecto con el cliente, la tarjeta anónima **muestra el nombre de la institución** que respalda al alumno, porque es un dato de valor para las empresas en esta etapa de exploración.
>
> **Implicación que el cliente debe evaluar a futuro:** la combinación de institución, carrera, periodo y municipio puede reducir el grupo a muy pocos alumnos en instituciones o programas pequeños (cohortes pequeñas). En el caso extremo, a uno solo, y una empresa con conocimiento local podría deducir de quién se trata sin conocer su nombre. El riesgo aumenta al combinarlo con los proyectos o certificaciones del CV público.
>
> **Mitigaciones posibles, no incluidas en este Sprint:**
> - ocultar la institución o el municipio cuando el grupo coincidente sea menor que un umbral (por ejemplo, 5 alumnos);
> - mostrar solo el estado en lugar del municipio;
> - que cada institución decida si su nombre se muestra.
>
> Esta decisión debe revisarse junto con la validación jurídica del futuro mecanismo de match y de los avisos de privacidad.

---

## Tareas técnicas transversales

Aprobadas por el responsable del proyecto el 21 de octubre de 2026 para preparar el despliegue en AWS. No corresponden a historias de Jira.

### T-01 — Extensión PostGIS creada por migración

**Estado:** Completada (21 de octubre de 2026)  
**Origen:** análisis técnico del Sprint 4 (preparación para AWS)

Hoy la extensión PostGIS solo se crea en `docker/postgres/01-postgis.sql`, un script que Docker ejecuta al inicializar un volumen vacío. En una base administrada como RDS ese script no se ejecuta y las migraciones espaciales fallarían.

- Una migración, anterior a cualquier columna espacial, ejecuta `CREATE EXTENSION IF NOT EXISTS postgis`.
- Es idempotente: no falla en volúmenes de desarrollo existentes ni en la base de pruebas.
- El script de Docker puede conservarse, pero deja de ser necesario.

### T-02 — Sesiones y caché en base de datos

**Estado:** Completada (21 de octubre de 2026)  
**Origen:** análisis técnico del Sprint 4 (preparación para AWS)

Hoy `SESSION_DRIVER=file` y `CACHE_STORE=file`. Con varias instancias detrás de un balanceador, las sesiones se perderían entre instancias y los límites de frecuencia (login, enlaces, búsqueda) se contarían por separado en cada una, lo que debilita la protección contra fuerza bruta.

- Se usan los drivers `database` para sesiones y caché, sin Redis, conforme a `AGENTS.md`, con sus migraciones.
- Se actualizan `backend/.env.example`, Compose y el entorno de pruebas.
- Se conservan las garantías actuales de sesión: cookie `HttpOnly` y `SameSite=Lax`, regeneración del identificador al autenticar, invalidación al cerrar sesión y cierre de todas las sesiones al restablecer la contraseña.
- Las pruebas de sesión que hoy dependen de archivos se adaptan sin sustituir el login real por `actingAs`.

### Normalización del tamaño de los contenedores

**Estado:** Completada (24 de octubre de 2026)  
**Origen:** solicitud del responsable del proyecto; no corresponde a una historia de Jira.  
**Detalle:** [design/identidad-visual.md](design/identidad-visual.md#tamaños-y-retícula)

Las vistas del Sprint 4 (empresas, cuentas de la Secretaría y buscador de talento) se mostraban en el ancho angosto del inicio de sesión, porque `App.tsx` solo ensanchaba las rutas de instituciones y alumnos. Ahora las vistas son anchas por defecto (70 rem) y solo las pantallas de acceso son angostas (34 rem), con tokens de dimensión y un único ancho de lectura de 45 rem para formularios y detalles. En el buscador, los filtros y los resultados quedan en dos columnas en escritorio, y las tarjetas se reparten en una cuadrícula responsiva.

