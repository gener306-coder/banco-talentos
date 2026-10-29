# Identidad visual base — Nodologístico

**Estado:** requisito transversal comunicado para el frontend. Los colores se muestrearon del logotipo proporcionado y deben confirmarse contra el archivo de marca original si está disponible.

## Alcance

- Incorporar el logotipo y una paleta derivada de sus colores en las nuevas vistas del frontend.
- No crear pantallas ni cambiar las rutas existentes.
- Las vistas existentes se migraron a la marca el 7 de octubre de 2026 (ver «Uso en vistas»).

## Logotipo

Existe una única variante del logotipo, más el logotipo institucional de la Secretaría de Economía como coemblema:

| Archivo | URL en el navegador | Uso |
|---|---|---|
| `frontend/public/brand/logo.png` | `/brand/logo.png` | Versión a color, para fondos claros (blanco o gris claro) |
| `frontend/public/brand/logob.png` | `/brand/logob.png` | Versión blanca para fondo oscuro; se usará cuando se active el modo oscuro (ver «Modo oscuro») |
| `frontend/public/brand/sec-economia.png` | `/brand/sec-economia.png` | Coemblema institucional, horizontal (1920 × 414 px, fondo transparente) |

Versión entregada el 29 de octubre de 2026, de mejor calidad que la anterior. Las dos variantes del logotipo principal son PNG con fondo transparente de **404 × 480 px**:
- se recortaron con la misma caja (el margen transparente común más 10 px), para que ocupen exactamente el mismo espacio y se puedan intercambiar sin mover nada;
- se redujeron desde 1102 × 1427 px, lo que da nitidez de sobra para 3× en el login y en el encabezado, con unos 130 KB cada una.

No se alteró el dibujo ni los colores. Sin modo oscuro activo, el logotipo a color no debe ir sobre fondos oscuros ni sobre el color primario vino.

Mantener la proporción y los colores originales; no recolorear, deformar ni recortar el dibujo. Fijar sólo la altura (`h-*` con `w-auto`), declarar `width={404} height={480}` para reservar el espacio y usar `alt="Nodologístico"`.

Ubicaciones actuales:

| Lugar | Componente | Altura |
|---|---|---|
| Encabezado general translúcido, junto al título | `App.tsx` | `h-14` (56 px); hasta 480 px, `h-11` (44 px). No se muestra en `/login` para no duplicarlo. |
| Parte superior del formulario de login | `pages/LoginPage.tsx` | `h-36` (144 px), centrado. |
| Secretaría de Economía, extremo derecho del encabezado general | `App.tsx` (`.app-bar-partner`) | `h-11` (44 px), centrado verticalmente con el logotipo principal y separado del título por un filete `neutral-200`. Se muestra en todas las vistas, también en `/login`. Hasta 480 px: `h-[1.6rem]`, con el título a 1.15rem. |

En todas las ubicaciones el logotipo va dentro de `.brand-plate`. En el tema claro la pastilla es transparente y no ocupa espacio.

El logotipo de la Secretaría de Economía se usa tal cual: `alt="Secretaría de Economía"`, `width={1920} height={414}` y solo altura fija (`w-auto`), sin recolorear ni recortar el escudo ni el texto.

A 56 px el símbolo se reconoce con claridad y el texto «nodologístico» se distingue, aunque es pequeño; el título textual permanece en el `h1`. Para un tamaño menor, solicitar una versión horizontal o un símbolo en SVG.

## Paleta y tokens

| Token | Color | HEX muestreado | Uso previsto |
|---|---|---|---|
| `brand-primary` | Vino | `#991B30` | Acciones primarias, enlaces, títulos `h1`/`h2` y bordes de botones secundarios |
| `brand-primary-hover` | Vino oscuro | `#7A1626` | Únicamente estado hover de acciones primarias (definido para el proyecto, no muestreado) |
| `brand-secondary` | Dorado | `#B99058` | Exclusivamente decorativo: bordes, separadores y detalles |
| `brand-neutral` | Gris grafito | `#57565B` | Texto y elementos neutros |

