# Sprint 12 — Estabilización UI/UX y Sistema de Diseño

Sprint vigente desde el 13 de noviembre de 2026. Sprint anterior: [sprint-11.md](sprint-11.md) (histórico).

**Objetivo del Sprint:** cerrar los hallazgos de la Fase 1 de la auditoría visual y de UX (consistencia del sistema de diseño) antes de pasar a infraestructura: jerarquía correcta en modo oscuro, cascada predecible, escala tipográfica única y componentes base consistentes. No cambia comportamiento ni datos.

**Rama:** `feat/hu-s12-ui-ux-audit`.

**Origen:** auditoría UI/UX, Fase 1 «Consistencia del Sistema de Diseño (Tokens y Tipografía)», del 13 de noviembre de 2026, prioridades 1 a 6.

## Decisiones del responsable y el Arquitecto (13 de noviembre de 2026)

- **Solo frontend y solo estilos.** No hay cambios de backend, rutas, textos ni lógica de componentes, salvo lo que exijan las pruebas.
- **Los colores se siguen escribiendo solo en los bloques de tokens de `index.css`.** El overlay de modales y hojas (`--scrim`) es un negro semitransparente absoluto, definido como token en los dos temas.
- **La escala tipográfica usa el prefijo `--type-*`.** El prefijo `--text-*` ya nombra tokens de color (`--text`, `--text-strong`) y además lo usa Tailwind v4 para sus propios tamaños; reutilizarlo sería ambiguo.
- **Tamaño mínimo legible: 12 px (`--type-xs`, 0.75rem).**
- **Hover solo con puntero.** Todo `:hover` vive dentro de `@media (hover: hover)` para que no quede fijo en pantallas táctiles.

## Orden de implementación

1. **T-S12-01** Limpieza de tokens y especificidad CSS.
2. **T-S12-02** Escala tipográfica y componentes base.
3. **T-S12-03** Correcciones de layout y responsividad (extensión del 13 de noviembre de 2026).

## Fuera de alcance

- Hallazgos de la Fase 2 que el responsable no incluyó en T-S12-03: título del encabezado en dos líneas a 390 px (4), radios y casillas nativos de 13 px y `.spotlight-dot` (6) y el botón «Buscar» del padrón en móvil (7).
- Rediseño de vistas, nuevos componentes o cambios de paleta de marca.
- Radios de los contenedores legacy de instituciones (`.delivery-method`, `.manual-setup-link`).

---

## T-S12-01 — Limpieza de tokens y especificidad CSS

**Estado:** Completada (13 de noviembre de 2026); validación visual pendiente del responsable  
**Rol:** `Frontend`  
**Prioridades de la auditoría:** 1, 2 y 5.

### Criterios de aceptación

- **CA-01.** [Capas] `talent.css`, `linkage.css`, `opportunities.css` y `companies.css` declaran su contenido dentro de `@layer components`. Ninguna hoja de `src/` contiene reglas fuera de una capa (salvo `layers.css`, que declara el orden), y una prueba lo verifica.
- **CA-02.** [`--ink`] `--ink` se define en los dos bloques de tokens: en claro oscurece `--text`; en oscuro lo aclara hacia `--text-strong`. En ambos temas su contraste sobre `--surface` es mayor o igual que el de `--text`.
- **CA-03.** [Overlay] Modales y hojas usan el token `--scrim` (negro semitransparente) en lugar de una mezcla de `--ink`.
- **CA-04.** [Tokens con función] Se crean `--on-danger` (ícono sobre el relleno de peligro), `--inverse-surface` y `--on-inverse` (tooltip). El botón eliminar de videos y su tooltip dejan de usar `--surface` y `--text-strong` fuera de su función.
- **CA-05.** [Pruebas] `tokens.test.ts` verifica en claro y en oscuro: `--accent` sobre `--tint` y `--tint-hover`, el texto de `.chip.soft`, el texto secundario con opacidad 0.9 sobre `--tint`, los íconos con opacidad 0.7 (≥ 3:1), `--ink`, `--on-danger` y `--on-inverse`.

---

## T-S12-02 — Escala tipográfica y componentes base

**Estado:** Completada (13 de noviembre de 2026); validación visual pendiente del responsable  
**Rol:** `Frontend`  
**Prioridades de la auditoría:** 3, 4 y 6.

### Criterios de aceptación

- **CA-01.** [Escala] `index.css` define `--type-xs` (0.75rem), `--type-sm` (0.875rem), `--type-base` (1rem), `--type-lg` (1.15rem), `--type-xl` (1.4rem) y `--type-2xl` (1.75rem). Fuera de los `clamp()` de títulos de página, los `font-size` usan la escala; ninguno queda por debajo de `--type-xs`.
- **CA-02.** [Jerarquía] `h2` usa `--type-xl`, `h3` `--type-lg` y `h4` `--type-base`. Los subtítulos de sección en acento (`legend` de formularios y `h4`) comparten tamaño `--type-base` y peso 600. Los títulos de tarjeta usan peso 600; las insignias de estado, `--type-xs` y 700.
- **CA-03.** [Pastillas] `.pill-link` y `button.account-action` comparten alto, tamaño de letra y borde de 1px.
- **CA-04.** [Botones-ícono] Tres tamaños como máximo, definidos como tokens: `--icon-button-sm` (1.75rem), `--icon-button-md` (2.5rem) y `--icon-button-lg` (2.75rem, táctil y multimedia).
- **CA-05.** [Botón principal como enlace] `.home-action` usa el radio de 10 px, el padding y el borde de `button`.
- **CA-06.** [Hover] Todo `:hover` está dentro de `@media (hover: hover)`, y una prueba lo verifica.
- **CA-07.** [Legacy] Se eliminan de `index.css` e `institutions.css` las declaraciones que `ui.css` ya anula (radios de 0.35rem en botones y campos, fondo del botón secundario, interlineado de `h1`, opacidad de `:disabled`).
- **CA-08.** [Calidad] Vitest, ESLint y el build pasan; `tokens.test.ts` sigue pasando.

