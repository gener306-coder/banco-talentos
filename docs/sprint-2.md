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

## Tareas técnicas transversales

### Lenguaje visual e interacción apple-design

**Estado:** En curso: paso 1 completado (11 de octubre de 2026)  
**Origen:** requisito comunicado por el responsable del proyecto tras revisar un prototipo; no corresponde a una historia de Jira.  
**Referencia:** skill `apple-design` (github.com/emilkowalski/skills) y prototipo interactivo privado (Artifact «Prototipo estilo fluido»).

Aplicar al frontend existente los principios de apple-design conservando la paleta y los tokens de `docs/design/identidad-visual.md`, en dos pasos:

1. **Normalización:** jerarquía de botones (relleno, tintado, plano), respuesta al presionar, estados hover, tipografía por tamaño, encabezado translúcido con borde de scroll suave, paneles que se materializan, transiciones con consistencia espacial, validación en línea, estados de carga, vacío y error, y confirmación con scrim al inactivar una institución.
2. **Hojas:** componente propio de hoja (inferior y arrastrable en pantallas estrechas, panel centrado en escritorio) para los formularios del detalle de institución: crear cuenta, reenviar enlace y restablecer contraseña.

Sin cambios en backend, rutas ni contratos de API. Debe respetar `prefers-reduced-motion`, `prefers-reduced-transparency` y `prefers-contrast`, y mantener el contraste mínimo de 4.5:1.
