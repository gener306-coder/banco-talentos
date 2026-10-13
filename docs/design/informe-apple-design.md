# Informe de cambios — Lenguaje visual e interacción apple-design

**Proyecto:** Banco de Talentos — Educación Dual  
**Fecha:** 11 de octubre de 2026  
**Tipo:** tarea técnica transversal del Sprint 2. Registrada en [sprint-2.md](../sprint-2.md).

## Objetivo

Aplicar al frontend los principios de la skill `apple-design` (github.com/emilkowalski/skills) validados en un prototipo interactivo, conservando la paleta, los tokens y las reglas de contraste de [identidad-visual.md](identidad-visual.md). Sin cambios en backend, rutas ni contratos de API.

## Paso 1 — Normalización (commit `9504b99`)

| Elemento | Resultado |
|---|---|
| Botones | Relleno, tintado (`color-mix` del vino) y plano; píldora «Ver detalle ›»; respuesta al presionar; hover solo con puntero; iconos SVG en línea. |
| Navegación | «‹ Inicio» (nombre accesible «Volver al inicio»), sección actual con `aria-current`; fila completa pulsable en el listado. |
| Estados | Esqueleto de carga tras 300 ms, vacío con acción, error de vista con título y reintento, botones con progreso. |
| Formularios | Validación del correo al salir del campo. |
| Tipografía y materiales | Títulos con tracking negativo y peso 600; encabezado fijo translúcido con borde de scroll suave. |
| Movimiento | Curva `--spring` (`linear()`); paneles que se materializan; transición direccional entre rutas sin desmontar componentes. |
| Confirmación | `ConfirmDialog` con scrim al inactivar una institución. |

## Paso 2 — Hojas en el detalle de institución

- Componente propio `Sheet`, sin dependencias: Vaul, la referencia en React, figura como *unmaintained* en su repositorio y su última versión es de diciembre de 2024.
- Hasta 640 px, hoja inferior arrastrable desde su barra (velocidad, proyección del impulso, resistencia y resorte interrumpible); en pantallas anchas, panel centrado.
- Los formularios de crear cuenta, reenviar enlace y restablecer contraseña pasan a hojas. Su contenido sigue montado al cerrar: lo escrito y un enlace manual no se pierden.
- Accesibilidad compartida con `ConfirmDialog` mediante `useModal`: `aria-modal`, foco atrapado y devuelto, Esc, fondo `inert`.

## Hallazgos durante la implementación

- **Hoja cerrada que capturaba clics.** `.sheet-layer.wide { display: grid }` anulaba el `display: none` del atributo `hidden`; la capa invisible quedaba encima de la página. Lo detectó E2E (jsdom no aplica CSS). Se corrigió con `.sheet-layer[hidden] { display: none !important }`.
- **Límite de intentos de login en E2E (resuelto el 12 de octubre de 2026).** Cinco escenarios iniciaban sesión con el mismo ADMIN y el límite es de 5 por minuto por correo (y 20 por IP); un sexto habría fallado con 429. Ahora `e2e/admin.setup.ts` inicia sesión una sola vez y los escenarios de administración reutilizan su sesión (`storageState`). Los contextos de la persona titular se crean con `NO_SESSION`, porque `browser.newContext()` hereda la sesión ADMIN de `test.use`; sin vaciarla, su cierre se bloqueaba hasta agotar el tiempo de la prueba.

## Validación

| Comprobación | Resultado |
|---|---|
| Vitest + React Testing Library | 264 pruebas aprobadas en 11 archivos (23 nuevas: 14 en `ui/`, 8 de estados y diálogo y 1 de validación en línea). |
| Playwright (`sh scripts/test-e2e.sh`) | 7 escenarios aprobados en dos ejecuciones consecutivas, incluido `detail-sheets.spec.ts` (móvil, 375 px: arrastre para cerrar, resistencia, contenido conservado y foco devuelto). |
| ESLint y `npm run build` (tipos de la app y de los E2E) | Aprobados. |
| Revisión visual | Capturas temporales en escritorio y a 375 px del listado, el detalle, la confirmación, el panel y la hoja; eliminadas después. |

No se ejecutaron las pruebas Pest porque no hubo cambios en el backend.

## Pruebas existentes ajustadas

- Inactivar una institución exige confirmar en el diálogo (3 pruebas Vitest y 2 E2E).
- Los formularios del detalle se abren primero en su hoja: helper `openSheet()` en sus tres archivos de Vitest y aperturas o cierres explícitos en 3 E2E. Ninguna prueba perdió aserciones.

