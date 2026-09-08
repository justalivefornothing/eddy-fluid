/**
 * Colour utilities shared by the simulation and the UI.
 * Pure functions only — no DOM, no WebGL, no third-party imports.
 */

export type RGB = readonly [number, number, number]

/** Wrap a hue into [0, 1). Handles negatives and values ≥ 1. */
export function wrapHue(h: number): number {
  const w = h - Math.floor(h)
  // -0 guard so tests comparing against 0 stay simple.
  return w === 0 ? 0 : w
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * HSV -> RGB. h, s, v are all in [0, 1]; the hue wraps.
 * Derived from the piecewise definition of the HSV hexcone: the chroma
 * (v * s) is distributed to two channels by a triangle wave over each
 * sixth of the hue circle, and the remaining channel receives v - chroma.
 */
export function hsvToRgb(h: number, s: number, v: number): RGB {
  const hue = wrapHue(h) * 6
  const sat = clamp01(s)
  const val = clamp01(v)
  const sector = Math.floor(hue)
  const frac = hue - sector
  const low = val * (1 - sat)
  const rising = val * (1 - sat * (1 - frac))
  const falling = val * (1 - sat * frac)
  switch (sector % 6) {
    case 0:
      return [val, rising, low]
    case 1:
      return [falling, val, low]
    case 2:
      return [low, val, rising]
    case 3:
      return [low, falling, val]
    case 4:
      return [rising, low, val]
    default:
      return [val, low, falling]
  }
}

/** RGB -> HSV, the inverse of hsvToRgb. Returns [h, s, v] in [0, 1]. */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const v = max
  const s = max === 0 ? 0 : delta / max
  if (delta === 0) return [0, s, v]
  let h: number
  if (max === r) h = (g - b) / delta
  else if (max === g) h = 2 + (b - r) / delta
  else h = 4 + (r - g) / delta
  return [wrapHue(h / 6), s, v]
}

/** Parse "#rrggbb" into normalised RGB. Returns black for malformed input. */
export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [0, 0, 0]
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function rgbToHex(rgb: RGB): string {
  const to = (x: number) =>
    Math.round(clamp01(x) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`
}

export function scaleRgb(rgb: RGB, k: number): RGB {
  return [rgb[0] * k, rgb[1] * k, rgb[2] * k]
}
