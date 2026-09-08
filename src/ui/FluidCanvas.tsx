import { useEffect, useRef } from 'react'
import { AudioReactor } from '../audio/reactor'
import { ColorCycler, driftHue } from '../core/cycler'
import { mulberry32, randomSplat } from '../core/random'
import { canvasBackingSize } from '../core/resolution'
import { negotiateFormats } from '../gl/formats'
import { FluidSim } from '../gl/simulation'
import { PointerTracker } from '../input/pointerTracker'
import { useRuntime, type FrameStats } from '../store/runtimeStore'
import { useSettings } from '../store/settingsStore'
import { downloadCapture } from './screenshot'
import { IDLE_SPLAT_DELAY_MS, toSimConfig } from './simConfig'

const STATS_INTERVAL_MS = 500
const MAX_DPR = 2

/**
 * Owns the <canvas>, the WebGL2 context and the render loop. Everything
 * reactive (settings, presets) is read from the Zustand store inside the
 * loop or via subscribe, so this component itself never re-renders.
 */
export function FluidCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let teardown: (() => void) | null = null

    const start = (): void => {
      teardown = boot(canvas)
    }
    const onLost = (event: Event): void => {
      event.preventDefault()
      teardown?.()
      teardown = null
      useRuntime.getState().setGpuStatus('error', 'The GPU context was lost. Waiting for it to come back…')
    }
    const onRestored = (): void => start()

    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    start()

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      teardown?.()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 block h-full w-full touch-none select-none"
      aria-label="Fluid simulation. Drag to paint dye."
      role="img"
    />
  )
}

