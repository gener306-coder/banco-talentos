# Sprint 11 — Inteligencia de búsqueda en el Buscador de Talento

Sprint vigente desde el 12 de noviembre de 2026. Sprint anterior: [sprint-10.md](sprint-10.md) (histórico).

**Objetivo del Sprint:** llevar al buscador de talento (HU-S4-05) la tolerancia a errores y abreviaturas del catálogo de habilidades (Sprint 10), y permitir buscar por texto libre en el titular y la carrera, sin cambiar el orden por cercanía ni exponer datos nuevos.

**Story Points:** 10 (HU-S11-01, HU-S11-02, HU-S11-03).

**Dependencia:** el Sprint 10 (`feat/hu-s10-postgres-fuzzy-aliases`): columna `skills.aliases`, `SkillCatalog::search`, la bandera `match` y la extensión `pg_trgm`.

## Decisiones del responsable y el Arquitecto (12 de noviembre de 2026)

- **Sin correcciones ocultas en el backend.** El error de escritura se corrige al capturar el filtro: el buscador usa el `SkillPicker` en modo «solo catálogo» y la persona elige la sugerencia. El backend solo resuelve slugs y alias **exactos**.
- **Un solo texto libre.** Un parámetro `q` busca a la vez en el titular y en la carrera.
- **La similitud filtra, no ordena.** El orden sigue siendo el de HU-S4-05 CA-09: distancia, actualización más reciente e `id`.
- **Índice GIN** (`gin_trgm_ops`) sobre columnas normalizadas (minúsculas y sin acentos) creadas por migración, consultado con el operador de similitud de palabra `<%`.

## Orden de implementación

1. **HU-S11-01** Autocompletar del catálogo en el filtro de habilidades.
2. **HU-S11-02** Resolución de alias exactos en `skills[]`.
3. **HU-S11-03** Búsqueda por texto en titular y carrera.

## Fuera de alcance

- Búsqueda difusa de habilidades en el backend del buscador.
- Orden por relevancia del texto.
- Catálogo de carreras y abreviaturas de carrera («Ing.»).
- Texto libre sobre proyectos, certificaciones o cualquier dato protegido.

---

## HU-S11-01 — Autocompletar del catálogo en el filtro de habilidades

