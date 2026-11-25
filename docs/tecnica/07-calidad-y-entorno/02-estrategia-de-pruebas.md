# Estrategia y conteos de pruebas

[Índice de la documentación técnica](../README.md)

Las pruebas siguen tres capas. Cada una prueba algo que las otras no pueden:
- **el backend contra PostgreSQL real** (Pest);
- **la interfaz aislada** (Vitest);
- **los recorridos completos en un navegador** (Playwright).

Ninguna capa usa *mocks* de la base de datos ni del navegador para sustituir lo que prueba.

## Cifras verificadas

Corridas ejecutadas **en secuencia** el 25 de noviembre de 2026 (de 18:04 a 18:45 UTC) sobre el commit `51d4b63` de la rama `docs/tecnica`. El código de la aplicación es idéntico al de `main` en `a01d283`: la rama solo agrega documentación, como confirma `git diff a01d283 -- backend frontend compose*.yaml docker scripts/test-*.sh`, que no muestra cambios.

| Suite | Comando | Resultado | Duración |
|---|---|---|---|
| Pest (backend) | `sh scripts/test-backend.sh` | **1810 de 1810 en verde** (18 103 aserciones) | 1528 s (unos 25 min) |
| Vitest (frontend) | `docker compose exec frontend npx vitest run` | **1637 de 1637 en verde**, en 80 archivos | 71.6 s |
| Playwright (E2E) | `sh scripts/test-e2e.sh` | **82 de 82 en verde**, incluidas las 4 preparaciones de sesión (`*.setup.ts`) | 10.1 min de pruebas (unos 14 min con la construcción de la imagen) |

Cada suite se lanzó después de que terminara la anterior: Pest, luego Vitest en el servicio `frontend` de desarrollo, y al final Playwright. Ninguna prueba se reintentó ni se omitió.

Las cifras de Sprints anteriores, por ejemplo las del cierre del Sprint 19, son históricas. Este documento solo cita las de una corrida propia.

## Capa 1 — Pest: la API contra PostgreSQL real

| Aspecto | Configuración |
|---|---|
| Alcance | 60 archivos en `backend/tests/Feature/`, uno o más por historia o tarea (por ejemplo, `StudentDisclosureTest`, `LinkageDecisionTest`, `TalentSearchTest`). Muchos usan *datasets*, así que el número de pruebas supera al de bloques `it()`. |
| Base de datos | PostgreSQL 17 + PostGIS 3.5 en `tmpfs` (`compose.testing.yaml`), con la base `banco_talentos_testing`. Las pruebas comprueban el nombre de la base antes de aplicar migraciones destructivas. |
| Entorno | `phpunit.xml` fija `APP_ENV=testing`, `CACHE_STORE` y `SESSION_DRIVER` en `database`, `MAIL_MAILER=array` y `QUEUE_CONNECTION=sync` |
| Sesión real | Las pruebas de sesión usan cookies cifradas y archivos reales (`InteractsWithCookieSessions`), no `actingAs`. La protección CSRF se mantiene activa donde importa (`EnforceRequestForgery`). |
| Qué verifica | Contratos JSON, validaciones y mensajes, autorización por rol y por organización (`404` para lo ajeno), restricciones de la base (`CHECK`, triggers e índices parciales), cifrado del NSS, límites de peticiones, cabeceras, correos (contenido y destinatarios), trabajos de la cola y comandos de consola |
| Seguridad transversal | `ApiSecurityMatrixTest` recorre **todas** las rutas: sesión, cuenta activa y rol, límites, ausencia de `DELETE` y cabeceras ([Seguridad](01-seguridad.md#verificación-automática)) |
| Video | `ProcessInstitutionVideoTest` cubre los casos con `Process::fake` (ffprobe y FFmpeg simulados) y uno final con el FFmpeg real de la imagen: un video vertical generado con metadatos de ubicación, para comprobar la rotación y que el GPS se elimina |

## Capa 2 — Vitest: componentes y lógica de la SPA

| Aspecto | Configuración |
|---|---|
| Alcance | 80 archivos `*.test.ts*` junto a su código en `frontend/src/` |
| Entorno | jsdom con Testing Library (`@testing-library/react` y `jest-dom`), configurado en `src/test/setup.ts` |
| Qué verifica | Estados de cada vista (carga, vacío, error, éxito), validación del contrato de las respuestas (`ApiError(502)`), accesibilidad básica (roles, etiquetas, foco), formularios, componentes compartidos (`Sheet`, `PasswordField`, `MessagesMenu`…), el tema y **los tokens**: contraste de 4.5:1 en ambos temas y ausencia de colores fijos (`tokens.test.ts`) |

## Capa 3 — Playwright: recorridos reales

| Aspecto | Configuración |
|---|---|
| Alcance | 31 archivos en `frontend/e2e/`: 4 de preparación de sesiones (`*.setup.ts`) y los *specs* de cada flujo |
| Entorno | Imagen `docker/testing/Dockerfile.e2e` con Chromium, la API real, un worker de la cola y un Mailpit efímero, sin puertos publicados |
| Sesiones | `admin.setup.ts` e `institution.setup.ts` inician sesión una vez, con credenciales efímeras que el script genera y no imprime. `secretary.setup.ts` y `company.setup.ts` crean una Secretaría y una empresa a partir de ellas. Los escenarios reutilizan esas sesiones para no agotar el límite de inicio de sesión. |
| Ejecución | `workers: 1` y sin reintentos (`retries: 0`): una prueba inestable falla, no se oculta |
| Qué verifica | Cada rol de punta a punta: invitación y activación leyendo el correo en Mailpit, recuperación de contraseña, correo de acceso, padrón y CV, búsqueda → solicitud → aceptación, conversación, ficha compartida, videos con reproducción, reportes, bitácora, legales y tema |

## Qué no cubren las pruebas automáticas

- **La CSP y las cabeceras de Caddy.** Las pruebas corren con Vite, que no envía la CSP. Esas cabeceras las verifica `smoke.sh` en cada despliegue ([Tokens y CSP](../05-frontend/03-tokens-y-csp.md#cómo-se-verifica)).
- **La infraestructura.** Terraform se valida con `fmt`, `validate` y `plan`, y Packer con `validate` y `99-verify.sh`. El resto se verifica en el piloto: la prueba funcional y la de recreación del runbook.
- **Carga y concurrencia.** La simulación de carga midió latencia de peticiones secuenciales, no concurrencia ([ADR-001](../01-vision-general/adr/ADR-001-monolito-modular.md)).

## Cómo se ejecutan

| Dónde | Qué corre |
|---|---|
| Local | Los tres comandos de la tabla de arriba, **en secuencia**: `test-backend.sh` y `test-e2e.sh` comparten el proyecto de Compose `banco-talentos-tests` ([Entorno local](03-entorno-local.md#pruebas-en-local)) |
| CI, en cada PR | Pest y Vitest (más ESLint, `tsc`, build, `npm audit`, Pint y `composer audit`) |
| CI, manual | Playwright, con `workflow_dispatch` y `e2e=true`, siempre después de Pest ([GitHub Actions](../06-infraestructura/04-github-actions.md)) |

## Fuentes en el repositorio

- `backend/tests/` (`Feature/`, `Support/`, `Fixtures/`), `backend/phpunit.xml`
- `frontend/vitest.config.ts`, `frontend/src/test/setup.ts`, `frontend/src/**/*.test.ts*`
- `frontend/playwright.config.ts`, `frontend/e2e/`
- `compose.testing.yaml`, `docker/testing/`, `scripts/test-backend.sh`, `scripts/test-e2e.sh`
- `.github/workflows/ci.yml`
