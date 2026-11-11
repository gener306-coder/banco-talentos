# Sprint 9 — Multimedia institucional y promoción dual

Sprint vigente desde el 31 de octubre de 2026; historias aprobadas por el responsable el mismo día. Sprint anterior: [sprint-8.md](sprint-8.md) (histórico).

**Objetivo del Sprint:** que cada institución pueda subir videos promocionales de su programa dual (instalaciones, talleres, proyectos) y que las empresas, la Secretaría y el Administrador los vean en una galería propia. El objetivo es animar a las empresas a recibir alumnos. Los videos de celular, de unos 150–200 MB, se procesan en segundo plano para dejarlos ligeros y reproducibles en cualquier dispositivo.

**Story Points:** 14–16 (HU-S9-01 a HU-S9-03), más la tarea técnica T-S9-01 (3).

## Decisiones del responsable (31 de octubre de 2026)

- **Visibilidad:** la galería es solo para cuentas con sesión (`COMPANY`, `SECRETARY`, `ADMIN`). No hay página pública.
- **Publicación directa:** el video se publica al terminar su procesamiento, sin revisión previa. La mitigación es el consentimiento declarado al subir y que el Administrador pueda inactivarlo.
- **Consentimiento:** los alumnos que aparecen dieron su consentimiento; la institución lo declara en cada subida.
- **Nube:** probablemente AWS, sin definir. La funcionalidad se diseña sobre los discos de Laravel, con local en desarrollo y cualquier almacenamiento compatible con S3 en producción (S3, R2, Spaces o MinIO).
- **Despliegue:** queda para el Sprint 10 (ver abajo).

## Decisiones técnicas

| Tema | Decisión | Motivo |
|---|---|---|
| Procesamiento | FFmpeg y ffprobe en la imagen del backend, invocados con el facade `Process` de Laravel | Herramienta estándar; sin paquetes PHP extra; se puede simular en Pest con `Process::fake`. Un servicio administrado (MediaConvert, Mux, Cloudflare Stream) no se justifica para unas 16 instituciones × 5 videos. |
| Asincronía | Cola `database` (tabla `jobs`) con un worker dedicado `--queue=videos`, concurrencia 1 | Sin Redis, conforme a `CLAUDE.md`. Transcodificar 2–3 min de video toma de 1 a 5 min de CPU; no puede ocurrir en la petición HTTP. |
| Salida | MP4 H.264 + AAC, lado corto a 720 px, ≤ 30 fps, CRF 26 con tope de 2.5 Mbps, `+faststart` | Unos 15–19 MB por minuto. Reproduce en todos los navegadores sin descargar el archivo completo. Escalar por el lado corto conserva los videos verticales. |
| Privacidad | `-map_metadata -1` y póster JPG generado (no la miniatura del celular) | Los videos de celular incluyen GPS y modelo del equipo en sus metadatos; el proyecto no expone ubicaciones. |
| Color | Conversión a `yuv420p` SDR (tonemap si el origen es HDR o HEVC de 10 bits) | Los iPhone graban en HDR; sin convertir, los colores salen lavados. |
| Validación | ffprobe sobre el contenido real: pista de video presente, duración ≤ 5 min | Extensión y MIME no bastan. La duración controla el peso final mejor que el tamaño original. |
| Original | Se borra al terminar bien o al fallar | No se paga almacenamiento por el archivo de 160 MB. |
| Entrega | URLs firmadas temporales (`Storage::temporaryUrl`, unos 60 min). En S3 son prefirmadas y no pasan por PHP; en local, una ruta firmada con `response()->file()` | La galería pide sesión, así que los archivos no son públicos. `response()->file()` soporta `Range`, que Safari exige para reproducir. |
| Subida | Un `multipart` a la API de hasta 250 MB, con barra de progreso | Lo más simple para pocas instituciones. La subida directa a S3 con URL prefirmada queda como mejora si en producción fallan las subidas lentas. |
| Bajas | Baja lógica `is_active` vía `PATCH .../status` para ocultar; eliminación vía `PATCH .../deletion` para liberar espacio (T-S9-04); sin `DELETE` | Convención del proyecto. Eliminar borra los archivos y conserva un registro mínimo oculto. |

