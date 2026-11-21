import { legalConfig } from './legalConfig'
import type { LegalConfig } from './legalConfig'

/** Configuración jurídica completa para las pruebas (T-S15-02). */
export const completeLegalConfig: LegalConfig = {
  ...legalConfig,
  regime: 'private_entity',
  controller: { name: 'Operadora Dual, S.A. de C.V.', shortName: 'Operadora Dual', address: 'Av. Reforma 1, Ciudad de México', website: 'https://dual.example.test' },
  dataProtection: {
    channelName: 'Departamento de Datos Personales', email: 'privacidad@dual.example.test', phone: '55 5555 0000',
    address: null, hours: 'Lunes a viernes, de 9:00 a 15:00', responseTerm: '20 días hábiles',
  },
  authority: { name: 'Secretaría Anticorrupción y Buen Gobierno', website: null },
  jurisdiction: { governingLaw: 'las leyes federales de los Estados Unidos Mexicanos', courts: 'los tribunales competentes de la Ciudad de México' },
  processors: [{ name: 'Correo Seguro', purpose: 'Envía los avisos de la plataforma.', location: 'México' }],
}
