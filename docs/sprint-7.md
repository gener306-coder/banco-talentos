# Sprint 7 — Reportes Ejecutivos, Exportación CSV y Cierre Documental

Sprint vigente desde el 28 de octubre de 2026. Sprint anterior: [sprint-6.md](sprint-6.md) (histórico).

**Objetivo del Sprint:** cubrir el bloque final de requisitos funcionales (RF-60 a RF-65) dotando al Administrador y a la Secretaría de Economía de un reporte ejecutivo de seguimiento del programa de Educación Dual con exportación en CSV (sin exponer datos personales de alumnos), permitir a cada Institución exportar su propio padrón y solicitudes en CSV, y actualizar el Documento General del proyecto para que refleje la arquitectura e implementación reales de los Sprints 1 a 7.

**Story Points:** 16 (HU-S7-01 a HU-S7-03), más una tarea transversal de cierre documental.

## Fuera de alcance

- Gráficas interactivas con librerías externas (Chart.js, D3, etc.): las tablas de distribución y barras de proporción usan únicamente HTML/CSS con los tokens semánticos existentes.
- Exponer identidades de alumnos (`student_identities`) o datos del IMSS (`student_social_security`) en reportes o exportaciones de `ADMIN` o `SECRETARY`.

## Orden de implementación sugerido

1. **HU-S7-01** Reporte ejecutivo del programa de Educación Dual (`ADMIN` y `SECRETARY`).
2. **HU-S7-02** Exportación en CSV del reporte ejecutivo y de las bandejas institucionales.
3. **HU-S7-03** Bitácora consultable de actividad administrativa y de vinculación (`ADMIN`).
4. **T-S7-01** Actualización integral de `Banco_de_Talentos_Documento_General.md` y `README.md`.

---

## HU-S7-01 — Reporte ejecutivo del programa de Educación Dual

**Estado:** Completada (28 de octubre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S7-01.md`  
**Story Points:** 5  
**Rol:** `ADMIN`, `SECRETARY`

### Historia de usuario

**COMO** Administrador o usuario de la Secretaría de Economía  
**QUIERO** consultar un reporte ejecutivo con el embudo de solicitudes de vinculación, la participación por institución educativa y las empresas/oportunidades por sector SCIAN  
**PARA** evaluar el impacto del programa de Educación Dual sin intervenir en la operación ni acceder a expedientes personales.

### Criterios de aceptación

- **CA-01.** Solo `ADMIN` y `SECRETARY` acceden a `GET /api/reports/dual-program` y a la vista `/reports`. `INSTITUTION` y `COMPANY` reciben `403`, y un visitante recibe `401`.
- **CA-02.** El reporte devuelve exclusivamente datos agregados (nunca nombres, matrículas ni identificadores de alumnos):
  - **Resumen de solicitudes (`linkage_summary`):** conteo total y por estado (`PENDIENTE_INSTITUCION`, `ACEPTADA`, `RECHAZADA`, `CANCELADA`).
  - **Participación por institución (`by_institution`):** lista de instituciones (ordenadas por nombre) con su estado (`is_active`), alumnos activos, perfiles buscables, solicitudes recibidas y solicitudes aceptadas.
  - **Participación por sector SCIAN (`by_sector`):** sectores con al menos una empresa u oportunidad registrada, mostrando código SCIAN, empresas activas, oportunidades activas y solicitudes aceptadas.
- **CA-03.** La vista `/reports` es accesible desde el inicio de `ADMIN` y `SECRETARY`, presenta las tres secciones con tablas accesibles y tokens semánticos de `docs/design/identidad-visual.md`.

---

## HU-S7-02 — Exportación en CSV de reportes y bandejas

**Estado:** Completada (28 de octubre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S7-02.md`  
**Story Points:** 5  
**Rol:** `ADMIN`, `SECRETARY`, `INSTITUTION`  
**Dependencia:** HU-S7-01

### Historia de usuario

**COMO** usuario de la Secretaría, Administrador o Institución Educativa  
**QUIERO** descargar en formato CSV la información estadística o las solicitudes de vinculación que me corresponden  
**PARA** elaborar informes oficiales y dar seguimiento administrativo en hojas de cálculo.

### Criterios de aceptación

- **CA-01.** [Exportación ejecutiva] `GET /api/reports/dual-program/export.csv` (para `ADMIN` y `SECRETARY`) descarga un archivo CSV (`text/csv; charset=UTF-8` con BOM UTF-8 para compatibilidad con Excel, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` y `Cache-Control: no-store, private`) con el desglose por institución y por sector SCIAN, sin ningún dato personal de alumnos.
- **CA-02.** [Exportación institucional con aislamiento Anti-IDOR] `GET /api/institution/linkage-requests/export.csv` (para `INSTITUTION` con `institution.member`, aceptando el filtro opcional `status`) descarga únicamente las solicitudes de la institución de la sesión con: folio (`id`), fecha de solicitud, estado, matrícula, apellidos y nombre del alumno, carrera, empresa, contacto de la empresa (`contact_name`, `contact_email`, `contact_phone`), título de la oportunidad y fecha de respuesta. Nunca incluye el NSS ni datos de otras instituciones.
- **CA-03.** [Seguridad contra inyección de fórmulas CSV] Todo valor de texto exportado que comience con `=`, `+`, `-`, `@`, tabulador o retorno de carro se neutraliza prefijándolo con una comilla simple (`'`) antes de escribir el CSV.
- **CA-04.** En `/reports` y en `/institution/linkage-requests` se incluye el botón **Descargar CSV** reutilizando `requestBlob()` de `lib/http.ts`.

---

## HU-S7-03 — Consulta administrativa de eventos recientes (Trazabilidad)

**Estado:** Completada (28 de octubre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S7-03.md`  
**Story Points:** 6  
**Rol:** `ADMIN`

### Historia de usuario

**COMO** Administrador  
**QUIERO** consultar una bitácora de trazabilidad con las altas de cuentas, empresas, oportunidades y decisiones de vinculación más recientes  
**PARA** auditar el uso del sistema sin exponer contraseñas, tokens ni datos protegidos de los alumnos.

### Criterios de aceptación

- **CA-01.** Solo `ADMIN` accede a `GET /api/audit-events` y a la vista `/audit-events` desde su página de inicio. Los demás roles reciben `403`.
- **CA-02.** Sin requerir tablas duplicadas, o mediante una vista/consulta unificada paginada de 30 en 30 ordenada por fecha descendente, muestra los eventos trazables ya registrados en la base de datos (`users.created_by`, `companies.registered_by`, `opportunities.created_by`, `linkage_requests.requested_by` y `linkage_requests.responded_by`), con filtro opcional por tipo de evento (`account_created`, `company_registered`, `opportunity_created`, `linkage_requested`, `linkage_responded`).
- **CA-03.** Cada evento expone únicamente: tipo, fecha (`occurred_at`), actor (`id`, `name`, `role`) y descripción pública del recurso afectado (nombre/correo de la cuenta, razón social de la empresa, título de la oportunidad o identificador de la solicitud con su institución y empresa). **Nunca** expone tokens, hashes, NSS ni la identidad del alumno (`student_identities`).