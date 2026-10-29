import type { Page } from '@playwright/test'

/** HU-S8-01: busca al alumno en el padrón y abre su detalle con «Ver detalle», sin depender de la página en que quede. */
export async function openFromRoster(page: Page, surname: string) {
  const search = page.getByRole('search', { name: 'Buscar alumnos' })
  await search.getByLabel('Buscar por matrícula o nombre').fill(surname)
  await search.getByRole('button', { name: 'Buscar' }).click()
  await page.getByRole('link', { name: new RegExp(`^Ver detalle de ${surname}`) }).click()
}
