import { type RGB, hsvToRgb, rgbToHsv, wrapHue } from './color'
import { PALETTES, type Palette, type PaletteId, paletteColor } from './palette'

export type Rng = () => number

/**
 * Golden-ratio conjugate. Stepping the hue phase by this amount produces
 * the most evenly spread sequence of colours for any number of samples,
 * so two fingers landing one after another never get near-identical dye.
 */
export const GOLDEN_STEP = 0.618033988749895

/**
 * Produces the stream of splat colours. The phase walks around the palette's
 * hue arc in golden-ratio steps; saturation and value are jittered inside the
 * palette's ranges with the injected RNG so unit tests are deterministic.
 */
export class ColorCycler {
  private phase: number
  private palette: Palette
  private readonly rng: Rng

  constructor(paletteId: PaletteId = 'spectrum', rng: Rng = Math.random, startPhase?: number) {
    this.palette = PALETTES[paletteId]
    this.rng = rng
    this.phase = startPhase ?? rng()
  }

  get paletteId(): PaletteId {
    return this.palette.id
  }

  setPalette(id: PaletteId): void {
    this.palette = PALETTES[id]
  }

  /** Current phase in [0,1). */
  get currentPhase(): number {
    return this.phase
  }

  /** Advance the cycle and return the next splat colour. */
  next(): RGB {
    this.phase = wrapHue(this.phase + GOLDEN_STEP)
    return paletteColor(this.palette, this.phase, this.rng(), this.rng())
  }

  /** Peek at what colour a given phase would produce, without advancing. */
  at(phase: number): RGB {
    return paletteColor(this.palette, phase, 0.5, 0.5)
  }
}

/**
 * Slowly rotate a colour's hue by `turns` (fraction of a full circle) while
 * keeping it inside the palette arc. Used to make a long drag stroke shift
 * hue gradually instead of staying flat.
 */
export function driftHue(color: RGB, turns: number, paletteId: PaletteId): RGB {
  const p = PALETTES[paletteId]
  const [h, s, v] = rgbToHsv(color[0], color[1], color[2])
  // Mono has no hue to drift; keep value drift only.
  if (p.saturation[1] === 0) return color
  const [a, b] = p.hue
  const span = b >= a ? b - a : 1 - a + b
  if (span >= 1 - 1e-9) return hsvToRgb(wrapHue(h + turns), s, v)
  // Position along the arc, bounce inside it so we never leave the palette.
  let local = wrapHue(h - a)
  if (local > span) local = span // hue drifted outside (shouldn't happen) — clamp
  const period = span * 2
  let x = (local + turns) % period
  if (x < 0) x += period
  const bounced = x <= span ? x : period - x
  return hsvToRgb(wrapHue(a + bounced), s, v)
}
