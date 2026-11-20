import { act, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SKELETON_DELAY_MS } from './StateMessage'
import { TableHead, TableSkeleton } from './TableSkeleton'
import type { TableColumn } from './TableSkeleton'

const columns: readonly TableColumn[] = [
  { label: 'Empresa', role: 'title', bone: 'text-meta' },
  { label: 'RFC', role: 'inline', bone: 'mono' },
  { label: 'Estado', role: 'status', bone: 'status' },
  { label: 'Detalle', hidden: true, role: 'open', bone: 'open' },
]

afterEach(() => { vi.useRealTimers() })

describe('esqueleto de listados a la medida (T-S14-08)', () => {
  it('reserva el marco con el encabezado real desde el primer pintado y muestra los huesos solo tras el retardo', () => {
    vi.useFakeTimers()
    const { container } = render(<TableSkeleton label="Cargando empresas…" columns={columns} tableClass="institution-table has-actions" rows={5} pager />)
    expect(screen.getByText('Cargando empresas…')).toHaveAttribute('role', 'status')
    const card = container.querySelector('.table-skeleton')!
    expect(card).toHaveClass('is-waiting')
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument()
    // El mismo encabezado que la tabla real, con la columna de la flecha solo para lectores de pantalla.
    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent)
    expect(headers).toEqual(['Empresa', 'RFC', 'Estado', 'Detalle'])
    expect(container.querySelector('thead th:last-child .visually-hidden')).toHaveTextContent('Detalle')

    act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS) })
    const table = screen.getByTestId('skeleton')
    expect(table).toHaveAttribute('aria-hidden', 'true')
    expect(card).not.toHaveClass('is-waiting')
    expect(table).toHaveClass('institution-table', 'has-actions', 'stack-mobile')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(5)
    expect(card.querySelector('.pager .bone')).toBeInTheDocument()
  })

  it('cada celda lleva el papel de su columna y un hueso con la forma de su contenido', () => {
    const { container } = render(<TableSkeleton label="Cargando…" columns={columns} tableClass="institution-table" rows={1} />)
    const cells = [...container.querySelectorAll('tbody tr > *')]
    expect(cells.map((cell) => cell.getAttribute('data-cell'))).toEqual(['title', 'inline', 'status', 'open'])
    expect(cells[0].tagName).toBe('TH')
    expect(cells[0].querySelectorAll('.bone')).toHaveLength(2)
    expect(cells[2].querySelector('.bone.status')).toBeInTheDocument()
    expect(cells[3].querySelector('.bone.open')).toBeInTheDocument()
  })

  it('el encabezado compartido rotula las columnas de la tabla real', () => {
    render(<table><TableHead columns={columns} /></table>)
    const row = screen.getByRole('row')
    expect(within(row).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Empresa', 'RFC', 'Estado', 'Detalle'])
  })
})
