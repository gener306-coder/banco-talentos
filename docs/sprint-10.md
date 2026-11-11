# Sprint 10 — Inteligencia de Búsqueda y Taxonomía de Habilidades

Sprint vigente desde el 11 de noviembre de 2026. Sprint anterior: [sprint-8.md](sprint-8.md) (histórico). *(Nota: El Sprint 9 cubrió Multimedia).*

**Objetivo del Sprint:** Resolver el problema de "arranque en frío" del catálogo de habilidades inyectando un dataset semilla curado para Educación Dual, e implementar un motor de búsqueda tolerante a errores ortográficos (fuzzy search) utilizando trigramas en PostgreSQL, ajustando la interfaz para evitar selecciones accidentales.

**Story Points:** 10 (HU-S10-01, T-S10-01, HU-S10-02).

## Orden de implementación sugerido

1. **HU-S10-01** Carga del catálogo semilla de habilidades (Comando Artisan).
2. **T-S10-01** Búsqueda tolerante a errores ortográficos en backend (`pg_trgm`).
3. **HU-S10-02** Ajuste de selección en el `SkillPicker` del frontend.

---

## HU-S10-01 — Carga del catálogo semilla de habilidades

**Estado:** Pendiente  
**Diseño técnico y verificación:** `docs/HU-S10-01.md`  
**Story Points:** 3  
**Rol:** `Backend / Sistema`

### Historia de usuario

**COMO** administrador del sistema  
**QUIERO** poblar la base de datos con un catálogo curado de habilidades técnicas y blandas sin afectar los datos existentes  
**PARA** que las empresas y alumnos reciban sugerencias estandarizadas desde el primer día de uso (evitando el arranque en frío).

### Criterios de aceptación

- **CA-01.** Crear el comando Artisan `php artisan skills:seed` que lea el archivo `backend/database/data/skills/top_skills.csv`.
- **CA-02.** El comando debe ser **idempotente**. Utiliza `insertOrIgnore` (o la lógica existente en `SkillCatalog`) para no duplicar slugs ni sobrescribir el tipo (`kind`) de habilidades que ya hayan sido registradas previamente por los usuarios.
- **CA-03.** El comando **no** debe ejecutarse automáticamente dentro de una migración para evitar romper las pruebas unitarias que asumen una base de datos vacía (ej. `StudentCvTest.php`).
- **CA-04.** Se debe incluir una prueba en Pest que ejecute el comando, valide que se carguen las habilidades correctamente y demuestre su idempotencia al ejecutarlo dos veces.

---

## T-S10-01 — Búsqueda tolerante a errores ortográficos (Fuzzy Search)

**Estado:** Pendiente  
**Diseño técnico y verificación:** `docs/T-S10-01.md`  
**Story Points:** 5  
**Rol:** `Backend`

### Criterios de aceptación

- **CA-01.** [Migración] Crear una migración que habilite `CREATE EXTENSION IF NOT EXISTS pg_trgm` y añada un índice GiST sobre la columna `slug` de la tabla `skills` usando `gist_trgm_ops`. El método `down()` debe eliminar el índice, pero no la extensión. El índice B-tree existente (`skills_slug_prefix_index`) debe conservarse.
- **CA-02.** [Motor de búsqueda en dos fases] Refactorizar la consulta en `App\Support\SkillCatalog::search($query, $limit)`:
  - **Fase 1 (Prefijo exacto):** Ejecuta la consulta actual (LIKE).
  - **Fase 2 (Similitud):** Si la Fase 1 devuelve menos de los resultados esperados (`$limit`) **Y** la longitud de la cadena de búsqueda tiene ≥ 3 caracteres alfanuméricos, ejecuta una consulta con el operador de similitud de palabra `<<->` (`word_similarity`), ordenando por distancia y filtrando con un umbral explícito (ej. `q <<-> slug < 0.5`) excluyendo los IDs ya encontrados en la Fase 1.
- **CA-03.** [Contrato API] El endpoint `GET /api/skills?q=` debe devolver los resultados combinados. Para mitigar problemas en el frontend, cada item del JSON debe incluir una nueva propiedad `"match": "prefix" | "fuzzy"`.
- **CA-04.** [Pruebas] Añadir pruebas en Pest que validen: tolerancia a errores (ej. "javascrip" -> "JavaScript"), que los resultados por prefijo exacto siempre aparezcan antes que los difusos, que las búsquedas de 1 o 2 caracteres no disparen la búsqueda difusa, y que los símbolos como "C++" y "C#" se resuelvan correctamente por prefijo.

---

## HU-S10-02 — Prevención de selección accidental en sugerencias difusas

**Estado:** Pendiente  
**Diseño técnico y verificación:** `docs/HU-S10-02.md`  
**Story Points:** 2  
**Rol:** `INSTITUTION`, `COMPANY`  
**Dependencia:** T-S10-01

### Historia de usuario

**COMO** usuario capturando habilidades  
**QUIERO** que el autocompletado no seleccione automáticamente una habilidad sugerida si contiene errores ortográficos respecto a lo que escribí  
**PARA** evitar registrar accidentalmente una habilidad incorrecta (ej. seleccionar "Vuex" al presionar Enter cuando escribí "Vue").

### Criterios de aceptación

- **CA-01.** En el componente `src/students/SkillPicker.tsx`, cuando se reciben los resultados de la API, el sistema no debe preseleccionar automáticamente (estado `active = 0`) el primer elemento si su propiedad `match` es `"fuzzy"`.
- **CA-02.** Si el primer resultado es `"prefix"`, se mantiene el comportamiento actual (preseleccionado para inserción rápida con Enter).
- **CA-03.** Las pruebas en Vitest deben validar este comportamiento de selección y des-selección basada en la nueva bandera `match` de la respuesta simulada.