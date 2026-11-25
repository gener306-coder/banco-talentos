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

**Estado:** completada (aprobada el 25 de noviembre de 2026, commit `1660a69`).

**Alcance:**
- **Cap. 01:** visión y alcance (D02); stack con versiones declaradas y resueltas de los lockfiles; arquitectura y módulos (D03); 6 ADRs con contexto, decisión, alternativas y consecuencias, registrados de forma retrospectiva con su fecha original.
- **Cap. 02:**
  - roles, quién crea cada cuenta y casos de uso (D01);
  - ciclo de vida de la vinculación (D08);
  - matriz de permisos derivada ruta por ruta de `routes/api.php` y `routes/web.php`;
  - metodología (D15).

**Verificación:**
- Cada afirmación se contrastó con el archivo citado en «Fuentes en el repositorio».
- Correcciones hechas durante la redacción:
  - el `CHECK users_role_organization` no exige `institution_id`: lo exige el middleware;
  - la regla `NoContactInformation` también cubre habilidades y certificaciones.
- Los 18 bloques Mermaid son idénticos a los aprobados en T-S20-02.
- `sh scripts/docs-pdf.sh diagramas` sigue en 18 de 18.
- Los enlaces relativos de `docs/tecnica/` resuelven todos.

### T-S20-04 — B3: modelo de datos, almacenamiento S3 y ficha compartida

**Estado:** completada (aprobada el 25 de noviembre de 2026, commit `809f6ff`).

**Alcance:**
- **Modelo de datos:**
  - las 28 tablas por dominio, leídas migración por migración (las 9 de SQL crudo y los `ALTER TABLE` posteriores);
  - convenciones: FK compuestas de pertenencia, `CHECK` relacionados, 3 índices únicos parciales, 3 triggers, PostGIS y búsqueda por trigramas;
  - catálogos INEGI (2,478 municipios) y de habilidades (820);
  - la bitácora como unión de columnas de autoría y eventos;
  - la nota de `users_role_organization` (la base no exige `institution_id`; lo exige `institution.member`).
- **Almacenamiento:** discos y prefijos, controles del bucket, URLs prefirmadas con caducidad por hora, comprobantes solo con sesión, certificados de Caddy y límites de subida.
- **Ficha compartida:** lista blanca, reglas y dónde se cumplen, datos en vivo, flujo con D09, trazabilidad y pruebas.

**Correcciones a lo aprobado en T-S20-02 y T-S20-03:**
- D05a: `actor_kind` vale `user` o `cli`, no `console`.
- D09 y ADR-006: el trigger de `student_disclosures` no es de solo inserción; solo admite revocar una vez, y rechaza el `DELETE` y cualquier otro cambio.

### T-S20-05 — Cap. 04 (backend) y Cap. 05 (frontend)

**Estado:** completada (Cap. 04 en `809f6ff` y Cap. 05 en `51d4b63`).

**Alcance del Cap. 04:** arquitectura Laravel (D04), catálogo de las 111 rutas (ninguna `DELETE`), colas y FFmpeg (D10), y correos transaccionales (D06, D07). El detalle está en el commit `809f6ff`.

**Alcance del Cap. 05:**
- **Arquitectura de la SPA:** arranque, rutas y `ProtectedRoute`, sesión por cookie y validación del contrato de cada respuesta (125 comprobaciones), sondeo de no leídos y bloques de la ficha compartida.
- **Componentes compartidos:**
  - `Sheet`, `ConfirmDialog`, `LoadingState` y `StateMessage`;
  - `PasswordField` (T-S18-01) y `EmailMenu` (T-S12-06);
  - `emailState`, `EmailStatusBadge`, `AccessEmailSection` y `/confirm-email` (Sprint 19).
- **Tokens y CSP:** tokens y lo que verifica `tokens.test.ts`; la CSP real del `Caddyfile`, contrastada directiva por directiva con lo que carga la SPA:
  - el `dist/index.html` compilado no tiene scripts ni estilos en línea;
  - los videos y pósteres vienen de S3 sin `crossorigin`;
  - la vista previa local usa `blob:`.
- **Limitación documentada:** la CSP no se aplica en local ni en E2E, solo en el piloto.

### T-S20-06 — Cap. 06 (infraestructura y operación) y Cap. 07 (seguridad, pruebas y entorno local)

**Estado:** Cap. 06 completado (`51d4b63`); Cap. 07 en revisión (B5).

**Alcance del Cap. 07:**
- **Seguridad:** las capas de extremo a extremo con enlace a su detalle, la verificación automática (`ApiSecurityMatrixTest`, `tokens.test.ts`, `smoke.sh`, `99-verify.sh`, `npm audit` y `composer audit`) y las limitaciones conocidas.
- **Estrategia y conteos de pruebas.** Corridas en secuencia el 25 de noviembre de 2026, de 18:04 a 18:45 UTC, sobre `51d4b63`, cuyo código es idéntico al de `main` en `a01d283`:

  | Suite | Resultado | Duración |
  |---|---|---|
  | Pest | 1810 de 1810 (18 103 aserciones) | 1528 s |
  | Vitest | 1637 de 1637 (80 archivos) | 71.6 s |
  | Playwright | 82 de 82 | 10.1 min |
- **Entorno local:** guía verificada contra `compose.yaml` para Linux, macOS y Windows con WSL 2.
  - **Apple Silicon:** `postgis/postgis:17-3.5` solo existe para amd64 y corre emulado; las demás imágenes son nativas.
  - **WSL 2:** clonar dentro del sistema de archivos Linux y usar `core.autocrlf input`, porque el repositorio no tiene `.gitattributes`.
  - **Variables y correo:** las de los dos `.env`, Mailpit y `mail:preview`.

**Alcance del Cap. 06:**
- **Topología AWS** (D11): recursos por módulo, flujos de red y salidas.
- **Packer** (D12): fuente, scripts, qué exige `99-verify.sh`, configuración horneada y ciclo de vida de las AMIs.
- **Terraform:** `bootstrap/` con estado local fuera de Git, `envs/pilot` con bloqueo nativo, y parámetros y secretos.
- **GitHub Actions** (D13, D14): jobs, entornos y protecciones.
- **Operación:** mapa del runbook sin duplicarlo, más las notas verificadas:
  - orden de pausa y reanudación;
  - reinicio automático de RDS a los 7 días;
  - verificación de migraciones por SSM;
  - cambiar la base de un PR no relanza el CI.
- **IDs del piloto** (AMI, instancia y ejecuciones) solo como referencia histórica.

**Verificación de B4:**
- **D13 y la metodología:** `backend-lint` también ejecuta `composer audit`. Es el único cambio en un diagrama.
- **Correcciones durante la redacción:**
  - `MunicipalityCombobox` no se usa en las vistas de instituciones;
  - el `blob:` de la vista previa es `media-src`, no `img-src`.
- **Afirmaciones sin fuente:** se quitó una fila sobre la pausa actual del piloto que no consta en el repositorio.
- **Validaciones:** `sh scripts/docs-pdf.sh diagramas` en 18 de 18, y enlaces y anclas internas en 0 rotos.

Los conteos de pruebas se obtienen ejecutando las suites (`sh scripts/test-backend.sh`, Vitest y `sh scripts/test-e2e.sh`, en secuencia), no copiándolos de Sprints anteriores.

### T-S20-07 — B6: PDF formal

**Estado:** pendiente. `sh scripts/docs-pdf.sh pdf` genera el PDF en tamaño Carta con portada, tabla de contenido y numeración (Paged.js).
