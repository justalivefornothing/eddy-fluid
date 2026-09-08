import { describe, expect, it } from 'vitest'
import { rgbToHsv } from './color'
import { ColorCycler, GOLDEN_STEP, driftHue } from './cycler'
import { PALETTES, hueInPalette } from './palette'
import { mulberry32 } from './random'

describe('ColorCycler (splat colour cycling)', () => {
  it('is deterministic for a seeded RNG', () => {
    const a = new ColorCycler('spectrum', mulberry32(7), 0.1)
    const b = new ColorCycler('spectrum', mulberry32(7), 0.1)
    for (let i = 0; i < 20; i++) expect(a.next()).toEqual(b.next())
  })

  it('advances the phase by the golden ratio each splat', () => {
    const c = new ColorCycler('spectrum', mulberry32(1), 0)
    c.next()
    expect(c.currentPhase).toBeCloseTo(GOLDEN_STEP)
    c.next()
    expect(c.currentPhase).toBeCloseTo((2 * GOLDEN_STEP) % 1)
  })

  it('never produces two consecutive near-identical hues', () => {
    const c = new ColorCycler('spectrum', mulberry32(3))
    let prev = rgbToHsv(...c.next())[0]
    for (let i = 0; i < 200; i++) {
      const h = rgbToHsv(...c.next())[0]
      const d = Math.min(Math.abs(h - prev), 1 - Math.abs(h - prev))
      expect(d).toBeGreaterThan(0.2)
      prev = h
    }
  })

  it('spreads hues evenly around the circle', () => {
    const c = new ColorCycler('spectrum', mulberry32(9), 0.25)
    const buckets = new Array(8).fill(0)
    for (let i = 0; i < 800; i++) {
      const h = rgbToHsv(...c.next())[0]
      buckets[Math.min(7, Math.floor(h * 8))]++
    }
    for (const n of buckets) expect(n).toBeGreaterThan(70)
  })

  it('respects the palette arc and palette switches', () => {
    const c = new ColorCycler('ocean', mulberry32(5))
    for (let i = 0; i < 100; i++) {
      const [h] = rgbToHsv(...c.next())
      expect(hueInPalette(PALETTES.ocean, h, 1e-4)).toBe(true)
    }
    c.setPalette('ember')
    expect(c.paletteId).toBe('ember')
    for (let i = 0; i < 100; i++) {
      const [h, s] = rgbToHsv(...c.next())
      expect(s).toBeGreaterThan(0.8)
      expect(hueInPalette(PALETTES.ember, h, 1e-4)).toBe(true)
    }
  })

  it('at() previews without advancing', () => {
    const c = new ColorCycler('acid', mulberry32(2), 0.5)
    const before = c.currentPhase
    c.at(0.1)
    expect(c.currentPhase).toBe(before)
  })
})

describe('driftHue', () => {
  it('stays inside the palette arc after many small drifts', () => {
    const c = new ColorCycler('sakura', mulberry32(11))
    let colour = c.next()
    for (let i = 0; i < 500; i++) {
      colour = driftHue(colour, 0.01, 'sakura')
      const [h, s] = rgbToHsv(...colour)
      if (s > 1e-6) expect(hueInPalette(PALETTES.sakura, h, 1e-3)).toBe(true)
    }
  })

  it('leaves grey alone for Mono', () => {
    expect(driftHue([0.6, 0.6, 0.6], 0.3, 'mono')).toEqual([0.6, 0.6, 0.6])
  })
})