## Fuera de alcance

- Galería pública sin sesión y moderación previa por la Secretaría.
- Subida directa al bucket (URL prefirmada) y subidas reanudables.
- Streaming adaptativo (HLS/DASH), subtítulos y varias calidades.
- Recorte o edición del video en la plataforma; reemplazar el archivo de un video existente (se sube uno nuevo).
- Relacionar videos con alumnos concretos.
- Despliegue en nube, Nginx, PHP-FPM, Packer, Terraform y CI (Sprint 10).

## Orden de implementación sugerido

1. **T-S9-01** Infraestructura de medios en local (incluye medir el video de prueba de 160 MB).
2. **HU-S9-01** Subida y procesamiento.
3. **HU-S9-02** Gestión de mis videos.
4. **HU-S9-03** Galería de promoción dual.

---

## T-S9-01 — Infraestructura de medios en local

**Estado:** Completada (31 de octubre de 2026)  
**Story Points:** 3  
**Rol:** técnica

- **Imagen:** `docker/backend/Dockerfile` instala `ffmpeg` (Debian bookworm) y un `php.ini` con `upload_max_filesize=250M`, `post_max_size=260M` y `max_input_time=600`.
- **Worker:** servicio `worker` en `compose.yaml`, `compose.testing.yaml` y `compose.simulation.yaml`, con la misma imagen y `php artisan queue:work --queue=videos,default --timeout=900 --tries=2`. En la conexión, `retry_after` es mayor que el timeout.
- **Cola:** migraciones `jobs` y `failed_jobs`; `QUEUE_CONNECTION=database`. Los correos y demás procesos actuales siguen funcionando igual.
- **Disco `media`:** en `config/filesystems.php`, configurable con `MEDIA_DISK` (local en desarrollo y pruebas). Se agrega `league/flysystem-aws-s3-v3` y la configuración `s3` lista por variables de entorno, sin credenciales en Git.
- **Medición inicial:** con el video de prueba de unos 160 MB, se ejecuta el comando FFmpeg propuesto dentro del contenedor y se registran tiempo, peso final y metadatos restantes (ffprobe). Si el resultado no cumple lo esperado, se ajustan CRF o tope antes de HU-S9-01.

### Criterios de aceptación

- **CA-01.** `ffmpeg -version` y `ffprobe -version` funcionan en los contenedores backend y worker de los tres proyectos Compose.
- **CA-02.** Un job de prueba encolado desde el backend lo ejecuta el worker. Las suites existentes pasan sin cambios, ejecutadas en secuencia.
- **CA-03.** Cambiar `MEDIA_DISK` no requiere cambios de código.
- **CA-04.** La medición del video de prueba queda registrada en este archivo.

### Medición preliminar (31 de octubre de 2026)

Hecha en planeación, fuera del código: contenedor `debian:bookworm-slim` con FFmpeg 5.1.9 y `--cpus=2` para aproximar un servidor pequeño.

| | Original (`NODO LOGISTICO-.mp4`) | Procesado |
|---|---|---|
| Peso | 136.1 MB | **14.4 MB** (−89 %) + póster JPG de 151 KB |
| Video | H.264 1920×1080, 24 fps, 11.7 Mbps, SDR | H.264 1280×720, 24 fps, 1.26 Mbps |
| Duración | 1 min 32 s | 1 min 32 s |
| Metadatos | `creation_time` y marcas del equipo | ninguno (solo `encoder`) |
| Orden de átomos | — | `ftyp, moov, free, mdat` (faststart correcto) |