El fondo `#F7F7F7` de las imágenes recibidas originalmente correspondía al lienzo del PNG; no se considera un color de marca aprobado.

Los tokens están definidos con Tailwind CSS v4 en `frontend/src/index.css`:

```css
@theme {
  --color-brand-primary: #991B30;
  --color-brand-primary-hover: #7A1626;
  --color-brand-secondary: #B99058;
  --color-brand-neutral: #57565B;
}
```

Clases resultantes, entre otras: `bg-brand-primary`, `text-brand-neutral`, `border-brand-secondary`.

No introducir nuevos colores de marca ni valores hexadecimales dispersos en vistas.

### Neutros y colores semánticos

- **Neutros:** escala `neutral` de Tailwind: `neutral-100` (fondo de la aplicación, hover de botones secundarios, encabezado de tablas), `neutral-200` (bordes de tarjetas, tablas y separadores) y `neutral-500` (borde de campos, contraste 4.74:1 sobre blanco, por encima del 3:1 que exige WCAG para componentes). Blanco: `--color-white`. Sustituyen a los grises con tinte verde azulado anteriores.
- **Semánticos, sin cambios:** error (`#7c2921`, `#b74738`, `#fff3ef`), éxito (`#155b36`, `#e4f3e9`, `#327a4a`), insignias ACTIVA/INACTIVA y foco (`#ad620e`, 4.64:1 sobre blanco). No son colores de marca y mantienen su significado.
- El rojo de error y el vino de marca tienen luminancia casi igual (1.16:1 entre sí). Los avisos de error se distinguen por su fondo, borde izquierdo y `role="alert"`; no usar el vino para comunicar errores.

### Tokens semánticos

Las hojas de estilo no usan los colores de la marca ni valores HEX directamente: usan tokens que nombran la **función** del color. Se definen una sola vez en `frontend/src/index.css` (bloque `:root` que termina en `/* Fin de los tokens semánticos. */`). Un tema futuro, por ejemplo oscuro, solo tendría que redefinir ese bloque. Los valores son exactamente los anteriores: el cambio no altera nada visible.

| Token | Valor actual | Función |
|---|---|---|
| `--surface` | `--color-white` | Tarjetas, paneles, hojas, campos |
| `--surface-muted` | `--color-neutral-100` | Fondo de la aplicación, encabezados de tabla, hover de botones secundarios |
| `--text` | `--color-brand-neutral` | Texto y elementos neutros |
| `--border` | `--color-neutral-200` | Bordes de tarjetas, tablas y separadores |
| `--border-strong` | `--color-neutral-500` | Borde de campos y la barra de arrastre de las hojas |
| `--accent` / `--accent-hover` | `--color-brand-primary` / `-hover` | Acciones primarias, enlaces, títulos |
| `--on-accent` | `--color-white` | Texto sobre el acento |
| `--accent-secondary` | `--color-brand-secondary` | Decoración dorada (etiquetas de habilidades blandas) |
| `--accent-secondary-text` | `#6b4f22` | Texto sobre el dorado tintado |
| `--focus-ring` | `#ad620e` | Contorno de foco |
| `--danger-text` / `--danger-surface` / `--danger-border` | `#7c2921` / `#fff3ef` / `#b74738` | Errores |
| `--success-text` / `--success-surface` / `--success-border` | `#155b36` / `#e4f3e9` / `#327a4a` | Éxito, estado ACTIVO y certificación revisada |
| `--status-off-text` / `--status-off-surface` | `#5d4b36` / `#f2ebdf` | Estado INACTIVO y «Sin revisar» |
| `--shadow` | `#000` | Base de sombras y de `--ink`, en mezclas `color-mix(… N%, transparent)` |

Los derivados de apple-design en `ui/ui.css` (`--tint`, `--tint-hover`, `--fill`, `--glass`, `--ink`) se calculan sobre estos tokens.

