import { ADVECTION_SOURCE } from './advection'
import { FRAGMENT_PREAMBLE } from './common'
import { BLOOM_BLUR_SOURCE } from './bloomBlur'
import { BLOOM_FINAL_SOURCE } from './bloomFinal'
import { BLOOM_PREFILTER_SOURCE } from './bloomPrefilter'
import { CLEAR_SOURCE } from './clear'
import { COPY_SOURCE } from './copy'
import { CURL_SOURCE } from './curl'
import { DISPLAY_SOURCE } from './display'
import { DIVERGENCE_SOURCE } from './divergence'
import { GRADIENT_SUBTRACT_SOURCE } from './gradientSubtract'
import { PRESSURE_SOURCE } from './pressure'
import { SPLAT_SOURCE } from './splat'
import { VORTICITY_SOURCE } from './vorticity'

export { FRAGMENT_PREAMBLE, FIELD_RANGE } from './common'
export { VERTEX_SOURCE } from './vertex'

/** Every fragment program body, keyed by pass name. */
export const FRAGMENT_SOURCES = {
  splat: SPLAT_SOURCE,
  advection: ADVECTION_SOURCE,
  curl: CURL_SOURCE,
  vorticity: VORTICITY_SOURCE,
  divergence: DIVERGENCE_SOURCE,
  pressure: PRESSURE_SOURCE,
  gradientSubtract: GRADIENT_SUBTRACT_SOURCE,
  bloomPrefilter: BLOOM_PREFILTER_SOURCE,
  bloomBlur: BLOOM_BLUR_SOURCE,
  bloomFinal: BLOOM_FINAL_SOURCE,
  display: DISPLAY_SOURCE,
  clear: CLEAR_SOURCE,
  copy: COPY_SOURCE,
} as const

export type FragmentName = keyof typeof FRAGMENT_SOURCES

export const FRAGMENT_NAMES = Object.keys(FRAGMENT_SOURCES) as FragmentName[]

/**
 * Compose a complete GLSL ES 3.00 fragment shader: version line, compile-time
 * defines (format profile + per-variant switches), the shared preamble, then
 * the pass body.
 */
export function assembleFragment(body: string, defines: readonly string[] = []): string {
  const defineBlock = defines.map((d) => `#define ${d}`).join('\n')
  return `#version 300 es\n${defineBlock}\n${FRAGMENT_PREAMBLE}\n${body}`
}
