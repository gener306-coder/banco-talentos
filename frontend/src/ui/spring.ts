/**
 * Física de las hojas (skill apple-design): resorte con amortiguamiento y respuesta,
 * proyección del impulso y resistencia progresiva en los bordes.
 */

export interface SpringOptions {
  from: number
  to: number
  /** Velocidad inicial en unidades por segundo (se hereda del gesto al soltar). */
  velocity?: number
  /** 1 = críticamente amortiguado (sin rebote); < 1 rebota. */
  damping?: number
  /** Segundos aproximados para alcanzar el destino; no es una duración fija. */
  response?: number
  /** Diferencia por debajo de la cual se considera en reposo. */
  precision?: number
  onUpdate: (value: number) => void
  onComplete?: () => void
}

export interface SpringAnimation {
  stop: () => void
  readonly value: number
  readonly velocity: number
}

/** Avanza el resorte `dt` segundos con integración semiimplícita en subpasos. */
export function stepSpring(x: number, v: number, to: number, dt: number, damping: number, response: number): [number, number] {
  const omega = (2 * Math.PI) / response
  const stiffness = omega * omega
  const friction = 2 * damping * omega
  const steps = 8
  for (let i = 0; i < steps; i++) {
    const acceleration = -stiffness * (x - to) - friction * v
    v += (acceleration * dt) / steps
    x += (v * dt) / steps
  }
  return [x, v]
}

/** Anima desde el valor actual: si se interrumpe, la siguiente animación parte de `value` y `velocity`. */
export function animateSpring({ from, to, velocity = 0, damping = 1, response = 0.35, precision = 0.5, onUpdate, onComplete }: SpringOptions): SpringAnimation {
  let x = from, v = velocity, frame = 0, last = performance.now()
  const tick = (now: number) => {
    const dt = Math.min(0.064, (now - last) / 1000)
    last = now
    ;[x, v] = stepSpring(x, v, to, dt, damping, response)
    if (Math.abs(x - to) < precision && Math.abs(v) < precision * 10) {
      x = to; v = 0
      onUpdate(x)
      onComplete?.()
      return
    }
    onUpdate(x)
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return {
    stop: () => cancelAnimationFrame(frame),
    get value() { return x },
    get velocity() { return v },
  }
}

/** Punto donde se detendría el gesto por inercia (decaimiento exponencial; 0.998 ≈ desplazamiento normal). */
export function projectMomentum(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/** Resistencia progresiva al pasar un límite: cuanto más se excede, menos sigue al puntero. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}

/** Velocidad (unidades por segundo) a partir de las últimas muestras del puntero. */
export function releaseVelocity(samples: { time: number; value: number }[]): number {
  if (samples.length < 2) return 0
  const first = samples[0], last = samples[samples.length - 1]
  const elapsed = last.time - first.time
  return elapsed > 0 ? ((last.value - first.value) / elapsed) * 1000 : 0
}
