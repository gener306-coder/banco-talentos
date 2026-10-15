# Sprint 2 — Banco de Talentos y Operaciones Extendidas

Sprint vigente desde el 8 de octubre de 2026. Sprint anterior: [sprint-1.md](sprint-1.md) (histórico).

## HU-S2-01 — Enlace de invitación manual (WhatsApp/Copia directa)

**Estado:** Completada (8 de octubre de 2026)  
**Diseño técnico y verificación:** [HU-S2-01.md](HU-S2-01.md)

### Historia de usuario

**COMO** Administrador  
**QUIERO** poder generar y copiar el enlace de configuración de contraseña en lugar de enviarlo por correo  
**PARA** poder compartirlo rápidamente con las instituciones a través de medios alternativos como WhatsApp.

### Criterios de aceptación

- **CA-01.** Al crear una cuenta institucional o reenviar una invitación, el Administrador puede elegir el método de entrega: "email" o "manual".
- **CA-02.** Si elige "email", el sistema funciona enviando el correo y ocultando el enlace (comportamiento por defecto).
- **CA-03.** Si elige "manual", el sistema NO envía el correo electrónico, pero expone el enlace de un solo uso en la respuesta de la API para que la interfaz lo muestre.
- **CA-04.** La interfaz debe proporcionar una forma fácil de copiar el enlace al portapapeles.
- **CA-05.** Los enlaces generados manualmente mantienen las mismas reglas de seguridad: caducidad de 60 minutos y son de un solo uso.

## HU-S2-02 — Registro y padrón estudiantil (Vista Institución)

**Estado:** Completada (13 de octubre de 2026)  
**Diseño técnico y verificación:** [HU-S2-02.md](HU-S2-02.md)  
**Story Points:** 5  
**Rol:** `INSTITUTION`

### Historia de usuario

**COMO** usuario de una Institución Educativa  
**QUIERO** registrar de forma interna a mis alumnos  
**PARA** tener un padrón administrable de los perfiles que publicaré en el Banco de Talentos.

### Criterios de aceptación

- **CA-01.** Solamente un usuario `INSTITUTION` puede crear y listar perfiles de alumnos.
- **CA-02.** El registro básico debe pedir: *Matrícula/Control Interno* y *Nombre y Apellidos* (Datos que servirán exclusivamente para uso interno de la institución).
- **CA-03.** [Aislamiento de Datos] Al registrar un alumno, el backend le asigna automáticamente el `institution_id` del usuario autenticado.
- **CA-04.** [Aislamiento de Datos] Al listar los alumnos, el sistema debe devolver **exclusivamente** los alumnos que pertenecen a la institución del usuario autenticado.
- **CA-05.** [Privacidad por Diseño] La base de datos debe estar preparada para clasificar "Matrícula" y "Nombre" como campos protegidos, los cuales no serán expuestos a las empresas en Sprints futuros.
- **CA-06.** La Matrícula debe ser única dentro de la misma institución.

## HU-S2-03 — Expediente académico, profesional y geográfico

**Estado:** Completada (13 de octubre de 2026)  
**Diseño técnico y verificación:** [HU-S2-03.md](HU-S2-03.md)  
**Story Points:** 8  
**Rol:** `INSTITUTION`

### Historia de usuario

**COMO** usuario de una Institución Educativa  
**QUIERO** completar la información académica, profesional y de ubicación de mis alumnos  
**PARA** que las empresas puedan filtrarlos en el Banco de Talentos sin conocer su identidad real.

### Criterios de aceptación

