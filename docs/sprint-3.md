# Sprint 3 — CV Normalizado y Seguro Facultativo (IMSS)

**Objetivo del Sprint:** Evolucionar el expediente básico del alumno hacia un "CV Normalizado" que estandarice el talento de cualquier disciplina (Ingeniería, Salud, Negocios). Además, implementar el resguardo estricto del Seguro Facultativo (IMSS) como requisito interno de Educación Dual.

## HU-S3-01 — Expediente Profesional (CV Normalizado)
**Estado:** Completada (16 de octubre de 2026) | **Diseño técnico:** [HU-S3-01.md](HU-S3-01.md) | **Story Points:** 8 | **Rol:** `INSTITUTION`

**Historia de usuario:**
COMO usuario de una Institución Educativa
QUIERO construir un CV normalizado para mis alumnos (titular, habilidades, idiomas, certificaciones, proyectos y enlaces)
PARA que las empresas puedan evaluar y comparar talento estandarizado de cualquier carrera, sin importar la disciplina.

**Criterios de Aceptación:**
- **CA-01 [Estructura Universal]:** La interfaz debe permitir capturar elementos universales de un CV: *Titular Profesional* (ej. "Desarrollador Backend Junior" o "Auxiliar Contable"), *Habilidades* (técnicas y blandas), *Idiomas*, *Certificaciones*, *Proyectos* y *Enlaces Externos* (GitHub, Behance, Portafolio).
- **CA-02 [La Paradoja del Anonimato]:** Dado que los enlaces externos (GitHub/Portafolio) revelan la identidad real del alumno, el sistema debe permitir guardarlos, pero la arquitectura debe prever un mecanismo para **ocultarlos a las empresas** hasta que exista un "Match" o contacto directo, protegiendo el anonimato inicial.
- **CA-03 [Desempeño y Búsqueda]:** La estructura de base de datos elegida debe permitir que las empresas apliquen filtros rápidos y complejos en el futuro (ej. "Alumnos con inglés B2, habilidad en React y certificación Cisco").
- **CA-04 [Validación de Certificaciones]:** El sistema debe soportar un campo para `credential_url` o `credential_id` para dar certeza a las empresas sobre la autenticidad de una certificación, evaluando integraciones ligeras (tipo Credly).

## HU-S3-02 — Gestión Estricta del Seguro Facultativo (IMSS)
**Estado:** Completada (16 de octubre de 2026) | **Diseño técnico:** [HU-S3-02.md](HU-S3-02.md) | **Story Points:** 5 | **Rol:** `INSTITUTION`

**Historia de usuario:**
COMO usuario de una Institución Educativa
QUIERO registrar el Número de Seguridad Social (NSS) y subir el comprobante de vigencia del IMSS de mis alumnos
PARA resguardar este requisito legal interno, asegurando que nunca se exponga a terceros.

**Criterios de Aceptación:**
- **CA-01 [Privacidad Estricta]:** El NSS y el documento PDF son de resguardo **exclusivo** de la Institución (datos protegidos). NUNCA se exponen en el perfil público.
- **CA-02 [Oculto por Diseño]:** Las empresas no verán ningún indicador sobre el seguro. Se asume que la institución ya validó este requisito si el alumno está publicado.
- **CA-03 [Almacenamiento y Descarga]:** El PDF debe guardarse en disco local privado, accesible solo mediante un endpoint protegido que valide el Anti-IDOR.

---
## Directrices de Arquitectura para el Agente
- **Diseño del CV:** Evaluar si conviene normalizar este "CV" usando múltiples tablas relacionales o campos `JSONB` indexados en PostgreSQL, priorizando la facilidad para que el motor de búsqueda cruce parámetros distintos en el futuro.

---
## Tareas técnicas transversales

### Logotipo de la Secretaría de Economía en el encabezado

**Estado:** Completada (16 de octubre de 2026)  
**Origen:** solicitud del responsable del proyecto; no corresponde a una historia de Jira.  
**Detalle:** [design/identidad-visual.md](design/identidad-visual.md#logotipo)

Mostrar el logotipo institucional `frontend/public/brand/sec-economia.png` en la parte superior de todas las vistas, alineado con la estructura del encabezado y con un tamaño visualmente equivalente al logotipo principal.

### Tokens semánticos de color

**Estado:** Completada (16 de octubre de 2026)  
**Origen:** recomendación aprobada por el responsable al evaluar un modo oscuro; no corresponde a una historia de Jira.  
**Detalle:** [design/identidad-visual.md](design/identidad-visual.md#tokens-semánticos)

Sustituir los colores escritos a mano en las hojas de estilo por tokens que nombran su función (superficie, texto, borde, acento, error, éxito, estado), sin ningún cambio visible, para que un modo oscuro futuro solo tenga que redefinir esos tokens. El modo oscuro en sí queda fuera: requiere variantes de logotipo para fondo oscuro y un vino aclarado aprobados.

