import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sheet } from './Sheet'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Abrir hoja</button>
      <Sheet open={open} onClose={() => setOpen(false)} labelledBy="sheet-title">
        <h3 id="sheet-title">Título de la hoja</h3>
        <label htmlFor="sheet-field">Campo</label>
        <input id="sheet-field" />
        <button type="button">Acción</button>
      </Sheet>
    </>
  )
}

function open() {
  const trigger = screen.getByRole('button', { name: 'Abrir hoja' })
  trigger.focus()
  fireEvent.click(trigger)
  return { trigger, dialog: screen.getByRole('dialog', { name: 'Título de la hoja' }) }
}

afterEach(() => vi.unstubAllGlobals())

describe('hoja modal', () => {
  it('queda fuera del árbol accesible mientras está cerrada', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Acción' })).not.toBeInTheDocument()
  })

  it('se abre como diálogo modal nombrado por su título, con el foco en el primer campo y el fondo inerte', () => {
    const view = render(<Harness />)
    const { dialog } = open()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Campo')).toHaveFocus()
    expect(view.container).toHaveAttribute('inert')
    expect(document.body).toHaveClass('modal-open')
  })

  it.each([
    ['el botón Cerrar', () => fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))],
    ['la tecla Esc', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
    ['un clic en el fondo', () => fireEvent.click(document.querySelector('.sheet-scrim')!)],
  ])('se cierra con %s y devuelve el foco al control que la abrió', (_how, close) => {
    const view = render(<Harness />)
    const { trigger } = open()
    close()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(view.container).not.toHaveAttribute('inert')
    expect(document.body).not.toHaveClass('modal-open')
  })

  it('conserva lo escrito al cerrar y volver a abrir', () => {
    render(<Harness />)
    open()
    fireEvent.change(screen.getByLabelText('Campo'), { target: { value: 'trabajo en curso' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    open()
    expect(screen.getByLabelText('Campo')).toHaveValue('trabajo en curso')
  })

  it('atrapa el foco con Tab dentro de la hoja', () => {
    render(<Harness />)
    open()
    const close = screen.getByRole('button', { name: 'Cerrar' })
    const action = screen.getByRole('button', { name: 'Acción' })
    action.focus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true })
    expect(action).toHaveFocus()
  })

  it('en pantallas estrechas muestra la barra de arrastre como hoja inferior', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'), media: query,
      addEventListener: () => {}, removeEventListener: () => {},
    }))
    render(<Harness />)
    open()
    await act(async () => { await new Promise((done) => setTimeout(done, 50)) })
    expect(document.querySelector('.sheet-layer')).toHaveClass('compact')
    expect(document.querySelector('.sheet-handle')).toHaveAttribute('aria-hidden', 'true')
  })
})
