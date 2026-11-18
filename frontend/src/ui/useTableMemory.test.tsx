import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTableMemory } from './useTableMemory'

// T-S13-12: al volver de una fila, la tabla recupera su posición, la fila parpadea y (con teclado) recupera el foco.
function Table() {
  const tableMemory = useTableMemory()
  return (
    <div className="institution-table-wrapper" ref={tableMemory}>
      <table className="institution-table">
        <tbody>
          {[1, 2, 3].map((id) => (
            <tr key={id} data-href={`/items/${id}`}>
              <th scope="row">Fila {id}</th>
              <td><Link className="row-link" to={`/items/${id}`}>Ver detalle {id}</Link></td>
              <td><button type="button">Acción {id}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderApp(start = '/items?status=x') {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <Routes>
        <Route path="/items" element={<Table />} />
        <Route path="/items/:id" element={<Link to="/items?status=x">Volver</Link>} />
        <Route path="/otra" element={<p>Otra</p>} />
      </Routes>
    </MemoryRouter>,
  )
}
const row = (id: number) => screen.getByRole('rowheader', { name: `Fila ${id}` }).closest('tr')!

let scrollBy: ReturnType<typeof vi.fn>
beforeEach(() => {
  scrollBy = vi.fn()
  vi.stubGlobal('scrollBy', scrollBy)
  vi.stubGlobal('scrollTo', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('memoria de la tabla', () => {
  it('al volver deja la fila en la misma altura de la pantalla y la hace parpadear una vez', () => {
    renderApp()
    vi.spyOn(row(2), 'getBoundingClientRect').mockReturnValue({ top: 300 } as DOMRect)
    fireEvent.click(screen.getByRole('link', { name: 'Ver detalle 2' }), { detail: 1 })
    fireEvent.click(screen.getByRole('link', { name: 'Volver' }))

    expect(row(2)).toHaveClass('row-return')
    expect(row(1)).not.toHaveClass('row-return')
    expect(screen.getByRole('link', { name: 'Ver detalle 2' })).not.toHaveFocus()
    expect(sessionStorage.getItem('table-memory')).toBeNull()
  })

  it('vuelve al principio y baja animado hasta dejar la fila donde estaba; luego parpadea (T-S13-13)', async () => {
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    const { unmount } = renderApp()
    vi.spyOn(row(3), 'getBoundingClientRect').mockReturnValue({ top: 80 } as DOMRect)
    fireEvent.click(row(3).querySelector('th')!)
    unmount()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 900 } as DOMRect)
    renderApp()
    expect(scrollTo).toHaveBeenNthCalledWith(1, 0, 0)
    // Mientras baja, la fila aún no parpadea; al llegar (destino 900 - 80 = 820), sí.
    expect(row(3)).not.toHaveClass('row-return')
    await waitFor(() => expect(row(3)).toHaveClass('row-return'), { timeout: 4000 })
    expect(scrollTo).toHaveBeenLastCalledWith(0, 820)
    vi.restoreAllMocks()
  })

  it('con movimiento reducido salta directo a la fila', () => {
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }))
    const { unmount } = renderApp()
    vi.spyOn(row(2), 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect)
    fireEvent.click(screen.getByRole('link', { name: 'Ver detalle 2' }), { detail: 1 })
    unmount()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 600 } as DOMRect)
    renderApp()
    expect(scrollTo.mock.calls).toEqual([[0, 0], [0, 500]])
    expect(row(2)).toHaveClass('row-return')
    vi.restoreAllMocks()
  })

  it('si la persona desplaza mientras baja, la animación le cede el control y la fila igual se marca', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const { unmount } = renderApp()
    fireEvent.click(screen.getByRole('link', { name: 'Ver detalle 1' }), { detail: 1 })
    unmount()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 700 } as DOMRect)
    renderApp()
    expect(row(1)).not.toHaveClass('row-return')
    fireEvent.wheel(window)
    expect(row(1)).toHaveClass('row-return')
    vi.restoreAllMocks()
  })

  it('con el teclado, el foco vuelve al control de la fila', () => {
    renderApp()
    // Un Enter sobre un enlace produce un clic con detail 0.
    fireEvent.click(screen.getByRole('link', { name: 'Ver detalle 1' }), { detail: 0 })
    fireEvent.click(screen.getByRole('link', { name: 'Volver' }))
    expect(screen.getByRole('link', { name: 'Ver detalle 1' })).toHaveFocus()
  })

  it('no recuerda los botones que no navegan ni restaura otro listado o con otros filtros', () => {
    const { unmount } = renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Acción 1' }))
    expect(sessionStorage.getItem('table-memory')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Ver detalle 1' }), { detail: 1 })
    unmount()
    renderApp('/items?status=y')
    expect(row(1)).not.toHaveClass('row-return')
  })

  it('el parpadeo termina solo', () => {
    vi.useFakeTimers()
    try {
      renderApp()
      fireEvent.click(screen.getByRole('link', { name: 'Ver detalle 2' }), { detail: 1 })
      fireEvent.click(screen.getByRole('link', { name: 'Volver' }))
      expect(row(2)).toHaveClass('row-return')
      act(() => { vi.advanceTimersByTime(2000) })
      expect(row(2)).not.toHaveClass('row-return')
    } finally {
      vi.useRealTimers()
    }
  })

  it('al cambiar de página, sube hasta el inicio de la tabla', () => {
    function Paged({ page }: { page: number }) {
      return <div className="institution-table-wrapper" ref={useTableMemory(page)}><table><tbody><tr data-href="/items/1"><td>Fila</td></tr></tbody></table></div>
    }
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }))
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 900 })
    try {
      const { rerender } = render(<MemoryRouter><Paged page={1} /></MemoryRouter>)
      expect(scrollTo).not.toHaveBeenCalled()
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: -500 } as DOMRect)
      rerender(<MemoryRouter><Paged page={2} /></MemoryRouter>)
      // Inicio de la tabla: 900 - 500 - 16 de aire.
      expect(scrollTo).toHaveBeenCalledWith(0, 384)
    } finally {
      Reflect.deleteProperty(window, 'scrollY')
      vi.restoreAllMocks()
    }
  })
})
