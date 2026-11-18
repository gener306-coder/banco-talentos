import type { CSSProperties } from 'react'

/** Posición de la fila para su entrada escalonada (T-S13-13, `tbody.rows-enter` en ui/ui.css). */
export const rowIndex = (index: number): CSSProperties => ({ '--row-index': index }) as CSSProperties
