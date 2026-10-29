# Banco de Talentos – Educación Dual: Documento General

Versión actualizada el 28 de octubre de 2026, al cierre del Sprint 7 (T-S7-01). Sustituye a la versión del 7 de octubre de 2026, escrita durante el Sprint 1, que mezclaba la propuesta inicial con el estado de entonces.

Este documento describe el proyecto tal como está construido en el repositorio. Las fuentes de verdad por historia son `docs/sprint-N.md` (alcance aprobado) y `docs/HU-SN-0X.md` (diseño técnico, contrato y pruebas); el `README.md` explica cómo usar y ejecutar el sistema.

---

# 1. Contexto general del proyecto

El proyecto es una **plataforma web de Banco de Talentos para la vinculación universidad-empresa y el impulso a la Educación Dual**.

La información de los alumnos está repartida entre instituciones educativas, y la vinculación con empresas dependía de trabajo manual. La plataforma centraliza esa información y organiza el proceso:

```text
Secretaría de Economía ── valida y registra ──▶ Empresas
                                                  │
Instituciones educativas                          │ buscan perfiles anónimos
        │                                         ▼
        │ registran y administran ──▶  Banco de Talentos
        │                                         │
        │                                         │ solicitud de vinculación
        ◀─────────────────────────────────────────┘
        │
        │ aceptan o rechazan
        ▼
  Educación Dual (coordinación fuera de la plataforma)
```

Participan 16 instituciones educativas, empresas y la Secretaría de Economía. **El alumno no es usuario del sistema**: su información la administra su institución.

---

# 2. Actores principales

| Rol | Función en el sistema construido |
|---|---|
| **Administrador (`ADMIN`)** | Gestiona instituciones, sus cuentas y las cuentas de la Secretaría; consulta el reporte ejecutivo y la bitácora. No sustituye a los actores durante una vinculación. |
| **Institución educativa (`INSTITUTION`)** | Administra exclusivamente a sus alumnos (padrón, expediente, CV, seguro facultativo); recibe, acepta o rechaza solicitudes de vinculación y las exporta en CSV. |
| **Empresa (`COMPANY`)** | Busca perfiles anónimos, publica Oportunidades Duales y envía solicitudes de vinculación a la institución del alumno. |
| **Secretaría de Economía (`SECRETARY`)** | Registra las empresas que ya validó y sus cuentas, crea cuentas para su propio personal y consulta el reporte ejecutivo. No administra expedientes académicos ni crea cuentas `ADMIN` o `INSTITUTION`. |
| **Alumno** | No tiene cuenta; es un perfil administrado por su institución. |

No hay registro público: toda cuenta la crea otra cuenta autorizada, que queda registrada como su creadora, y la persona titular establece su propia contraseña con un enlace de un solo uso.

---

# 3. Objetivo general

> **Diseñar y desarrollar una plataforma web de Banco de Talentos que facilite la vinculación entre instituciones educativas, empresas y la Secretaría de Economía, permitiendo a las instituciones registrar y administrar perfiles de alumnos, y a las empresas localizar candidatos mediante criterios académicos, profesionales y geográficos para apoyar los procesos de Educación Dual.**

En términos sencillos: pasar de «tenemos alumnos y empresas interesadas» a un proceso organizado de búsqueda, solicitud, respuesta y seguimiento.

---

# 4. Objetivos específicos y su estado