- **Tiempo:** 142 s de transcodificación (≈ 1.5× la duración) y 1 s para el póster. Confirma la cola con worker dedicado y el `timeout` de 900 s (alcanza para 5 min de video con margen).
- **Video vertical con GPS** (sintético de 1080×1920 con etiqueta `location`): sale a 720×1280 y sin la etiqueta.
- **Corrección al comando propuesto:** el filtro `fps=30` *sube* a 30 fps un video de 24 (la primera prueba salió a 30 fps). El job debe agregar `fps=30` solo cuando ffprobe reporte más de 30 fps. CA-05 de HU-S9-01 se interpreta así.
- Pendiente: probar un video HDR/HEVC real de iPhone; este no lo era.

### Resultado

- **Imagen:** `docker/backend/Dockerfile` instala `ffmpeg` 5.1.9 y la extensión `pcntl`, y copia `docker/backend/php.ini` (250M/260M/600 s). `pcntl` no estaba en el plan: sin ella `queue:work` no puede cortar un trabajo que rebasa su `--timeout`, y la imagen `php:8.4-cli` no la trae.
- **Cola:** `config/queue.php` usa `database` por defecto, con `retry_after` de 960 s (mayor que el timeout de 900 s), `after_commit` y fallidos en `failed_jobs` (`database-uuids`). Migración `2026_10_31_000000_create_jobs_tables`. Pest conserva `sync`.
- **Worker:**
  - **desarrollo:** servicio `worker` con `queue:listen`, que relee el código en cada trabajo;
  - **simulación:** servicio `worker` con `queue:work` y la clave y el storage de la simulación (`scripts/simulation.sh up` lo inicia);
  - **E2E:** `queue:work` en segundo plano dentro del backend de pruebas, porque su clave y su storage son efímeros y propios del contenedor; un servicio aparte no los compartiría.
- **Disco:** `config('filesystems.media_disk')` toma `MEDIA_DISK`: `media` (`storage/app/media`, privado, excluido de Git) o `s3`. Se agregó `league/flysystem-aws-s3-v3`, y las variables `AWS_*` van vacías en `.env.example`.
- **Verificación:**
  - Pest completo: 1281 pruebas, incluidas las 6 nuevas de `MediaInfrastructureTest`;
  - E2E: 39 pruebas;
  - en desarrollo y en la simulación, un trabajo encolado desde el backend lo procesó el contenedor `worker`;
  - la simulación conserva sus 42 713 alumnos.
- **Fuera de alcance:** `composer audit` reportó CVE-2026-45070 en `symfony/mime` (inyección de cabeceras de correo, severidad media), que ya existía antes de esta tarea. Se corrigió aparte, a pedido del responsable, al actualizar a 8.1.10 (commit `16a772f`).

---

## HU-S9-01 — Subida y procesamiento del video promocional

