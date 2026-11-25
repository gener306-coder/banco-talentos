# Colas y procesamiento de video

> **Estado:** pendiente de redacción (T-S20-05). [Índice de la documentación técnica](../README.md)

## Contenido previsto

- Cola en base de datos con los workers `default` y `videos`.
- Parámetros de FFmpeg y manejo de fallos.

## Subida y transcodificación de video

```mermaid
%% D10: Secuencia, subida y transcodificación de un video promocional
sequenceDiagram
    autonumber
    participant I as Institución
    participant API as API Laravel
    participant L as Disco local
    participant DB as PostgreSQL
    participant W as bt-queue@videos
    participant F as ffprobe y FFmpeg
    participant S3 as S3 privado

    I->>API: POST /api/institution/videos con archivo y consentimiento
    API->>L: Guarda el original
    API->>DB: INSERT institution_videos PROCESSING y encola en videos
    API-->>I: 202 Accepted
    W->>DB: Toma ProcessInstitutionVideo, 900 s y 2 intentos
    W->>F: ffprobe, hasta 300 s y 30 fps
    W->>F: H.264 CRF 26 con tope de 2500 kbit/s, con nice 10
    W->>F: Póster JPG
    W->>S3: PUT videos/institución/public_id.mp4 y .jpg
    opt Versión WebM
        W->>F: VP9 CRF 34
        W->>S3: PUT .webm, si falla el video queda sin WebM
    end
    alt Procesado
        W->>DB: READY con rutas, medidas y bytes
        W->>L: Borra el original
    else Video inválido, error o tiempo agotado
        W->>S3: Borra lo que alcanzó a subir
        W->>DB: FAILED con failure_reason
    end
    I->>API: GET /api/institution/videos
    API-->>I: Estado y URLs prefirmadas temporales
    I->>S3: Reproduce, la CSP permite el origen de S3 en media-src
```

## Fuentes en el repositorio

- `backend/app/Jobs/ProcessInstitutionVideo.php`
- `backend/app/Support/Video/VideoProcessor.php`
- `infra/packer/files/systemd/bt-queue@.service`
