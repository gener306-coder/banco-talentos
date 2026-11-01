import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { ChevronLeftIcon, PlusIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import type { InstitutionVideo } from './api'
import { VideoUploadForm } from './VideoUploadForm'

/**
 * Videos promocionales del programa dual de la institución (HU-S9-01). La subida se hace en una hoja; el video queda
 * «Procesando…» mientras el servidor lo optimiza. El listado y su estado en vivo llegan con HU-S9-02.
 */
export function InstitutionVideosPage() {
  const [uploading, setUploading] = useState(false)
  const [received, setReceived] = useState<InstitutionVideo | null>(null)
  const close = useCallback(() => setUploading(false), [])

  return (
    <section className="card" aria-labelledby="institution-videos-title">
      <nav className="page-navigation" aria-label="Navegación de videos">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
      </nav>
      <h2 id="institution-videos-title">Videos promocionales</h2>
      <div className="page-toolbar">
        <p>Muestra a las empresas tus instalaciones, talleres y proyectos del programa dual. Puedes tener hasta 5 videos activos de máximo 5 minutos cada uno.</p>
        <button type="button" onClick={() => setUploading(true)}><PlusIcon />Subir video</button>
      </div>
      {received && (
        <p className="institution-success" role="status">
          Recibimos «{received.title}». Procesando… Lo optimizamos para que se reproduzca rápido; puede tardar unos minutos.
        </p>
      )}
      <Sheet open={uploading} onClose={close} labelledBy="video-form-title">
        <VideoUploadForm onUploaded={(video) => { setReceived(video); setUploading(false) }} />
      </Sheet>
    </section>
  )
}
