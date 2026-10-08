# Sprint 2

Sprint vigente desde el 8 de octubre de 2026. Sprint anterior: [sprint-1.md](sprint-1.md) (histórico).

# Sprint 2 — Banco de Talentos y Operaciones Extendidas

## HU-S2-01 — Enlace de invitación manual (WhatsApp/Copia directa)
**Estado:** En desarrollo 

**Historia de usuario:**
COMO Administrador
QUIERO poder generar y copiar el enlace de configuración de contraseña en lugar de enviarlo por correo
PARA poder compartirlo rápidamente con las instituciones a través de medios alternativos como WhatsApp.

### Criterios de aceptación:
- **CA-01:** Al crear una cuenta institucional o reenviar una invitación, el Administrador puede elegir el método de entrega: "email" o "manual".
- **CA-02:** Si elige "email", el sistema funciona enviando el correo y ocultando el enlace (comportamiento por defecto).
- **CA-03:** Si elige "manual", el sistema NO envía el correo electrónico, pero expone el enlace de un solo uso en la respuesta de la API para que la interfaz lo muestre.
- **CA-04:** La interfaz debe proporcionar una forma fácil de copiar el enlace al portapapeles.
- **CA-05:** Los enlaces generados manualmente mantienen las mismas reglas de seguridad: caducidad de 60 minutos y son de un solo uso.