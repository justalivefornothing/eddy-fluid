/**
 * Declarative description of one simulation frame. `FluidSim.step()` walks
 * exactly this list; keeping it as data means the README diagram, the tests
 * and the runtime can never drift apart.
 */
export const SIM_PASS_ORDER = [
  'splat',
  'advectVelocity',
  'curl',
  'vorticity',
  'divergence',
  'clearPressure',
  'pressure',
  'gradientSubtract',
  'advectDye',
] as const

export type SimPass = (typeof SIM_PASS_ORDER)[number]

export const RENDER_PASS_ORDER = ['bloomPrefilter', 'bloomDownsample', 'bloomUpsample', 'bloomFinal', 'display'] as const

export type RenderPass = (typeof RENDER_PASS_ORDER)[number]

/** Which fragment program each logical pass is drawn with. */
export const PASS_PROGRAM: Readonly<Record<SimPass | RenderPass, string>> = {
  splat: 'splat',
  advectVelocity: 'advection',
  curl: 'curl',
  vorticity: 'vorticity',
  divergence: 'divergence',
  clearPressure: 'clear',
  pressure: 'pressure',
  gradientSubtract: 'gradientSubtract',
  advectDye: 'advection',
  bloomPrefilter: 'bloomPrefilter',
  bloomDownsample: 'bloomBlur',
  bloomUpsample: 'bloomBlur',
  bloomFinal: 'bloomFinal',
  display: 'display',
}

/** Everything the GPU solver needs to know; a strict subset of SimSettings. */
export interface SimConfig {
  simResolution: number
  dyeResolution: number
  velocityDissipation: number
  dyeDissipation: number
  pressure: number
  pressureIterations: number
  curl: number
  splatRadius: number
  shading: boolean
  bloom: boolean
  bloomIntensity: number
  bloomThreshold: number
}

/** Short side of the bloom pyramid's top level, in texels. */
export const BLOOM_BASE_RESOLUTION = 256
export const BLOOM_LEVELS = 4
/** Smallest allowed short side for a pyramid level. */
export const BLOOM_MIN_SIZE = 16

/**
 * Count draw calls in one full frame for the HUD / README. The Jacobi
 * relaxation dominates: it is `iterations` full-screen passes at sim res.
 */
export function drawCallsPerFrame(config: Pick<SimConfig, 'pressureIterations' | 'bloom'>, splats: number, bloomLevels = BLOOM_LEVELS): number {
  const sim = splats * 2 + 1 + 1 + 1 + 1 + 1 + config.pressureIterations + 1 + 1
  const bloom = config.bloom ? 1 + (bloomLevels - 1) * 2 + 1 : 0
  return sim + bloom + 1
}
