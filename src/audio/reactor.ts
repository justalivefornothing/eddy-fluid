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
  private readonly detector = new BeatDetector({ sensitivity: 1.45, cooldownMs: 160, smoothing: 0.92, floor: 0.06 })

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined'
  }

  get active(): boolean {
    return this.analyser !== null
  }

  /** Ask for the microphone and start analysing. Throws on denial. */
  async start(): Promise<void> {
    if (this.active) return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } })
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.55
    context.createMediaStreamSource(stream).connect(analyser)
    if (context.state === 'suspended') await context.resume()
    this.stream = stream
    this.context = context
    this.analyser = analyser
    this.bins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
    this.detector.reset()
  }

  /** Current features, or null when not running. Call once per frame. */
  sample(nowMs: number): AudioFeatures | null {
    const { analyser, bins, context } = this
    if (!analyser || !bins || !context) return null
    analyser.getByteFrequencyData(bins)
    return analyseFrame(bins, context.sampleRate, analyser.fftSize, this.detector, nowMs)
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.analyser?.disconnect()
    this.analyser = null
    this.bins = null
    void this.context?.close().catch(() => {})
    this.context = null
  }
}
