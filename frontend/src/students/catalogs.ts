/**
 * Catálogos del expediente (HU-S2-03). Las claves de estado son las del INEGI y deben coincidir
 * con App\Enums\MexicanState en el backend.
 */
export const MEXICAN_STATES: readonly { code: string; name: string }[] = [
  { code: '01', name: 'Aguascalientes' },
  { code: '02', name: 'Baja California' },
  { code: '03', name: 'Baja California Sur' },
  { code: '04', name: 'Campeche' },
  { code: '05', name: 'Coahuila' },
  { code: '06', name: 'Colima' },
  { code: '07', name: 'Chiapas' },
  { code: '08', name: 'Chihuahua' },
  { code: '09', name: 'Ciudad de México' },
  { code: '10', name: 'Durango' },
  { code: '11', name: 'Guanajuato' },
  { code: '12', name: 'Guerrero' },
  { code: '13', name: 'Hidalgo' },
  { code: '14', name: 'Jalisco' },
  { code: '15', name: 'Estado de México' },
  { code: '16', name: 'Michoacán' },
  { code: '17', name: 'Morelos' },
  { code: '18', name: 'Nayarit' },
  { code: '19', name: 'Nuevo León' },
  { code: '20', name: 'Oaxaca' },
  { code: '21', name: 'Puebla' },
  { code: '22', name: 'Querétaro' },
  { code: '23', name: 'Quintana Roo' },
  { code: '24', name: 'San Luis Potosí' },
  { code: '25', name: 'Sinaloa' },
  { code: '26', name: 'Sonora' },
  { code: '27', name: 'Tabasco' },
  { code: '28', name: 'Tamaulipas' },
  { code: '29', name: 'Tlaxcala' },
  { code: '30', name: 'Veracruz' },
  { code: '31', name: 'Yucatán' },
  { code: '32', name: 'Zacatecas' },
]

export type PeriodType = 'semester' | 'four_month'

export const PERIOD_TYPES: readonly { value: PeriodType; label: string }[] = [
  { value: 'semester', label: 'Semestre' },
  { value: 'four_month', label: 'Cuatrimestre' },
]

export const MAX_PERIOD = 15

export const isStateCode = (value: unknown): value is string =>
  typeof value === 'string' && MEXICAN_STATES.some((state) => state.code === value)

export const isPeriodType = (value: unknown): value is PeriodType =>
  value === 'semester' || value === 'four_month'

export function stateName(code: string): string {
  return MEXICAN_STATES.find((state) => state.code === code)?.name ?? code
}

/** «6.º semestre». */
export function periodLabel(type: PeriodType, number: number): string {
  return `${number}.º ${type === 'semester' ? 'semestre' : 'cuatrimestre'}`
}