| # | Objetivo | Estado al cierre del Sprint 7 |
|---|---|---|
| 1 | Centralizar la información de talento de las instituciones. | Cumplido: padrón, expediente público y CV normalizado (Sprints 2 y 3). |
| 2 | Que cada institución administre solo a sus alumnos. | Cumplido: aislamiento por institución en cada consulta; un recurso ajeno responde `404`. |
| 3 | Búsqueda por carrera, habilidades, certificaciones, disponibilidad y ubicación. | Cumplido: buscador anónimo con radio en kilómetros (HU-S4-05). |
| 4 | Seguro facultativo y comprobante del IMSS. | Cumplido como resguardo interno de la institución (HU-S3-02); nunca se expone a empresas. |
| 5 | Oportunidades de Educación Dual. | Cumplido (HU-S5-02, HU-S5-03). |
| 6 | Flujo de solicitud y seguimiento. | Cumplido con solicitud **directa** empresa → institución, sin mediación de la Secretaría (HU-S5-04 a HU-S6-02). |
| 7 | Trazabilidad de acciones relevantes. | Cumplido para altas y vinculaciones mediante columnas de autoría y la bitácora (HU-S7-03). |
| 8 | Proteger la información personal del alumno. | Cumplido: identidad, NSS, enlaces y credenciales separados y nunca expuestos fuera de la institución. |
| 9 | Ejecución local y en nube con infraestructura como código. | Parcial: ejecución local y pruebas reproducibles con Docker Compose; sin Terraform, Packer ni despliegue en nube. |

---

# 5. Flujo principal del proyecto

El documento maestro planteaba como primera meta funcional un flujo con mediación de la Secretaría. Durante el Sprint 5 se decidió que la empresa solicite **directamente** a la institución, porque la Secretaría ya valida a las empresas al registrarlas. El flujo construido es:

```text
Secretaría registra empresa validada y sus cuentas
        ↓
Institución registra alumno y su expediente
        ↓
Empresa publica una Oportunidad Dual
        ↓
Empresa localiza un perfil anónimo (filtros y radio)
        ↓
Empresa solicita la vinculación a la institución del alumno
        ↓
Institución revisa al alumno (identidad y seguro) y acepta o rechaza
        ↓
Empresa ve la respuesta y el contacto de la institución
        ↓
Coordinación de la Educación Dual fuera de la plataforma
```

La Secretaría y el Administrador dan seguimiento con indicadores, el reporte ejecutivo y la bitácora, sin intervenir en cada solicitud.

---

# 6. Metas por etapas y su resultado

| Meta | Contenido | Sprints | Resultado |
|---|---|---|---|
| 1. Fundamentos | Autenticación, roles, instituciones, cuentas, seguridad. | 1, 2 | Completa. |
| 2. Banco de Talentos | Padrón, expediente, CV, seguro facultativo, ubicación. | 2, 3, 4 | Completa. |
| 3. Búsqueda empresarial | Filtros académicos y profesionales, distancia. | 4 | Completa (sin mapa y sin filtro por seguro: el seguro es interno de la institución). |
| 4. Oportunidades | Carrera, habilidades, periodo, lugares, ubicación. | 5 | Completa. |
| 5. Vinculación | Solicitud, respuesta institucional, estados. | 5, 6 | Completa con solicitud directa; sin historial ni observaciones de seguimiento posteriores a la respuesta. |
| 6. Operación y evolución | Indicadores, reportes, exportaciones, auditoría. | 5, 6, 7 | Indicadores, reporte ejecutivo, CSV y bitácora completos; notificaciones, multimedia y casos de éxito siguen como evolución. |

---

# 7. Requisitos funcionales

La especificación de septiembre de 2026 contiene **65 requisitos funcionales**. Su cobertura por bloque:

| Bloque | Qué contempla | Historias que lo cubren |
|---|---|---|
| RF-01–RF-11 | Autenticación, usuarios, roles, instituciones, empresas y Secretaría | HU-S1-01 a HU-S1-04, HU-S2-01, HU-S4-01 a HU-S4-03, HU-S6-04 |
| RF-12–RF-20 | Registro y administración de alumnos | HU-S2-02 a HU-S2-04 |
| RF-21–RF-29 | Habilidades, idiomas, certificaciones, proyectos | HU-S3-01 |
| RF-30–RF-33 | Seguro facultativo | HU-S3-02 |
| RF-34–RF-39 | Ubicación, movilidad y búsqueda geográfica | HU-S2-03, HU-S4-04, HU-S4-05 |
| RF-40–RF-45 | Buscador y filtros de talento | HU-S4-05 |
| RF-46–RF-49 | Oportunidades de Educación Dual | HU-S5-02, HU-S5-03 |
| RF-50–RF-59 | Vinculación, estados y seguimiento | HU-S5-04, HU-S5-05, HU-S6-01, HU-S6-02 |
| RF-60–RF-65 | Catálogos, auditoría, indicadores, reportes y exportación | HU-S5-01, HU-S6-03, HU-S7-01 a HU-S7-03 |

