import type { Rng } from './cycler'

/** Small, fast, seedable PRNG (mulberry32) for tests, benches and idle splats. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface SplatSpec {
  /** Position in normalised UV, origin bottom-left. */
  x: number
  y: number
  /** Velocity impulse in world units per second (world height = 1). */
  dx: number
  dy: number
}

/**
 * A random splat somewhere on screen with a random direction. Speed is
 * biased away from zero so idle splats always visibly move.
 */
export function randomSplat(rng: Rng, speed = 1.5): SplatSpec {
  const angle = rng() * Math.PI * 2
  const mag = speed * (0.5 + rng() * 0.5)
  return {
    x: 0.1 + rng() * 0.8,
    y: 0.1 + rng() * 0.8,
    dx: Math.cos(angle) * mag,
    dy: Math.sin(angle) * mag,
  }
}