- **CA-01.** La institución puede acceder a la vista de detalle de un alumno propio para editar su expediente público.
- **CA-02.** [Académico] Debe permitir guardar: Carrera / Programa Educativo, Periodo actual (Semestre/Cuatrimestre) y Disponibilidad para el programa dual (Disponible / No disponible). No debe confundirse con el estado `ACTIVO`/`INACTIVO` de HU-S2-04, que oculta el perfil del Banco de Talentos.
- **CA-03.** [Geográfico] Debe permitir guardar: *Ubicación Aproximada* (ej. Municipio y Estado, sin direcciones exactas).
- **CA-04.** [Movilidad] Debe permitir guardar un indicador de *Disponibilidad para reubicarse/moverse* (Booleano: Sí/No).
- **CA-05.** [Anti-IDOR] Al intentar actualizar un expediente, el backend DEBE verificar estricta y obligatoriamente que el alumno pertenezca a la institución que hace la petición.
- **CA-06.** El formulario de la interfaz debe incluir validaciones y utilizar los colores y componentes del sistema visual base (`brand-primary`, etc.).
- **CA-07.** [Identidad] La institución puede corregir la matrícula y el nombre de un alumno propio, conservando la unicidad de la matrícula dentro de la institución. *(Añadido el 13 de octubre de 2026 por decisión del responsable del proyecto.)*

> **Nota (13 de octubre de 2026):** CA-02 se reformuló («Estatus» → disponibilidad para el programa dual) y se añadió CA-07, ambos por decisión del responsable del proyecto, para evitar confundirlo con la baja lógica de HU-S2-04 y permitir corregir la identidad.

> **Tarea técnica autorizada (13 de octubre de 2026):** a solicitud del cliente y del responsable del proyecto, la ubicación del expediente se guarda además como punto PostGIS (`geography(Point, 4326)`) para preparar el futuro buscador por radio de las empresas. Fase A: el servidor deriva el punto del estado (punto de referencia por entidad); la API no acepta coordenadas del cliente y la interfaz no cambia. La Fase B (catálogo INEGI de municipios con su punto) queda para la historia del buscador. Detalle en [HU-S2-03.md](HU-S2-03.md#ubicación-espacial-postgis-fase-a).

## HU-S2-04 — Inactivación de perfil estudiantil (Baja lógica)

**Estado:** Completada (15 de octubre de 2026)  
**Diseño técnico y verificación:** [HU-S2-04.md](HU-S2-04.md)  
**Story Points:** 3  
**Rol:** `INSTITUTION`

### Historia de usuario

**COMO** usuario de una Institución Educativa  
**QUIERO** inactivar el perfil de un alumno en el sistema  
**PARA** ocultarlo del Banco de Talentos si se da de baja o ya no está disponible, sin perder su historial.

### Criterios de aceptación

- **CA-01.** Todo alumno tiene un estado booleano: `ACTIVO` o `INACTIVO` (por defecto `ACTIVO`).
- **CA-02.** La institución puede alternar este estado desde la interfaz.
- **CA-03.** No existe eliminación física (`DELETE`) en la base de datos para los alumnos.
- **CA-04.** La acción de inactivar/reactivar respeta el aislamiento institucional (solo alumnos propios).

## Tareas técnicas transversales

### Lenguaje visual e interacción apple-design

**Estado:** Completada (11 de octubre de 2026)  
**Informe:** [design/informe-apple-design.md](design/informe-apple-design.md)  
**Origen:** requisito comunicado por el responsable del proyecto tras revisar un prototipo; no corresponde a una historia de Jira.  
**Referencia:** skill `apple-design` (github.com/emilkowalski/skills) y prototipo interactivo privado (Artifact «Prototipo estilo fluido»).

Aplicar al frontend existente los principios de apple-design conservando la paleta y los tokens de `docs/design/identidad-visual.md`, en dos pasos:

1. **Normalización:** jerarquía de botones (relleno, tintado, plano), respuesta al presionar, estados hover, tipografía por tamaño, encabezado translúcido con borde de scroll suave, paneles que se materializan, transiciones con consistencia espacial, validación en línea, estados de carga, vacío y error, y confirmación con scrim al inactivar una institución.
2. **Hojas:** componente propio de hoja (inferior y arrastrable en pantallas estrechas, panel centrado en escritorio) para los formularios del detalle de institución: crear cuenta, reenviar enlace y restablecer contraseña.

Sin cambios en backend, rutas ni contratos de API. Debe respetar `prefers-reduced-motion`, `prefers-reduced-transparency` y `prefers-contrast`, y mantener el contraste mínimo de 4.5:1.
