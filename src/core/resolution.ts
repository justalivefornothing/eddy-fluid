/**
 * Resolution helpers. The simulation grid always has square cells, so a
 * "resolution" of 256 means the SHORT side of the grid is 256 cells and the
 * long side is scaled by the viewport aspect ratio.
 */

export interface GridSize {
  readonly width: number
  readonly height: number
}

export const SIM_RESOLUTIONS = [128, 192, 256, 384, 512] as const
export const DYE_RESOLUTIONS = [512, 768, 1024, 1536, 2048] as const

/** Aspect ratio helper that is always >= 1 (long side / short side). */
export function normalisedAspect(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1
  const a = width / height
  return a >= 1 ? a : 1 / a
}

/**
 * Size a grid so its short side is `base` cells and cells are square.
 * The long side is rounded to the nearest integer and never below `base`.
 */
export function computeGridSize(base: number, viewportWidth: number, viewportHeight: number): GridSize {
  const short = Math.max(1, Math.round(base))
  const aspect = normalisedAspect(viewportWidth, viewportHeight)
  const long = Math.max(short, Math.round(short * aspect))
  return viewportWidth >= viewportHeight ? { width: long, height: short } : { width: short, height: long }
}

/** 1 / size for each axis — the texelSize uniform every pass consumes. */
export function texelSize(size: GridSize): readonly [number, number] {
  return [1 / size.width, 1 / size.height]
}

/**
 * Backing-store size for a canvas: CSS size × device pixel ratio, with the
 * DPR capped (a 3× phone rendering a 2048-wide dye texture is wasted work)
 * and the result floored to whole pixels and at least 1×1.
 */
export function canvasBackingSize(cssWidth: number, cssHeight: number, dpr: number, maxDpr = 2): GridSize {
  const scale = Math.min(Math.max(dpr || 1, 0.5), maxDpr)
  return {
    width: Math.max(1, Math.floor(cssWidth * scale)),
    height: Math.max(1, Math.floor(cssHeight * scale)),
  }
}

/** Pick the largest allowed resolution that does not exceed `wanted`. */
export function snapResolution(wanted: number, allowed: readonly number[]): number {
  let best = allowed[0]
  for (const r of allowed) if (r <= wanted && r > best) best = r
  return best
}
