# Sprint 1

## HU-S1-01 — Autenticación y control de acceso

**Estado:** Completada (27 de septiembre de 2026)  
**Criterios de aceptación y evidencia:** [HU-S1-01.md](HU-S1-01.md)

## HU-S1-02 — Gestión de instituciones

**Estado:** Completada (30 de septiembre de 2026)  
**Diseño técnico y verificación:** [HU-S1-02.md](HU-S1-02.md)  
**Tipo Jira:** Story  
**Story Points:** 8  
**Prioridad:** Alta  
**Dependencia:** HU-S1-01 — Autenticación y control de acceso

### Historia de usuario

**COMO** Administrador  
**QUIERO** registrar, consultar, modificar y cambiar el estado de las instituciones educativas  
**PARA** administrar las instituciones que participan en el Banco de Talentos sin perder su información histórica.

### Criterios de aceptación

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

### Decisión de diseño y límite de alcance

No implementar `DELETE /institutions` como operación funcional. La institución permanece registrada y su disponibilidad se controla mediante `ACTIVA` / `INACTIVA`, para conservar las futuras relaciones con usuarios, alumnos, solicitudes, vinculaciones y procesos de Educación Dual.

Esta historia gestiona **instituciones**. La creación de sus cuentas de acceso pertenece a **HU-S1-03**. Antes de implementar CA-04 y CA-05, documentar en el diseño técnico cuáles serán los campos obligatorios y la regla concreta de unicidad; no asumirlos sin definirlos.

### Subtareas técnicas

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

### Resultado esperado

Un Administrador puede registrar y gestionar instituciones desde React; la API aplica las mismas reglas de autorización y validación; PostgreSQL conserva los registros cuando pasan a `INACTIVA`.

## HU-S1-03 — Creación de cuentas institucionales

**Estado:** Completada (1 de octubre de 2026)  
**Diseño técnico y verificación:** [HU-S1-03.md](HU-S1-03.md)  
**Tipo Jira:** Story  
**Story Points:** 5  
**Prioridad:** Alta  
**Dependencias:** HU-S1-01 — Autenticación y control de acceso; HU-S1-02 — Gestión de instituciones

### Historia de usuario

**COMO** Administrador  
**QUIERO** crear cuentas de acceso asociadas a instituciones registradas  
**PARA** permitir que cada institución acceda posteriormente a las funciones que le correspondan dentro del Banco de Talentos.

### Criterios de aceptación

- **CA-01.** Solamente un usuario con rol `ADMIN` puede crear una cuenta institucional.
- **CA-02.** Para crear una cuenta debe existir previamente la institución asociada.
- **CA-03.** Toda cuenta institucional queda relacionada con exactamente una institución.
- **CA-04.** Toda cuenta creada mediante esta funcionalidad recibe el rol `INSTITUTION`.
- **CA-05.** No se permite registrar dos cuentas utilizando el mismo correo de acceso.
- **CA-06.** Las credenciales nunca se almacenan en texto plano.
- **CA-07.** Una cuenta institucional válida puede autenticarse en el sistema.
- **CA-08.** Después del inicio de sesión, la API puede identificar al usuario autenticado, su rol y la institución a la que pertenece.
- **CA-09.** Un usuario `INSTITUTION` no puede acceder a funciones exclusivas de `ADMIN`.
- **CA-10.** Intentar acceder directamente a endpoints administrativos devuelve una respuesta de acceso denegado.
- **CA-11.** La existencia de los roles `COMPANY` y `SECRETARY` en el modelo no habilita funcionalidades para ellos en este Sprint.
- **CA-12.** Si una institución pasa a estado INACTIVA, ninguna de sus cuentas vinculadas podrá iniciar sesión ni consumir la API autenticada (la sesión se invalida inmediatamente).
- **CA-13.** ADMIN puede reenviar el enlace de configuración únicamente para cuentas que sigan pendientes. El reenvío se hace al correo ya registrado, invalida el token anterior, y el ADMIN nunca tiene acceso visual al enlace.

### Decisiones de diseño y límites de alcance

- Reutilizar el modelo de usuarios, la autenticación con Sanctum y el control de roles establecidos en HU-S1-01; reutilizar la entidad y la clave `institutions.id` de HU-S1-02.
- El rol se asigna desde el servidor como `INSTITUTION`; el formulario o una petición HTTP manipulada no pueden elegir otro rol.
- La relación con una institución se valida en la API. La interfaz no sustituye la autorización ni las restricciones de datos del backend.
- Esta historia crea cuentas institucionales. No incluye alta de alumnos, cuentas de empresa o Secretaría, ni el restablecimiento administrativo de contraseñas de HU-S1-04.
- La historia aprobada no fija cómo establece la institución su contraseña inicial ni cómo recibe el acceso. Antes de programar ese flujo, definir una opción segura en el plan técnico. El Administrador no debe conocer ni establecer la contraseña del usuario institucional.
- Conforme al CA-12, una institución `INACTIVA` bloquea el inicio de sesión y el acceso autenticado de todas sus cuentas vinculadas. No se crean cuentas para instituciones inactivas. Inactivar conserva los usuarios y sus datos; el detalle técnico se documenta en `docs/HU-S1-03.md`.

### Subtareas técnicas

- **S1-03-T01 — Relacionar User con Institution:** definir la relación en base de datos y modelos, de modo que cada cuenta institucional pertenezca a una institución.
- **S1-03-T02 — Implementar creación administrativa de cuentas:** crear un endpoint protegido para el alta de cuentas institucionales.
- **S1-03-T03 — Asignación automática de rol:** asignar `INSTITUTION` en backend, sin aceptar un rol enviado por el cliente.
- **S1-03-T04 — Validación de correo:** aplicar la regla de unicidad al identificador de acceso.
- **S1-03-T05 — Implementar autorización:** restringir la creación a `ADMIN` y verificar la restricción en la API.
- **S1-03-T06 — Crear interfaz React:** formulario administrativo de creación de una cuenta vinculada a una institución existente.
- **S1-03-T07 — Restricción de navegación:** mostrar únicamente las opciones permitidas para cada rol, manteniendo la protección equivalente en backend.
- **S1-03-T08 — Pruebas de integración:** verificar la relación **Usuario → Institución → Rol** y la identificación de los tres datos después del login.
- **S1-03-T09 — Pruebas de autorización:** comprobar accesos permitidos y denegados, incluidos intentos directos de usar endpoints administrativos o de alterar el rol.
- **S1-03-T10 — Prueba E2E:** **Administrador → institución registrada → crear cuenta → iniciar sesión como institución.**

### Resultado esperado

Un Administrador puede crear una cuenta institucional vinculada a una institución existente. Esa cuenta puede iniciar sesión; la API identifica correctamente usuario, rol e institución, y rechaza sus intentos de acceder a funciones administrativas.

La historia se cierra cuando sus criterios de aceptación están verificados, frontend y backend funcionan integrados, las migraciones y pruebas son reproducibles, y no se han incorporado funcionalidades de historias posteriores.