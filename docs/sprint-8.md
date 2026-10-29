# Sprint 8 — Afinación previa al despliegue

Sprint vigente desde el 29 de octubre de 2026. Sprint anterior: [sprint-7.md](sprint-7.md) (histórico).

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

## Afinaciones pendientes

Espacio para registrar las siguientes afinaciones antes de convertirlas en historias.

- (vacío)
