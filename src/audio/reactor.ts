import { BeatDetector, analyseFrame, type AudioFeatures } from '../core/audio'

/**
 * Microphone -> AnalyserNode -> per-frame AudioFeatures. Owns the media
 * stream and the AudioContext; `stop()` releases both so the browser's
 * recording indicator goes away immediately.
 */
export class AudioReactor {
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private bins: Uint8Array<ArrayBuffer> | null = null
  private generation = 0
  private readonly detector = new BeatDetector({ sensitivity: 1.45, cooldownMs: 160, smoothing: 0.92, floor: 0.06 })

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined'
  }

  get active(): boolean {
    return this.bins !== null
  }

  /** Ask for the microphone. Returns false when canceled; throws on a current failure. */
  async start(): Promise<boolean> {
    if (this.active) return true
    // Invalidate an earlier pending request before starting another one.
    this.stop()
    const generation = this.generation
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } })
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop())
        return false
      }

      // Take ownership immediately so failures and stop() during resume()
      // release the stream even before analysis becomes active.
      this.stream = stream
      const context = new AudioContext()
      this.context = context
      const analyser = context.createAnalyser()
      this.analyser = analyser
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.55
      context.createMediaStreamSource(stream).connect(analyser)
      if (context.state === 'suspended') await context.resume()
      if (generation !== this.generation) return false

      this.bins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
      this.detector.reset()
      return true
    } catch (error) {
      // An obsolete request must not stop a newer session or report denial.
      if (generation !== this.generation) return false
      this.stop()
      throw error
    }
  }

  /** Current features, or null when not running. Call once per frame. */
  sample(nowMs: number): AudioFeatures | null {
    const { analyser, bins, context } = this
    if (!analyser || !bins || !context) return null
    analyser.getByteFrequencyData(bins)
    return analyseFrame(bins, context.sampleRate, analyser.fftSize, this.detector, nowMs)
  }

  stop(): void {
    this.generation++
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.analyser?.disconnect()
    this.analyser = null
    this.bins = null
    void this.context?.close().catch(() => {})
    this.context = null
  }
}
