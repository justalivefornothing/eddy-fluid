import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { rgbToHsv } from './color'
import { PALETTES, PALETTE_IDS, PALETTE_LIST, hueInPalette, hueSpan, isPaletteId, paletteColor, paletteHue } from './palette'

describe('palettes', () => {
  it('defines the six named palettes plus the full spectrum', () => {
    expect(PALETTE_IDS).toEqual(['spectrum', 'nebula', 'ember', 'ocean', 'mono', 'sakura', 'acid'])
    for (const p of PALETTE_LIST) {
      expect(p.accent).toMatch(/^#[0-9a-f]{6}$/i)
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.saturation[0]).toBeLessThanOrEqual(p.saturation[1])
      expect(p.value[0]).toBeLessThanOrEqual(p.value[1])
    }
  })

  it('validates ids', () => {
    expect(isPaletteId('ember')).toBe(true)
    expect(isPaletteId('rainbow')).toBe(false)
    expect(isPaletteId(42)).toBe(false)
  })

  it('hue span handles wrap-around arcs', () => {
    expect(hueSpan(PALETTES.spectrum)).toBeCloseTo(1)
    expect(hueSpan(PALETTES.ember)).toBeCloseTo(0.16) // 0.97 -> 0.13 through red
    expect(hueSpan(PALETTES.mono)).toBe(0)
  })

  it('every generated colour lies on the palette hue arc', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PALETTE_IDS), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (id, t, u) => {
        const p = PALETTES[id]
        const rgb = paletteColor(p, t, u, 0.9)
        const [h, s] = rgbToHsv(rgb[0], rgb[1], rgb[2])
        if (s === 0) return p.saturation[1] === 0 // grey only from Mono
        return hueInPalette(p, h, 1e-4)
      }),
    )
  })

  it('paletteHue walks the arc from start to end', () => {
    expect(paletteHue(PALETTES.ocean, 0)).toBeCloseTo(0.45)
    expect(paletteHue(PALETTES.ocean, 0.999)).toBeCloseTo(0.65, 2)
    // Ember wraps through 0.
    expect(paletteHue(PALETTES.ember, 0.5)).toBeCloseTo(0.05)
  })

  it('mono is grey with the value range respected', () => {
    const rgb = paletteColor(PALETTES.mono, 0.3, 0.5, 0)
    expect(rgb[0]).toBeCloseTo(rgb[1])
    expect(rgb[1]).toBeCloseTo(rgb[2])
    expect(rgb[0]).toBeCloseTo(0.45)
  })
})
