import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv, wrapHue } from './color'

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

describe('hsvToRgb', () => {
  it('maps the primary hues', () => {
    expect(hsvToRgb(0, 1, 1)).toEqual([1, 0, 0])
    expect(hsvToRgb(1 / 3, 1, 1)).toEqual([0, 1, 0])
    expect(hsvToRgb(2 / 3, 1, 1)).toEqual([0, 0, 1])
  })

  it('maps the secondary hues', () => {
    const [r, g, b] = hsvToRgb(1 / 6, 1, 1)
    expect(close(r, 1) && close(g, 1) && close(b, 0)).toBe(true)
    const cyan = hsvToRgb(0.5, 1, 1)
    expect(close(cyan[0], 0) && close(cyan[1], 1) && close(cyan[2], 1)).toBe(true)
  })

  it('zero saturation is grey at the value', () => {
    expect(hsvToRgb(0.37, 0, 0.42)).toEqual([0.42, 0.42, 0.42])
  })

  it('wraps hues outside [0,1)', () => {
    expect(hsvToRgb(1, 1, 1)).toEqual(hsvToRgb(0, 1, 1))
    expect(hsvToRgb(-1 / 3, 1, 1)).toEqual(hsvToRgb(2 / 3, 1, 1))
  })

  it('always yields components inside [0,1]', () => {
    fc.assert(
      fc.property(fc.double({ min: -5, max: 5, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (h, s, v) => {
        const rgb = hsvToRgb(h, s, v)
        return rgb.every((c) => c >= 0 && c <= 1) && close(Math.max(...rgb), v, 1e-9)
      }),
    )
  })

  it('round-trips through rgbToHsv', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 0.999, noNaN: true }),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        (h, s, v) => {
          const [h2, s2, v2] = rgbToHsv(...hsvToRgb(h, s, v))
          const hueDiff = Math.min(Math.abs(h - h2), 1 - Math.abs(h - h2))
          return hueDiff < 1e-6 && close(s, s2, 1e-6) && close(v, v2, 1e-6)
        },
      ),
    )
  })
})

describe('hex helpers', () => {
  it('parses and formats', () => {
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0])
    expect(rgbToHex([1, 128 / 255, 0])).toBe('#ff8000')
    expect(hexToRgb('nonsense')).toEqual([0, 0, 0])
  })
})

describe('wrapHue', () => {
  it('normalises into [0,1)', () => {
    expect(wrapHue(1.25)).toBeCloseTo(0.25)
    expect(wrapHue(-0.25)).toBeCloseTo(0.75)
    expect(wrapHue(2)).toBe(0)
  })
})
