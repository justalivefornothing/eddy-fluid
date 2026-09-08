import { describe, expect, it } from 'vitest'
import { BASS_BAND, BeatDetector, analyseFrame, bandEnergy, binFrequency } from './audio'

const RATE = 48000
const FFT = 1024
const BINS = FFT / 2

function spectrum(fill: (hz: number) => number): Uint8Array {
  const bins = new Uint8Array(BINS)
  for (let i = 0; i < BINS; i++) bins[i] = Math.max(0, Math.min(255, Math.round(fill(binFrequency(i, RATE, FFT)))))
  return bins
}

describe('bandEnergy', () => {
  it('reads only the requested band', () => {
    const bassOnly = spectrum((hz) => (hz >= 40 && hz <= 180 ? 255 : 0))
    expect(bandEnergy(bassOnly, RATE, FFT, BASS_BAND[0], BASS_BAND[1])).toBeGreaterThan(0.85)
    expect(bandEnergy(bassOnly, RATE, FFT, 2000, 8000)).toBe(0)
  })

  it('is normalised to 0..1 and tolerates swapped/degenerate bounds', () => {
    const full = spectrum(() => 255)
    expect(bandEnergy(full, RATE, FFT, 0, RATE / 2)).toBeCloseTo(1)
    expect(bandEnergy(full, RATE, FFT, 500, 100)).toBeCloseTo(1)
    expect(bandEnergy(new Uint8Array(0), RATE, FFT, 0, 100)).toBe(0)
    expect(bandEnergy(full, 0, FFT, 0, 100)).toBe(0)
  })
})

describe('BeatDetector', () => {
  it('fires on a bass jump, then respects the cooldown', () => {
    const d = new BeatDetector({ sensitivity: 1.4, cooldownMs: 200 })
    let t = 0
    for (let i = 0; i < 30; i++) expect(d.update(0.2, (t += 16))).toBe(false)
    expect(d.update(0.6, (t += 16))).toBe(true)
    expect(d.update(0.9, (t += 16))).toBe(false) // inside cooldown
    for (let i = 0; i < 30; i++) d.update(0.2, (t += 16))
    expect(d.update(0.7, (t += 300))).toBe(true)
  })

  it('never fires on silence or a sustained flat signal (only on the transition)', () => {
    const d = new BeatDetector()
    let t = 0
    for (let i = 0; i < 100; i++) expect(d.update(0.0, (t += 16))).toBe(false)
    // Silence -> sound is a genuine onset, exactly once...
    expect(d.update(0.5, (t += 16))).toBe(true)
    // ...and a held note never re-triggers.
    for (let i = 0; i < 100; i++) expect(d.update(0.5, (t += 16))).toBe(false)
  })

  it('ignores tiny onsets below the floor and handles NaN', () => {
    const d = new BeatDetector({ floor: 0.1 })
    d.update(0.01, 0)
    expect(d.update(0.05, 300)).toBe(false)
    expect(d.update(Number.NaN, 600)).toBe(false)
    d.reset()
    expect(d.average).toBe(0)
  })
})

describe('analyseFrame', () => {
  it('produces bass, level and beat together', () => {
    const d = new BeatDetector()
    const quiet = spectrum(() => 20)
    const kick = spectrum((hz) => (hz < 200 ? 240 : 30))
    for (let i = 0; i < 20; i++) analyseFrame(quiet, RATE, FFT, d, i * 16)
    const f = analyseFrame(kick, RATE, FFT, d, 1000)
    expect(f.bass).toBeGreaterThan(0.8)
    expect(f.level).toBeGreaterThan(0.1)
    expect(f.level).toBeLessThan(f.bass)
    expect(f.beat).toBe(true)
  })
})
