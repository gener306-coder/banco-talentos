import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { completeLegalConfig } from '../legal/testing'
import { AppFooter } from './AppFooter'

const renderFooter = (config?: typeof completeLegalConfig) =>
  render(<MemoryRouter initialEntries={['/login']}><AppFooter wide={false} config={config} /></MemoryRouter>)

describe('footer HU-S15-03 y T-S15-02', () => {
  it('con la configuración predeterminada nombra el programa una sola vez y sin marcadores', () => {
    renderFooter()
    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent('© 2026 Banco de Talentos – Educación Dual')
    expect(footer.textContent?.match(/Banco de Talentos/g)).toHaveLength(1)
    expect(footer).not.toHaveTextContent(/Pendiente de definir|Borrador/)
    expect(within(footer).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/legal/privacidad', '/legal/terminos', '/legal/cookies'])
  })

  it('con un nombre corto distinto lo antepone al programa', () => {
    renderFooter(completeLegalConfig)
    expect(screen.getByRole('contentinfo')).toHaveTextContent('© 2026 Operadora Dual · Banco de Talentos – Educación Dual')
  })
})
