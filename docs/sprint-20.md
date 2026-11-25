# Sprint 20 — Documentación técnica (`docs/tecnica/` y PDF formal)

Sprint abierto el 25 de noviembre de 2026. Sprint anterior: [sprint-19.md](sprint-19.md) (histórico).

**Objetivo del Sprint:** documentar el sistema tal como está en `main` tras los Sprints 18 y 19 (`a01d283`), con dos salidas generadas desde una sola fuente:
- documentación viva en GitHub, en Markdown modular con diagramas Mermaid, bajo [`docs/tecnica/`](tecnica/README.md);
- un PDF formal en tamaño Carta (portada con logotipos, tabla de contenido, numeración y paleta oficial), más la exportación de cada diagrama a SVG y PNG.

**Rama y PR:** `docs/tecnica`. Un solo PR al terminar T-S20-07; cada bloque se revisa antes de avanzar al siguiente.

**Despliegue:** ninguno. El Sprint no modifica código de la aplicación ni infraestructura.

## Diagnóstico (25 de noviembre de 2026)

Auditoría de solo lectura de `main`:
- **Modelo de datos:** 46 migraciones y 28 tablas. 9 tablas se crean con SQL crudo (`CREATE TABLE`), no con `Schema::create`: `companies`, `municipalities`, `opportunities`, `opportunity_skills`, `linkage_requests`, `linkage_messages`, `institution_videos`, `account_audit_events` y `student_disclosures`.
- **API:** 105 definiciones de ruta en `routes/api.php`, más 6 en `routes/web.php` (sesión y enlaces de un solo uso), protegidas por la cadena `auth:sanctum` → `active` → `role:`.
- **Infraestructura:** 3 workflows, Packer 1.16.2, Terraform 1.17.2, 5 módulos más `bootstrap`, región `us-east-2`.
- **Herramientas locales:** no hay Pandoc, Typst, LaTeX, Mermaid CLI ni Chromium en el sistema. Chromium solo existe dentro de la imagen de E2E (`docker/testing/Dockerfile.e2e`). Sí hay Docker y Podman.

## Decisiones del responsable (25 de noviembre de 2026)

- **D1. Sprint formal:** la documentación se registra como Sprint 20, con las tareas `T-S20-01` a `T-S20-07` mapeadas a los bloques B0–B6.
- **D2. Solo script local:** `scripts/docs-pdf.sh` y `docs/tecnica/tools/`. No se agrega un workflow `docs-pdf.yml` en este Sprint.
- **D3. Tamaño Carta (`Letter`)** para el PDF, estándar de entrega e impresión en México.
- **D4. Fuente única de diagramas:** cada diagrama vive una sola vez, como bloque ```` ```mermaid ```` dentro del capítulo que lo usa (GitHub lo dibuja ahí). Su primera línea lo identifica (`%% D05a: Título`). El script extrae los bloques desde esos `.md`, valida su sintaxis y exporta `Dxx.svg` y `Dxx.png`; no existen copias `.mmd`.
- **D5. Herramienta de compilación:** Chromium de Playwright dentro de un contenedor fijado (la misma base `node:24-bookworm-slim` que E2E) dibuja tanto los diagramas como el PDF. Pandoc y Typst se descartan porque no dibujan las etiquetas HTML (`<foreignObject>`) de Mermaid.
- **D6. Sin binarios en Git:** `docs/tecnica/build/` se ignora; el PDF, los SVG y los PNG se generan localmente.
- **D7. Diagramas legibles en una página:** C4 con `flowchart` (la sintaxis C4 de Mermaid es experimental) y el modelo Entidad-Relación dividido en 4 dominios.

## Fuera de alcance

- Cambios en el código de la aplicación, la infraestructura o los workflows existentes.
- El workflow `docs-pdf.yml` (D2).
- Despliegue en AWS.

---

## Tareas técnicas

### T-S20-01 — B0: estructura de `docs/tecnica/` y registro del Sprint

**Estado:** completada.

**Alcance:**
- Este archivo; `CLAUDE.md`, `AGENTS.md` y `README.md` apuntan al Sprint 20.
- Árbol de capítulos en `docs/tecnica/` con su índice ([README](tecnica/README.md)) y el catálogo de diagramas.
- `.gitignore` excluye `docs/tecnica/build/` y `docs/tecnica/tools/node_modules/`.

### T-S20-02 — B1: catálogo de diagramas con el tema de marca

**Estado:** completada (diagramas aprobados el 25 de noviembre de 2026; D11 muestra las salidas a SMTP, ACME y SSM por el Internet Gateway, frente al endpoint Gateway de S3).

**Alcance:**
- 18 bloques Mermaid (D01–D15; D05 se divide en D05a–D05d), cada uno en su capítulo y verificado contra los archivos que cita el catálogo.
- Tema de marca en `docs/tecnica/tools/mermaid-theme.json`: vino `#991B30`, gris grafito `#57565B` y dorado `#B99058` solo en bordes y separadores, como en [identidad-visual.md](design/identidad-visual.md).
- `sh scripts/docs-pdf.sh diagramas`:
  - valida la sintaxis de todos los bloques;
  - comprueba que cada identificador sea único y coincida con el catálogo del índice;
  - exporta `docs/tecnica/build/diagramas/Dxx.svg` y `Dxx.png` (a 2×).

**Decisiones de implementación:**
- **Etiquetas como texto SVG** (`htmlLabels: false`), no `<foreignObject>`, para que el SVG sea portable fuera del navegador. Mermaid deja el fondo de las etiquetas de flecha desalineado y al 50 %. El script lo ajusta al tamaño real del texto para que la línea no lo tache.
- **Participantes como cajas** en las secuencias. La figura `actor` dejaba su nombre en blanco sobre blanco con la paleta de marca.
- **Proporción apta para Carta.**
  - D01, D12, D13 y D15 agrupan sus nodos en filas (`subgraph` con `direction LR`); antes medían 1:4 o 10:1.
  - D03 pasa a `TB`; D05b y D05d a `direction LR`.

**Verificación (25 de noviembre de 2026):**
- `sh scripts/docs-pdf.sh diagramas`: 18 de 18 válidos y exportados. La primera construcción de la imagen tarda unos 3 minutos; las siguientes usan la caché.
- Prueba negativa sobre una copia de `docs/tecnica/`. El script termina con código 1 y señala archivo y línea en los tres casos:
  - un identificador repetido (D02);
  - uno fuera del catálogo (D99);
  - un error de sintaxis (D01).
- Revisión visual de cada PNG: sin palabras cortadas, sin etiquetas tachadas y sin nombres ocultos.

### T-S20-03 — B2: visión general, stack, ADRs, roles y metodología

**Estado:** pendiente.

### T-S20-04 — B3: modelo de datos, almacenamiento S3 y ficha compartida

**Estado:** pendiente.

### T-S20-05 — B4: backend, API, colas y correos; frontend y CSP

**Estado:** pendiente.

### T-S20-06 — B5: infraestructura, operación, seguridad, pruebas y entorno local

**Estado:** pendiente. Los conteos de pruebas se obtienen ejecutando las suites (`sh scripts/test-backend.sh`, Vitest y `sh scripts/test-e2e.sh`, en secuencia), no copiándolos de Sprints anteriores.

### T-S20-07 — B6: PDF formal

**Estado:** pendiente. `sh scripts/docs-pdf.sh pdf` genera el PDF en tamaño Carta con portada, tabla de contenido y numeración (Paged.js).
