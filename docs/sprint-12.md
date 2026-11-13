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
4. **T-S12-04** Pulido de navegación, tablas y avisos (rama `chore/ui-polish-navigation-alerts`).
5. **T-S12-05** Tablas: jerarquía de acciones, hover independiente y filtros en la URL (rama `chore/ui-polish-tables-filters`).
6. **T-S12-06** Mensaje de respuesta en una hoja y menú del correo (rama `chore/ui-polish-messages-email`).

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

## T-S12-04 — Pulido de navegación, tablas y avisos

**Estado:** Completada (13 de noviembre de 2026); validación visual pendiente del responsable  
**Rol:** `Frontend` (y textos de validación del backend)  
**Origen:** revisión del responsable y el Arquitecto tras T-S12-03: enlaces subrayados en tablas, regresos fijos que sacan al usuario de su flujo y comillas angulares en avisos.

### Decisiones del responsable y el Arquitecto

- En la bandeja de la empresa, la fila abre el perfil. La columna «Acciones» lleva las pastillas «Ver perfil» y «Oportunidad», y «Cancelar» en tono de peligro (T-S8-16) si la solicitud está pendiente.
- Regla de comillas: los nombres, las etiquetas y lo que escribió el usuario van en negritas (`.notice-subject` dentro de avisos). Las citas literales (la respuesta de la institución) y los ejemplos van entre “ ”. Esta regla sustituye a la de T-S8-13, que conservaba « » en las citas.

### Criterios de aceptación

- **CA-01.** [Tablas] Ninguna tabla usa enlaces de texto para abrir un detalle. Las filas con detalle usan `data-href` con el hook compartido `ui/useRowNavigation.ts` (padrón, instituciones, empresas, oportunidades y las dos bandejas de vinculación), y la columna «Acciones» lleva `.pill-link`. Los clics en enlaces y botones de la fila no la abren.
- **CA-02.** [Regreso contextual] `ui/backLink.ts` lleva en el `state` del router el destino y el texto del regreso. Solo se aceptan rutas internas; `//dominio` y `https:` se ignoran. Orígenes: bandeja de la empresa → perfil y oportunidad («Volver a solicitudes», con su filtro); detalle de la solicitud de la institución → expediente («Volver a la solicitud», también a través del CV); padrón → alumno (con su búsqueda). Sin estado, cada detalle conserva su regreso de siempre.
- **CA-03.** [Filtro en la URL] El estado de la bandeja de la empresa vive en `?status=`, como en la de la institución (T-S8-08), para que el regreso conserve el filtro.
- **CA-04.** [Comillas] Ningún texto de la interfaz usa « »; `src/ui/copy.test.ts` lo verifica. Los mensajes de validación del backend usan “ ”.
- **CA-05.** [Avisos] `ui/Callout.tsx` (tonos `info` y `pending`) comparte la anatomía de los avisos de resultado: remarque izquierdo, ícono, fondo suave y acción en pastilla. Reemplaza los cuatro `.pending-notice`, y se eliminan las clases `.pending-notice`, `.home-notice`, `.home-action-notice` y `.linkage-notice`.
- **CA-06.** [Pruebas] Vitest cubre la fila clicable, el filtro en la URL, los regresos contextual, por defecto y rechazado, los tonos del aviso y la guarda de comillas. E2E comprueba el regreso a la bandeja filtrada. Vitest, ESLint, el build, Pest y E2E pasan.

---

## T-S12-05 — Tablas: jerarquía de acciones, hover independiente y filtros en la URL

**Estado:** Completada (13 de noviembre de 2026); validación visual pendiente del responsable  
**Rol:** `Frontend`  
**Origen:** validación de las tablas de Oportunidades y Solicitudes por el responsable y el Arquitecto.

### Decisiones del responsable y el Arquitecto

- **Acciones contextuales en su celda; acciones de fila en «Acciones».** Una acción que opera sobre un dato (escribir o llamar al contacto de la institución) va junto a ese dato. La columna «Acciones» queda para lo que opera sobre la fila completa (ver el detalle, cancelar).
- **La fila es el último recurso del clic.** No se usa `stopPropagation` en cada botón: `useRowNavigation` ignora los clics que nacen en un control. El hover de la fila se suspende mientras el cursor está sobre uno de sus controles.
- **La URL es la única fuente de la vista de un listado.** Búsqueda, filtros y página se leen y se escriben en `useSearchParams` mediante `ui/useListParams.ts`.

### Criterios de aceptación

- **CA-01.** [Acciones contextuales] El patrón `.cell-actions` coloca íconos discretos (1.75 rem, sin relleno, en acento, con su propio hover y foco) junto al texto al que pertenecen. Se aplica al contacto de la institución en la bandeja de la empresa.
- **CA-02.** [Hover independiente] El fondo de la fila solo cambia mientras el cursor no está sobre un enlace o botón de la fila. Solo la flecha de la acción principal (`.row-link`, el mismo destino que la fila) se adelanta con la fila; las demás pastillas responden solo a su propio cursor.
- **CA-03.** [Clic] La fila no navega si el clic nace en un control (enlace, botón, campo, etiqueta o `role="button"`), si se usa una tecla modificadora o si hay texto seleccionado.
- **CA-04.** [Filtros en la URL] Alumnos (`q`, `status`, `data`, `page`), empresas (`q`, `page`), oportunidades (`page`), las dos bandejas de vinculación (`status`, `page`), la bitácora (`type`, `page`) y las cuentas de la Secretaría (`page`) se reconstruyen desde la URL. Cambiar un filtro vuelve a la página 1 y reemplaza la entrada del historial.
- **CA-05.** [Regreso exacto] Los detalles de empresa, oportunidad, alumno, perfil y solicitud regresan a la URL de origen. `backState` conserva el regreso del origen, así que la cadena bandeja filtrada → solicitud → expediente → solicitud → bandeja recupera cada vista.
- **CA-06.** [Pruebas] Vitest cubre la reconstrucción desde la URL, el regreso exacto, la cadena de regresos, el clic con modificador y la ubicación de los íconos de contacto. ESLint y el build pasan.

