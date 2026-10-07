# Banco de Talentos – Educación Dual

## Objetivo
Sistema web para vinculación entre instituciones educativas,
empresas y Secretaría de Economía mediante un Banco de Talentos.

## Stack
- Frontend: React + TypeScript + Vite
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
- El administrador gestiona cuentas y organizaciones,
  pero no sustituye a los actores durante una vinculación.
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

Sprint vigente: docs/sprint-1.md

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