Tokens añadidos con el modo oscuro. En el tema claro son alias de los anteriores, así que no cambian nada visible:

| Token | Valor claro | Función |
|---|---|---|
| `--text-strong` | `--color-brand-neutral` | Texto de máximo contraste del encabezado («Educación Dual») |
| `--accent-fill` / `--accent-fill-hover` | `--color-brand-primary` / `-hover` | Relleno de las acciones primarias (botones, «Nueva …», menú de cuenta abierto) |
| `--logo-plate` / `--logo-plate-padding` | `transparent` / `0` | Pastilla de los logotipos |

**Regla:** en una hoja de estilos nueva, usar solo tokens semánticos. `src/ui/tokens.test.ts` falla si:
- alguna hoja, fuera de `@theme` y de los bloques de tokens claro y oscuro, escribe un HEX, `rgb()`, `hsl()`, `black`/`white` o un `var(--color-…)` directamente;
- un `.tsx` usa utilidades de color de Tailwind (`text-|bg-|border-brand-*`, `neutral`, `white`, `black`), que fijarían el tema claro;
- el bloque oscuro no define exactamente los mismos tokens que el claro, o algún par de texto queda por debajo del umbral de contraste.

## Modo oscuro

**Estado: preparado, no activado** (28 de octubre de 2026). Se implementó y revisó completo, pero el responsable decidió mantener la aplicación solo en claro hasta contar con logotipos aprobados para fondo oscuro. La aplicación se muestra en claro aunque el sistema prefiera el oscuro (`e2e/theme.spec.ts`).

Queda listo y protegido por `src/ui/tokens.test.ts`:
- el bloque de tokens oscuros;
- los tokens `--text-strong`, `--accent-fill` y `--logo-plate`;
- la pastilla `.brand-plate`, transparente en claro;
- las reglas de color del encabezado basadas en tokens.

Todo token nuevo debe definirse también en el bloque oscuro y cumplir el contraste.

**Para activarlo:**
1. Recuperar la activación del commit `0ac5ccc` («modo oscuro alineado a la identidad visual»): `src/ui/theme.ts` y sus pruebas, el script previo al pintado de `index.html`, `watchTheme()` en `main.tsx`, el selector «Tema» del menú de cuenta (`AccountMenu.tsx`, con sus estilos `.account-theme` y su prueba en `SessionPage.test.tsx`) y la versión de `e2e/theme.spec.ts` que comprueba el tema oscuro.
2. Con logotipos oficiales para fondo oscuro, mostrarlos cuando el tema activo sea oscuro y retirar la pastilla. Colores del encabezado oscuro en reposo y sobre una tarjeta: `#1E1C21` y `#211F24`. Se recomiendan PNG o SVG con fondo transparente, no un fondo sólido. La variante de la Secretaría de Economía debe solicitarse a la propia Secretaría, porque incluye el Escudo Nacional.
3. Revisar de nuevo las capturas de las vistas en ambos temas.

Diseño aprobado para cuando se active:

**Activación.** Sigue la preferencia del sistema (`prefers-color-scheme`) y el menú de cuenta ofrece **Tema: Sistema / Claro / Oscuro**, guardado solo en el navegador (`localStorage['bt-theme']`). El tema se expresa como `data-theme="light" | "dark"` en `<html>` y se fija antes del primer pintado.

**Paleta.** El bloque `:root[data-theme='dark']` de `index.css`, que termina en `/* Fin de los tokens del tema oscuro. */`, redefine los mismos tokens con `color-scheme: dark`, así que los controles nativos también se oscurecen. Contrastes calculados con la fórmula WCAG:

