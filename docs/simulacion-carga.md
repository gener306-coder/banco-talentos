# Simulación de carga con datos aleatorios

Tarea transversal del 29 de octubre de 2026, fuera de las historias del Sprint. Objetivo: ver cómo se comporta el sistema con un volumen de piloto realista, sobre todo en alumnos e instituciones, sin tocar los datos de desarrollo.

Cómo reproducirla: sección «Simulación de carga» del `README.md`. Los informes completos de cada ejecución quedan en `backend/storage/simulation/` (excluido de Git).

## Entorno

- **Proyecto aislado:** Compose `banco-talentos-sim` (`compose.simulation.yaml`), con su propio PostgreSQL 17 + PostGIS, backend y frontend en `http://localhost:5180`.
- **Clave y datos propios:** el backend usa una clave propia, estable entre reinicios porque el NSS va cifrado, y guarda storage y cachés en su volumen. No comparte nada con `banco-talentos` ni con `banco-talentos-tests`.
- **Servidor:** `php artisan serve` con `APP_DEBUG=false`. Las mediciones son de **latencia por vista con peticiones secuenciales**, no de concurrencia; para medir usuarios simultáneos haría falta un servidor tipo producción (PHP-FPM con Nginx u Octane).
- **Generador:** `simulation:seed` (`app/Support/Simulation/`). No usa Faker y es determinista con la misma semilla (`--seed`).

## Volumen cargado

Opciones por defecto: 16 instituciones, unos 3000 alumnos por institución con variación de ±40 %, estado principal 15 (Estado de México). La carga tardó **27.8 s**, y la base ocupa **149 MB**.

| Tabla | Filas |
|---|---|
| `institutions` | 16 (1 inactiva) |
| `users` | 362 |
| `students` / `student_identities` | 42 712 |
| `student_skills` | 146 395 |
| `student_languages` | 36 452 |
| `student_certifications` | 18 792 |
| `student_projects` | 26 824 |
| `student_social_security` | 25 659 |
| `companies` | 150 |
| `opportunities` | 600 |
| `linkage_requests` | 5000 |

**Reparto de los alumnos:**
- 95 % activos;
- expedientes: 70 % completos, 20 % parciales y 10 % solo con identidad; un 3 % con «Municipio por confirmar»;
- 85 % en el estado principal y el resto en estados vecinos.

La institución más grande tiene 3971 alumnos, con 80 páginas de padrón.

## Tiempos por endpoint

Hay 20 repeticiones medidas por endpoint, más 2 de calentamiento. El objetivo del Documento General es un p95 de ≤ 3 s en páginas comunes y ≤ 5 s en búsquedas.

| Rol | Escenario | p50 ms | p95 ms | Tamaño |
|---|---|---|---|---|
| Institución | Padrón, página 1 (3971 alumnos) | 96.7 | 135.9 | 9.2 KB |
| Institución | Padrón, última página (80) | 108.9 | 144.5 | 4.0 KB |
| Institución | Detalle de alumno / CV | 54.4 / 69.4 | 66.6 / 85.9 | < 1 KB |
| Institución | Inicio (indicadores) | 70.2 | 83.6 | 159 B |
| Institución | Bandeja de solicitudes (con y sin filtro) | 61–64 | 72–83 | 10 KB |
| Institución | Exportación CSV de la bandeja | 247.1 | 295.4 | 117 KB |
| Empresa | Buscador sin filtros | 217.5 | 248.0 | 12.3 KB |
| Empresa | Buscador por habilidad | 208.2 | 257.9 | 13.3 KB |
| Empresa | Buscador con radio de 50 km | 185.0 | 254.3 | 12.8 KB |
| Empresa | Buscador combinado | 164.2 | 217.7 | 13.5 KB |
| Empresa | Perfil público | 85.2 | 99.3 | 661 B |
| Empresa | Bandeja, oportunidades e inicio | 54–61 | 75–81 | ≤ 12 KB |
| Secretaría | Empresas (listado y búsqueda) | 58–67 | 73–77 | ≤ 12 KB |
| Secretaría | Reporte ejecutivo | 288.1 | 371.3 | 4.2 KB |
| Secretaría | Exportación CSV del reporte | 287.7 | 375.9 | 2.0 KB |
| ADMIN | Instituciones e inicio | 44–51 | 63–68 | ≤ 4 KB |
| ADMIN | Bitácora (página 1, última y filtrada) | 60–68 | 67–86 | ≤ 9 KB |
| ADMIN | Reporte ejecutivo | 296.7 | 385.4 | 4.2 KB |

