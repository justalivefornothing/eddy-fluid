import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { DYE_RESOLUTIONS, SIM_RESOLUTIONS, canvasBackingSize, computeGridSize, normalisedAspect, snapResolution, texelSize } from './resolution'

describe('normalisedAspect', () => {
  it('is always >= 1 regardless of orientation', () => {
    expect(normalisedAspect(1920, 1080)).toBeCloseTo(16 / 9)
    expect(normalisedAspect(1080, 1920)).toBeCloseTo(16 / 9)
    expect(normalisedAspect(500, 500)).toBe(1)
  })

  it('falls back to 1 for degenerate viewports', () => {
    expect(normalisedAspect(0, 100)).toBe(1)
    expect(normalisedAspect(100, -5)).toBe(1)
    expect(normalisedAspect(Number.NaN, 100)).toBe(1)
  })
})

describe('computeGridSize (FBO sizing)', () => {
  it('puts `base` cells on the short side and scales the long side by aspect', () => {
    expect(computeGridSize(256, 1920, 1080)).toEqual({ width: 455, height: 256 })
    expect(computeGridSize(256, 1080, 1920)).toEqual({ width: 256, height: 455 })
    expect(computeGridSize(128, 800, 800)).toEqual({ width: 128, height: 128 })
  })

  it('keeps the exact spec resolutions for a 16:9 landscape canvas', () => {
    for (const r of SIM_RESOLUTIONS) expect(computeGridSize(r, 1600, 900).height).toBe(r)
    for (const r of DYE_RESOLUTIONS) expect(computeGridSize(r, 1600, 900).height).toBe(r)
  })

  it('cells stay square: long/short ratio matches the viewport aspect within one cell', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 128, max: 2048 }),
        fc.integer({ min: 200, max: 5000 }),
        fc.integer({ min: 200, max: 5000 }),
        (base, w, h) => {
          const size = computeGridSize(base, w, h)
          const short = Math.min(size.width, size.height)
          const long = Math.max(size.width, size.height)
          expect(short).toBe(base)
          expect(long).toBeGreaterThanOrEqual(short)
          // Rounding the long side to an integer cell count costs at most half a cell.
          expect(Math.abs(long / short - normalisedAspect(w, h))).toBeLessThanOrEqual(0.5 / short + 1e-9)
          // Orientation is preserved (a near-square viewport may round to a square grid).
          if (size.width !== size.height) expect(size.width > size.height).toBe(w > h)
        },
      ),
    )
  })

  it('never produces a zero-sized grid', () => {
    expect(computeGridSize(0, 100, 100)).toEqual({ width: 1, height: 1 })
    expect(computeGridSize(64, 0, 0)).toEqual({ width: 64, height: 64 })
  })
})

describe('texelSize', () => {
  it('is the reciprocal of each axis (the u_texelSize uniform)', () => {
    expect(texelSize({ width: 256, height: 512 })).toEqual([1 / 256, 1 / 512])
  })
})

describe('canvasBackingSize (DPR-aware canvas sizing)', () => {
  it('multiplies CSS pixels by the device pixel ratio', () => {
    expect(canvasBackingSize(1000, 500, 2)).toEqual({ width: 2000, height: 1000 })
    expect(canvasBackingSize(1000.7, 500.2, 1)).toEqual({ width: 1000, height: 500 })
  })

  it('caps the DPR so 3x phones do not render 3x the pixels', () => {
    expect(canvasBackingSize(400, 800, 3)).toEqual({ width: 800, height: 1600 })
    expect(canvasBackingSize(400, 800, 3, 3)).toEqual({ width: 1200, height: 2400 })
  })

  it('treats a missing or tiny DPR as 1 / 0.5 and never returns 0', () => {
    expect(canvasBackingSize(300, 200, 0)).toEqual({ width: 300, height: 200 })
    expect(canvasBackingSize(300, 200, 0.1)).toEqual({ width: 150, height: 100 })
    expect(canvasBackingSize(0, 0, 2)).toEqual({ width: 1, height: 1 })
  })
})

describe('snapResolution', () => {
  it('picks the largest allowed value not above the request', () => {
    expect(snapResolution(300, SIM_RESOLUTIONS)).toBe(256)
    expect(snapResolution(512, SIM_RESOLUTIONS)).toBe(512)
    expect(snapResolution(9000, DYE_RESOLUTIONS)).toBe(2048)
  })

  it('falls back to the smallest option below the range', () => {
    expect(snapResolution(10, SIM_RESOLUTIONS)).toBe(128)
  })
})