| Token | Oscuro | Contraste |
|---|---|---|
| `--surface` / `--surface-muted` | `#211f24` / `#17161a` | — |
| `--text` | `#e6e4e8` | 12.9:1 sobre surface, 14.3:1 sobre muted |
| `--text-strong` | `#fff` | 16.9:1 sobre el encabezado |
| `--border` / `--border-strong` | `#3a3840` / `#8a8790` | borde de campos 4.6:1 (≥ 3:1) |
| `--accent` / `--accent-hover` | `#e07a8a` / `#ea97a3` | 5.7:1 / 7.4:1 sobre surface |
| `--accent-fill` / `--accent-fill-hover` | vino `#991B30` / `#7A1626` | blanco encima 8.2:1 / 10.7:1 |
| `--accent-secondary` / `-text` | dorado / `#e3c48f` | 7.4:1 sobre la etiqueta dorada |
| `--focus-ring` | `#f0a04b` | 7.7:1 |
| `--danger-*` | `#f2a79b` / `#3a1e1b` / `#d9705f` | 7.8:1 |
| `--success-*` | `#8fd3a6` / `#183324` / `#4f9c6a` | 7.8:1 |
| `--status-off-*` | `#e0cdb0` / `#362e24` | 8.6:1 |
| `--logo-plate` | `#f1f0f3` | vino del logotipo 7.2:1, guinda de la Secretaría 10.6:1 |

**Vino aclarado.** `#E07A8A` es un color definido para el proyecto, no muestreado. Se usa solo como texto: títulos, enlaces, «Banco de Talentos» y bordes de botones. Las acciones primarias conservan el vino de marca `#991B30` con texto blanco y un filete `#E07A8A` que las separa del fondo oscuro.

**Encabezado.** Gris oscuro translúcido con el mismo difuminado (`--glass` sobre la superficie oscura), «Educación Dual» en blanco (`--text-strong`) y «Banco de Talentos» en vino aclarado.

**Logotipos.** No hay variantes para fondo oscuro. Sobre el gris oscuro, sus colores caerían a 1.2–1.7:1 (guinda de la Secretaría 1.2:1, vino y grafito de Nodologístico 1.7:1). Por eso cada logotipo se muestra tal cual, sin recolorear, sobre una pastilla clara redondeada ajustada a su tamaño, de modo que sigue sobre un fondo claro como exige la regla de arriba. Es una solución provisional que el responsable consideró visualmente insuficiente, y por eso el modo oscuro no se activó. Las variantes para fondo oscuro que aprueben los dueños de cada marca sustituirán a las pastillas sin tocar los tokens.

**Errores frente al vino.** La regla del tema claro se mantiene: los avisos de error se distinguen por su fondo, su borde izquierdo y `role="alert"`, no solo por el color del texto.

## Accesibilidad

Meta del proyecto: contraste mínimo de **4.5:1 para texto y controles interactivos** respecto a su fondo. Es el umbral del proyecto para ambos; WCAG 2.2 AA fija 4.5:1 para texto normal y otros umbrales según el tipo de contenido.

Contraste calculado con la fórmula de luminancia relativa de WCAG:

| Combinación | Contraste | Cumple 4.5:1 |
|---|---|---|
| Vino `#991B30` sobre blanco | 8.22:1 | Sí |
| Vino sobre fondo de la aplicación `#F4F7F7` | 7.63:1 | Sí |
| Grafito `#57565B` sobre blanco | 7.27:1 | Sí |
| Grafito sobre `#F4F7F7` | 6.75:1 | Sí |
| Blanco sobre vino | 8.22:1 | Sí |
| Blanco sobre vino oscuro `#7A1626` | 10.66:1 | Sí |
| Dorado `#B99058` sobre blanco | 2.92:1 | **No** |
| Dorado sobre vino | 2.82:1 | **No** |

Reglas derivadas:

- Para texto sobre fondos claros usar vino o grafito; para texto sobre vino, blanco.
- El dorado no se usa como color de texto, de icono informativo ni como único indicador del estado o del borde de un control.

## Estilos existentes y Tailwind

