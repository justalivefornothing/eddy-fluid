import { hsvToRgb, wrapHue, type RGB } from './color'

/**
 * A palette is a region of HSV space that splat colours are drawn from.
 * `hue` is a [start, end] arc measured in turns; when start > end the arc
 * wraps through red (e.g. [0.9, 0.1] covers magenta -> red -> orange).
 */
export interface Palette {
  readonly id: PaletteId
  readonly name: string
  /** Blurb shown in the panel. */
  readonly tagline: string
  /** UI accent colour (#rrggbb) — slider glow, active chips, focus rings. */
  readonly accent: string
  readonly hue: readonly [number, number]
  readonly saturation: readonly [number, number]
  readonly value: readonly [number, number]
}

export const PALETTE_IDS = ['spectrum', 'nebula', 'ember', 'ocean', 'mono', 'sakura', 'acid'] as const
export type PaletteId = (typeof PALETTE_IDS)[number]

export const PALETTES: Readonly<Record<PaletteId, Palette>> = {
  spectrum: {
    id: 'spectrum',
    name: 'Spectrum',
    tagline: 'full HSV cycle',
    accent: '#a78bfa',
    hue: [0, 1],
    saturation: [1, 1],
    value: [1, 1],
  },
  nebula: {
    id: 'nebula',
    name: 'Nebula',
    tagline: 'violet · magenta · deep blue',
    accent: '#c084fc',
    hue: [0.62, 0.92],
    saturation: [0.75, 1],
    value: [0.85, 1],
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    tagline: 'crimson · amber · gold',
    accent: '#fb923c',
    hue: [0.97, 0.13],
    saturation: [0.85, 1],
    value: [0.9, 1],
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    tagline: 'teal · cyan · cobalt',
    accent: '#22d3ee',
    hue: [0.45, 0.65],
    saturation: [0.7, 1],
    value: [0.8, 1],
  },
  mono: {
    id: 'mono',
    name: 'Mono',
    tagline: 'silver ink on black',
    accent: '#e5e7eb',
    hue: [0, 0],
    saturation: [0, 0],
    value: [0.45, 1],
  },
  sakura: {
    id: 'sakura',
    name: 'Sakura',
    tagline: 'blush · rose · peach',
    accent: '#f9a8d4',
    hue: [0.88, 0.04],
    saturation: [0.35, 0.7],
    value: [0.95, 1],
  },
  acid: {
    id: 'acid',
    name: 'Acid',
    tagline: 'lime · chartreuse · electric yellow',
    accent: '#a3e635',
    hue: [0.14, 0.34],
    saturation: [0.9, 1],
    value: [0.95, 1],
  },
}

export const PALETTE_LIST: readonly Palette[] = PALETTE_IDS.map((id) => PALETTES[id])

export function isPaletteId(x: unknown): x is PaletteId {
  return typeof x === 'string' && (PALETTE_IDS as readonly string[]).includes(x)
}

/** Length of a hue arc in turns, honouring wrap-around. */
export function hueSpan(p: Palette): number {
  const [a, b] = p.hue
  return b >= a ? b - a : 1 - a + b
}

/** Map a phase t in [0,1) onto the palette's hue arc. */
export function paletteHue(p: Palette, t: number): number {
  return wrapHue(p.hue[0] + wrapHue(t) * hueSpan(p))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Pick a colour from the palette at phase `t`. `u` and `w` are two extra
 * random numbers in [0,1) used for saturation and value jitter so callers
 * can inject a deterministic RNG.
 */
export function paletteColor(p: Palette, t: number, u = 0.5, w = 0.5): RGB {
  const h = paletteHue(p, t)
  const s = lerp(p.saturation[0], p.saturation[1], u)
  const v = lerp(p.value[0], p.value[1], w)
  return hsvToRgb(h, s, v)
}

/** True when the hue lies on the palette's arc (with a small tolerance). */
export function hueInPalette(p: Palette, h: number, eps = 1e-6): boolean {
  const [a, b] = p.hue
  const x = wrapHue(h)
  if (b >= a) return x >= a - eps && x <= b + eps
  return x >= a - eps || x <= b + eps
}