Los requisitos se refinaron sprint a sprint; las diferencias principales con la propuesta original están en la sección 13.

---

# 8. Requisitos no funcionales

La especificación contiene **28 requisitos no funcionales**. Así se atienden:

| Área | Cómo se cumple |
|---|---|
| Usabilidad | Interfaz en español, responsiva (retícula de 70 rem y formularios de 45 rem), accesible (roles ARIA, foco gestionado en hojas y diálogos, estados vacíos y de error) y con la identidad visual de `docs/design/identidad-visual.md`. |
| Rendimiento | Listados paginados (20, 30 o 50 por página), índices en las columnas de filtro, índice GiST para distancia y exportaciones CSV en flujo. No se han hecho pruebas de carga formales. |
| Portabilidad | Todo el entorno corre en contenedores (Docker Compose) con un proyecto de pruebas aislado. La nube y la infraestructura como código siguen pendientes. |
| Seguridad | Contraseñas con hash, sesiones Sanctum con cookie `HttpOnly` y CSRF, autorización en backend por rol y por organización, límites de intentos, `Cache-Control: no-store, private` en respuestas autenticadas, NSS cifrado con índice ciego, PDFs en disco privado, neutralización de fórmulas en CSV. HTTPS queda a cargo del despliegue. |
| Datos y operación | Transacciones y bloqueos de fila en operaciones concurrentes, restricciones `CHECK` y llaves foráneas en PostgreSQL, baja lógica sin eliminación física, registro de quién crea cada recurso. Respaldos y recuperación dependen del despliegue. |
| Calidad | Monolito modular, pruebas automatizadas en tres niveles, Git con una rama por historia, Pint y ESLint. |

---

# 9. Stack tecnológico

## Propuesta original frente a lo construido

| Capa | Propuesta del documento maestro | Construido |
|---|---|---|
| Frontend | React + TypeScript + Vite | React 19, TypeScript 5.9, Vite 8, Node 24 |
| Estilos | Tailwind CSS o equivalente | CSS por módulo en capas (`@layer`) con tokens semánticos y Tailwind CSS 4 solo para los tokens de marca (sin Preflight) |
| Backend | Laravel + PHP | Laravel 13, PHP 8.4 |
| API | REST | REST JSON bajo `/api` |
| Autenticación | Laravel Sanctum | Sanctum 4 con sesión y CSRF (sin tokens de acceso) |
| Base de datos | PostgreSQL + PostGIS | PostgreSQL 17 + PostGIS 3.5 |
| Caché/colas | Redis cuando sea necesario | Sin Redis: sesiones y caché en PostgreSQL |
| Archivos | Local / S3 | Disco local privado de Laravel |
| Correo | — | SMTP; Mailpit en desarrollo y en E2E |
| Contenedores | Docker + Compose | Docker Compose para desarrollo (`compose.yaml`) y pruebas (`compose.testing.yaml`) |
| IaC e imágenes | Terraform, Packer | No implementado |
| CI/CD | GitHub Actions | No implementado; las suites se ejecutan con `scripts/` |
| Pruebas | — | Pest, Vitest + React Testing Library, Playwright/Chromium |

Se mantuvo la recomendación de no introducir microservicios, Kubernetes, Redis ni Octane en el MVP.

---

# 10. Arquitectura

```text
                  ┌──────────────────────────────┐
                  │  SPA React + TypeScript      │
                  │  rutas protegidas por rol    │
                  └──────────────┬───────────────┘
                                 │ HTTP JSON, cookie de sesión + X-XSRF-TOKEN
                  ┌──────────────▼───────────────┐
                  │  Laravel (monolito modular)  │
                  │  auth:sanctum · active ·     │
                  │  role · institution.member · │
                  │  organization.member         │
                  └──────┬───────────────┬───────┘
                         │               │
            ┌────────────▼───┐   ┌───────▼─────────┐
            │ PostgreSQL     │   │ Disco privado   │
            │ + PostGIS      │   │ (comprobantes)  │
            └────────────────┘   └─────────────────┘
                         Docker Compose · Mailpit
```