- Tailwind se carga sin Preflight: no restablece los estilos base del navegador.
- Orden de capas declarado en `frontend/src/index.css`: `theme, base, legacy, components, utilities`.
- Los estilos existentes (`frontend/src/index.css` y `frontend/src/institutions/institutions.css`) están dentro de `@layer legacy`, con sus selectores y valores originales. Por eso las utilidades de Tailwind prevalecen sobre ellos cuando una vista nueva las aplica.
- Cualquier hoja de estilos nueva que no use Tailwind debe declararse también dentro de una capa. Los estilos sin capa prevalecen sobre todas las capas, incluidas las utilidades.

## Uso en vistas

Enfoque híbrido:

- **Estilos globales por etiqueta** (`button`, `a`, `input`, `h2`, `.card`) y clases existentes de `institutions.css`: siguen en `@layer legacy`, pero sus colores usan los tokens semánticos (`var(--accent)`, `var(--border)`, …) en lugar de HEX. Así no se repiten clases en cada botón.
- **Elementos propios de una vista** (encabezado, logotipo, `h1`): clases de Tailwind en el JSX (`text-brand-primary`, `text-brand-neutral`, `h-14`, `flex`, …).
- Vistas nuevas: preferir clases de Tailwind; los estilos globales ya aplican la marca a botones, enlaces y campos.
- Tailwind sólo emite en el CSS final las variables de tema que se usan en utilidades o en CSS procesado por Tailwind (`index.css`). Si `institutions.css` u otra hoja sin `@import "tailwindcss"` necesita una variable no usada en `index.css`, comprobar que aparezca en `dist/assets/*.css` tras `npm run build`.

## Tamaños y retícula

Adoptado el 24 de octubre de 2026 como tarea transversal del Sprint 4 (`docs/sprint-4.md`). Antes, el ancho de la página dependía de una lista de rutas en `App.tsx`, y las vistas nuevas (empresas, cuentas de la Secretaría y buscador) quedaban comprimidas en el ancho del login.

**Tokens de dimensión** (`frontend/src/index.css`, bloque «Dimensiones», separado de los tokens de color):

| Token | Valor | Uso |
| --- | --- | --- |
| `--page-narrow` | 34 rem | Pantallas de acceso de una sola tarjeta: inicio de sesión, contraseña inicial y restablecimiento. Desde el «Inicio por rol», la página de inicio (`/`) es ancha. |
| `--page-wide` | 70 rem | Todas las demás vistas: listados, detalles, formularios y buscador. |
| `--page-gutter` | 2 rem | Margen lateral total en pantallas estrechas (1 rem por lado). |
| `--content-readable` | 45 rem | Ancho máximo de formularios, listas de detalles y bloques de texto dentro de una vista ancha. |

**Regla:** las vistas son anchas por defecto. `App.tsx` solo enumera las rutas angostas (`NARROW_PATHS`) y aplica `page-wide` a `<main>` y `.wide` al encabezado en el resto, así que el encabezado y el contenido siempre tienen el mismo ancho. Una vista nueva no necesita registrarse en ningún sitio. Las tablas, las cuadrículas de tarjetas y el buscador ocupan todo el ancho; los formularios y los detalles se limitan a `--content-readable`. La barra de búsqueda de empresas conserva 38 rem.

| Ancho de ventana | Comportamiento |
| --- | --- |
| Hasta 600 px | Margen de 1 rem por lado, tarjeta con padding de 1.25 rem, barras de acciones apiladas y botones a todo el ancho. |
| 601 a 959 px | Una columna; en el buscador, los filtros arriba y los resultados debajo, con dos tarjetas por fila si caben. |
| Desde 960 px | Contenido hasta 70 rem. El buscador en dos columnas: filtros de 18 a 20 rem y resultados en tarjetas de al menos 20 rem (`auto-fill`), de igual altura por fila. |
| 480 px | Solo cambia el tamaño de los logotipos del encabezado. |

## Inicio por rol

Adoptado el 24 de octubre de 2026 como tarea transversal del Sprint 4 (`docs/sprint-4.md`). Sustituye la tarjeta «Sesión iniciada», con nombre, correo, rol y enlaces de texto, por un punto de partida por rol. Es solo presentación: no consulta datos nuevos.

