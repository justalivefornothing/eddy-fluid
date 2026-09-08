import type { SimSettings } from '../core/presets'
import type { SimConfig } from '../gl/pipeline'

/** Silence in milliseconds before the idle splats kick in, and their cadence. */
export const IDLE_SPLAT_DELAY_MS = 3000

/** Project the user-facing settings onto what the GPU solver consumes. */
export function toSimConfig(s: SimSettings): SimConfig {
  return {
    simResolution: s.simResolution,
    dyeResolution: s.dyeResolution,
    velocityDissipation: s.velocityDissipation,
    dyeDissipation: s.dyeDissipation,
    pressure: s.pressure,
    pressureIterations: s.pressureIterations,
    curl: s.curl,
    splatRadius: s.splatRadius,
    shading: s.shading,
    bloom: s.bloom,
    bloomIntensity: s.bloomIntensity,
    bloomThreshold: s.bloomThreshold,
  }
}