## Convenciones técnicas obligatorias

- **Aislamiento y anti-IDOR:** toda consulta de recursos de una institución o empresa filtra por la organización de la sesión; un recurso ajeno responde `404`, idéntico a uno inexistente.
- **Privacidad por diseño:** `student_identities`, `student_social_security`, `student_links`, `student_certification_credentials`, `students.id` y las columnas `location` nunca salen hacia `COMPANY` o `SECRETARY`. Las vistas externas usan listas explícitas de campos y `students.public_id` (UUID v4).
- **Geolocalización en el servidor:** el cliente nunca envía coordenadas. El servidor ubica alumnos, empresas y oportunidades en la cabecera municipal del catálogo INEGI.
- **Sin eliminación física:** no hay rutas `DELETE` para entidades principales; las bajas son lógicas (`is_active`) mediante `PATCH .../status`.
- **Cuerpos estrictos:** las peticiones rechazan campos no permitidos y textos con enlaces, correos o teléfonos donde se compartirán con otra organización.
- **Frontend:** solo tokens semánticos en CSS (verificado por `src/ui/tokens.test.ts`), componentes compartidos (`Sheet`, `ConfirmDialog`, `LoadingState`, `StateMessage`, `MunicipalityCombobox`, `CsvDownloadButton`) y validación del contrato de cada respuesta antes de mostrarla.

## Módulos del backend

| Módulo | Controladores |
|---|---|
| Acceso | `AuthController`, `InitialPasswordController`, `InstitutionPasswordResetController`, `InstitutionSetupLinkController` |
| Instituciones y cuentas | `InstitutionController`, `InstitutionAccountController`, `SecretaryAccountController` |
| Empresas | `CompanyController`, `CompanyAccountController` |
| Alumnos | `StudentController`, `StudentCvController`, `StudentSocialSecurityController` |
| Catálogos | `MunicipalityController`, `SkillController` |
| Búsqueda y oportunidades | `TalentController`, `OpportunityController` |
| Vinculación | `LinkageRequestController` (empresa), `InstitutionLinkageRequestController` (institución) |
| Seguimiento | `DashboardController`, `ReportController`, `AuditEventController` |

---

# 11. Lo que se ha construido, por Sprint

| Sprint | Objetivo | Historias |
|---|---|---|
| 1 | Base de acceso y administración institucional | HU-S1-01 Autenticación y control de acceso · HU-S1-02 Gestión de instituciones · HU-S1-03 Cuentas institucionales con contraseña establecida por la titular · HU-S1-04 Restablecimiento de contraseña iniciado por ADMIN |
| 2 | Padrón y expediente estudiantil | HU-S2-01 Enlace de invitación manual · HU-S2-02 Registro y padrón · HU-S2-03 Expediente académico, profesional y geográfico · HU-S2-04 Baja lógica de alumnos |
| 3 | CV normalizado y seguro facultativo | HU-S3-01 CV profesional para cualquier disciplina · HU-S3-02 NSS cifrado y comprobante del IMSS |
| 4 | Apertura a empresas | HU-S4-01 Cuentas de la Secretaría · HU-S4-02 Empresas validadas · HU-S4-03 Cuentas de empresa · HU-S4-04 Catálogo INEGI y ubicación por municipio · HU-S4-05 Buscador de talento anónimo |
| 5 | Oportunidades y solicitudes | T-S5-01 Sesiones E2E reutilizables · HU-S5-01 Indicadores del inicio · HU-S5-02 Oportunidades Duales · HU-S5-03 Baja lógica de oportunidades · HU-S5-04 Solicitud directa a la institución · HU-S5-05 Bandeja de la empresa |
| 6 | Cierre del flujo dual | HU-S6-01 Bandeja institucional · HU-S6-02 Respuesta `ACEPTADA`/`RECHAZADA` · HU-S6-03 Indicadores de vinculación · HU-S6-04 Inactivación y restablecimiento de cuentas `SECRETARY` y `COMPANY` |
| 7 | Seguimiento y cierre documental | HU-S7-01 Reporte ejecutivo · HU-S7-02 Exportación CSV · HU-S7-03 Bitácora de trazabilidad · T-S7-01 Este documento y el `README.md` |