- **Saludo:** título grande «Hola, {nombre}» y, en texto secundario, el rol como etiqueta tintada (`.home-role`), la organización vinculada (institución o empresa) y el correo.
- **Acción principal:** un botón primario con el siguiente paso más probable. Administrador: «Nueva institución». Secretaría: «Registrar empresa». Institución: «Registrar alumno», que abre directamente la hoja de alta del padrón. La empresa tiene en su lugar el campo «Buscar talento por habilidad», que abre el buscador con ese filtro aplicado.
- **Tarjetas de acceso** (`.home-card`): una por sección del rol, con icono tintado, título, descripción y chevron. La cuadrícula es `auto-fill` con un mínimo de 16 rem: una columna en móvil y hasta tres en escritorio. El nombre accesible de cada tarjeta es su título (`aria-labelledby`) y la descripción se anuncia aparte (`aria-describedby`). La navegación conserva el nombre de cada rol: «Administración», «Secretaría de Economía», «Institución» o «Empresa».
- **Cuenta sin organización:** una cuenta sin su organización vinculada ve un aviso en lugar de las secciones.
- **Menú de cuenta** (`ui/AccountMenu.tsx`): botón con las iniciales del usuario, a la derecha del encabezado en todas las vistas con sesión. Su panel muestra nombre, correo, rol, organización y «Cerrar sesión».
  - El panel solo se monta mientras está abierto, y muestra ahí los errores al cerrar la sesión.
  - Se cierra con Esc, con un clic fuera o al navegar, y Esc devuelve el foco al botón.
  - Se materializa como las hojas; con «reducir movimiento» solo se funde.
- **Contadores y avisos con datos** («12 instituciones activas», «municipios por confirmar»): quedan para una historia del Sprint 5, porque requieren endpoints con autorización por rol.

## Lenguaje de interacción (apple-design)

Adoptado el 11 de octubre de 2026 como cambio transversal del Sprint 2 (`docs/sprint-2.md`), a partir de la skill `apple-design`. Las reglas viven en `frontend/src/ui/ui.css` (capa `components`, que prevalece sobre `legacy`) y en los componentes de `frontend/src/ui/`.

### Botones

| Nivel | Uso | Estilo |
|---|---|---|
| Relleno | Acción principal de la vista o del formulario | `brand-primary`; hover `brand-primary-hover` |
| Tintado | Acciones secundarias (`button.secondary`, `.institution-button.secondary`, `.tinted`) | Fondo `--tint` (vino al 8 %, 14 % en hover), texto vino |
| Plano | Navegación y regreso (`.plain`) | Sin fondo; `--fill` (grafito al 8 %) en hover |
| Píldora | Acción por fila de tabla (`.pill-link`, «Ver detalle ›») | Tintado redondeado con chevron |

- Radio de 10 px en botones y 8 px en campos. Los iconos (`ui/icons.tsx`) son SVG de trazo, `aria-hidden`; el texto del control lo nombra.
- Respuesta inmediata: escala 0.97 al presionar (100 ms).
- Navegación: «‹ Inicio» conserva el nombre accesible «Volver al inicio»; el enlace de la sección actual lleva `aria-current="page"`.
- En tablas, toda la fila abre el detalle con el puntero; el enlace «Ver detalle de …» sigue siendo el control accesible.
- Los tintes se derivan con `color-mix()` de los tokens; no son colores nuevos. Vino sobre tinte: entre 5.7:1 y 7.3:1.

### Estados

