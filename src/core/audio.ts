/**
 * Pure audio-analysis helpers for the audio-reactive mode. They work on the
 * byte frequency data an AnalyserNode produces but know nothing about Web
 * Audio, so they run (and are tested) in Node.
 */

export interface AudioFeatures {
  /** Mean energy in the bass band, 0..1. */
  bass: number
  /** Mean energy across the whole spectrum, 0..1. */
  level: number
  /** True on the frame a bass onset was detected. */
  beat: boolean
}

/** Frequency of FFT bin `i` for a given sample rate and fftSize. */
export function binFrequency(index: number, sampleRate: number, fftSize: number): number {
  return (index * sampleRate) / fftSize
}

/**
 * Average normalised magnitude (0..1) of the bins whose centre frequency
 * lies in [loHz, hiHz]. `bins` is AnalyserNode.getByteFrequencyData output
 * (fftSize / 2 entries, 0..255).
 */
export function bandEnergy(bins: ArrayLike<number>, sampleRate: number, fftSize: number, loHz: number, hiHz: number): number {
  if (bins.length === 0 || !(sampleRate > 0) || !(fftSize > 0)) return 0
  const hzPerBin = sampleRate / fftSize
  if (loHz > hiHz) [loHz, hiHz] = [hiHz, loHz]
  // Bins whose centre frequency falls inside the band; a band narrower than
  // one bin degrades to the single nearest bin.
  let lo = Math.max(0, Math.ceil(loHz / hzPerBin - 1e-9))
  let hi = Math.min(bins.length - 1, Math.floor(hiHz / hzPerBin + 1e-9))
  if (hi < lo) {
    const nearest = Math.min(bins.length - 1, Math.max(0, Math.round((loHz + hiHz) / 2 / hzPerBin)))
    lo = nearest
    hi = nearest
  }
  let sum = 0
  for (let i = lo; i <= hi; i++) sum += bins[i]
  return sum / ((hi - lo + 1) * 255)
}

export interface BeatDetectorOptions {
  /** Energy must exceed the running mean by this factor. */
  sensitivity?: number
  /** Minimum gap between beats in milliseconds. */
  cooldownMs?: number
  /** Exponential smoothing factor for the running mean (per update). */
  smoothing?: number
  /** Ignore onsets below this absolute energy (silence guard). */
  floor?: number
}

/**
 * Simple onset detector: compares the current bass energy against an
 * exponentially smoothed history and fires when it jumps above it by
 * `sensitivity`, at most once per `cooldownMs`.
 */
export class BeatDetector {
  private readonly sensitivity: number
  private readonly cooldownMs: number
  private readonly smoothing: number
  private readonly floor: number
  private mean = 0
  private primed = false
  private lastBeatAt = -Infinity

  constructor(options: BeatDetectorOptions = {}) {
    this.sensitivity = options.sensitivity ?? 1.4
    this.cooldownMs = options.cooldownMs ?? 180
    this.smoothing = options.smoothing ?? 0.9
    this.floor = options.floor ?? 0.08
  }

  /** Running mean the detector is currently comparing against. */
  get average(): number {
    return this.mean
  }

  /** Feed one energy sample; returns true when this sample is an onset. */
  update(energy: number, nowMs: number): boolean {
    const e = Number.isFinite(energy) ? Math.max(0, energy) : 0
    if (!this.primed) {
      this.mean = e
      this.primed = true
      return false
    }
    const isOnset = e > this.floor && e > this.mean * this.sensitivity && nowMs - this.lastBeatAt >= this.cooldownMs
    // Update the history AFTER the comparison so the onset itself does not mask itself.
    this.mean = this.mean * this.smoothing + e * (1 - this.smoothing)
    if (isOnset) this.lastBeatAt = nowMs
    return isOnset
  }

  reset(): void {
    this.mean = 0
    this.primed = false
    this.lastBeatAt = -Infinity
  }
}

/** Bass band used for the reactive mode, in Hz. */
export const BASS_BAND: readonly [number, number] = [40, 180]

/**
 * Turn a frame of frequency data into the features the render loop consumes.
 * Injected detector so the caller controls beat state across frames.
 */
export function analyseFrame(bins: ArrayLike<number>, sampleRate: number, fftSize: number, detector: BeatDetector, nowMs: number): AudioFeatures {
  const bass = bandEnergy(bins, sampleRate, fftSize, BASS_BAND[0], BASS_BAND[1])
  const level = bandEnergy(bins, sampleRate, fftSize, 0, sampleRate / 2)
  return { bass, level, beat: detector.update(bass, nowMs) }
}