---

## T-S12-03 — Correcciones de layout y responsividad

**Estado:** Completada (13 de noviembre de 2026); validación visual pendiente del responsable  
**Rol:** `Frontend`  
**Origen:** auditoría UI/UX, Fase 2 «Layouts y responsividad» (hallazgos 1, 2, 3, 5 y 8), medida en la simulación a 390 y 1440 px con sesiones reales.

### Decisiones del responsable y el Arquitecto

- En el buscador, los filtros pasan a una `Sheet` por debajo de 960 px, el mismo corte en el que la retícula pasa a una sola columna. En escritorio el panel es `sticky`.
- Las tablas conservan su desplazamiento horizontal dentro de la tarjeta (no se convierten en tarjetas apiladas). Solo se añade una señal visual de que hay más columnas.
- Las vistas de alta y edición centran toda la tarjeta (navegación, título y formulario), no solo el formulario, para que el título y el formulario sigan alineados.

### Criterios de aceptación

- **CA-01.** [Tarjeta] Hasta 600 px, `.card` usa un padding de 1.25 rem, como indica `identidad-visual.md`.
- **CA-02.** [Buscador en escritorio] Desde 960 px, el panel de filtros es `sticky` y tiene su propio desplazamiento, con la altura de la ventana como máximo. «Buscar» y «Limpiar filtros» quedan fijos al pie del panel.
- **CA-03.** [Buscador en pantallas estrechas] Por debajo de 960 px, los resultados aparecen sin recorrer el panel. Un botón «Filtros» (con «(n)» cuando hay filtros aplicados y el indicador de cambios sin aplicar de T-S11-01) abre los filtros en una `Sheet`, que se cierra al aplicarlos.
- **CA-04.** [Formularios] En el alta y la edición de instituciones, empresas y oportunidades, la tarjeta se limita a `--content-readable` más su padding y se centra.
- **CA-05.** [Diálogo] `.modal-dialog` mide como máximo `min(90vh, 100dvh − 2rem)` y se desplaza por dentro: los botones siguen alcanzables en un teléfono en horizontal.
- **CA-06.** [Tablas] Ninguna tabla desborda la página. Las envolturas `.data-table-wrapper` e `.institution-table-wrapper` muestran una sombra en el borde mientras quedan columnas por desplazar.
- **CA-07.** [Pruebas] Vitest cubre CA-03. Vitest, ESLint, el build y E2E pasan.

### Medición del hallazgo 8 (390 px, sesiones reales)

Ninguna página desborda; las 12 tablas medidas se desplazan dentro de su envoltura (298 px visibles).

| Vista | Ancho de la tabla | Visible |
|---|---|---|
| Padrón de alumnos (50 filas) | 538 px | 55 % |
| Bandeja de solicitudes de la institución | 951 px | 31 % |
| Solicitudes enviadas por la empresa | 985 px | 30 % |
| Oportunidades | 815 px | 37 % |
| Instituciones, empresas y cuentas de la Secretaría | 708–734 px | 41–42 % |
| Bitácora | 501 px | 59 % |
| Reporte ejecutivo (3 tablas) | 467–875 px | 34–64 % |

Como la columna de estado y la de acciones quedan fuera de la vista sin ninguna señal, se añadió la sombra de CA-06.

---

## Verificación (13 de noviembre de 2026)

- `tokens.test.ts`: 114 casos (contraste en claro y oscuro con mezclas y opacidades, capas, hover y escala). La prueba de capas encontró una quinta regla fuera de capa que la auditoría no había listado: `.institution-status.pending` en `institutions.css`, ahora dentro de `@layer legacy`.
- Vitest: 855 pruebas pasan, incluida la de la hoja de filtros (T-S12-03). Fallan 3 de descarga (`object.stream is not a function`, jsdom) que **ya fallan en `main` sin estos cambios**: `InstitutionLinkageRequests`, `ReportsPage` y `StudentSocialSecuritySection`. Quedan fuera del alcance de este Sprint.
- ESLint y `npm run build` pasan.
- Medición en Chromium (390 y 1440 px, claro y oscuro) sobre la simulación: ninguna de las 22 rutas (cuatro roles y el inicio de sesión) desborda en horizontal.
- E2E (`sh scripts/test-e2e.sh`): 44 pasan.
- T-S12-03, medido con sesiones reales en la simulación: en el buscador a 390 px la primera tarjeta aparece en y≈443 (antes, y≈1720). A 1440×900, el panel queda fijo en y=96 con «Buscar» visible. Las tarjetas de alta miden 778 px y están centradas. El diálogo cabe en 844×390.
