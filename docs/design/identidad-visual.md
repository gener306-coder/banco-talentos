# Identidad visual base — Nodologístico

**Estado:** requisito transversal comunicado para el frontend. Los colores se muestrearon del logotipo proporcionado y deben confirmarse contra el archivo de marca original si está disponible.

## Alcance

- Incorporar el logotipo y una paleta derivada de sus colores en las nuevas vistas del frontend.
- No crear pantallas ni cambiar el diseño o las rutas existentes como parte de esta tarea.
- No migrar los estilos actuales a Tailwind ni cambiar sus valores visuales.

## Logotipo

Existe una única variante del logotipo:

| Archivo | URL en el navegador | Uso |
|---|---|---|
| `frontend/public/brand/logo.png` | `/brand/logo.png` | Fondos claros (blanco o gris claro) |

El PNG tiene fondo transparente y mide 791 × 1024 px. No hay variante blanca: no colocar el logotipo sobre fondos oscuros ni sobre el color primario vino.

Mantener la proporción y los colores originales; no recolorear, deformar ni recortar el logotipo. Fijar sólo una dimensión (ancho o alto) al mostrarlo y proporcionar un texto alternativo, por ejemplo `alt="Nodologístico"`. El archivo conserva margen transparente alrededor del símbolo; si se necesita en tamaños pequeños, solicitar una versión recortada o vectorial (SVG) en lugar de recortarla en CSS.

## Paleta y tokens

| Token | Color | HEX muestreado | Uso previsto |
|---|---|---|---|
| `brand-primary` | Vino | `#991B30` | Acciones primarias, acentos principales y texto destacado |
| `brand-secondary` | Dorado | `#B99058` | Exclusivamente decorativo: bordes, separadores y detalles |
| `brand-neutral` | Gris grafito | `#57565B` | Texto y elementos neutros |

El fondo `#F7F7F7` de las imágenes recibidas originalmente correspondía al lienzo del PNG; no se considera un color de marca aprobado.

Los tokens están definidos con Tailwind CSS v4 en `frontend/src/index.css`:

```css
@theme {
  --color-brand-primary: #991B30;
  --color-brand-secondary: #B99058;
  --color-brand-neutral: #57565B;
}
```

Clases resultantes, entre otras: `bg-brand-primary`, `text-brand-neutral`, `border-brand-secondary`.

No introducir nuevos colores de marca ni valores hexadecimales dispersos en vistas.

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

- Las vistas nuevas usan los tokens `brand-*` para los colores de marca.
- Las vistas actuales conservan sus estilos CSS existentes, incluidos los colores legados.
- La presencia y ubicación del logotipo en una pantalla concreta se determina en su historia aprobada.

## Criterios de aceptación de esta base

1. El tema Tailwind expone los tres tokens de marca con los valores indicados.
2. Tailwind genera utilidades de tema y utilidades visuales sin activar Preflight.
3. Los estilos legados mantienen sus declaraciones y valores dentro de la capa `legacy`; las utilidades de Tailwind pueden prevalecer sobre ellos.
4. `frontend/public/brand/logo.png` está versionado con fondo transparente.
5. `AGENTS.md` instruye a los agentes frontend a consultar este documento y no inventar una paleta.
6. No se agregan pantallas ni se cambian rutas, y no se migran los estilos existentes a tokens.
