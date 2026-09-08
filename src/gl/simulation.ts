import type { RGB } from '../core/color'
import { computeGridSize, type GridSize } from '../core/resolution'
import { FBO, DoubleFBO, createDoubleFBO } from './fbo'
import { FORMAT_RGBA8, type FormatProfile } from './formats'
import { BLOOM_BASE_RESOLUTION, BLOOM_LEVELS, BLOOM_MIN_SIZE, type SimConfig } from './pipeline'
import { Program, compileShader } from './program'
import { FullscreenTriangle } from './quad'
import { FRAGMENT_SOURCES, VERTEX_SOURCE, assembleFragment } from './shaders'

export interface SplatRequest {
  /** Position in UV space, origin bottom-left. */
  x: number
  y: number
  /** Velocity impulse in world units per second (short side of viewport = 1). */
  dx: number
  dy: number
  color: RGB
  /** Multiplier on the configured splat radius (1 = default). */
  radiusScale?: number
  /** Multiplier on dye amount (1 = default). */
  dyeScale?: number
}

export interface CaptureResult {
  width: number
  height: number
  /** Tightly packed RGBA8, top row first (already flipped from GL order). */
  pixels: Uint8ClampedArray<ArrayBuffer>
}

export interface SimStats {
  simWidth: number
  simHeight: number
  dyeWidth: number
  dyeHeight: number
  bloomLevels: number
  formatLabel: string
  formatMode: FormatProfile['mode']
  /** Draw calls issued by the last step()+render() pair. */
  drawCalls: number
}

/** Dye deposited by a splat of unit colour at its centre. */
const DYE_STRENGTH = 0.85
/** Width of the soft knee in the bloom bright-pass, as a fraction of threshold. */
const BLOOM_KNEE = 0.6
/** Never allow a single step to integrate more than this many seconds. */
export const MAX_DT = 1 / 30

type DisplayKey = 'plain' | 'shaded' | 'bloom' | 'shaded-bloom'

interface Programs {
  splatColor: Program
  splatField: Program
  advectColor: Program
  advectField: Program
  curl: Program
  vorticity: Program
  divergence: Program
  pressure: Program
  gradientSubtract: Program
  clear: Program
  bloomPrefilter: Program
  bloomBlur: Program
  bloomFinal: Program
  copyColor: Program
  copyField: Program
  display: Record<DisplayKey, Program>
}

/**
 * The GPU stable-fluids solver. Owns every texture and program, knows
 * nothing about the DOM: it receives a context, a negotiated format profile
 * and numbers, and exposes step()/render()/capture().
 */
export class FluidSim {
  readonly profile: FormatProfile
  private readonly gl: WebGL2RenderingContext
  private readonly triangle: FullscreenTriangle
  private readonly vertex: WebGLShader
  private readonly programs: Programs

  private config: SimConfig
  private canvasWidth: number
  private canvasHeight: number
  private worldScaleX = 1
  private worldScaleY = 1

  private velocity: DoubleFBO
  private pressure: DoubleFBO
  private divergence: FBO
  private curl: FBO
  private dye: DoubleFBO
  private bloomLevels: FBO[] = []
  private bloomOut: FBO | null = null
  private capture: FBO | null = null

  private readonly queue: SplatRequest[] = []
  private drawCalls = 0
  private frameDrawCalls = 0
  private disposed = false

  constructor(gl: WebGL2RenderingContext, profile: FormatProfile, config: SimConfig, canvasWidth: number, canvasHeight: number) {
    this.gl = gl
    this.profile = profile
    this.config = { ...config }
    this.canvasWidth = Math.max(1, canvasWidth)
    this.canvasHeight = Math.max(1, canvasHeight)
    this.updateWorldScale()

    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.BLEND)
    gl.disable(gl.DITHER)

