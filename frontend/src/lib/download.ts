/** Descarga un Blob con el nombre indicado sin abrirlo en una pestaña. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  // Se libera después del clic, cuando el navegador ya inició la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Nombre de una exportación CSV con la fecha local de descarga (HU-S7-02). */
export function csvName(prefix: string, today = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${prefix}-${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.csv`
}
