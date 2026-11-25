# Almacenamiento de archivos y S3

[Índice de la documentación técnica](../README.md)

La aplicación guarda tres tipos de archivo. Ninguno es público, y su disco se elige por configuración, no por código:

| Archivo | Disco (variable de entorno) | Local y pruebas | Piloto | Prefijo en S3 |
|---|---|---|---|---|
| Videos promocionales y pósteres | `MEDIA_DISK` | `media` (`storage/app/media`) | `s3` | `videos/<institución>/<public_id>.{mp4,webm,jpg}` |
| Comprobantes del seguro (PDF) | `PRIVATE_DOCUMENTS_DISK` | `local` (`storage/app/private`) | `s3` | `imss/<institución>/<uuid>.pdf` |
| Certificados TLS y cuenta ACME de Caddy | No es de Laravel: lo maneja `bt-caddy-certs.sh` | — | `s3` | `caddy/` |

Además, el **original de un video** se guarda en el disco `local` de la instancia (`ProcessInstitutionVideo::SOURCE_DISK`), porque FFmpeg necesita una ruta de archivo. Es temporal: se borra al terminar el procesamiento.

## El bucket del piloto

Lo declara `infra/terraform/modules/storage/main.tf`. Su nombre es `banco-talentos-pilot-<cuenta>`:

| Control | Configuración |
|---|---|
| Acceso público | Bloqueado en sus cuatro opciones (`block_public_acls`, `block_public_policy`, `ignore_public_acls` y `restrict_public_buckets`). Propiedad `BucketOwnerEnforced`: sin ACL. |
| Cifrado en reposo | SSE-S3 (`AES256`) con *bucket key*. |
| Cifrado en tránsito | La política del bucket niega toda acción sin TLS (`aws:SecureTransport = false`). |
| Versionado | Activo. Las versiones anteriores expiran a los 30 días (`noncurrent_version_days`), así que un borrado o una sobrescritura accidental se recupera en ese plazo. |
| Cargas incompletas | Las subidas multiparte sin terminar se abortan a los 7 días. |
| Destrucción | `force_destroy = false`: Terraform no borra un bucket con objetos. |
| Credenciales | El disco `s3` de Laravel no recibe llaves: el SDK de AWS usa el rol IAM de la instancia, que solo tiene `GetObject`, `PutObject` y `DeleteObject` sobre los objetos del bucket, y `ListBucket`. |
| Red | La EC2 llega al bucket por un VPC endpoint de tipo Gateway, sin pasar por Internet ([ADR-004](../01-vision-general/adr/ADR-004-vpc-sin-nat.md)). |

## Cómo se entregan los archivos

### Videos y pósteres: URLs prefirmadas

`App\Support\Video\MediaUrl::temporary()` genera la URL de cada video y póster:
- **Con `MEDIA_DISK=s3`**, es una URL prefirmada de S3 (`temporaryUrl`). El navegador descarga directo del bucket, y la CSP de Caddy permite ese origen en `img-src` y `media-src`.
- **Con un disco local**, es una URL firmada de Laravel (`/api/media/{path}`, `signed:relative`). La firma hace las veces de credencial, el controlador sirve con soporte de rangos (`206`) y la ruta está fuera del límite general de peticiones.
- **Caducidad.** La URL caduca al final de la hora siguiente a la actual (`startOfHour()->addHours(2)`). Así, dos respuestas dentro de la misma hora comparten la URL y el navegador reutiliza su caché (`Cache-Control: private, max-age=3600`).

### Comprobantes del seguro: solo con sesión

- **Nunca tienen URL.** `GET /api/students/{student}/social-security/document` exige la sesión de la institución dueña del alumno, que se filtra por organización y responde `404` si el alumno es ajeno.
- **Descarga.** Se descarga en streaming con el nombre fijo `comprobante-seguro.pdf`.
- **Validaciones de la subida:**
  - PDF por extensión, tipo MIME y firma real del archivo (`%PDF`);
  - 2 MB como máximo;
  - `throttle:uploads`.
- **Integridad.** El SHA-256 se calcula sobre el archivo subido antes de guardarlo, así funciona igual con disco local o S3 (T-S17-02), y se guarda en `document_sha256`.

### Certificados de Caddy

`bt-caddy-certs.sh` respalda y restaura los datos de Caddy (`/var/lib/caddy/.local/share/caddy`) en `s3://<bucket>/caddy/`:
- `bt-caddy-certs.timer` respalda 30 minutos después del arranque y luego cada día;
- `deploy-pilot.yml` fuerza un respaldo antes de reemplazar la instancia;
- `bt-boot.sh` restaura al arrancar.

Así, una instancia nueva no pide otro certificado a la autoridad ACME en cada despliegue.

## Límites de subida

| Archivo | Tipos | Tamaño máximo | Validación |
|---|---|---|---|
| Video promocional | MP4, MOV o WebM | 250 MB (`upload_max_filesize=250M`, `post_max_size=260M`) | `StoreInstitutionVideoRequest`. Después, el worker exige hasta 300 s de duración (ver [Colas y video](../04-backend/03-colas-y-video.md)). |
| Comprobante del seguro | PDF | 2 MB | `StoreStudentSocialSecurityDocumentRequest` |

## Eliminación

- **Sin borrado físico de los registros.**
- **Videos.** La institución puede eliminar los archivos de un video para liberar espacio (`PATCH /api/institution/videos/{video}/deletion`). El registro se conserva con `deleted_at` y `deleted_by`.
- **Comprobantes.** Un comprobante nuevo reemplaza al anterior en el mismo registro y borra el archivo anterior del disco.
- **Versiones.** En el piloto, las versiones anteriores de cualquier objeto siguen recuperables 30 días.

## Fuentes en el repositorio

- `backend/config/filesystems.php` (`media_disk`, `private_documents_disk`, discos `local`, `media` y `s3`)
- `backend/app/Support/Video/MediaUrl.php`, `backend/app/Http/Controllers/MediaController.php`
- `backend/app/Http/Controllers/StudentSocialSecurityController.php`, `backend/app/Http/Requests/StoreStudentSocialSecurityDocumentRequest.php`
- `backend/app/Http/Requests/StoreInstitutionVideoRequest.php`, `backend/app/Jobs/ProcessInstitutionVideo.php`
- `infra/terraform/modules/storage/main.tf`, `infra/terraform/modules/compute/main.tf` (política S3 del rol)
- `infra/packer/files/sbin/bt-caddy-certs.sh`, `infra/packer/files/systemd/bt-caddy-certs.timer`
- `infra/packer/files/php/zz-banco-talentos.ini`, `infra/packer/files/caddy/Caddyfile`
- `docs/infra/pilot-aws-plan.md` §1.2
