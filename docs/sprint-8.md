# Sprint 8 — Afinación previa al despliegue

Sprint vigente desde el 29 de octubre de 2026. Sprint anterior: [sprint-7.md](sprint-7.md) (histórico).

**Objetivo del Sprint:** afinar la usabilidad y el rendimiento del sistema antes del despliegue, empezando por el módulo de alumnos. La institución podrá encontrar a cualquier alumno por matrícula o nombre, con una tabla coherente con el resto del sistema, y completar el expediente justo después de registrarlo. Se aplican además las recomendaciones de la simulación de carga ([simulacion-carga.md](simulacion-carga.md)).

**Story Points:** 8 (HU-S8-01 y HU-S8-02), más una tarea técnica opcional de 2.

## Fuera de alcance

- Búsqueda que ignore acentos (por ejemplo, que «Lopez» encuentre «López»): requiere la extensión `unaccent` de PostgreSQL. Puede proponerse como afinación posterior.
- Cambios en el expediente, el CV o el seguro facultativo más allá de cómo se llega a ellos.
- Concurrencia y despliegue en un servidor de producción.

## Orden de implementación sugerido

1. **HU-S8-01** Búsqueda y filtrado del padrón de alumnos.
2. **HU-S8-02** Continuar con el expediente después de registrar un alumno.
3. **T-S8-01** Reporte ejecutivo con una sola agregación (opcional).

---

## HU-S8-01 — Búsqueda y filtrado del padrón de alumnos

**Estado:** Pendiente  
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

**Estado:** Pendiente  
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

**Estado:** Pendiente  
**Story Points:** 2  
**Rol:** `ADMIN`, `SECRETARY`

Segunda recomendación de la simulación de carga:
- **Hoy:** el reporte ejecutivo (HU-S7-01) calcula los conteos por institución con 4 subconsultas por institución, y recorre la tabla de alumnos 2 veces por cada una (32 recorridos con 16 instituciones).
- **Cambio:** reescribirlos como una sola agregación por institución, con el mismo contrato y las mismas pruebas de HU-S7-01, y volver a medir con `sh scripts/simulation.sh benchmark`.

### Criterios de aceptación

- **CA-01.** La respuesta de `GET /api/reports/dual-program` y de su CSV es idéntica a la actual. Las pruebas de HU-S7-01 y HU-S7-02 siguen pasando.
- **CA-02.** La tabla de alumnos se recorre una sola vez, sin importar cuántas instituciones haya.
- **CA-03.** En la simulación, el p95 del reporte baja respecto a la medición del 29 de octubre de 2026 (371–385 ms).

---

## Afinaciones pendientes

Espacio para registrar las siguientes afinaciones antes de convertirlas en historias:

- (vacío)