**Estado:** Completada (12 de noviembre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S11-01.md`  
**Story Points:** 3  
**Rol:** `COMPANY`

### Historia de usuario

**COMO** persona reclutadora de una empresa  
**QUIERO** que el filtro de habilidades del buscador me sugiera las habilidades del catálogo mientras escribo, aunque cometa un error o use una abreviatura  
**PARA** no recibir cero resultados por escribir «pyhton» o «js».

### Criterios de aceptación

- **CA-01.** El filtro de habilidades de `/talent` usa `SkillPicker` en un modo «solo catálogo»: consulta `GET /api/skills?q=` y muestra las sugerencias con las reglas de HU-S10-02 (preselección para `prefix` y `alias`, nunca para `fuzzy`).
- **CA-02.** En ese modo no se puede agregar una habilidad que no esté en el catálogo: no existe la opción «Agregar como nueva» ni el selector de tipo. Enter sin una sugerencia elegida muestra un mensaje y no agrega nada.
- **CA-03.** Se conservan el máximo de 10 habilidades, el rechazo de repetidas, las etiquetas removibles y que Enter no lance la búsqueda. El atajo del inicio de la empresa sigue llegando con la habilidad ya aplicada.
- **CA-04.** El CV del alumno y las oportunidades no cambian: siguen permitiendo habilidades nuevas.
- **CA-05.** Vitest cubre: sugerencia por alias agregada con Enter, sugerencia difusa que exige elegirla, texto fuera del catálogo rechazado y los filtros enviados. La prueba E2E del buscador filtra eligiendo la habilidad del catálogo.

---

## HU-S11-02 — Resolución de alias exactos en el filtro `skills[]`

**Estado:** Completada (12 de noviembre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S11-02.md`  
**Story Points:** 2  
**Rol:** `Backend`

### Criterios de aceptación

- **CA-01.** `App\Support\SkillCatalog::resolve()` recibe los términos de `skills[]` y devuelve, por término, los ids de las habilidades cuyo `slug` es igual al término o que lo tienen entre sus `aliases`. Solo coincidencias exactas: sin prefijos, trigramas ni Levenshtein.
- **CA-02.** `GET /api/talent` combina las habilidades de un mismo término con OR y los términos entre sí con AND, con un `whereExists` por término sobre `student_skills`. «bd» encuentra a quien tenga cualquiera de las dos habilidades de bases de datos.
- **CA-03.** Un término que no resuelve a ninguna habilidad sigue devolviendo cero resultados sin consultar alumnos. «pyhton» por la API no se corrige.
- **CA-04.** No cambian los campos de la respuesta, la privacidad ni el orden.
- **CA-05.** Pest cubre: alias de una habilidad, alias de varias, alias combinado con otra habilidad (AND), término con error sin resultados y un prefijo que no se ensancha («java» no trae a quien solo tiene JavaScript).

---

## HU-S11-03 — Búsqueda por texto en titular y carrera

**Estado:** Completada (12 de noviembre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S11-03.md`  
**Story Points:** 5  
**Rol:** `COMPANY`

### Historia de usuario

**COMO** persona reclutadora de una empresa  
**QUIERO** buscar por texto libre en el titular y la carrera de los perfiles, aunque escriba sin acentos o con un error  
**PARA** encontrar perfiles por el puesto o la formación que me interesan.

### Criterios de aceptación

- **CA-01.** [Migración] Agrega a `students` las columnas `headline_search` y `program_search`, normalizadas en minúsculas y sin acentos, mantenidas por la base de datos, con un índice GIN `gin_trgm_ops` en cada una. Las filas existentes quedan normalizadas al migrar. El `down()` quita índices y columnas.
- **CA-02.** [API] `GET /api/talent` acepta `q` (texto, hasta 100 caracteres). Cada palabra de `q` debe aparecer en el titular **o** en la carrera, como texto contenido o por similitud de palabra (`<%`); las palabras se combinan con AND. `q` se combina con el resto de los filtros.
- **CA-03.** [Umbral] El umbral de similitud se fija con `SET LOCAL pg_trgm.word_similarity_threshold` dentro de la transacción de la consulta, de modo que no se filtra a otras peticiones de la misma conexión.
- **CA-04.** [Orden] El orden no cambia (HU-S4-05 CA-09). La similitud no interviene en el orden.
- **CA-05.** [Privacidad] Las columnas nuevas no aparecen en ninguna respuesta. `q` solo lee el titular y la carrera, que ya son públicos en la tarjeta. `%` y `_` son literales.
- **CA-06.** [Interfaz] El panel de filtros ofrece un campo de texto «Titular o carrera» que envía `q` y sustituye al campo «Carrera». El parámetro `program` de la API (HU-S4-05) se conserva sin cambios.
- **CA-07.** [Pruebas] Pest cubre: sin acentos, con un error de escritura, palabras repartidas entre titular y carrera, palabra ausente, combinación con otros filtros, orden por distancia intacto, literales y validación de `q`. Vitest cubre el envío de `q`.

---

## T-S11-01 — Refinamiento UI/UX de filtros y autocompletado

**Estado:** Completada (13 de noviembre de 2026); validación visual de CA-01 y CA-02 pendiente del responsable  
**Diseño técnico y verificación:** `docs/T-S11-01.md`  
**Rol:** `Frontend`  
**Origen:** auditoría de UI/UX tras la validación visual del Sprint 11 (13 de noviembre de 2026). La interacción con las sugerencias y las etiquetas de habilidades se sentía estática.

### Decisiones del responsable y el Arquitecto

- El cursor (`:hover`, fondo `--fill`) y la opción activa del teclado (`.active`, fondo `--tint`) son estados separados. El ratón no mueve la opción activa y la lógica de Enter de HU-S10-02 no cambia.
- La jerarquía del texto secundario se resuelve con tamaño, peso y opacidad. No se crea el token `--text-muted`.
- Los estilos de `.chip` y `.combobox-list` se mejoran para toda la aplicación: CV, oportunidades y buscador.

### Criterios de aceptación

- **CA-01.** [Estados] Las opciones de la lista de sugerencias responden al cursor y a la presión. Las etiquetas y su botón de quitar responden al cursor, al foco y a la presión, sin heredar la sombra de los botones. Los campos de texto y las listas desplegables cambian de borde al pasar el cursor y al enfocarse. Las tarjetas de resultados se elevan al pasar el cursor.
- **CA-02.** [Transiciones] Los cambios de color y borde tienen transición. Una etiqueta nueva entra con una animación breve. Con `prefers-reduced-motion: reduce` no hay transformaciones ni desenfoque, y la lista de sugerencias aparece con `fade-in`.
- **CA-03.** [Claridad] En el `SkillPicker`: una sugerencia aproximada muestra «¿Quisiste decir?»; una sugerencia por alias muestra el alias escrito; una búsqueda del catálogo sin resultados muestra «Sin coincidencias en el catálogo».
- **CA-04.** [Teclado] Retroceso con el campo vacío quita la última habilidad. Al quitar una habilidad, el foco vuelve al campo.
- **CA-05.** [Filtros sin aplicar] En el buscador de talento, cuando los filtros editados difieren de los aplicados, el botón de búsqueda dice «Aplicar filtros» y muestra un indicador; al aplicarlos vuelve a «Buscar».
- **CA-06.** [Identidad] Solo tokens semánticos existentes, en claro y en oscuro; `src/ui/tokens.test.ts` sigue pasando.
- **CA-07.** [Pruebas] Vitest cubre CA-03, CA-04 y CA-05. Vitest, ESLint y E2E pasan.
