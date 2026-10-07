# Identidad visual base — Nodologístico

**Estado:** requisito transversal comunicado para el frontend. Los colores se muestrearon del logotipo proporcionado y deben confirmarse contra el archivo de marca original si está disponible.

## Alcance

- Incorporar el logotipo y una paleta derivada de sus colores en las nuevas vistas del frontend.
- No crear pantallas ni cambiar las rutas existentes.
- Las vistas existentes se migraron a la marca el 7 de octubre de 2026 (ver «Uso en vistas»).

## Logotipo

Existe una única variante del logotipo:

| Archivo | URL en el navegador | Uso |
|---|---|---|
| `frontend/public/brand/logo.png` | `/brand/logo.png` | Fondos claros (blanco o gris claro) |

El PNG tiene fondo transparente y mide 697 × 783 px; se le retiró únicamente el margen transparente, sin alterar el dibujo. No hay variante blanca: no colocar el logotipo sobre fondos oscuros ni sobre el color primario vino.

Mantener la proporción y los colores originales; no recolorear, deformar ni recortar el dibujo. Fijar sólo la altura (`h-*` con `w-auto`), declarar `width={697} height={783}` para reservar el espacio y usar `alt="Nodologístico"`.

Ubicaciones actuales:

| Lugar | Componente | Altura |
|---|---|---|
| Encabezado general, junto al título | `App.tsx` | `h-14` (56 px). No se muestra en `/login` para no duplicarlo. |
| Parte superior del formulario de login | `pages/LoginPage.tsx` | `h-32` (128 px), centrado. |

A 56 px el texto «nodologístico» del logotipo no es legible; el símbolo identifica la marca y el título textual permanece en el `h1`. Para un tamaño menor, solicitar una versión horizontal o un símbolo en SVG.

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

- **Estilos globales por etiqueta** (`button`, `a`, `input`, `h2`, `.card`) y clases existentes de `institutions.css`: siguen en `@layer legacy`, pero sus colores usan variables (`var(--color-brand-primary)`, `var(--color-neutral-200)`, …) en lugar de HEX. Así no se repiten clases en cada botón.
- **Elementos propios de una vista** (encabezado, logotipo, `h1`): clases de Tailwind en el JSX (`text-brand-primary`, `text-brand-neutral`, `h-14`, `flex`, …).
- Vistas nuevas: preferir clases de Tailwind; los estilos globales ya aplican la marca a botones, enlaces y campos.
- Tailwind sólo emite en el CSS final las variables de tema que se usan en utilidades o en CSS procesado por Tailwind (`index.css`). Si `institutions.css` u otra hoja sin `@import "tailwindcss"` necesita una variable no usada en `index.css`, comprobar que aparezca en `dist/assets/*.css` tras `npm run build`.

## Criterios de aceptación de esta base

1. El tema Tailwind expone los tres tokens de marca con los valores indicados.
2. Tailwind genera utilidades de tema y utilidades visuales sin activar Preflight.
3. Los estilos legados están dentro de la capa `legacy` y sus colores de marca y neutros usan variables del tema, sin HEX fijos; las utilidades de Tailwind pueden prevalecer sobre ellos.
4. `frontend/public/brand/logo.png` está versionado con fondo transparente y se muestra en el encabezado y en el login.
5. `AGENTS.md` instruye a los agentes frontend a consultar este documento y no inventar una paleta.
6. No se agregan pantallas ni se cambian rutas ni la estructura semántica de los componentes.
