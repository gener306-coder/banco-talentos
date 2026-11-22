import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isProfileIncomplete, request } from './http'

const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('perfil incompleto de la organización (HU-S14-03, HU-S16-08)', () => {
  it.each([
    [422, { code: 'COMPANY_PROFILE_INCOMPLETE' }, true],
    [422, { code: 'INSTITUTION_PROFILE_INCOMPLETE' }, true],
    [422, { code: 'OTRO' }, false],
    [422, { errors: {} }, false],
    [403, { code: 'INSTITUTION_PROFILE_INCOMPLETE' }, false],
  ])('con %i y %j responde %s', (status, body, expected) => {
    expect(isProfileIncomplete(status, body)).toBe(expected)
  })

  it('marca el ApiError del 422 de la institución sin mezclarlo con los errores por campo', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ message: 'Completa…', code: 'INSTITUTION_PROFILE_INCOMPLETE', missing: ['cct'] }, { status: 422 }))
    await expect(request('/api/institution/videos')).rejects.toMatchObject({ status: 422, profileIncomplete: true, errors: {} })
  })
})