    this.triangle = new FullscreenTriangle(gl)
    this.vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE)
    this.programs = this.compilePrograms()

    const sim = this.simGrid()
    const dyeGrid = this.dyeGrid()
    this.velocity = this.allocField(sim, profile.vec2)
    this.pressure = this.allocField(sim, profile.scalar)
    this.divergence = new FBO(gl, sim.width, sim.height, profile.scalar, false)
    this.curl = new FBO(gl, sim.width, sim.height, profile.scalar, false)
    this.dye = createDoubleFBO(gl, dyeGrid.width, dyeGrid.height, profile.color, profile.colorLinear)
    this.clearColor(this.dye.read)
    this.clearColor(this.dye.write)
    this.allocBloom()
  }

  // ------------------------------------------------------------ public API

  get stats(): SimStats {
    return {
      simWidth: this.velocity.width,
      simHeight: this.velocity.height,
      dyeWidth: this.dye.width,
      dyeHeight: this.dye.height,
      bloomLevels: this.bloomLevels.length,
      formatLabel: this.profile.label,
      formatMode: this.profile.mode,
      drawCalls: this.frameDrawCalls,
    }
  }

  get settings(): Readonly<SimConfig> {
    return this.config
  }

  /** Canvas backing-store size changed. Grids are re-derived from the new aspect. */
  resize(canvasWidth: number, canvasHeight: number): void {
    if (canvasWidth === this.canvasWidth && canvasHeight === this.canvasHeight) return
    this.canvasWidth = Math.max(1, canvasWidth)
    this.canvasHeight = Math.max(1, canvasHeight)
    this.updateWorldScale()
    this.reallocateIfNeeded()
    if (this.capture) {
      this.capture.dispose()
      this.capture = null
    }
  }

  applyConfig(next: SimConfig): void {
    this.config = { ...next }
    this.reallocateIfNeeded()
  }

  /** Queue a splat; it is applied at the start of the next step(). */
  splat(request: SplatRequest): void {
    this.queue.push(request)
  }

  /** Apply queued splats immediately (used while paused so taps still show). */
  flushSplats(): void {
    this.applySplats()
  }

  /** Call once per animation frame before step()/render(); rolls the draw-call counter. */
  beginFrame(): void {
    this.frameDrawCalls = this.drawCalls
    this.drawCalls = 0
  }

  /** Advance the fluid by dt seconds (clamped to MAX_DT). */
  step(dtSeconds: number): void {
    const gl = this.gl
    const dt = Math.min(Math.max(dtSeconds, 0), MAX_DT)
    const cfg = this.config
    gl.disable(gl.BLEND)

    this.applySplats()

    const sim = this.velocity
    const simTexel = [sim.texelX, sim.texelY] as const

    // advect velocity
    this.programs.advectField
      .use()
      .vec2('u_texelSize', simTexel[0], simTexel[1])
      .vec2('u_velocityTexel', simTexel[0], simTexel[1])
      .vec2('u_sourceTexel', simTexel[0], simTexel[1])
      .vec2('u_worldScale', this.worldScaleX, this.worldScaleY)
      .float('u_dt', dt)
      .float('u_decay', Math.exp(-cfg.velocityDissipation * dt))
      .sampler('u_velocity', sim.read.attach(0))
      .sampler('u_source', 0)
    this.draw(sim.write)
    sim.swap()

    // curl
    this.programs.curl.use().vec2('u_texelSize', simTexel[0], simTexel[1]).sampler('u_velocity', sim.read.attach(0))
    this.draw(this.curl)

    // vorticity confinement
    this.programs.vorticity
      .use()
      .vec2('u_texelSize', simTexel[0], simTexel[1])
      .float('u_strength', cfg.curl)
      .float('u_dt', dt)
      .sampler('u_velocity', sim.read.attach(0))
      .sampler('u_curl', this.curl.attach(1))
    this.draw(sim.write)
    sim.swap()

    // divergence
    this.programs.divergence.use().vec2('u_texelSize', simTexel[0], simTexel[1]).sampler('u_velocity', sim.read.attach(0))
    this.draw(this.divergence)

    // warm-start pressure
    this.programs.clear
      .use()
      .vec2('u_texelSize', simTexel[0], simTexel[1])
      .float('u_value', cfg.pressure)
      .sampler('u_texture', this.pressure.read.attach(0))
    this.draw(this.pressure.write)
    this.pressure.swap()

    // Jacobi relaxation
    const jacobi = this.programs.pressure.use().vec2('u_texelSize', simTexel[0], simTexel[1])
    jacobi.sampler('u_divergence', this.divergence.attach(1))
    const iterations = Math.max(1, Math.round(cfg.pressureIterations))
    for (let i = 0; i < iterations; i++) {
      jacobi.sampler('u_pressure', this.pressure.read.attach(0))
      this.draw(this.pressure.write)
      this.pressure.swap()
    }

    // projection
    this.programs.gradientSubtract
      .use()
      .vec2('u_texelSize', simTexel[0], simTexel[1])
      .sampler('u_pressure', this.pressure.read.attach(0))
      .sampler('u_velocity', sim.read.attach(1))
    this.draw(sim.write)
    sim.swap()

    // advect dye
    const dye = this.dye
    this.programs.advectColor
      .use()
      .vec2('u_texelSize', dye.texelX, dye.texelY)
      .vec2('u_velocityTexel', simTexel[0], simTexel[1])
      .vec2('u_sourceTexel', dye.texelX, dye.texelY)
      .vec2('u_worldScale', this.worldScaleX, this.worldScaleY)
      .float('u_dt', dt)
      .float('u_decay', Math.exp(-cfg.dyeDissipation * dt))
      .sampler('u_velocity', sim.read.attach(0))
      .sampler('u_source', dye.read.attach(1))
    this.draw(dye.write)
    dye.swap()
  }

  /** Composite to the canvas (target null) or to an FBO. */
  render(target: FBO | null = null): void {
    const gl = this.gl
    const cfg = this.config
    gl.disable(gl.BLEND)

    const bloomOn = cfg.bloom && this.bloomLevels.length > 0 && this.bloomOut !== null
    if (bloomOn) this.renderBloom()

    const key: DisplayKey = cfg.shading ? (bloomOn ? 'shaded-bloom' : 'shaded') : bloomOn ? 'bloom' : 'plain'
    const program = this.programs.display[key]
      .use()
      .vec2('u_texelSize', this.dye.texelX, this.dye.texelY)
      .vec2('u_dyeTexel', this.dye.texelX, this.dye.texelY)
      .sampler('u_dye', this.dye.read.attach(0))
    if (bloomOn && this.bloomOut) {
      program.vec2('u_bloomTexel', this.bloomOut.texelX, this.bloomOut.texelY).sampler('u_bloom', this.bloomOut.attach(1))
    }
    this.draw(target)
  }

  /**
   * Render the current frame into an off-screen RGBA8 target and read it
   * back. Works without preserveDrawingBuffer because we never touch the
   * default framebuffer here.
   */
  captureFrame(): CaptureResult {
    const gl = this.gl
    if (!this.capture || this.capture.width !== this.canvasWidth || this.capture.height !== this.canvasHeight) {
      this.capture?.dispose()
      this.capture = new FBO(gl, this.canvasWidth, this.canvasHeight, FORMAT_RGBA8, false)
    }
    const target = this.capture
    this.render(target)
    const { width, height } = target
    const raw = new Uint8Array(width * height * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { width, height, pixels: flipRows(raw, width, height) }
  }

  /** Wipe all fluid state to rest. */
  clear(): void {
    this.queue.length = 0
    this.clearField(this.velocity.read)
    this.clearField(this.velocity.write)
    this.clearField(this.pressure.read)
    this.clearField(this.pressure.write)
    this.clearField(this.divergence)
    this.clearField(this.curl)
    this.clearColor(this.dye.read)
    this.clearColor(this.dye.write)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const gl = this.gl
    this.velocity.dispose()
    this.pressure.dispose()
    this.divergence.dispose()
    this.curl.dispose()
    this.dye.dispose()
    for (const level of this.bloomLevels) level.dispose()
    this.bloomOut?.dispose()
    this.capture?.dispose()
    const p = this.programs
    for (const program of [
      p.splatColor, p.splatField, p.advectColor, p.advectField, p.curl, p.vorticity, p.divergence, p.pressure,
      p.gradientSubtract, p.clear, p.bloomPrefilter, p.bloomBlur, p.bloomFinal, p.copyColor, p.copyField,
      ...Object.values(p.display),
    ]) {
      program.dispose()
    }
    gl.deleteShader(this.vertex)
    this.triangle.dispose()
  }

  // ------------------------------------------------------------- internals

  private compilePrograms(): Programs {
    const base = this.profile.defines
    const make = (body: string, extra: string[] = []) => new Program(this.gl, this.vertex, assembleFragment(body, [...base, ...extra]))
    const S = FRAGMENT_SOURCES
    return {
      splatColor: make(S.splat),
      splatField: make(S.splat, ['SPLAT_FIELD']),
      advectColor: make(S.advection),
      advectField: make(S.advection, ['ADVECT_FIELD']),
      curl: make(S.curl),
      vorticity: make(S.vorticity),
      divergence: make(S.divergence),
      pressure: make(S.pressure),
      gradientSubtract: make(S.gradientSubtract),
      clear: make(S.clear),
      bloomPrefilter: make(S.bloomPrefilter),
      bloomBlur: make(S.bloomBlur),
      bloomFinal: make(S.bloomFinal),
      copyColor: make(S.copy),
      copyField: make(S.copy, ['COPY_FIELD']),
      display: {
        plain: make(S.display),
        shaded: make(S.display, ['SHADING']),
        bloom: make(S.display, ['BLOOM']),
        'shaded-bloom': make(S.display, ['SHADING', 'BLOOM']),
      },
    }
  }

  private updateWorldScale(): void {
    const short = Math.min(this.canvasWidth, this.canvasHeight)
    this.worldScaleX = this.canvasWidth / short
    this.worldScaleY = this.canvasHeight / short
  }

  private simGrid(): GridSize {
    return computeGridSize(this.config.simResolution, this.canvasWidth, this.canvasHeight)
  }

  private dyeGrid(): GridSize {
    return computeGridSize(this.config.dyeResolution, this.canvasWidth, this.canvasHeight)
  }

  private allocField(size: GridSize, format: FormatProfile['vec2']): DoubleFBO {
    const pair = createDoubleFBO(this.gl, size.width, size.height, format, this.profile.fieldLinear)
    this.clearField(pair.read)
    this.clearField(pair.write)
    return pair
  }

  private allocBloom(): void {
    for (const level of this.bloomLevels) level.dispose()
    this.bloomOut?.dispose()
    this.bloomLevels = []
    this.bloomOut = null
    const base = computeGridSize(Math.min(BLOOM_BASE_RESOLUTION, this.config.dyeResolution / 2), this.canvasWidth, this.canvasHeight)
    let { width, height } = base
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      if (Math.min(width, height) < BLOOM_MIN_SIZE) break
      this.bloomLevels.push(new FBO(this.gl, width, height, this.profile.color, this.profile.colorLinear))
      width = Math.floor(width / 2)
      height = Math.floor(height / 2)
    }
    if (this.bloomLevels.length > 0) {
      this.bloomOut = new FBO(this.gl, base.width, base.height, this.profile.color, this.profile.colorLinear)
    }
  }

  /** Re-create any texture whose size no longer matches config/aspect, preserving contents. */
  private reallocateIfNeeded(): void {
    const sim = this.simGrid()
    const dyeGrid = this.dyeGrid()
    const { gl, profile } = this
    if (sim.width !== this.velocity.width || sim.height !== this.velocity.height) {
      this.velocity = this.resampleDouble(this.velocity, sim, profile.vec2, profile.fieldLinear, true)
      this.pressure = this.resampleDouble(this.pressure, sim, profile.scalar, false, false)
      this.divergence.dispose()
      this.curl.dispose()
      this.divergence = new FBO(gl, sim.width, sim.height, profile.scalar, false)
      this.curl = new FBO(gl, sim.width, sim.height, profile.scalar, false)
      this.clearField(this.divergence)
      this.clearField(this.curl)
    }
    if (dyeGrid.width !== this.dye.width || dyeGrid.height !== this.dye.height) {
      this.dye = this.resampleDouble(this.dye, dyeGrid, profile.color, profile.colorLinear, false, true)
    }
    const bloomBase = this.bloomLevels[0]
    const wantedBloom = computeGridSize(Math.min(BLOOM_BASE_RESOLUTION, this.config.dyeResolution / 2), this.canvasWidth, this.canvasHeight)
    if (!bloomBase || bloomBase.width !== wantedBloom.width || bloomBase.height !== wantedBloom.height) this.allocBloom()
  }

  private resampleDouble(old: DoubleFBO, size: GridSize, format: FormatProfile['vec2'], linear: boolean, vec2Field: boolean, color = false): DoubleFBO {
    const fresh = createDoubleFBO(this.gl, size.width, size.height, format, linear)
    if (color) {
      this.clearColor(fresh.read)
      this.clearColor(fresh.write)
    } else {
      this.clearField(fresh.read)
      this.clearField(fresh.write)
    }
    // Scalar fields (pressure) are cheap to re-derive; only carry vec2 velocity and dye across.
    if (vec2Field || color) {
      const program = vec2Field ? this.programs.copyField : this.programs.copyColor
      program
        .use()
        .vec2('u_texelSize', fresh.texelX, fresh.texelY)
        .vec2('u_sourceTexel', old.texelX, old.texelY)
        .sampler('u_source', old.read.attach(0))
      this.draw(fresh.write)
      fresh.swap()
    }
    old.dispose()
    return fresh
  }

  private applySplats(): void {
    if (this.queue.length === 0) return
    const sim = this.velocity
    const dye = this.dye
    const radius = this.config.splatRadius
    const field = this.programs.splatField
    const colour = this.programs.splatColor
    for (const s of this.queue) {
      const r = radius * (s.radiusScale ?? 1)
      const dyeScale = DYE_STRENGTH * (s.dyeScale ?? 1)
      field
        .use()
        .vec2('u_texelSize', sim.texelX, sim.texelY)
        .vec2('u_worldScale', this.worldScaleX, this.worldScaleY)
        .vec2('u_point', s.x, s.y)
        .vec3('u_value', s.dx, s.dy, 0)
        .float('u_radius', r)
        .sampler('u_target', sim.read.attach(0))
      this.draw(sim.write)
      sim.swap()

      colour
        .use()
        .vec2('u_texelSize', dye.texelX, dye.texelY)
        .vec2('u_worldScale', this.worldScaleX, this.worldScaleY)
        .vec2('u_point', s.x, s.y)
        .vec3('u_value', s.color[0] * dyeScale, s.color[1] * dyeScale, s.color[2] * dyeScale)
        .float('u_radius', r)
        .sampler('u_target', dye.read.attach(0))
      this.draw(dye.write)
      dye.swap()
    }
    this.queue.length = 0
  }

  private renderBloom(): void {
    const gl = this.gl
    const levels = this.bloomLevels
    const out = this.bloomOut
    if (levels.length === 0 || !out) return
    const cfg = this.config
    const top = levels[0]

    this.programs.bloomPrefilter
      .use()
      .vec2('u_texelSize', top.texelX, top.texelY)
      .vec2('u_sourceTexel', this.dye.texelX, this.dye.texelY)
      .float('u_threshold', cfg.bloomThreshold)
      .float('u_knee', cfg.bloomThreshold * BLOOM_KNEE + 1e-3)
      .sampler('u_source', this.dye.read.attach(0))
    this.draw(top)

    const blur = this.programs.bloomBlur.use()
    for (let i = 1; i < levels.length; i++) {
      const src = levels[i - 1]
      const dst = levels[i]
      blur.vec2('u_texelSize', dst.texelX, dst.texelY).vec2('u_sourceTexel', src.texelX, src.texelY).sampler('u_source', src.attach(0))
      this.draw(dst)
    }

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    for (let i = levels.length - 1; i >= 1; i--) {
      const src = levels[i]
      const dst = levels[i - 1]
      blur.vec2('u_texelSize', dst.texelX, dst.texelY).vec2('u_sourceTexel', src.texelX, src.texelY).sampler('u_source', src.attach(0))
      this.draw(dst)
    }
    gl.disable(gl.BLEND)

    // Each up-sample added a whole level, so normalise by the level count.
    this.programs.bloomFinal
      .use()
      .vec2('u_texelSize', out.texelX, out.texelY)
      .vec2('u_sourceTexel', top.texelX, top.texelY)
      .float('u_intensity', cfg.bloomIntensity / Math.max(1, levels.length - 1))
      .sampler('u_source', top.attach(0))
    this.draw(out)
  }

  private draw(target: FBO | null): void {
    this.triangle.draw(target, this.canvasWidth, this.canvasHeight)
    this.drawCalls++
  }

  private clearField(fbo: FBO): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.framebuffer)
    if (this.profile.mode === 'byte') {
      // Packed encoding of 0.0 for both 16-bit lanes: see FRAGMENT_PREAMBLE.
      gl.clearColor(127 / 255, 1, 127 / 255, 1)
    } else {
      gl.clearColor(0, 0, 0, 1)
    }
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private clearColor(fbo: FBO): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.framebuffer)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }
}

/** GL reads bottom row first; images want the top row first. */
export function flipRows(src: Uint8Array, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const stride = width * 4
  const out = new Uint8ClampedArray(new ArrayBuffer(src.length))
  for (let row = 0; row < height; row++) {
    const from = (height - 1 - row) * stride
    out.set(src.subarray(from, from + stride), row * stride)
  }
  return out
}
