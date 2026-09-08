import { describe, expect, it } from 'vitest'
import { mulberry32, randomSplat } from './random'
import { ReferenceFluid, type ReferenceConfig } from './referenceSolver'

const BASE: ReferenceConfig = {
  width: 48,
  height: 32,
  velocityDissipation: 0,
  dyeDissipation: 0,
  pressure: 0.8,
  pressureIterations: 30,
  curl: 0,
}

function seeded(config: Partial<ReferenceConfig> = {}): ReferenceFluid {
  const fluid = new ReferenceFluid({ ...BASE, ...config })
  const rng = mulberry32(42)
  for (let i = 0; i < 4; i++) {
    const s = randomSplat(rng, 6)
    fluid.splat(s.x * fluid.width, s.y * fluid.height, s.dx, s.dy, [rng(), rng(), rng()], 4)
  }
  return fluid
}

describe('ReferenceFluid (CPU twin of the GLSL passes)', () => {
  it('a Gaussian splat lands where it was asked, with the right peak', () => {
    const f = new ReferenceFluid(BASE)
    f.splat(10.5, 8.5, 2, -1, [1, 0.5, 0], 3)
    const i = 8 * f.width + 10
    expect(f.velocity[i * 2]).toBeCloseTo(2, 5)
    expect(f.velocity[i * 2 + 1]).toBeCloseTo(-1, 5)
    expect(f.dye[i * 3]).toBeCloseTo(1, 5)
    expect(f.dye[i * 3 + 1]).toBeCloseTo(0.5, 5)
    // Far away the blob has faded to nothing.
    expect(Math.abs(f.velocity[(30 * f.width + 45) * 2])).toBeLessThan(1e-6)
  })

  it('the projection step makes the velocity field (nearly) divergence free', () => {
    const project = (iterations: number) => {
      const f = seeded({ pressureIterations: iterations })
      const before = f.rmsDivergence()
      expect(before).toBeGreaterThan(0.05)
      f.computeDivergence()
      f.solvePressure()
      f.subtractGradient()
      return f.rmsDivergence() / before
    }
    // Jacobi is a slow smoother: 30 sweeps (the default) knock out over half
    // of the divergence, and letting it run long approaches a clean field.
    expect(project(30)).toBeLessThan(0.5)
    expect(project(300)).toBeLessThan(0.1)
  })

  it('more Jacobi iterations remove more divergence', () => {
    const residual = (iterations: number) => {
      const f = seeded({ pressureIterations: iterations })
      f.computeDivergence()
      f.solvePressure()
      f.subtractGradient()
      return f.rmsDivergence()
    }
    const r15 = residual(15)
    const r40 = residual(40)
    expect(r40).toBeLessThan(r15)
  })

  it('velocity dissipation drains kinetic energy at the configured rate', () => {
    const still = seeded({ velocityDissipation: 0, pressureIterations: 1 })
    const damped = seeded({ velocityDissipation: 2, pressureIterations: 1 })
    const e0 = still.kineticEnergy()
    for (let i = 0; i < 10; i++) {
      still.advectVelocity(1 / 60)
      damped.advectVelocity(1 / 60)
    }
    expect(damped.kineticEnergy()).toBeLessThan(still.kineticEnergy())
    // Ten frames of exp(-2 dt) is exp(-1/3) on velocity, so ~exp(-2/3) on energy (plus a little numerical diffusion).
    expect(damped.kineticEnergy() / e0).toBeLessThan(Math.exp(-2 / 3) + 0.02)
  })

  it('advection with zero dissipation roughly conserves dye and never creates new maxima', () => {
    const f = seeded()
    const total0 = f.totalDye()
    const max0 = Math.max(...f.dye)
    for (let i = 0; i < 20; i++) f.step(1 / 60)
    const total1 = f.totalDye()
    expect(Math.max(...f.dye)).toBeLessThanOrEqual(max0 + 1e-6)
    // Semi-Lagrangian advection is not exactly conservative, but it must stay in the same ballpark.
    expect(total1).toBeGreaterThan(total0 * 0.8)
    expect(total1).toBeLessThan(total0 * 1.2)
  })

  it('vorticity confinement adds rotational energy compared to none', () => {
    const plain = seeded({ curl: 0 })
    const spun = seeded({ curl: 30 })
    for (let i = 0; i < 15; i++) {
      plain.step(1 / 60)
      spun.step(1 / 60)
    }
    expect(spun.kineticEnergy()).toBeGreaterThan(plain.kineticEnergy())
  })

  it('curl of a pure rotation is uniform and has the right sign', () => {
    const f = new ReferenceFluid(BASE)
    const cx = f.width / 2
    const cy = f.height / 2
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const i = (y * f.width + x) * 2
        // Anticlockwise rigid rotation: u = -(y - cy), v = (x - cx).
        f.velocity[i] = -(y + 0.5 - cy)
        f.velocity[i + 1] = x + 0.5 - cx
      }
    }
    f.computeCurl()
    // Interior cells: dv/dx - du/dy = 1 - (-1) = 2.
    expect(f.curl[16 * f.width + 24]).toBeCloseTo(2, 5)
    expect(f.curl[10 * f.width + 10]).toBeCloseTo(2, 5)
  })

  it('is deterministic', () => {
    const a = seeded()
    const b = seeded()
    for (let i = 0; i < 5; i++) {
      a.step(1 / 60)
      b.step(1 / 60)
    }
    expect(a.velocity).toEqual(b.velocity)
    expect(a.dye).toEqual(b.dye)
  })
})

describe('random helpers', () => {
  it('mulberry32 is deterministic and uniform-ish in [0,1)', () => {
    const a = mulberry32(123)
    const b = mulberry32(123)
    const seq = Array.from({ length: 50 }, () => a())
    expect(Array.from({ length: 50 }, () => b())).toEqual(seq)
    for (const v of seq) expect(v >= 0 && v < 1).toBe(true)
    const mean = seq.reduce((s, v) => s + v, 0) / seq.length
    expect(mean).toBeGreaterThan(0.3)
    expect(mean).toBeLessThan(0.7)
  })

  it('randomSplat stays away from the edges and always moves', () => {
    const rng = mulberry32(9)
    for (let i = 0; i < 200; i++) {
      const s = randomSplat(rng, 2)
      expect(s.x).toBeGreaterThanOrEqual(0.1)
      expect(s.x).toBeLessThanOrEqual(0.9)
      expect(s.y).toBeGreaterThanOrEqual(0.1)
      expect(s.y).toBeLessThanOrEqual(0.9)
      const speed = Math.hypot(s.dx, s.dy)
      expect(speed).toBeGreaterThanOrEqual(1 - 1e-9)
      expect(speed).toBeLessThanOrEqual(2 + 1e-9)
    }
  })
})
