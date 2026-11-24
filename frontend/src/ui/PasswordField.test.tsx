import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { PasswordField } from './PasswordField'
import type { PasswordFieldProps } from './PasswordField'

// T-S18-01: el campo de contraseña compartido por el inicio de sesión, Mi cuenta y las pantallas públicas.
function Harness(props: Partial<PasswordFieldProps>) {
  const [value, setValue] = useState('')
  return <>
    <PasswordField id="pwd" label="Contraseña nueva" autoComplete="new-password" value={value} onChange={setValue} {...props} />
    <button type="button" onClick={() => setValue('')}>Vaciar</button>
  </>
}

describe('PasswordField', () => {
  it('muestra y oculta la contraseña con un botón accesible que controla el campo', () => {
    render(<Harness />)
    const input = screen.getByLabelText('Contraseña nueva')
    const toggle = screen.getByRole('button', { name: 'Mostrar contraseña nueva' })
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('autocomplete', 'new-password')
    expect(input).toBeRequired()
    expect(toggle).toHaveAttribute('aria-controls', 'pwd')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(toggle)
    expect(input).toHaveAttribute('type', 'text')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(toggle)
    expect(input).toHaveAttribute('type', 'password')
  })

  it('vuelve a ocultarse cuando el campo se vacía, pero respeta mostrarlo antes de escribir', () => {
    render(<Harness />)
    const input = screen.getByLabelText('Contraseña nueva')
    const toggle = screen.getByRole('button', { name: 'Mostrar contraseña nueva' })
    fireEvent.click(toggle)
    expect(input).toHaveAttribute('type', 'text')

    fireEvent.change(input, { target: { value: 'secreta-larga-2026' } })
    expect(input).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: 'Vaciar' }))
    expect(input).toHaveAttribute('type', 'password')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  it('enlaza las descripciones externas, la ayuda y el error, que acepta una lista', () => {
    render(<>
      <p id="reqs">Al menos 12 caracteres.</p>
      <Harness describedBy="reqs" help="Usa una frase larga." error={['Muy corta.', 'Muy común.']} />
    </>)
    const input = screen.getByLabelText('Contraseña nueva')
    expect(input).toHaveAttribute('aria-describedby', 'reqs pwd-help pwd-error')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Muy corta. Muy común.')).toHaveAttribute('id', 'pwd-error')
  })

  it('se deshabilita junto con su botón mientras se envía', () => {
    render(<Harness disabled />)
    expect(screen.getByLabelText('Contraseña nueva')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mostrar contraseña nueva' })).toBeDisabled()
  })
})
