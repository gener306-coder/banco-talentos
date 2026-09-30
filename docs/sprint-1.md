# Sprint 1

## HU-S1-01 — Autenticación y control de acceso
**Estado:** Completada 

# HU-S1-02 — Gestión de instituciones

**Tipo Jira:** Story  
**Story Points:** 8  
**Prioridad:** Alta  
**Dependencia:** HU-S1-01 — Autenticación y control de acceso

## Historia de usuario

**COMO** Administrador  
**QUIERO** registrar, consultar, modificar y cambiar el estado de las instituciones educativas  
**PARA** administrar las instituciones que participan en el Banco de Talentos sin perder su información histórica.

## Criterios de aceptación

- **CA-01.** Solamente un usuario con rol `ADMIN` puede acceder a la gestión administrativa de instituciones.
- **CA-02.** El Administrador puede consultar el listado de instituciones registradas.
- **CA-03.** El Administrador puede registrar una nueva institución.
- **CA-04.** El sistema valida los campos obligatorios antes de almacenar una institución.
- **CA-05.** El sistema evita registros duplicados de acuerdo con las reglas de unicidad definidas para las instituciones.
- **CA-06.** El Administrador puede consultar los datos individuales de una institución.
- **CA-07.** El Administrador puede modificar los datos de una institución existente.
- **CA-08.** Toda institución posee un estado: `ACTIVA` o `INACTIVA`.
- **CA-09.** Una institución recién registrada queda en estado `ACTIVA` por defecto.
- **CA-10.** El Administrador puede cambiar una institución de `ACTIVA` a `INACTIVA` y viceversa.
- **CA-11.** Cambiar una institución a `INACTIVA` no elimina su registro de la base de datos.
- **CA-12.** No existe eliminación física de instituciones desde las funcionalidades del sistema.
- **CA-13.** Si una solicitud contiene información inválida, el sistema no almacena información parcial.
- **CA-14.** Un usuario sin rol `ADMIN` no puede registrar, modificar ni cambiar el estado de instituciones, incluso mediante solicitudes directas a la API.

## Decisión de diseño y límite de alcance

No implementar `DELETE /institutions` como operación funcional. La institución permanece registrada y su disponibilidad se controla mediante `ACTIVA` / `INACTIVA`, para conservar las futuras relaciones con usuarios, alumnos, solicitudes, vinculaciones y procesos de Educación Dual.

Esta historia gestiona **instituciones**. La creación de sus cuentas de acceso pertenece a **HU-S1-03**. Antes de implementar CA-04 y CA-05, documentar en el diseño técnico cuáles serán los campos obligatorios y la regla concreta de unicidad; no asumirlos sin definirlos.

## Subtareas técnicas

- **S1-02-T01 — Diseñar entidad Institution:** definir la estructura inicial de institución.
- **S1-02-T02 — Crear migración de instituciones:** incluir estado `ACTIVA` / `INACTIVA` y las restricciones de datos acordadas.
- **S1-02-T03 — Crear modelo y relaciones iniciales:** preparar la relación con las futuras cuentas institucionales.
- **S1-02-T04 — API listado de instituciones:** crear endpoint administrativo para consultar instituciones.
- **S1-02-T05 — API registro de institución:** crear endpoint administrativo de alta.
- **S1-02-T06 — API consulta individual:** permitir consultar una institución determinada.
- **S1-02-T07 — API actualización:** permitir modificar los datos autorizados de una institución.
- **S1-02-T08 — API cambio de estado:** implementar `ACTIVA ↔ INACTIVA` sin eliminación física.
- **S1-02-T09 — Validaciones backend:** validar campos obligatorios, unicidad y datos de entrada mediante Form Requests o mecanismo equivalente.
- **S1-02-T10 — Autorización:** restringir las operaciones administrativas al rol `ADMIN` desde la API.
- **S1-02-T11 — Interfaz React de instituciones:** crear listado, registro, consulta, edición y cambio de estado.
- **S1-02-T12 — Estados de interfaz:** contemplar carga, éxito, errores de validación y errores de solicitud.
- **S1-02-T13 — Pruebas backend:** verificar operaciones permitidas, validaciones, autorización y cambio de estado; comprobar que no hay eliminación funcional.
- **S1-02-T14 — Pruebas frontend:** verificar listado, formularios y presentación de errores.
- **S1-02-T15 — Prueba E2E:** Administrador registra institución → consulta → modifica → inactiva → reactiva.

## Resultado esperado

Un Administrador puede registrar y gestionar instituciones desde React; la API aplica las mismas reglas de autorización y validación; PostgreSQL conserva los registros cuando pasan a `INACTIVA`.