## Pendiente

- Probar el gesto de la hoja en un teléfono real, sobre todo iOS Safari.

## Archivos creados o modificados

Inventario relativo a la raíz del repositorio.

- [README.md](../../README.md)
- [docs/design/identidad-visual.md](../../docs/design/identidad-visual.md)
- [docs/design/informe-apple-design.md](../../docs/design/informe-apple-design.md)
- [docs/sprint-2.md](../../docs/sprint-2.md)
- [frontend/e2e/detail-sheets.spec.ts](../../frontend/e2e/detail-sheets.spec.ts)
- [frontend/e2e/institution-accounts.spec.ts](../../frontend/e2e/institution-accounts.spec.ts)
- [frontend/e2e/institutions.spec.ts](../../frontend/e2e/institutions.spec.ts)
- [frontend/e2e/manual-setup-link.spec.ts](../../frontend/e2e/manual-setup-link.spec.ts)
- [frontend/e2e/password-reset.spec.ts](../../frontend/e2e/password-reset.spec.ts)
- [frontend/src/App.tsx](../../frontend/src/App.tsx)
- [frontend/src/institutions/InstitutionAccountForm.test.tsx](../../frontend/src/institutions/InstitutionAccountForm.test.tsx)
- [frontend/src/institutions/InstitutionAccountForm.tsx](../../frontend/src/institutions/InstitutionAccountForm.tsx)
- [frontend/src/institutions/InstitutionAccountPasswordResetForm.test.tsx](../../frontend/src/institutions/InstitutionAccountPasswordResetForm.test.tsx)
- [frontend/src/institutions/InstitutionAccountPasswordResetForm.tsx](../../frontend/src/institutions/InstitutionAccountPasswordResetForm.tsx)
- [frontend/src/institutions/InstitutionAccountSetupLinkForm.test.tsx](../../frontend/src/institutions/InstitutionAccountSetupLinkForm.test.tsx)
- [frontend/src/institutions/InstitutionAccountSetupLinkForm.tsx](../../frontend/src/institutions/InstitutionAccountSetupLinkForm.tsx)
- [frontend/src/institutions/InstitutionDetailPage.tsx](../../frontend/src/institutions/InstitutionDetailPage.tsx)
- [frontend/src/institutions/InstitutionEditPage.tsx](../../frontend/src/institutions/InstitutionEditPage.tsx)
- [frontend/src/institutions/InstitutionForm.tsx](../../frontend/src/institutions/InstitutionForm.tsx)
- [frontend/src/institutions/InstitutionLayout.tsx](../../frontend/src/institutions/InstitutionLayout.tsx)
- [frontend/src/institutions/Institutions.test.tsx](../../frontend/src/institutions/Institutions.test.tsx)
- [frontend/src/institutions/InstitutionsPage.tsx](../../frontend/src/institutions/InstitutionsPage.tsx)
- [frontend/src/institutions/SetupLinkDelivery.tsx](../../frontend/src/institutions/SetupLinkDelivery.tsx)
- [frontend/src/main.tsx](../../frontend/src/main.tsx)
- [frontend/src/pages/LoginPage.tsx](../../frontend/src/pages/LoginPage.tsx)
- [frontend/src/pages/NewPasswordForm.tsx](../../frontend/src/pages/NewPasswordForm.tsx)
- [frontend/src/ui/ConfirmDialog.tsx](../../frontend/src/ui/ConfirmDialog.tsx)
- [frontend/src/ui/Sheet.test.tsx](../../frontend/src/ui/Sheet.test.tsx)
- [frontend/src/ui/Sheet.tsx](../../frontend/src/ui/Sheet.tsx)
- [frontend/src/ui/StateMessage.tsx](../../frontend/src/ui/StateMessage.tsx)
- [frontend/src/ui/forms.tsx](../../frontend/src/ui/forms.tsx)
- [frontend/src/ui/icons.tsx](../../frontend/src/ui/icons.tsx)
- [frontend/src/ui/modal.ts](../../frontend/src/ui/modal.ts)
- [frontend/src/ui/spring.test.ts](../../frontend/src/ui/spring.test.ts)
- [frontend/src/ui/spring.ts](../../frontend/src/ui/spring.ts)
- [frontend/src/ui/ui.css](../../frontend/src/ui/ui.css)
- [frontend/src/ui/validation.ts](../../frontend/src/ui/validation.ts)