| Estado | Componente | Comportamiento |
|---|---|---|
| Carga | `LoadingState` | Anuncia el texto en `role="status"` de inmediato y muestra el esqueleto solo si la espera supera 300 ms. |
| Vacío | `StateMessage kind="empty"` | Icono, título, explicación y la siguiente acción posible. |
| Error de vista | `InstitutionRequestError page` | Icono, título según el código (404, 403 u otro), el mensaje y «Reintentar» cuando procede. |
| Error de acción | `InstitutionRequestError` | Aviso compacto junto a la acción, como hasta ahora. |
| Acción en curso | `PendingLabel` | Indicador de progreso en el botón, que queda deshabilitado. |
| Hover | `ui.css` | Solo con `@media (hover: hover)`: fondos tintados, fila resaltada, chevron que avanza 2 px y sombra suave. |

La validación del correo se hace al salir del campo (`ui/validation.ts`); la obligatoriedad se sigue comprobando al enviar.

### Movimiento, materiales y diálogos

- Curva `--spring`: resorte críticamente amortiguado (respuesta 0.35 s, sin rebote) muestreado con `linear()` en 500 ms.
- Materializar: avisos, errores de campo, estados y el enlace manual aparecen con opacidad, escala 0.97 y desenfoque.
- Consistencia espacial: al profundizar en las rutas la vista entra desde la derecha y al volver desde la izquierda (`App.tsx`), sin desmontar componentes.
- Encabezado fijo translúcido (`backdrop-filter`), con borde de scroll suave solo cuando hay contenido debajo.
- `ConfirmDialog` (`ui/ConfirmDialog.tsx`) para acciones con consecuencias, hoy solo inactivar una institución: scrim, origen en el botón que lo abre, foco inicial en «Cancelar», Esc, fondo `inert` y foco devuelto al cerrar (`ui/modal.ts`).

### Hojas

`Sheet` (`ui/Sheet.tsx`, física en `ui/spring.ts`) presenta formularios secundarios sin saturar la vista. Hoy se usa en el detalle de institución para crear una cuenta, reenviar el enlace de configuración y restablecer una contraseña; la vista muestra solo los datos y la sección «Cuentas institucionales» con sus tres acciones.

| Ancho | Presentación |
|---|---|
| Hasta 640 px | Hoja inferior. Se arrastra solo desde su barra superior (el contenido se desplaza normalmente): seguimiento 1:1, velocidad de suelta, proyección del impulso (deceleración 0.998), resistencia progresiva al tirar hacia arriba y resorte (amortiguamiento 1, o 0.8 tras un gesto con impulso; respuesta 0.3 s). Las animaciones son interrumpibles. |
| Más de 640 px | Panel centrado de hasta 36 rem que se materializa; sin arrastre. |

- Diálogo modal (`role="dialog"`, `aria-modal`) nombrado por el título del formulario; botón «Cerrar», Esc y clic en el fondo; foco inicial en el primer campo; fondo `inert` y foco devuelto al botón que la abrió.
- El contenido sigue montado al cerrarse: lo escrito y un enlace manual generado no se pierden al reabrir mientras se permanece en la vista.
- Una hoja cerrada lleva `hidden` y `display: none !important`: no debe capturar clics.
- Con reducir movimiento, la hoja solo se funde.

### Accesibilidad

- `prefers-reduced-motion`: sin escala al presionar, sin animación del esqueleto y del indicador; los paneles solo se funden.
- `prefers-reduced-transparency` y `prefers-contrast: more`: encabezado blanco sólido; con más contraste, bordes `neutral-500` y contorno en los botones tintados.
- Sin `backdrop-filter`, el encabezado es blanco sólido.

## Criterios de aceptación de esta base

1. El tema Tailwind expone los tres tokens de marca con los valores indicados.
2. Tailwind genera utilidades de tema y utilidades visuales sin activar Preflight.
3. Los estilos legados están dentro de la capa `legacy` y sus colores de marca y neutros usan variables del tema, sin HEX fijos; las utilidades de Tailwind pueden prevalecer sobre ellos.
4. `frontend/public/brand/logo.png` está versionado con fondo transparente y se muestra en el encabezado y en el login.
5. `AGENTS.md` instruye a los agentes frontend a consultar este documento y no inventar una paleta.
6. No se agregan pantallas ni se cambian rutas ni la estructura semántica de los componentes.
