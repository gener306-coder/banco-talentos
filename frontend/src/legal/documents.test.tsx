import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { privacyDocument } from './documents/privacy'
import { termsDocument } from './documents/terms'
import { SimplifiedNotice } from './SimplifiedNotice'
import { completeLegalConfig } from './testing'
import type { LegalDocument } from './types'

function renderDocument(legal: LegalDocument) {
  return render(
    <div>
      <p>{legal.lead}</p>
      {legal.sections.map((section) => (
        <section key={section.id} aria-label={section.title}>{section.body}</section>
      ))}
    </div>,
  )
}

describe('documentos con la configuración jurídica completa (T-S15-02)', () => {
  it('el Aviso de Privacidad muestra el régimen, el responsable, el canal ARCO, la autoridad y los encargados', () => {
    renderDocument(privacyDocument(completeLegalConfig))
    expect(screen.getByText(/conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares/)).toBeInTheDocument()
    const owner = screen.getByRole('region', { name: 'Responsable' })
    expect(owner).toHaveTextContent('Responsable del tratamiento: Operadora Dual, S.A. de C.V.')
    expect(owner).toHaveTextContent('Domicilio: Av. Reforma 1, Ciudad de México.')
    expect(owner).toHaveTextContent('https://dual.example.test')
    const rights = screen.getByRole('region', { name: 'Derechos ARCO y revocación' })
    expect(rights).toHaveTextContent('ante el área de datos personales del responsable (Departamento de Datos Personales)')
    expect(rights).toHaveTextContent('Correo electrónico: privacidad@dual.example.test')
    expect(rights).toHaveTextContent('Teléfono: 55 5555 0000')
    expect(rights).toHaveTextContent('Domicilio: Av. Reforma 1, Ciudad de México')
    expect(rights).toHaveTextContent('Horario: Lunes a viernes, de 9:00 a 15:00')
    expect(rights).toHaveTextContent('Plazo de respuesta: 20 días hábiles.')
    expect(rights).toHaveTextContent('autoridad garante: Secretaría Anticorrupción y Buen Gobierno.')
    expect(screen.getByRole('region', { name: 'Transferencias y encargados' })).toHaveTextContent('Correo Seguro: Envía los avisos de la plataforma. Ubicación: México.')
  })

  it('los Términos muestran el responsable, la ley aplicable y los tribunales', () => {
    renderDocument(termsDocument(completeLegalConfig))
    expect(screen.getByText(/cuyo responsable es/)).toHaveTextContent('Operadora Dual, S.A. de C.V.')
    expect(screen.getByRole('region', { name: 'Ley aplicable y jurisdicción' })).toHaveTextContent(
      'Estas condiciones se rigen por las leyes federales de los Estados Unidos Mexicanos. Para cualquier controversia, las partes se someten a los tribunales competentes de la Ciudad de México.')
  })

  it('sin tribunales definidos, los Términos remiten a la legislación mexicana sin huecos', () => {
    renderDocument(termsDocument())
    expect(screen.getByRole('region', { name: 'Ley aplicable y jurisdicción' })).toHaveTextContent(/^Estas condiciones se rigen por la legislación mexicana aplicable\.$/)
  })

  it('el aviso simplificado nombra al responsable configurado', () => {
    render(<MemoryRouter><SimplifiedNotice backLabel="Volver" config={completeLegalConfig} /></MemoryRouter>)
    expect(screen.getByText(/Responsable de tus datos/)).toHaveTextContent('Responsable de tus datos: Operadora Dual, S.A. de C.V.')
  })
})
