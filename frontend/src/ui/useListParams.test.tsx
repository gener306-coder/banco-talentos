import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import { useListParams } from './useListParams'

// T-S13-13: dos cambios seguidos de la URL, antes de que la vista se pinte de nuevo, no se pisan.
function Probe() {
  const list = useListParams()
  const location = useLocation()
  return (
    <>
      <button type="button" onClick={() => { list.update({ q: 'golfo' }); list.update({ interaction: 'conversation' }) }}>Dos cambios</button>
      <button type="button" onClick={list.clear}>Limpiar</button>
      <output aria-label="Búsqueda">{location.search}</output>
    </>
  )
}

describe('useListParams', () => {
  it('compone cambios consecutivos y vuelve a la página 1', () => {
    render(<MemoryRouter initialEntries={['/x?page=3&status=ACEPTADA']}><Probe /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Dos cambios' }))
    expect(screen.getByRole('status', { name: 'Búsqueda' })).toHaveTextContent('?status=ACEPTADA&q=golfo&interaction=conversation')
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dos cambios' }))
    expect(screen.getByRole('status', { name: 'Búsqueda' })).toHaveTextContent(/^\?q=golfo&interaction=conversation$/)
  })
})