**Estado:** Completada (31 de octubre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S9-01.md`  
**Story Points:** 8  
**Rol:** `INSTITUTION` (institución activa)

### Historia de usuario

**COMO** institución educativa  
**QUIERO** subir un video promocional de mi programa dual  
**PARA** mostrar a las empresas mis instalaciones, talleres y proyectos, y animarlas a recibir alumnos.

### Criterios de aceptación

- **CA-01.** [Modelo] Tabla `institution_videos` con estos campos:
  - `public_id` (UUID v4), `institution_id`, `title` (≤ 120) y `description` (≤ 1000, opcional);
  - `status` (`PROCESSING`, `READY`, `FAILED`, con `CHECK`);
  - `video_path`, `poster_path`, `duration_seconds`, `width`, `height`, `original_bytes`, `output_bytes` y `failure_reason`;
  - `is_active`, `consent_confirmed_at`, `created_by` y fechas.
- **CA-02.** [Subida] `POST /api/institution/videos` (`multipart/form-data`) valida:
  - `video`: obligatorio, extensión y MIME mp4, mov o webm, ≤ 250 MB;
  - `title` y `description` sin datos de contacto (`NoContactInformation`);
  - `consent`: `accepted`.

  Un dato inválido responde `422` con mensajes en español.
- **CA-03.** [Cuota] Máximo 5 videos activos por institución, contando los que están en `PROCESSING` y los `READY`. La revisión ocurre en una transacción con bloqueo de la fila de la institución. Si se rebasa, responde `422` «Tu institución ya tiene 5 videos activos.».
- **CA-04.** [Respuesta] Responde `202` con el video en `PROCESSING` y encola `ProcessInstitutionVideo` en la cola `videos`. El original queda en el disco privado, nunca en `media`.
- **CA-05.** [Procesamiento] El job:
  1. ejecuta ffprobe; si no hay pista de video, el archivo no se puede leer o la duración pasa de 5 min, termina en `FAILED` con un motivo legible;
  2. transcodifica con `-vf` (lado corto a 720 px sin agrandar; `fps=30` solo si el origen tiene más de 30 fps; `format=yuv420p`), `-c:v libx264 -preset medium -crf 26 -maxrate 2500k -bufsize 5000k -c:a aac -b:a 128k -movflags +faststart -map_metadata -1`;
  3. genera un póster JPG en el segundo 2, o a la mitad si el video dura menos;
  4. guarda video y póster en el disco `media` bajo `videos/{institution_id}/{uuid}`, registra duración, dimensiones y pesos, y deja `READY`;
  5. borra el original en cualquier desenlace. Un fallo deja `FAILED` sin archivos huérfanos.
- **CA-06.** [Aislamiento] Solo cuentas `INSTITUTION` de una institución activa (`institution.member`). Respuestas con `Cache-Control: no-store, private`.
- **CA-07.** [Interfaz] En `/institution/videos`, **Subir video** abre un `Sheet` con título, descripción, archivo y la casilla «Confirmo que cuento con la autorización de las personas que aparecen en el video». La barra de progreso de la subida usa `XMLHttpRequest` y se anuncia con `role="status"`. Al terminar se muestra «Procesando…».
- **CA-08.** [Pruebas]
  - **Pest:** validación, cuota concurrente, rol, `Queue::fake` en la subida, `Process::fake` en éxito y en cada tipo de fallo.
  - **Pest con FFmpeg real:** sobre un video de 2 s generado con `ffmpeg -f lavfi -i testsrc` con metadatos de ubicación, comprueba 720 px en el lado corto, `faststart` y que no quedan metadatos.
  - **Vitest:** formulario, progreso y errores.

---

## HU-S9-02 — Gestión de mis videos

**Estado:** Completada (31 de octubre de 2026)  
**Diseño técnico y verificación:** `docs/HU-S9-02.md`. Adelanta de HU-S9-03 las URLs firmadas (su CA-03), que el póster y la vista previa necesitan.  
**Story Points:** 3  
**Rol:** `INSTITUTION`  
**Dependencia:** HU-S9-01

### Historia de usuario

**COMO** institución educativa  
**QUIERO** ver el estado de mis videos, corregir sus textos y dar de baja los que ya no quiero mostrar  
**PARA** mantener al día lo que ven las empresas.

### Criterios de aceptación

- **CA-01.** [Listado] `GET /api/institution/videos` devuelve los videos de la institución de la sesión, del más reciente al más antiguo. Cada uno trae estado, póster, duración, peso final, activo o inactivo y, si falló, el motivo.
- **CA-02.** [Edición] `PUT /api/institution/videos/{publicId}` cambia título y descripción con las mismas reglas que la subida.
- **CA-03.** [Baja lógica] `PATCH /api/institution/videos/{publicId}/status` activa o inactiva el video. Al reactivar se respeta la cuota de 5. En la interfaz la baja pide confirmación con `ConfirmDialog`.
- **CA-04.** [Anti-IDOR] El video de otra institución responde `404` idéntico a uno inexistente, en lectura, edición y estado.
- **CA-05.** [Estado en vivo] Mientras haya videos en `PROCESSING`, la vista consulta el listado cada 5 s y deja de hacerlo cuando ninguno queda pendiente. Usa `LoadingState` y `StateMessage`, y la retícula `--page-wide`.
- **CA-06.** [Vista previa] La institución puede reproducir sus videos `READY` desde el listado.

---

## HU-S9-03 — Galería de promoción dual

**Estado:** Completada (31 de octubre de 2026). El municipio de la institución (CA-02) queda pendiente porque las instituciones no lo tienen en el modelo; ver `docs/HU-S9-03.md`.  
**Diseño técnico y verificación:** `docs/HU-S9-03.md`  
**Story Points:** 3–5  
**Rol:** `COMPANY`, `SECRETARY`, `ADMIN`  
**Dependencia:** HU-S9-01

### Historia de usuario

**COMO** empresa  
**QUIERO** ver los videos promocionales de las instituciones  
**PARA** conocer sus programas duales y animarme a recibir alumnos.

### Criterios de aceptación

- **CA-01.** [API] `GET /api/promotional-videos` devuelve solo videos `READY`, activos y de instituciones activas, del más reciente al más antiguo, paginados de 12 en 12. Acepta `institution` (`public_id`) como filtro opcional.
- **CA-02.** [Campos explícitos] Cada video expone solo:
  - `public_id`, título, descripción y duración;
  - nombre y municipio de la institución;
  - `video_url` y `poster_url`, firmadas y con vigencia de unos 60 min.

  Nunca expone `id`, rutas internas, `location` ni datos de alumnos.
- **CA-03.** [Archivos] En local los medios se sirven por una ruta firmada que responde `Range` (`206`); una URL vencida o alterada responde `403`. En S3 las URLs son prefirmadas por el SDK.
- **CA-04.** [Interfaz] La sección **Promoción dual** (`/promocion`) aparece en la navegación de los tres roles:
  - retícula de tarjetas con póster, título, institución y duración;
  - reproductor `<video controls preload="none" poster>`, con nombre accesible;
  - estado vacío «Aún no hay videos promocionales.»;
  - tokens de `docs/design/identidad-visual.md`, en claro y en oscuro.
- **CA-05.** [Moderación mínima] El Administrador ve un botón **Inactivar** en cada video, con `ConfirmDialog`, mediante `PATCH /api/promotional-videos/{publicId}/status`. Confirmado por el responsable el 31 de octubre de 2026. El video inactivado desaparece de la galería y la institución lo ve inactivo en su listado.
- **CA-06.** [Pruebas]
  - **Pest:** lista de campos, filtros, roles autorizados y no autorizados (`INSTITUTION` → `403`), y firma vencida.
  - **Playwright:** la institución sube un fixture pequeño, el worker de pruebas lo procesa y la empresa lo reproduce en la galería.

---

## HU-S9-04 — Feed de Historias del Dual con reproductor propio

**Estado:** Completada (4 de noviembre de 2026). Aprobada por el responsable el mismo día.  
**Diseño técnico y verificación:** `docs/HU-S9-04.md`  
**Rol:** `COMPANY`, `SECRETARY`, `ADMIN` (feed); `INSTITUTION` (vista previa)

Los videos son testimonios de alumnos que están o estuvieron en el Dual en una empresa, aclaró el responsable. La sección pasa a llamarse **Historias del Dual**.

**COMO** empresa  
**QUIERO** ver las historias en un feed bien diseñado, con controles claros  
**PARA** conocer cómo les fue a otros y animarme a recibir alumnos.

### Criterios de aceptación

- **CA-01.** [Feed] Columna centrada de `--content-readable` con `role="feed"`, carga continua y el botón **Ver más historias** como alternativa. Sustituye a la retícula y a la paginación de HU-S9-03 CA-04.
- **CA-02.** [Reproductor] Reproductor propio sin `controls` nativos, también en la vista previa de la institución: reproducir, pausar y reanudar, línea de tiempo, sonido, pantalla completa, volver a ver y teclado. Accesible y con los tokens de marca en ambos temas.
- **CA-03.** [Reproducción automática] El video visible al 60 % arranca sin sonido y se pausa al salir; uno a la vez; una pausa del usuario se respeta; el sonido activado se mantiene. No arranca solo con movimiento reducido ni con ahorro de datos.
- **CA-04.** [Sin descarga] Sin opción de descarga en la interfaz. Quita la opción: no impide copiar el archivo con herramientas de desarrollador.
- **CA-05.** [Sin pesos] Ninguna vista muestra cuánto pesa o pesaba un video, y `original_bytes` y `output_bytes` salen de la API de la institución; cambia HU-S9-02 CA-01. Las columnas se conservan.
- **CA-06.** [Textos] Textos de testimonio en todos los roles y consentimiento que cubre personas y empresas. La ruta `/promocion` y la API no cambian.
- **CA-07.** [URL vencida] Si un video falla, **Reintentar** pide URLs firmadas nuevas.

---

## HU-S9-05 — Que las Historias del Dual no pasen desapercibidas

**Estado:** Completada (4 de noviembre de 2026). Aprobada por el responsable el mismo día.  
**Diseño técnico y verificación:** `docs/HU-S9-05.md`  
**Rol:** `COMPANY`  
**Dependencia:** HU-S9-04

**COMO** responsable del programa  
**QUIERO** que las empresas encuentren las historias sin buscarlas  
**PARA** que el testimonio de los alumnos las anime a recibir alumnos.

### Criterios de aceptación

- **CA-01.** [Módulo destacado] El inicio de la empresa muestra, debajo de **Buscar talento** y sobre los indicadores, la historia más reciente y hasta dos más, con **Ver todas las historias**. No reproduce nada ahí. Sin historias o con error, no aparece.
- **CA-02.** [Enlace] Cada historia abre `/promocion?video={public_id}`, y el feed se coloca en ella.
- **CA-03.** [Buscador] `/talent` tiene una franja hacia las historias, sin relación con los perfiles, que siguen anónimos.
- **CA-04.** [Tarjeta] En el inicio de la empresa, **Historias del Dual** pasa a la segunda posición.
- **CA-05.** [Otros roles] Administrador y Secretaría no ven el módulo ni la franja.

---

## HU-S9-06 — Carrusel y vista previa en el inicio de la empresa

**Estado:** Completada (4 de noviembre de 2026). Aprobada por el responsable el mismo día.  
**Diseño técnico y verificación:** `docs/HU-S9-06.md`  
**Rol:** `COMPANY`  
**Dependencia:** HU-S9-05

**COMO** empresa  
**QUIERO** que las historias de mi inicio se muevan solas y poder verlas ahí mismo  
**PARA** descubrirlas sin salir de mi inicio.

### Criterios de aceptación

- **CA-01.** [Carrusel] Hasta 5 historias, con la siguiente asomando. Avanza cada 6 s con deslizamiento, vuelve al inicio al final y se puede deslizar con el dedo o el trackpad.
- **CA-02.** [Control] Flechas, puntos y **Pausar** / **Reanudar**. Se detiene con el puntero, el foco de teclado, la vista previa abierta, la pestaña oculta o fuera de pantalla.
- **CA-03.** [Movimiento reducido] No avanza solo y cambia sin animación.
- **CA-04.** [Vista previa] El clic abre el video en una hoja en el mismo inicio, con **Buscar talento** y **Ver todas las historias**. Sustituye el enlace directo de HU-S9-05 CA-02. No hay ningún `<video>` hasta ese clic.

---

## HU-S9-07 — Formulario de subida con vista previa

**Estado:** Completada (4 de noviembre de 2026). Aprobada por el responsable el mismo día.  
**Diseño técnico y verificación:** `docs/HU-S9-07.md`  
**Rol:** `INSTITUTION`

**COMO** institución educativa  
**QUIERO** un formulario claro donde pueda revisar el video antes de subirlo  
**PARA** no esperar minutos subiendo el archivo equivocado.

### Criterios de aceptación

- **CA-01.** [Diseño] Dos columnas desde 720 px, con el video a un lado y título y descripción al otro; una columna en móvil, con el video primero.
- **CA-02.** [Elegir] Arrastrar o elegir archivo, con un `input` real accesible por teclado. Las validaciones de formato y peso aplican igual en ambos casos.
- **CA-03.** [Vista previa] Reproduce el archivo local sin subir nada. Se libera al cambiarlo y se desmonta al cerrar la hoja.
- **CA-04.** [Duración] Avisa antes de subir si dura más de 5 minutos. El servidor sigue siendo quien decide.
- **CA-05.** [Sin bloqueo] Si el navegador no puede mostrar el archivo, lo explica y la subida sigue disponible.
- **CA-06.** [Consentimiento] Casilla alineada al inicio de su texto, dentro de una tarjeta con toda el área clicable.
- **CA-07.** [Contrato] No cambia lo que se envía a la API.

---

## Afinaciones

### T-S9-02 — Historias del inicio sin repetirse y con vista al pasar el cursor

**Estado:** Completada (10 de noviembre de 2026). Pedida por el responsable el mismo día.  
**Rol:** `COMPANY`  
**Cambia:** HU-S9-05 CA-03 y CA-04, y HU-S9-06 CA-04.

- **Una sola entrada:** la empresa ya no ve la tarjeta «Historias del Dual» entre las secciones del inicio ni la franja de `/talent`. **Ver todas las historias** del carrusel lleva al feed. Administración y Secretaría conservan su tarjeta.
- **Cursor encima:** tras 300 ms con el cursor sobre una portada del carrusel, la historia se reproduce sin sonido y en bucle, y el carrusel se detiene. Al salir vuelve a la portada. Solo responde al ratón, una historia a la vez. Con movimiento reducido o ahorro de datos solo se muestra la portada.
- **Sin descargas de más:** el `<video>` existe solo mientras el cursor está encima o la vista previa está abierta.
- **Se probó y se descartó:** una fila fija de 3 historias en lugar del carrusel. El responsable prefirió conservar el carrusel de HU-S9-06.

### T-S9-03 — Historias al azar en el inicio y orden elegible en el feed

**Estado:** Completada (10 de noviembre de 2026). Pedida por el responsable el mismo día.  
**Rol:** `COMPANY` (inicio); `COMPANY`, `SECRETARY`, `ADMIN` (feed)  
**Cambia:** HU-S9-05 CA-01 y HU-S9-06 CA-01.

- **API:** `GET /api/promotional-videos` acepta `order=recent|random`. El azar exige `seed` (1 a 2 147 483 647) y ordena por `md5(public_id || seed)`: la misma semilla continúa la misma mezcla en cada página, sin repetir ni saltar historias. `first={public_id}` pone esa historia primero en cualquier orden. Sin `order`, el orden sigue siendo el más reciente.
- **Inicio:** el carrusel toma 12 historias al azar de toda la galería, con una semilla nueva en cada visita, y muestra 5. Al dar la vuelta completa entra el siguiente grupo; con 5 o menos historias, el mismo grupo cambia de orden.
- **Relevo:** las historias nuevas entran girando como un dado, alternando hacia arriba y hacia abajo, escalonadas 70 ms. El carrusel vuelve al inicio sin deslizarse, para que el giro sea la única transición. Con movimiento reducido cambian sin animación.
- **Feed:** control segmentado **Más recientes** / **Al azar**. El orden vive en la URL (`/promocion?orden=azar`) y la semilla en la página, así que cada visita al azar trae otra mezcla. **Otra mezcla** pide una semilla nueva y vuelve a la primera página.
- **Enlace del inicio:** `/promocion?video={public_id}` envía `first`, así que la historia abierta desde el carrusel aparece aunque por su orden estuviera en una página lejana. Elegir otro orden ya no la fija.

### T-S9-04 — La institución elimina sus videos para liberar espacio

**Estado:** Completada (11 de noviembre de 2026). Pedida por el responsable el 10 de noviembre.  
**Rol:** `INSTITUTION`  
**Cambia:** la decisión técnica «Bajas» y HU-S9-02 CA-03.

- **Problema:** inactivar un video lo ocultaba, pero conservaba su MP4 (unos 15–19 MB por minuto) y su póster, así que el almacenamiento solo crecía.
- **Eliminar:** `PATCH /api/institution/videos/{publicId}/deletion` responde `204`. En una transacción con bloqueo, quita las rutas, lo inactiva y registra `deleted_at` y `deleted_by`. Después del commit borra el MP4 y el póster del disco de medios; si el disco falla, solo queda una advertencia en el log, sin rutas.
- **Registro mínimo:** la fila conserva el título, el consentimiento, quién lo subió y quién lo eliminó. Las restricciones de la base garantizan que un video eliminado no tenga archivos ni esté activo.
- **Oculto en todo:** con `SoftDeletes`, un video eliminado no aparece en el listado de la institución, en la galería ni en la cuota, y cualquier acción sobre él responde `404`, igual que uno ajeno.
- **Límite:** un video en proceso no se elimina («Espera a que termine de procesarse para eliminarlo.»), porque el worker sigue escribiendo sus archivos. Los listos, activos o inactivos, y los fallidos sí.
- **Interfaz:** **Eliminar**, con color de peligro, pide confirmación con `ConfirmDialog`: «Se borrará definitivamente para liberar espacio. Ya no aparecerá en las Historias del Dual y no se puede deshacer.».
- **Sin `DELETE`:** la convención del proyecto se mantiene.

### T-S9-05 — Videos de la institución en lista uniforme con acciones de ícono

**Estado:** Completada (11 de noviembre de 2026). Pedida por el responsable el mismo día.  
**Rol:** `INSTITUTION`  
**Cambia:** la retícula de tarjetas de HU-S9-02 CA-05.

- **Lista uniforme:** el mosaico de tarjetas se sustituye por filas iguales a todo el ancho de la página. Cada fila tiene una miniatura fija de 16:9 con la duración, el título en una línea (completo en `title`), la insignia de estado, la fecha y, si falló, el motivo en dos líneas. En móvil, las acciones pasan a una fila propia.
- **Acciones de ícono:** Ver (reproducir), Editar (lápiz), Inactivar y Activar (ojo tachado y ojo) y Eliminar (bote), que es el único relleno: un círculo con el color de peligro y el ícono en el color de superficie, para distinguirlo de las demás acciones. Son círculos con los tokens de marca, y el verbo aparece en una etiqueta al pasar el cursor o con el foco del teclado.
- **Accesibilidad:** cada botón conserva su nombre accesible completo («Editar {título}»). El orden es fijo, y una acción que no aplica deja su hueco para que los íconos coincidan entre filas.

---

## Sprint 10 (avance) — Despliegue en nube con infraestructura como código

No forma parte de este Sprint; se detallará en `docs/sprint-10.md`. Se anota para que el Sprint 9 quede alineado:

- **Imágenes de producción:** Dockerfile multietapa del backend con PHP-FPM, Nginx y FFmpeg. El worker usa la misma imagen con `queue:work`. El frontend se compila a estáticos. Nginx con `client_max_body_size 260m`.
- **Packer:** AMI base Ubuntu LTS con Docker Engine y Compose, agente de CloudWatch y hardening básico. La aplicación llega como imágenes desde ECR, no dentro de la AMI.
- **Terraform** (estado remoto en S3 con bloqueo):
  - red: VPC y security groups;
  - cómputo: EC2 con IAM role (sin llaves en Git);
  - base de datos: RDS PostgreSQL 17 con PostGIS y respaldos automáticos;
  - archivos: buckets privados `media` y `private` (PDFs del IMSS) cifrados;
  - entrega: CloudFront para el frontend, ACM y Route 53 para HTTPS, SES para el correo.
- **Secretos** en SSM Parameter Store.
- **CI con GitHub Actions:** Pint, ESLint, Pest y Vitest, luego build y push a ECR, y despliegue con migraciones.
- **Escalar solo con medición:** si FFmpeg compite con la API por CPU, el worker pasa a una segunda instancia con la misma imagen. Sigue siendo un monolito modular.
