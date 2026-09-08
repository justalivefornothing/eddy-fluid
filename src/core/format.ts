/**
 * Number formatting for slider read-outs. Picks the number of decimals from
 * the slider's step so 0.01-step knobs show two places and integer knobs
 * show none.
 */
export function formatNumber(value: number, step: number): string {
  if (!Number.isFinite(value)) return '—'
  const decimals = step >= 1 || step <= 0 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)))
  return value.toFixed(decimals)
}