Todas las respuestas fueron `200` y **todas cumplen el objetivo con amplio margen**. El endpoint más lento, el reporte ejecutivo, queda unas 8 veces por debajo de los 3 s. Cerca de 40–50 ms de cada petición son el arranque de Laravel en `artisan serve`, que en producción se reduce con OPcache y PHP-FPM.

## Planes de consulta

`simulation:explain` capturó las consultas reales de cada escenario y analizó con `EXPLAIN (ANALYZE, BUFFERS)` las 3 más lentas. Ninguna ordena ni agrega en disco. Las 14 señales son lecturas secuenciales de `students` o `student_identities`:

| Hallazgo | Dónde | Costo actual | Por qué importa |
|---|---|---|---|
| **No hay índice que empiece por `students.institution_id`.** Solo existen el `UNIQUE (id, institution_id)`, `public_id`, `municipality_code` y el GiST de `location`. | Reporte ejecutivo: conteo de alumnos activos y buscables por institución. | ~480 ms en `EXPLAIN ANALYZE`; ~290 ms de p50 en HTTP | Cada institución hace 2 subconsultas que recorren los 42 712 alumnos (32 recorridos). Crece con instituciones × alumnos: con 50 instituciones y 150 000 alumnos serían varios segundos. |
| Mismo índice faltante | Padrón (listado y conteo), inicio de la institución | 12–25 ms | Recorre todos los alumnos para quedarse con los de una institución (~4000 de 42 712) y los une a todas las identidades. |
| Estimación muy baja del universo buscable (7255 estimadas frente a 28 420 reales) | Buscador sin filtros e inicio de la empresa | 20–100 ms | Las 7 condiciones `IS NOT NULL` de `scopeSearchable` están correlacionadas y PostgreSQL las multiplica como si fueran independientes. Hoy no cambia el plan, pero puede llevar a malas decisiones con más datos. |
| Orden por distancia de todos los perfiles buscables | Buscador sin filtros | ~100 ms | Es inherente a «ordenar por cercanía»: hay que calcular la distancia de todos los candidatos. Escala lineal con los perfiles buscables. |

## Recomendaciones

Ninguna es urgente para el piloto, porque todo cumple el objetivo con margen. Se aplicarían como una historia o tarea técnica aprobada, ya que cambian el esquema o el código de producción:

1. **Índice `students (institution_id, is_active)`.**
   - Es una migración pequeña y sin riesgo.
   - Convierte los recorridos completos del padrón, del inicio y del reporte en lecturas por índice.
   - Es la mejora con mejor relación costo-beneficio.
2. **Reporte ejecutivo con una sola agregación.**
   - Cambiar los `withCount` correlacionados por un `GROUP BY institution_id` con `count(*) FILTER (…)` sobre `students`, unido a `institutions`.
   - Pasa de 32 recorridos a uno, independientemente del número de instituciones.
3. **Índice parcial del universo buscable.**
   - `CREATE INDEX … ON students (institution_id) WHERE is_active AND program IS NOT NULL AND … AND location IS NOT NULL`, o bien estadísticas extendidas (`CREATE STATISTICS`) sobre esas columnas.
   - Corrige la estimación del buscador y acelera los conteos de perfiles buscables.
4. **Padrón:** si una institución supera unos 20 000 alumnos, conviene un índice `student_identities (institution_id, first_surname, second_surname, given_names)` para no ordenar en memoria. Con el volumen actual, unos 4000 por institución, no hace falta.
5. **Medir concurrencia antes de producción:**
   - montar el backend con PHP-FPM y Nginx o con Octane;
   - repetir la carga con varios usuarios simultáneos usando una herramienta como k6, fuera del alcance de esta simulación.

## Revisión visual

Con la simulación levantada (`sh scripts/simulation.sh up`), se abre `http://localhost:5180` con las cuentas de demostración que imprime `simulation:seed`. Todas comparten una misma contraseña.

| Cuenta | Qué revisar |
|---|---|
| `institucion01-1@sim.test` | Padrón paginado de 50 en 50 con miles de alumnos, detalle, CV, seguro, bandeja con cientos de solicitudes y su CSV |
| `empresa001-1@sim.test` | Buscador con filtros y distancia sobre unos 28 000 perfiles, perfil público, oportunidades y bandeja |
| `secretaria01@sim.test` | 150 empresas, reporte ejecutivo con 16 instituciones y 13 sectores, CSV |
| `admin@sim.test` | Instituciones, cuentas, bitácora con unas 8400 entradas en 280 páginas, reporte |
