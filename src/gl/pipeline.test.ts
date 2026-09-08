import { describe, expect, it } from 'vitest'
import { BLOOM_LEVELS, PASS_PROGRAM, RENDER_PASS_ORDER, SIM_PASS_ORDER, drawCallsPerFrame } from './pipeline'
import { FRAGMENT_NAMES, FRAGMENT_SOURCES, VERTEX_SOURCE, assembleFragment } from './shaders'

describe('pass order', () => {
  it('matches the spec: splat -> advect velocity -> curl -> vorticity -> divergence -> pressure -> gradient -> advect dye', () => {
    expect(SIM_PASS_ORDER).toEqual([
      'splat',
      'advectVelocity',
      'curl',
      'vorticity',
      'divergence',
      'clearPressure',
      'pressure',
      'gradientSubtract',
      'advectDye',
    ])
    expect(RENDER_PASS_ORDER).toEqual(['bloomPrefilter', 'bloomDownsample', 'bloomUpsample', 'bloomFinal', 'display'])
  })

  it('maps every logical pass onto a fragment program that exists', () => {
    for (const pass of [...SIM_PASS_ORDER, ...RENDER_PASS_ORDER]) {
      const program = PASS_PROGRAM[pass]
      expect(FRAGMENT_NAMES).toContain(program)
    }
  })
})

describe('shader sources', () => {
  it('ships at least the 9 distinct programs the spec names', () => {
    const required = ['splat', 'advection', 'curl', 'vorticity', 'divergence', 'pressure', 'gradientSubtract', 'bloomPrefilter', 'bloomBlur', 'bloomFinal', 'display']
    for (const name of required) expect(FRAGMENT_NAMES).toContain(name)
    expect(new Set(Object.values(FRAGMENT_SOURCES)).size).toBeGreaterThanOrEqual(9)
  })

  it('every fragment body declares main() and writes fragColor', () => {
    for (const name of FRAGMENT_NAMES) {
      const src = FRAGMENT_SOURCES[name]
      expect(src, name).toMatch(/void\s+main\s*\(\s*\)/)
      expect(src, name).toMatch(/fragColor\s*=/)
    }
  })

  it('assembles GLSL ES 3.00 shaders with the version line first and defines before the preamble', () => {
    const src = assembleFragment(FRAGMENT_SOURCES.display, ['SHADING', 'BLOOM'])
    expect(src.startsWith('#version 300 es\n')).toBe(true)
    const define = src.indexOf('#define SHADING')
    const precision = src.indexOf('precision highp float;')
    const body = src.indexOf('uniform sampler2D u_dye;')
    expect(define).toBeGreaterThan(0)
    expect(precision).toBeGreaterThan(define)
    expect(body).toBeGreaterThan(precision)
    expect(VERTEX_SOURCE.startsWith('#version 300 es')).toBe(true)
  })

  it('every stencil pass consumes the per-pass texel size through the shared varyings', () => {
    expect(VERTEX_SOURCE).toMatch(/uniform vec2 u_texelSize/)
    for (const name of ['curl', 'divergence', 'pressure', 'gradientSubtract', 'vorticity'] as const) {
      expect(FRAGMENT_SOURCES[name]).toMatch(/v_left|v_right|v_top|v_bottom/)
    }
  })
})

describe('drawCallsPerFrame', () => {
  it('counts the Jacobi loop, the fixed passes, and the bloom pyramid', () => {
    // No splats, 20 iterations, no bloom: advect, curl, vorticity, divergence, clear, 20 x jacobi, gradient, advect dye, display.
    expect(drawCallsPerFrame({ pressureIterations: 20, bloom: false }, 0)).toBe(8 + 20)
    // Each splat is two passes (velocity + dye).
    expect(drawCallsPerFrame({ pressureIterations: 20, bloom: false }, 3)).toBe(8 + 20 + 6)
    // Bloom: prefilter + (levels-1) down + (levels-1) up + final.
    expect(drawCallsPerFrame({ pressureIterations: 20, bloom: true }, 0)).toBe(8 + 20 + 1 + (BLOOM_LEVELS - 1) * 2 + 1)
  })
})
