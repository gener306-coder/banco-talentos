# Componentes compartidos

[Índice de la documentación técnica](../README.md)

`frontend/src/ui/` reúne los componentes y *hooks* que toda la aplicación reutiliza. `CLAUDE.md` exige usarlos en lugar de crear variantes por vista:
- `Sheet` para formularios secundarios en los detalles;
- `ConfirmDialog` para inactivaciones y bajas;
- `LoadingState`, `StateMessage` y `MunicipalityCombobox`.

Ninguno depende de una librería de componentes: son React y CSS con tokens.

## Componentes de interacción

| Componente | Para qué | Notas |
|---|---|---|
| `Sheet` | Hoja modal para formularios secundarios: editar una sección, invitar una cuenta, compartir la ficha | En pantallas estrechas sube desde abajo y se arrastra, con seguimiento 1:1, velocidad de suelta y resistencia en el borde (`spring.ts`). En pantallas anchas es un panel centrado. El contenido sigue montado al cerrarse, para no perder el trabajo en curso. |
| `ConfirmDialog` | Confirmar acciones con consecuencias: inactivar, dar de baja, dejar de compartir la ficha | El foco inicial queda en «Cancelar», la opción segura. El diálogo nace del control que lo abrió. |
| `PasswordField` | Contraseña con botón para mostrar u ocultar (T-S8-04; compartido desde T-S18-01) | Lo usan el inicio de sesión, el formulario de contraseña nueva, el cambio de contraseña y el cambio de correo en Mi cuenta. Asocia la ayuda y los errores con `aria-describedby`. |
| `EmailMenu` | Menú del ícono de correo en las tablas y los detalles (T-S12-06) | `mailto:` falla sin un cliente de correo configurado. Por eso ofrece «Copiar correo», Gmail, Outlook y la app del sistema (`composeLinks.ts`). Es un menú ARIA (flechas, Inicio, Fin y Esc) en un portal con posición fija. Lo usan las bandejas y los detalles de vinculación. |
| `AccountMenu` | Identidad de la sesión, tema (claro, oscuro o sistema, con miniaturas) y «Cerrar sesión» | En todas las vistas con sesión |
| `MessagesMenu` | Conversaciones con mensajes sin leer y aviso breve cuando llega uno (T-S14-17) | Para empresa e institución. Se alimenta del resumen único de no leídos. |
| `CsvDownloadButton` | «Descargar CSV» con la sesión, sin salir de la vista | Bandeja institucional y reporte ejecutivo |
| `NavBackLink`, `useBackLink`, `useContextualBack` | «Volver» que regresa a la vista y los filtros de origen | — |

## Estados de carga, vacío y error

| Componente | Para qué |
|---|---|
| `LoadingState` | Anuncia la carga a los lectores de pantalla de inmediato y muestra un esqueleto (`table` o `details`) solo si la espera supera 300 ms, para que una carga rápida no parpadee |
| `StateMessage` | Estados vacíos y de error con ícono, título, descripción y acción |
| `TableSkeleton`, `TableHead` | Esqueleto y encabezado de tablas. Debajo de 600 px, cada fila se apila como tarjeta según el papel de cada celda (`title`, `name`, `meta`). |
| `Callout` | Aviso informativo o de pendiente, con remarque, ícono y fondo suave del tono (T-S12-04) |
| `Snackbar`, `SnackbarProvider`, `useSnackbar` | Avisos breves de resultado, por vista y globales |
| `RouteErrorBoundary` | Ante un error inesperado al pintar, muestra la opción de recargar sin perder el encabezado ni el pie |

## Correo de acceso (Sprint 19)

| Componente | Para qué |
|---|---|
| `emailState.ts`, `emailStateOf()` | Calcula uno de cuatro estados del correo de acceso: cuenta pendiente de activar, cambio por confirmar, correo verificado o sin verificar |
| `EmailStatusBadge` | Etiqueta de ese estado, idéntica en Mi cuenta (`AccessEmailSection`) y en los listados de cuentas (`AccountEmailCell`) |
| `account/AccessEmailSection.tsx` | Sección de Mi cuenta: verificar el correo, pedir un cambio con la contraseña actual (`PasswordField`), reenviar o cancelar el enlace. Muestra la espera de 60 s. |
| `pages/ConfirmEmailPage.tsx` | Pantalla pública `/confirm-email`: confirma el token una vez y muestra el resultado (verificado, cambiado, enlace inválido o correo ocupado) |

## Formularios y datos de dominio

| Componente | Para qué |
|---|---|
| `forms.tsx` (`PendingLabel`) | Texto del botón de envío con un indicador de progreso mientras la acción está en curso |
| `validation.ts` (`emailErrorOnBlur`) | Validación de correo al salir del campo, con el mismo criterio que el backend |
| `students/MunicipalityCombobox.tsx` | Combobox accesible del catálogo INEGI por estado. Lo usan el expediente del alumno, las empresas, las oportunidades, el perfil de la organización y el origen del radio en el buscador. |
| `videos/VideoPlayer.tsx` | Reproductor con póster, MP4 y respaldo WebM (`fallbackSrc`) |
| `UserAvatar`, `BrandLogo` | Avatar con iniciales y logotipo (con su variante para el tema oscuro) |

## Hooks de comportamiento

| Hook | Para qué |
|---|---|
| `useListParams` | Filtros, búsqueda y página de un listado en la URL, para compartir o volver a la misma vista |
| `useTableMemory` | Recuerda la posición de desplazamiento y la fila de origen al volver de un detalle (T-S13-12) |
| `useRowNavigation` | Filas de tabla navegables con teclado y clic |
| `useModal`, `prefersReducedMotion` | Foco atrapado, cierre con Esc y movimiento reducido |
| `useMediaQuery`, `useReveal`, `useCountUp`, `useSkeletonDelay` | Disposición adaptable y animaciones discretas que respetan `prefers-reduced-motion` |
| `theme.ts` | Preferencia de tema (`bt-theme` en `localStorage`), resolución con el sistema y sincronía entre pestañas |

## Pruebas

Los componentes compartidos tienen sus pruebas de Vitest junto a ellos (`*.test.ts*` en `src/ui/`): `Sheet`, `PasswordField`, `MessagesMenu`, `RouteErrorBoundary`, `TableSkeleton`, `useListParams`, `useTableMemory`, el tema, los tokens y otros. Los conteos totales están en [Estrategia y conteos de pruebas](../07-calidad-y-entorno/02-estrategia-de-pruebas.md).

## Fuentes en el repositorio

- `frontend/src/ui/`
- `frontend/src/account/AccessEmailSection.tsx`, `frontend/src/pages/ConfirmEmailPage.tsx`
- `frontend/src/students/MunicipalityCombobox.tsx`, `frontend/src/videos/VideoPlayer.tsx`
- `CLAUDE.md` (Componentes UI)
- `docs/design/identidad-visual.md`, `docs/design/informe-apple-design.md`
