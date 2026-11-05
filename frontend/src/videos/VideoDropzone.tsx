import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { UploadIcon, VideoIcon } from '../ui/icons'
import { VIDEO_ACCEPT } from './api'
import { VideoPlayer } from './VideoPlayer'

/**
 * Vista previa del archivo local: el navegador lo lee del disco, así que no se sube nada. Si no puede mostrarlo (los
 * .mov HEVC de iPhone en Chrome o Firefox), lo dice y la subida sigue disponible: ffmpeg sí lo procesa.
 */
function LocalPreview({ file, onDuration }: { file: File; onDuration: (seconds: number) => void }) {
  // Quien la usa le da una `key` por archivo: cada archivo tiene su propia URL.
  const [url] = useState(() => URL.createObjectURL(file))
  const pendingRevoke = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [unplayable, setUnplayable] = useState(false)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  // Se revoca un instante después de desmontar: el modo estricto de React desmonta y vuelve a montar, y lo cancela.
  useEffect(() => {
    clearTimeout(pendingRevoke.current)
    return () => { pendingRevoke.current = setTimeout(() => URL.revokeObjectURL(url)) }
  }, [url])

  if (unplayable) {
    return (
      <div className="video-file-fallback">
        <VideoIcon />
        <p>Este navegador no puede mostrar la vista previa, pero el video se puede subir y se procesará igual.</p>
      </div>
    )
  }
  return (
    <VideoPlayer src={`${url}#t=0.1`} poster={null} label={file.name} durationSeconds={null} width={size?.width ?? null} height={size?.height ?? null}
      preload="metadata" onUnplayable={() => setUnplayable(true)}
      onMetadata={(metadata) => { setSize(metadata); onDuration(metadata.duration) }} />
  )
}

/**
 * Zona para elegir el video (HU-S9-07): arrastrar o elegir, con un `input type="file"` real para el teclado y los
 * lectores de pantalla. Con archivo elegido se convierte en su vista previa. `showPreview` la desmonta al cerrar la
 * hoja: como su contenido sigue montado, el video seguiría sonando.
 */
export function VideoDropzone({ file, resetKey, disabled, invalid, describedBy, showPreview, onChoose, onDuration }: {
  file: File | null
  /** Cambiarla vacía el selector tras una subida. */
  resetKey: number
  disabled: boolean
  invalid: boolean
  describedBy?: string
  showPreview: boolean
  onChoose: (file: File | null) => void
  onDuration: (seconds: number) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files[0]
    if (!disabled && dropped) onChoose(dropped)
  }

  return (
    <div className="video-dropzone" data-dragging={dragging} data-invalid={invalid} data-filled={file !== null}
      onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
      onDrop={drop}>
      <input key={resetKey} ref={input} id="video-file" className="visually-hidden" name="video" type="file" accept={VIDEO_ACCEPT} disabled={disabled}
        aria-label="Archivo de video" aria-invalid={invalid} aria-describedby={describedBy}
        onChange={(event) => onChoose(event.target.files?.[0] ?? null)} />
      {file
        ? (
          <>
            {/* key: otro archivo es otra vista previa, sin arrastrar el estado de la anterior. */}
            {showPreview && <LocalPreview key={`${file.name}-${file.size}-${file.lastModified}`} file={file} onDuration={onDuration} />}
            <div className="video-file-row">
              <span className="video-file-name">{file.name}</span>
              <button type="button" className="secondary" disabled={disabled} onClick={() => input.current?.click()}>Cambiar video</button>
            </div>
          </>
        )
        : (
          <label htmlFor="video-file" className="video-dropzone-area">
            <span className="video-dropzone-icon" aria-hidden="true"><UploadIcon /></span>
            <strong>Arrastra tu video o elige un archivo</strong>
            <span>MP4, MOV o WebM, hasta 250 MB y 5 minutos</span>
          </label>
        )}
    </div>
  )
}