/** Create the GL context + simulation and run the loop. Returns a cleanup. */
function boot(canvas: HTMLCanvasElement): (() => void) | null {
  const runtime = useRuntime.getState()
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  })
  if (!gl) {
    runtime.setGpuStatus('unsupported')
    return null
  }

  const cssRect = canvas.getBoundingClientRect()
  const initialSize = canvasBackingSize(cssRect.width || window.innerWidth, cssRect.height || window.innerHeight, window.devicePixelRatio, MAX_DPR)
  canvas.width = initialSize.width
  canvas.height = initialSize.height

  let sim: FluidSim
  try {
    const profile = negotiateFormats(gl)
    sim = new FluidSim(gl, profile, toSimConfig(useSettings.getState().settings), canvas.width, canvas.height)
  } catch (error) {
    runtime.setGpuStatus('error', error instanceof Error ? error.message : String(error))
    return null
  }
  runtime.setGpuStatus('ready')

  const tracker = new PointerTracker()
  const rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0)
  const cycler = new ColorCycler(useSettings.getState().settings.palette, rng)
  const applyWorldScale = (): void => {
    const short = Math.min(canvas.width, canvas.height)
    tracker.setWorldScale(canvas.width / short, canvas.height / short)
  }
  applyWorldScale()

  // ------------------------------------------------------------ sizing
  const fitCanvas = (): void => {
    const rect = canvas.getBoundingClientRect()
    const size = canvasBackingSize(rect.width || window.innerWidth, rect.height || window.innerHeight, window.devicePixelRatio, MAX_DPR)
    if (size.width !== canvas.width || size.height !== canvas.height) {
      canvas.width = size.width
      canvas.height = size.height
      sim.resize(size.width, size.height)
      applyWorldScale()
    }
  }
  const observer = new ResizeObserver(() => fitCanvas())
  observer.observe(canvas)
  window.addEventListener('resize', fitCanvas)

  // ------------------------------------------------------------ input
  let lastInputAt = performance.now()
  let lastAutoAt = -Infinity

  const toUv = (event: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1)
    const y = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1)
    return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]
  }
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    canvas.setPointerCapture(event.pointerId)
    const [x, y] = toUv(event)
    tracker.down(event.pointerId, x, y, cycler.next())
    lastInputAt = performance.now()
    useSettings.getState().dismissHint()
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (!tracker.has(event.pointerId)) return
    const [x, y] = toUv(event)
    tracker.move(event.pointerId, x, y)
    lastInputAt = performance.now()
  }
  const onPointerEnd = (event: PointerEvent): void => {
    tracker.up(event.pointerId)
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerEnd)
  canvas.addEventListener('pointercancel', onPointerEnd)
  const onContextMenu = (event: Event): void => event.preventDefault()
  canvas.addEventListener('contextmenu', onContextMenu)

  // ------------------------------------------------------------ commands
  const burst = (count: number): void => {
    const strength = 5.5
    for (let i = 0; i < count; i++) {
      const s = randomSplat(rng, strength)
      sim.splat({ x: s.x, y: s.y, dx: s.dx, dy: s.dy, color: cycler.next(), radiusScale: 1.15 })
    }
  }
  // ------------------------------------------------------------ audio
  const reactor = new AudioReactor()
  /** Smoothed bass energy (0..1) that swells pointer splats while the mic is on. */
  let bassLevel = 0
  const stopAudio = (): void => {
    reactor.stop()
    bassLevel = 0
    useRuntime.getState().setAudioStatus('off')
  }
  const toggleAudio = async (): Promise<void> => {
    const rt = useRuntime.getState()
    if (reactor.active || rt.audioStatus === 'starting') {
      stopAudio()
      return
    }
    if (!AudioReactor.isSupported()) {
      rt.setAudioStatus('unsupported')
      return
    }
    rt.setAudioStatus('starting')
    try {
      await reactor.start()
      useRuntime.getState().setAudioStatus('on')
    } catch {
      reactor.stop()
      useRuntime.getState().setAudioStatus('denied')
    }
  }

  const handle = {
    randomSplats: (count?: number) => {
      burst(count ?? 4 + Math.floor(rng() * 4))
      lastInputAt = performance.now()
    },
    clear: () => {
      sim.clear()
      lastInputAt = performance.now()
    },
    screenshot: async () => {
      const capture = sim.captureFrame()
      await downloadCapture(capture)
    },
    toggleAudio,
  }
  runtime.setHandle(handle)

  // ------------------------------------------------------------ settings sync
  const unsubscribe = useSettings.subscribe((state, prev) => {
    if (state.settings !== prev.settings) {
      sim.applyConfig(toSimConfig(state.settings))
      if (state.settings.palette !== prev.settings.palette) cycler.setPalette(state.settings.palette)
    }
  })

  // ------------------------------------------------------------ loop
  burst(5)
  let raf = 0
  let last = performance.now()
  let statFrames = 0
  let statMs = 0
  let statSince = last

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    const dtMs = Math.max(0, now - last)
    last = now
    const dt = dtMs / 1000
    const state = useSettings.getState()
    const { settings, paused } = state

    sim.beginFrame()

    // Microphone: bass swells the brush, onsets fire splats of their own.
    const audio = reactor.sample(now)
    if (audio) {
      bassLevel += (audio.bass - bassLevel) * (audio.bass > bassLevel ? 0.5 : 0.08)
      if (audio.beat && !paused) {
        const count = 1 + Math.floor(audio.bass * 3)
        for (let i = 0; i < count; i++) {
          const s = randomSplat(rng, 3 + audio.bass * 6)
          sim.splat({ x: s.x, y: s.y, dx: s.dx, dy: s.dy, color: cycler.next(), radiusScale: 1.2 + audio.bass * 2.2, dyeScale: 0.8 + audio.bass * 0.6 })
        }
        lastInputAt = now
      }
    }
    const audioRadius = 1 + bassLevel * 1.6

    // Pointer strokes -> splats. Impulse is pointer speed scaled by splatForce/60.
    const strokes = tracker.drain(dt)
    if (strokes.length > 0) {
      const gain = settings.splatForce / 60
      const perSecond = 1 / Math.max(dt, 1 / 120)
      for (const stroke of strokes) {
        sim.splat({
          x: stroke.x,
          y: stroke.y,
          dx: stroke.dx * perSecond * gain,
          dy: stroke.dy * perSecond * gain,
          color: stroke.color,
          radiusScale: audioRadius,
          dyeScale: stroke.fresh ? 0.6 : 1,
        })
      }
    }
    // Long strokes slowly walk around the palette so a single drag is never flat.
    tracker.forEach((p) => tracker.setColor(p.id, driftHue(p.color, dt * 0.08, settings.palette)))

    if (settings.autoSplats && !paused && now - lastInputAt > IDLE_SPLAT_DELAY_MS && now - lastAutoAt > IDLE_SPLAT_DELAY_MS) {
      burst(3 + Math.floor(rng() * 4))
      lastAutoAt = now
    }

    if (paused) sim.flushSplats()
    else sim.step(dt)
    sim.render(null)

    statFrames++
    statMs += dtMs
    if (now - statSince >= STATS_INTERVAL_MS) {
      const s = sim.stats
      const stats: FrameStats = {
        fps: Math.round((statFrames * 1000) / Math.max(1, now - statSince)),
        frameMs: statMs / Math.max(1, statFrames),
        simWidth: s.simWidth,
        simHeight: s.simHeight,
        dyeWidth: s.dyeWidth,
        dyeHeight: s.dyeHeight,
        drawCalls: s.drawCalls,
        formatLabel: s.formatLabel,
      }
      useRuntime.getState().setStats(stats)
      statFrames = 0
      statMs = 0
      statSince = now
    }
  }
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    unsubscribe()
    observer.disconnect()
    window.removeEventListener('resize', fitCanvas)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerEnd)
    canvas.removeEventListener('pointercancel', onPointerEnd)
    canvas.removeEventListener('contextmenu', onContextMenu)
    if (useRuntime.getState().handle === handle) useRuntime.getState().setHandle(null)
    if (reactor.active) stopAudio()
    sim.dispose()
  }
}
