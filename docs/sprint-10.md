# Sprint 10 — Inteligencia de Búsqueda y Taxonomía de Habilidades

Sprint vigente desde el 11 de noviembre de 2026; alcance redefinido por el responsable y el Arquitecto el 12 de noviembre de 2026. Sprint anterior: [sprint-9.md](sprint-9.md) (histórico).

**Objetivo del Sprint:** resolver el «arranque en frío» del catálogo de habilidades con un catálogo semilla curado para Educación Dual, y hacer que el autocompletar tolere errores ortográficos y abreviaturas, todo dentro de PostgreSQL, sin que la interfaz permita selecciones accidentales.

**Story Points:** 10 (HU-S10-01, T-S10-01, HU-S10-02).

## Decisiones del responsable y el Arquitecto (12 de noviembre de 2026)

- **Todo en PostgreSQL.** Se evaluó Laravel Scout + Meilisearch y se rechazó: un contenedor adicional, gestión de claves, un volumen y sincronización asíncrona son desproporcionados para el MVP, conforme a `CLAUDE.md`.
- **Tres fases de búsqueda:** prefijo o alias, trigramas (`pg_trgm`) y Levenshtein (`fuzzystrmatch`).
- **Alias por habilidad.** El catálogo semilla lleva una tercera columna `aliases`. Un mismo alias puede apuntar a varias habilidades («bd» apunta a las dos habilidades de bases de datos).
- **El catálogo curado manda sobre el tipo.** `skills:seed` actualiza el `kind` y los `aliases` de las habilidades existentes. Nunca cambia el nombre que alguien registró ni toca habilidades que no estén en el archivo. Las altas desde el CV y las oportunidades siguen sin modificar habilidades existentes.
- **Levenshtein según la longitud.** Una edición para consultas de 4–5 caracteres y dos para 6–7. Con dos ediciones en 4 letras, «java» sugeriría «Jira» y «Sass».
- La rama `feat/hu-s10-skills-fuzzy-search` (dos fases, sin alias) queda descartada. La implementación vive en `feat/hu-s10-postgres-fuzzy-aliases`.

## Orden de implementación

1. **HU-S10-01** Catálogo semilla con alias y comando `skills:seed`.
2. **T-S10-01** Búsqueda en tres fases en el backend.
3. **HU-S10-02** Preselección segura en el `SkillPicker`.

## Fuera de alcance

- Motores de búsqueda externos (Meilisearch, Elasticsearch, Algolia).
- Edición de alias desde la interfaz; los alias solo llegan por el catálogo semilla.
- Alias por coincidencia parcial o con tolerancia a errores; solo el término exacto.
- Fusión o limpieza de habilidades duplicadas que hayan registrado las cuentas.

---

## HU-S10-01 — Catálogo semilla de habilidades y comando de carga

