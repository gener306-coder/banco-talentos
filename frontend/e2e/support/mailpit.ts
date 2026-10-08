import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

/**
 * Enlace del correo más reciente enviado a `recipient` cuyo asunto empieza por `subject`,
 * leído del Mailpit efímero del entorno E2E. No imprime el enlace en las aserciones.
 */
export async function linkFromMail(request: APIRequestContext, recipient: string, subject: string, path: string): Promise<string> {
  const mailpitUrl = process.env.MAILPIT_URL
  if (!mailpitUrl) throw new Error('Ejecuta sh scripts/test-e2e.sh desde la raíz del repositorio.')
  const pattern = new RegExp(`https?://\\S+${path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\?[^\\s)\\]>]+`)
  let link: string | undefined
  await expect.poll(async () => {
    const search = await request.get(`${mailpitUrl}/api/v1/search`, { params: { query: `to:"${recipient}"` } })
    const { messages } = await search.json() as { messages: { ID: string; Subject: string }[] }
    const message = messages.find((candidate) => candidate.Subject.startsWith(subject))
    if (!message) return false
    const body = await (await request.get(`${mailpitUrl}/api/v1/message/${message.ID}`)).json() as { Text: string }
    link = body.Text.match(pattern)?.[0]

    return link !== undefined
  }, { message: `correo "${subject}" recibido` }).toBe(true)

  return link!
}

export async function mailCount(request: APIRequestContext, recipient: string): Promise<number> {
  const search = await request.get(`${process.env.MAILPIT_URL}/api/v1/search`, { params: { query: `to:"${recipient}"` } })
  return ((await search.json()) as { messages: unknown[] }).messages.length
}
