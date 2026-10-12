import { describe, expect, it } from 'vitest'
import { projectMomentum, releaseVelocity, rubberband, stepSpring } from './spring'

function settle(damping: number, from = 0, to = 100, velocity = 0) {
  let x = from, v = velocity, peak = from
  for (let i = 0; i < 120; i++) {
    ;[x, v] = stepSpring(x, v, to, 1 / 60, damping, 0.35)
    peak = Math.max(peak, x)
  }
  return { x, v, peak }
}

describe('física de las hojas', () => {
  it('el resorte críticamente amortiguado llega al destino sin rebasarlo', () => {
    const { x, v, peak } = settle(1)
    expect(x).toBeCloseTo(100, 1)
    expect(Math.abs(v)).toBeLessThan(1)
    expect(peak).toBeLessThanOrEqual(100.01)
  })

  it('con amortiguamiento menor que 1 rebasa el destino y luego se asienta', () => {
    const { x, peak } = settle(0.8)
    expect(peak).toBeGreaterThan(100)
    expect(x).toBeCloseTo(100, 0)
  })

  it('hereda la velocidad inicial del gesto', () => {
    const [still] = stepSpring(0, 0, 100, 1 / 60, 1, 0.35)
    const [thrown] = stepSpring(0, 2000, 100, 1 / 60, 1, 0.35)
    expect(thrown).toBeGreaterThan(still)
  })

  it('proyecta el impulso hacia donde va el gesto', () => {
    expect(projectMomentum(0)).toBe(0)
    expect(projectMomentum(1000)).toBeCloseTo(499, 0)
    expect(projectMomentum(-1000)).toBeCloseTo(-499, 0)
    expect(projectMomentum(1000, 0.99)).toBeLessThan(projectMomentum(1000))
  })

  it('resiste progresivamente al pasar el límite', () => {
    const near = rubberband(20, 400)
    const far = rubberband(200, 400)
    expect(near).toBeLessThan(20)
    expect(far).toBeLessThan(200)
    expect(far / 200).toBeLessThan(near / 20)
    expect(rubberband(-50, 400)).toBeCloseTo(-rubberband(50, 400))
  })

  it('calcula la velocidad de suelta a partir de las muestras', () => {
    expect(releaseVelocity([])).toBe(0)
    expect(releaseVelocity([{ time: 0, value: 0 }, { time: 100, value: 50 }])).toBe(500)
    expect(releaseVelocity([{ time: 10, value: 300 }, { time: 60, value: 200 }])).toBe(-2000)
  })
})
