import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteErrorBoundary } from './RouteErrorBoundary'

function Broken(): never {
  throw new Error('Fallo al pintar')
}

function Harness() {
  const [path, setPath] = useState('/rota')
  return (
    <>
      <button type="button" onClick={() => setPath('/sana')}>Ir a otra vista</button>
      <RouteErrorBoundary pathname={path}>{path === '/rota' ? <Broken /> : <p>Vista sana</p>}</RouteErrorBoundary>
    </>
  )
}

afterEach(() => vi.restoreAllMocks())

describe('error inesperado al pintar una vista (auditoría QA)', () => {
  it('muestra un aviso con Recargar en lugar de dejar la aplicación en blanco y lo olvida al navegar', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<Harness />)
    expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal al mostrar esta vista')
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
    // Lo que rodea a la vista (aquí, el botón; en la app, el encabezado y el footer) sigue montado.
    fireEvent.click(screen.getByRole('button', { name: 'Ir a otra vista' }))
    expect(screen.getByText('Vista sana')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