Tareas transversales fuera de las historias: inicio por rol con tarjetas de acceso, tokens semánticos de marca, tamaños de contenedores, logotipo de la Secretaría y un modo oscuro preparado pero desactivado hasta contar con logotipos para fondo oscuro.

## Modelo de datos

| Tabla | Contenido |
|---|---|
| `users` | Cuentas de los cuatro roles, con `institution_id` o `company_id` según el rol, `created_by`, `is_active` y `password_setup_required`. |
| `institutions` | Nombre, CCT único, correo de contacto, estado. |
| `institution_password_setup_tokens`, `institution_password_reset_tokens` | Enlaces de un solo uso para la contraseña inicial y para el restablecimiento, de cualquier rol salvo ADMIN en el restablecimiento. |
| `students` | Expediente público: carrera, periodo, disponibilidad, estado y municipio, `location`, `public_id`, estado. |
| `student_identities` | Matrícula y nombre, solo para la institución. |
| `student_social_security` | NSS cifrado, su índice ciego y el comprobante en PDF. |
| `student_skills`, `student_languages`, `student_certifications`, `student_certification_credentials`, `student_projects`, `student_links` | CV normalizado: habilidades, idiomas, certificaciones (con credenciales protegidas), proyectos y enlaces protegidos. |
| `skills`, `municipalities` | Catálogos de habilidades y de municipios INEGI con su punto. |
| `companies` | Empresa validada: RFC único, sector SCIAN, municipio, contacto, `registered_by`, estado. |
| `opportunities`, `opportunity_skills` | Oportunidad Dual de una empresa, con habilidades, idioma, municipio, `created_by`, estado. |
| `linkage_requests` | Solicitud empresa → institución sobre un alumno y una oportunidad, con `requested_by`, estado, `responded_by`, `responded_at` y mensaje de respuesta. |
| `sessions`, `cache`, `cache_locks` | Sesiones y caché de Laravel en PostgreSQL. |

## Estados de una solicitud de vinculación

```text
PENDIENTE_INSTITUCION ──(institución acepta)──▶ ACEPTADA
          │
          ├──(institución rechaza)──▶ RECHAZADA
          │
          └──(empresa cancela)──▶ CANCELADA
```

Solo una solicitud pendiente cambia de estado, y la respuesta institucional es definitiva. No se puede repetir una solicitud de la misma empresa, alumno y oportunidad mientras siga pendiente o aceptada.

## Pruebas al cierre del Sprint 7

Última ejecución completa, en secuencia, el 28 de octubre de 2026 (HU-S7-03):

| Suite | Resultado |
|---|---|
| Pest (PostgreSQL temporal) | 1246 pruebas |
| Vitest + React Testing Library | 647 pruebas |
| ESLint y build de producción | Sin errores |
| Playwright/Chromium con API real y Mailpit | 34 escenarios |

---

# 12. Cómo se gestionan los cambios

- **El objetivo general no cambia fácilmente:** facilitar la vinculación entre instituciones, empresas y Secretaría para apoyar la Educación Dual.
- **Los requisitos sí pueden cambiar** tras una revisión con el cliente; se refinan en la historia correspondiente.
- **Los Sprints sí pueden cambiar:** las historias se gestionan en Jira y solo se implementan las que el responsable copia en el archivo del Sprint vigente (`docs/sprint-N.md`). Los Sprints anteriores son históricos.
- Cada historia se implementa en su propia rama, en dos fases (backend con Pest; interfaz con Vitest, E2E y documentación), y se integra en `main` solo tras confirmación.

---

# 13. Diferencias con la propuesta original