---

## T-S12-06 — Mensaje de respuesta en una hoja y menú del correo

**Estado:** Completada (13 de noviembre de 2026); validación visual pendiente del responsable  
**Rol:** `Frontend`  
**Origen:** validación de la bandeja de solicitudes por el responsable y el Arquitecto. El mensaje de respuesta aparecía truncado bajo el estado, y `mailto:` falla sin un cliente de correo configurado.

### Decisiones del responsable y el Arquitecto

- **El mensaje se lee completo en una `Sheet`.** Es el componente existente para contenido secundario; `ConfirmDialog` es para confirmar acciones. La hoja vive fuera de la tabla.
- **El correo abre un menú propio, sin dependencias.** Sigue la mecánica del menú de cuenta: Esc, clic fuera y devolver el foco. Usa `createPortal` con posición fija y la API del portapapeles.

### Criterios de aceptación

- **CA-01.** [Mensaje] La celda de estado ya no muestra el mensaje. Si la institución dejó uno, un ícono `.cell-actions` junto al estado («Leer el mensaje de …») abre la hoja «Mensaje de la institución». La hoja muestra la institución, el estado, la fecha de respuesta, la oportunidad y el texto completo, con sus saltos de línea.
- **CA-02.** [Menú del correo] El ícono de correo (`ui/EmailMenu.tsx`) abre un menú ARIA con «Copiar correo», «Abrir en Gmail», «Abrir en Outlook» (en una pestaña nueva) y «Abrir en app del sistema» (`mailto:`). El menú muestra la dirección. Se recorre con las flechas, Inicio y Fin; se cierra con Esc, con Tab, con un clic fuera, al elegir o al desplazarse; y devuelve el foco al ícono.
- **CA-03.** [Copiar] «Copiar correo» usa `navigator.clipboard.writeText` y muestra junto al ícono el aviso «Correo copiado» (`role="status"`). Sin permiso de portapapeles, deja la dirección seleccionada en el menú y lo avisa.
- **CA-04.** [Fila] Ni el ícono, ni el menú, ni la hoja abren la fila. `useRowNavigation` ignora los clics que React propaga desde un portal, porque no están dentro de la fila en el DOM.
- **CA-05.** [Alcance] Aplica a la bandeja de la empresa y al correo de la empresa en el detalle de la solicitud de la institución, el único otro `mailto:` directo.
- **CA-06.** [Pruebas] Vitest cubre las opciones y sus enlaces, la copia con y sin portapapeles, el teclado, que la fila no navega y la hoja del mensaje. E2E abre la hoja y el menú. ESLint y el build pasan.

---

## Verificación (13 de noviembre de 2026)

- `tokens.test.ts`: 114 casos (contraste en claro y oscuro con mezclas y opacidades, capas, hover y escala). La prueba de capas encontró una quinta regla fuera de capa que la auditoría no había listado: `.institution-status.pending` en `institutions.css`, ahora dentro de `@layer legacy`.
- Vitest: 855 pruebas pasan, incluida la de la hoja de filtros (T-S12-03). Fallan 3 de descarga (`object.stream is not a function`, jsdom) que **ya fallan en `main` sin estos cambios**: `InstitutionLinkageRequests`, `ReportsPage` y `StudentSocialSecuritySection`. Quedan fuera del alcance de este Sprint.
- ESLint y `npm run build` pasan.
- Medición en Chromium (390 y 1440 px, claro y oscuro) sobre la simulación: ninguna de las 22 rutas (cuatro roles y el inicio de sesión) desborda en horizontal.
- E2E (`sh scripts/test-e2e.sh`): 44 pasan.
- T-S12-03, medido con sesiones reales en la simulación: en el buscador a 390 px la primera tarjeta aparece en y≈443 (antes, y≈1720). A 1440×900, el panel queda fijo en y=96 con «Buscar» visible. Las tarjetas de alta miden 778 px y están centradas. El diálogo cabe en 844×390.
- T-S12-04: Vitest 979 (más las 3 fallas previas de `object.stream`), ESLint, build, Pest 1455 y E2E 44 pasan. En la simulación, el perfil abierto desde la bandeja filtrada regresa a `/linkage-requests?status=PENDIENTE_INSTITUCION` (a 390 y a 1440 px), y el alumno abierto desde el padrón filtrado regresa a `/students?data=missing&status=active`.
- T-S12-05: Vitest con las mismas 3 fallas previas de `object.stream`; ESLint y el build pasan. En Chromium (simulación, 1440 px), con el cursor en el texto de la fila solo se adelanta la flecha de «Ver perfil». Con el cursor en «Oportunidad» o en el ícono de correo, la fila no se resalta y solo ese control responde. `/linkage-requests?status=PENDIENTE_INSTITUCION&page=2` abre en la página 2, y el regreso desde el perfil vuelve a esa misma URL.
- T-S12-06: Vitest con las mismas 3 fallas previas de `object.stream`; ESLint, el build y E2E (44) pasan. En la simulación, a 1440 y 390 px (tabla desplazada), el menú del correo aparece completo bajo el ícono, y abrir el menú o la hoja no cambia la URL.
