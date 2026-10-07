# Informe de cambios — Identidad visual base

**Proyecto:** Banco de Talentos — Educación Dual  
**Marca:** Nodologístico  
**Fecha:** 7 de octubre de 2026  
**Tipo:** tarea técnica transversal del Sprint 1, sin historia de usuario asociada. Registrada en [sprint-1.md](../sprint-1.md).

## Objetivo

Preparar la base documental y técnica para incorporar el logotipo de Nodologístico y los colores derivados de él en futuras vistas del frontend, sin agregar pantallas ni cambiar el aspecto de las existentes.

## Cambios realizados

| Archivo | Cambio |
|---|---|
| `docs/design/identidad-visual.md` | Guía de uso del logotipo, paleta, tabla de contraste, reglas de uso del dorado y convención de capas CSS. |
| `docs/design/informe-identidad-visual-base.md` | Este informe. |
| `docs/sprint-1.md` | Registro de la tarea técnica transversal. |
| `frontend/public/brand/logo.png` | Logotipo único, PNG con fondo transparente (791 × 1024 px). |
| `frontend/package.json` | `tailwindcss` y `@tailwindcss/vite` 4.3.3 como dependencias de desarrollo. |
| `frontend/package-lock.json` | Dependencias de Tailwind y actualización de `source-map-js` a 1.2.2 (ver Seguridad). |
| `frontend/vite.config.ts` | Plugin oficial de Tailwind CSS para Vite. |
| `frontend/src/layers.css` | Declaración del orden de capas `theme, base, legacy, components, utilities`. |
| `frontend/src/main.tsx` | Importa `layers.css` antes que cualquier otro módulo. |
| `frontend/src/index.css` | Imports de tema y utilidades de Tailwind sin Preflight, tokens `brand-*` y estilos existentes dentro de `@layer legacy`. |
| `frontend/src/institutions/institutions.css` | Estilos existentes dentro de `@layer legacy`, sin cambios de selectores ni valores. |
| `AGENTS.md` | Tailwind en el stack y sección «Identidad visual del frontend» al final del documento. |
| `README.md` | Tailwind en el stack y referencia a `docs/design/`. |

## Paleta registrada

Los valores se muestrearon del logotipo y deben cotejarse con los archivos originales de marca cuando estén disponibles.

| Token | Color | Valor | Uso |
|---|---|---|---|
| `brand-primary` | Vino | `#991B30` | Acciones, acentos y texto destacado |
| `brand-secondary` | Dorado | `#B99058` | Solo decorativo (contraste 2.92:1 sobre blanco) |
| `brand-neutral` | Gris grafito | `#57565B` | Texto y elementos neutros |

## Decisiones

- **Un único logotipo.** Se descartó la variante blanca; el logotipo se usa solo sobre fondos claros.
- **Capas CSS.** Los estilos existentes se agrupan en `legacy` para que las utilidades de Tailwind puedan prevalecer en vistas nuevas. El orden de capas se declara en `layers.css`, importado primero: `institutions.css` se carga antes que `index.css` por el orden de imports de `main.tsx`, y la cascada toma el orden de la primera aparición de cada capa. No se reordenaron los imports existentes porque `.card` y `.institutions` tienen la misma especificidad y cambiaría el padding de las pantallas de instituciones en móvil.
- **Sin cambios visuales.** El CSS compilado conserva el orden relativo de las reglas existentes; no hay utilidades generadas porque ninguna vista las usa todavía.
- No se añadieron rutas, vistas ni componentes que muestren el logotipo. Su ubicación se decidirá en la historia aprobada que lo requiera.

## Seguridad

`npm audit` reportó una vulnerabilidad alta en `source-map-js` 1.2.1 ([GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)): denegación de servicio por bloqueo del event loop al procesar source maps con offsets de sección manipulados.

- No la introdujo Tailwind: el paquete ya estaba en el lockfile como dependencia de `vite` → `postcss` y de `jsdom` → `css-tree`; `@tailwindcss/node` reutiliza la misma copia.
- Afectaba solo a herramientas de desarrollo y build, no al código servido al navegador.
- Se corrigió con `npm audit fix`, que actualizó únicamente `source-map-js` a 1.2.2 en `package-lock.json`. `npm audit` informa 0 vulnerabilidades.

## Validación

| Comprobación | Resultado |
|---|---|
| `npm run build` (TypeScript + Vite) | Aprobado. |
| `npm run lint` (ESLint) | Aprobado. |
| `npx vitest run` | 180 pruebas aprobadas en 7 archivos. |
| `sh scripts/test-e2e.sh` (Playwright/Chromium) | 4 escenarios aprobados. |
| `npm audit` | 0 vulnerabilidades. |
| CSS compilado | Capas en el orden declarado; tokens `--color-brand-*` presentes; las clases `bg-brand-primary`, `text-brand-neutral` y `border-brand-secondary` se generan al usarse (comprobado con un archivo temporal, eliminado después). |

No se ejecutaron las pruebas Pest porque no hubo cambios en el backend.

## Siguiente paso

Consultar `docs/design/identidad-visual.md` al implementar vistas frontend aprobadas. Si el logotipo debe mostrarse en tamaños pequeños, solicitar una versión recortada o SVG.