| Propuesta original | Decisión tomada | Motivo |
|---|---|---|
| La Secretaría recibe y canaliza cada solicitud. | Solicitud directa empresa → institución (HU-S5-04). | La Secretaría ya valida a la empresa al registrarla; la mediación añadía un paso manual sin aportar control. |
| El Administrador gestiona también empresas y sus usuarios. | La Secretaría registra empresas y sus cuentas (HU-S4-02, HU-S4-03). | Es quien valida a las empresas. |
| El Administrador define contraseñas. | La persona titular establece su contraseña con un enlace de un solo uso, por correo o para compartir (HU-S1-03, HU-S2-01). | Nadie conoce la contraseña de otra cuenta. |
| Búsqueda con filtro por seguro facultativo y mapa. | Sin filtro por seguro ni mapa; tarjetas anónimas por distancia. | El seguro es un resguardo interno de la institución; el mapa no era necesario para el MVP. |
| Ubicación capturada libremente. | Catálogo INEGI y punto de la cabecera municipal calculado por el servidor (HU-S4-04). | Distancias reales sin exponer domicilios ni coordenadas. |
| Historial, observaciones y cierre de la vinculación dentro de la plataforma. | Tras aceptar, la coordinación continúa fuera de la plataforma con el contacto de cada parte. | Alcance del MVP. |
| Auditoría en una tabla de eventos. | Bitácora derivada de las columnas de autoría (HU-S7-03). | Evita duplicar datos; cubre altas y vinculaciones. |
| Redis, Terraform, Packer, CI/CD y nube desde el inicio. | Solo Docker Compose y scripts de pruebas. | Simplicidad para un desarrollo individual; se añadirán cuando haga falta desplegar. |

---

# 14. MVP alcanzado

El escenario de punta a punta que el proyecto se propuso demostrar está construido. El E2E `e2e/talent-search.spec.ts` lo recorre desde la publicación del alumno hasta la respuesta, sobre las sesiones de Secretaría y Empresa que crean `e2e/secretary.setup.ts` y `e2e/company.setup.ts`:

```text
ADMIN ── instituciones y cuentas
SECRETARÍA ── empresas validadas y cuentas
INSTITUCIÓN ── registra alumno, expediente, CV y seguro
EMPRESA ── publica oportunidad, busca por habilidad y radio, solicita vinculación
INSTITUCIÓN ── revisa identidad y seguro, acepta con mensaje
EMPRESA ── ve la respuesta y el contacto de la institución
ADMIN / SECRETARÍA ── indicadores, reporte ejecutivo, CSV y bitácora
```

---

# 15. Pendiente y evolución

**Fuera del alcance construido**, para Sprints futuros si se aprueban:

- exportación del padrón institucional en CSV (mencionada en el objetivo del Sprint 7, pero no incluida en sus historias);
- seguimiento de la vinculación después de la respuesta: historial, observaciones y cierre;
- bitácora de eventos que hoy no tienen columna de autoría (ediciones, cambios de estado, restablecimientos, inicios de sesión);
- notificaciones a las cuentas;
- modo oscuro, cuando existan logotipos para fondo oscuro;
- multimedia, casos de éxito y verificación automática de credenciales.

**Operación e infraestructura:**

- despliegue en nube con HTTPS, respaldos y recuperación;
- infraestructura como código (Terraform, Packer) e integración continua;
- pruebas de carga para validar los objetivos de rendimiento;
- Redis u Octane solo si las pruebas lo justifican.

---

# 16. Referencias

| Documento | Contenido |
|---|---|
| `README.md` | Uso del sistema por rol, desarrollo local, pruebas y operación. |
| `docs/sprint-1.md` a `docs/sprint-7.md` | Alcance aprobado de cada Sprint (históricos salvo el vigente). |
| `docs/HU-S1-01.md` a `docs/HU-S7-03.md` | Decisiones, contrato API y matriz de pruebas de cada historia. |
| `docs/design/identidad-visual.md` | Paleta, tokens semánticos, logotipos y modo oscuro preparado. |
| `backend/README.md` | Contrato HTTP de autenticación y alta local de cuentas. |
| `CLAUDE.md` / `AGENTS.md` | Reglas de desarrollo y convenciones técnicas obligatorias. |