**Estado:** Completada (12 de noviembre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S10-01.md`  
**Story Points:** 3  
**Rol:** `Backend / Sistema`

### Historia de usuario

**COMO** administrador del sistema  
**QUIERO** poblar la base de datos con un catálogo curado de habilidades técnicas y blandas, con sus abreviaturas  
**PARA** que las empresas y las instituciones reciban sugerencias estandarizadas desde el primer día de uso.

### Criterios de aceptación

- **CA-01.** El comando `php artisan skills:seed` lee `backend/database/data/skills/top_skills.csv`, con cabecera `name,kind,aliases`. La columna `aliases` es opcional por renglón y separa los alias con `|` (por ejemplo `c sharp|csharp`). El archivo incluye al menos 5 alias críticos, entre ellos «js» para JavaScript, «c sharp» para C#, «ml» para Aprendizaje automático y «bd» para las habilidades de bases de datos.
- **CA-02.** El comando inserta las habilidades nuevas y, para las que ya existen (por `slug`), actualiza su `kind` y sus `aliases`. Protege la integridad:
  - nunca cambia el `name` ni el `id` de una habilidad existente;
  - no toca las habilidades que no están en el archivo;
  - corre en una transacción: un fallo no deja el catálogo a medias;
  - es **idempotente**: una segunda ejecución no cambia nada.
- **CA-03.** El archivo se valida completo antes de escribir: cabecera, `kind` válido, nombre de hasta 80 caracteres y sin habilidades repetidas. Los alias se guardan normalizados (minúsculas, sin acentos), sin vacíos ni repetidos.
- **CA-04.** El comando **no** corre dentro de una migración, para no romper las pruebas que parten de un catálogo vacío (`StudentCvTest.php`).
- **CA-05.** Pruebas en Pest: carga con alias, idempotencia (dos ejecuciones), actualización de `kind` y `aliases` conservando el nombre, habilidades ajenas intactas y archivos inválidos.

---

## T-S10-01 — Búsqueda en tres fases: prefijo o alias, trigramas y Levenshtein

**Estado:** Completada (12 de noviembre de 2026)  
**Diseño técnico y verificación:** `docs/T-S10-01.md`  
**Story Points:** 5  
**Rol:** `Backend`

### Criterios de aceptación

- **CA-01.** [Migración] Habilita `pg_trgm` y `fuzzystrmatch` (`CREATE EXTENSION IF NOT EXISTS`), agrega la columna `aliases` a `skills` y un índice GiST de trigramas sobre `slug` (`gist_trgm_ops`). El `down()` quita la columna y los índices, pero no las extensiones. El índice B-tree `skills_slug_prefix_index` se conserva.
- **CA-02.** [Motor] `App\Support\SkillCatalog::search($query, $limit)` busca en tres fases secuenciales. Cada fase corre solo si falta llenar el límite y excluye los ids ya encontrados:
  1. **Prefijo o alias:** `LIKE` literal sobre `slug`, o el término exacto dentro de `aliases`. Resuelve las búsquedas de 1–2 letras, los símbolos («C#», «C++») y las abreviaturas («js»). Orden: nombre exacto, alias y luego el resto del prefijo en orden alfabético.
  2. **Trigramas:** si la consulta tiene 3 o más caracteres alfanuméricos, similitud de palabra (`<<->`) con umbral explícito de 0.5, ordenada por distancia.
  3. **Levenshtein:** si la consulta mide entre 4 y 7 caracteres, `levenshtein(slug, consulta)` de hasta 1 (4–5 caracteres) o 2 (6–7 caracteres), ordenada por distancia. Resuelve inversiones como «pyhton».
- **CA-03.** [Contrato] `GET /api/skills?q=` devuelve los resultados combinados y cada elemento incluye `"match": "prefix" | "alias" | "fuzzy"`. Una habilidad que coincide por prefijo y por alias se marca `prefix`. Las fases 2 y 3 marcan `fuzzy`.
- **CA-04.** [Pruebas] Pest valida: «javscript» → JavaScript; «pyhton» → Python; «js» y «c sharp» por alias; un alias que apunta a varias habilidades; «java» no sugiere «Jira»; los resultados de la fase 1 siempre antes que los difusos; las búsquedas de 1–2 caracteres sin fases difusas; «C#» y «C++» por prefijo; y `%` y `_` como literales (las aserciones de `StudentCvTest.php` siguen pasando).

---

## HU-S10-02 — Prevención de selección accidental en sugerencias difusas

**Estado:** Completada (12 de noviembre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S10-02.md`  
**Story Points:** 2  
**Rol:** `INSTITUTION`, `COMPANY`  
**Dependencia:** T-S10-01

### Historia de usuario

**COMO** usuario capturando habilidades  
**QUIERO** que el autocompletado no seleccione automáticamente una habilidad sugerida si contiene errores ortográficos respecto a lo que escribí  
**PARA** evitar registrar accidentalmente una habilidad incorrecta (por ejemplo, «Vuex» al presionar Enter cuando escribí «Vue»).

### Criterios de aceptación

- **CA-01.** En `src/students/SkillPicker.tsx`, la primera sugerencia queda preseleccionada (Enter la agrega) si su `match` es `"prefix"` o `"alias"`.
- **CA-02.** Si la primera sugerencia es `"fuzzy"`, ninguna queda preseleccionada: el usuario debe elegirla con las flechas o el ratón, y Enter agrega lo escrito como habilidad nueva.
- **CA-03.** Vitest valida la preselección y la no preselección según la bandera `match` de la respuesta simulada, para los tres valores.
