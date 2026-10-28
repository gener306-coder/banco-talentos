# Banco de Talentos – Educación Dual

## Objetivo
Sistema web para vinculación entre instituciones educativas,
empresas y Secretaría de Economía mediante un Banco de Talentos.

## Stack
- Frontend: React + TypeScript + Vite
- Estilos: CSS existente + Tailwind CSS v4 (tokens de marca, sin Preflight)
- Backend: Laravel API REST
- Autenticación: Laravel Sanctum
- Base de datos: PostgreSQL + PostGIS
- Entorno local: Docker Compose
- Backend tests: Pest
- Frontend tests: Vitest + React Testing Library
- E2E: Playwright

## Arquitectura
Usar monolito modular.

No utilizar:
- microservicios
- Kubernetes
- Redis durante el MVP salvo necesidad demostrada
- Laravel Octane durante el MVP salvo pruebas que lo justifiquen

## Roles
- Administrador
- Institución
- Empresa
- Secretaría de Economía

Los alumnos NO son usuarios.
Los alumnos son administrados por su institución.

## Reglas de seguridad
- Una institución nunca puede modificar alumnos de otra institución.
- Una empresa nunca puede modificar alumnos.
- Secretaría no administra expedientes académicos.
- El administrador gestiona las instituciones, sus cuentas y las cuentas
  de la Secretaría, pero no sustituye a los actores durante una vinculación.
- La Secretaría de Economía gestiona las empresas que valida y sus cuentas,
  y puede crear cuentas SECRETARY para su propio personal. Nunca crea
  cuentas ADMIN ni INSTITUTION.
- Toda cuenta registra quién la creó.
- Nunca guardar contraseñas en texto plano.
- Nunca incluir secretos en Git.

## Desarrollo
Las historias se gestionan en Jira. Solo se consideran aprobadas
para implementación las que el responsable copia en el archivo
del Sprint vigente.

No agregar funcionalidades que no pertenezcan
al Sprint actual sin indicarlo.

Cada historia debe:
1. Cumplir sus criterios de aceptación.
2. Tener validaciones backend.
3. Tener autorización backend cuando corresponda.
4. Incluir pruebas automatizadas relevantes.
5. Mantener el código sencillo y mantenible.

## Desarrollo por Sprint

Sprint vigente: docs/sprint-5.md

Ese archivo es la única fuente de verdad mientras dure el Sprint.
Los archivos de Sprints anteriores (docs/sprint-N.md) son históricos:
sirven como contexto, pero no autorizan nuevo desarrollo.

Solo pueden implementarse historias contenidas en el archivo del Sprint vigente.
Si una solicitud no aparece ahí, no debe desarrollarse sin confirmación.

Antes de implementar una historia:
1. Verifica que exista en el archivo del Sprint vigente.
2. Revisa sus criterios de aceptación.
3. Limita los cambios estrictamente al alcance de esa historia.
4. Detente y pide confirmación si una funcionalidad solicitada no está incluida en el Sprint.

## Identidad visual del frontend

Antes de desarrollar vistas frontend, consulta `docs/design/identidad-visual.md` y usa los tokens semánticos de marca definidos allí. No inventes una paleta ni migres los estilos existentes sin aprobación.

## Convenciones técnicas obligatorias (Sprints 1–4)

### Backend y Base de Datos
- **Aislamiento y Anti-IDOR:** Toda consulta o escritura de recursos de una institución o empresa debe filtrar por la organización de la sesión (ej. trait `FindsOwnedStudent`). Un recurso ajeno responde `404` idéntico a uno inexistente.
- **Privacidad por diseño:** Nunca exponer `student_identities`, `student_social_security`, `student_links`, `student_certification_credentials`, `students.id` ni columnas `location` (PostGIS) en endpoints para `COMPANY` o `SECRETARY`. Usar listas explícitas de campos y `students.public_id` (UUID v4) para vistas externas.
- **Geolocalización:** El cliente nunca envía coordenadas (`latitude`, `longitude`, `location` se ignoran). El servidor calcula `location` desde la cabecera municipal del catálogo INEGI (`municipalities`).
- **Cabeceras y rutas:** Respuestas autenticadas llevan `Cache-Control: no-store, private`. No existen rutas `DELETE` para entidades principales (usar baja lógica `is_active` vía `PATCH .../status`).

### Frontend y Diseño (apple-design)
- **Tokens semánticos estrictos:** En archivos CSS usar exclusivamente los tokens semánticos de `frontend/src/index.css` (`--surface`, `--text`, `--accent`, `--border`, etc.) dentro de `@layer`. Nunca escribir valores HEX, `rgb()` ni `var(--color-*)` directos (`src/ui/tokens.test.ts` lo verifica).
- **Retícula:** Las vistas son anchas por defecto (`--page-wide: 70rem`); formularios y detalles se limitan a `--content-readable: 45rem`.
- **Componentes UI:** Reutilizar `Sheet` para formularios secundarios en detalles, `ConfirmDialog` para inactivaciones/bajas, `LoadingState`, `StateMessage` y `MunicipalityCombobox`.

### Ejecución de Pruebas
- Ejecutar `sh scripts/test-backend.sh` y `sh scripts/test-e2e.sh` siempre de forma **secuencial**, nunca en paralelo, porque comparten el proyecto `banco-talentos-tests`.
