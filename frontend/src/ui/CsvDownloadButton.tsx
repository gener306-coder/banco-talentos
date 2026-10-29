import { csvName, saveBlob } from '../lib/download'
import { useApiMutation } from '../lib/useApiRequest'
import type { FailureMessages } from '../lib/useApiRequest'
import { PendingLabel } from './forms'

/** Botón **Descargar CSV** (HU-S7-02 CA-04): descarga con la sesión y avisa si falla, sin salir de la vista. */
export function CsvDownloadButton({ download, prefix, messages }: {
  download: () => Promise<Blob>
  /** Prefijo del archivo; se completa con la fecha de descarga. */
  prefix: string
  messages?: FailureMessages
}) {
  const mutation = useApiMutation(messages)

  return (
    <div className="csv-download">
      <button type="button" className="secondary" disabled={mutation.pending} aria-busy={mutation.pending}
        onClick={() => { void mutation.submit(download, (blob) => saveBlob(blob, csvName(prefix))) }}>
        <PendingLabel pending={mutation.pending} label="Descargar CSV" pendingLabel="Preparando CSV…" />
      </button>
      {mutation.failure && <p className="notice" role="alert">{mutation.failure.message}</p>}
    </div>
  )
}
