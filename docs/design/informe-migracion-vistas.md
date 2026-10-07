# Informe de cambios — Migración de vistas a la identidad visual

**Proyecto:** Banco de Talentos — Educación Dual  
**Marca:** Nodologístico  
**Fecha:** 7 de octubre de 2026  
**Tipo:** tarea técnica transversal del Sprint 1. Registrada en [sprint-1.md](../sprint-1.md).

## Objetivo

Aplicar la paleta y el logotipo definidos en [identidad-visual.md](identidad-visual.md) a las vistas existentes, sin cambiar rutas, comportamiento ni estructura semántica.

## Decisiones aprobadas

| Tema | Decisión |
|---|---|
| Enfoque | Híbrido: estilos globales por etiqueta con variables del tema en `@layer legacy`; clases de Tailwind en el JSX de elementos propios (encabezado, logotipo, `h1`). |
| Neutros | Escala `neutral` de Tailwind en lugar de los grises con tinte verde azulado. |
| Hover primario | Nuevo token `brand-primary-hover` `#7A1626`. |
| Logotipo | Se retiró sólo el margen transparente del PNG; el del encabezado no se muestra en `/login`. |
| Semánticos | Error, éxito, insignias de estado y foco sin cambios. |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `frontend/public/brand/logo.png` | Margen transparente retirado: 791 × 1024 → 697 × 783 px. Dibujo y transparencia intactos. |
| `frontend/src/index.css` | Token `brand-primary-hover`. Texto base en grafito, fondo `neutral-100`, `h2` en vino, tarjetas y campos con neutros, botones primarios y secundarios y enlaces con la marca. Se eliminó el color fijo de `.eyebrow`. |
| `frontend/src/institutions/institutions.css` | Botones, enlaces, bordes de tabla, encabezado de tabla, ayuda de campos y separador con variables del tema. Corrección del ajuste de texto de la tabla en móvil (ver Observaciones). |
| `frontend/src/App.tsx` | Encabezado con logotipo (`h-14`, oculto en `/login`) y clases `text-brand-neutral` / `text-brand-primary`. |
| `frontend/src/pages/LoginPage.tsx` | Logotipo centrado (`h-32`) sobre el título del formulario. |
| `frontend/src/App.test.tsx` | Dos pruebas: un único logotipo en el login y logotipo dentro del encabezado (`banner`) fuera de él. |
| `docs/design/identidad-visual.md` | Ubicaciones del logotipo, token hover, neutros, colores semánticos y enfoque híbrido. |
| `docs/sprint-1.md` | Registro de la tarea. |

Los componentes de instituciones, sesión y contraseña inicial no requirieron cambios en el JSX: heredan la marca de los estilos globales.

## Equivalencias de color

| Antes | Después | Uso |
|---|---|---|
| `#20545b` | `brand-primary` | Botones, enlaces, borde y texto de botones secundarios |
| `#153e43` | `brand-primary-hover` | Hover de botones primarios |
| `#183b40`, `#365f66` | `brand-neutral` | Texto base, subtítulo y ayudas de campo |
| `#f4f7f7`, `#edf4f4` | `neutral-100` | Fondo de la aplicación, hover secundario y encabezado de tabla |
| `#d5e2e2` | `neutral-200` | Bordes y separadores |
| `#799396` | `neutral-500` | Borde de campos |
| `#fff` | `white` | Fondo de tarjetas y texto de botones |

Tras la migración, `index.css` e `institutions.css` sólo contienen HEX en las definiciones de tokens y en los colores semánticos.

## Validación

| Comprobación | Resultado |
|---|---|
| `npx vitest run` | 182 pruebas aprobadas en 7 archivos (180 existentes y 2 nuevas). |
| `sh scripts/test-e2e.sh` (Playwright/Chromium) | 4 escenarios aprobados, también después de corregir la tabla. |
| `npm run lint` y `npm run build` | Aprobados. |
| CSS compilado | Presentes todas las variables usadas (`brand-*`, `neutral-100/200/500`, `white`) y las utilidades del encabezado y del logotipo. |
| Revisión visual | Capturas temporales en Chromium de login, sesión, detalle y listado (escritorio y 375 px), eliminadas después. |

No se ejecutaron las pruebas Pest porque no hubo cambios en el backend.

## Observaciones

- **Tabla en móvil (defecto preexistente, corregido):** `overflow-wrap: anywhere` en las celdas de `institution-table` reducía el ancho mínimo de cada columna a un carácter, y a 375 px el texto se repartía letra por letra. Se sustituyó por `overflow-wrap: break-word`, que sólo parte palabras que no caben, y las insignias de estado usan `white-space: nowrap`. La tabla conserva su ancho natural y se desplaza horizontalmente dentro de su región enfocable (`tabIndex={0}`, «Listado de instituciones»); la página no se desborda. Comprobado en Chromium a 375 px (875 px de contenido en 285 px visibles) y a 1280 px (sin desplazamiento).
- A 56 px de altura el texto del logotipo no es legible en el encabezado; para ese tamaño convendría una versión horizontal o un símbolo SVG.
