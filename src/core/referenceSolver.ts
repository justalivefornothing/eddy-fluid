/**
 * CPU reference implementation of the exact discretisation the GLSL passes
 * use (central differences in texel units, 5-point Jacobi, bilinear
 * semi-Lagrangian back-trace, mirrored-normal walls). It exists so the
 * numerical scheme can be unit-tested and benchmarked in Node, where there
 * is no GPU, and so a reader can follow the maths in plain TypeScript.
 *
 * Layout: row-major Float32Arrays, index = y * width + x, origin bottom-left
 * to match texture space. Velocity is interleaved (u, v).
 */

export interface ReferenceConfig {
  width: number
  height: number
  velocityDissipation: number
  dyeDissipation: number
  pressure: number
  pressureIterations: number
  curl: number
}

export class ReferenceFluid {
  readonly width: number
  readonly height: number
  velocity: Float32Array
  private velocityBack: Float32Array
  dye: Float32Array
  private dyeBack: Float32Array
  pressure: Float32Array
  private pressureBack: Float32Array
  readonly divergence: Float32Array
  readonly curl: Float32Array
  config: ReferenceConfig

  constructor(config: ReferenceConfig) {
    this.config = { ...config }
    this.width = config.width
    this.height = config.height
    const cells = this.width * this.height
    this.velocity = new Float32Array(cells * 2)
    this.velocityBack = new Float32Array(cells * 2)
    this.dye = new Float32Array(cells * 3)
    this.dyeBack = new Float32Array(cells * 3)
    this.pressure = new Float32Array(cells)
    this.pressureBack = new Float32Array(cells)
    this.divergence = new Float32Array(cells)
    this.curl = new Float32Array(cells)
  }

  private idx(x: number, y: number): number {
    const cx = x < 0 ? 0 : x >= this.width ? this.width - 1 : x
    const cy = y < 0 ? 0 : y >= this.height ? this.height - 1 : y
    return cy * this.width + cx
  }

  /** Gaussian splat in texel units. */
  splat(cx: number, cy: number, dx: number, dy: number, color: readonly [number, number, number], radiusTexels: number): void {
    const r2 = radiusTexels * radiusTexels
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const ox = x + 0.5 - cx
        const oy = y + 0.5 - cy
        const g = Math.exp(-(ox * ox + oy * oy) / r2)
        const i = y * this.width + x
        this.velocity[i * 2] += dx * g
        this.velocity[i * 2 + 1] += dy * g
        this.dye[i * 3] += color[0] * g
        this.dye[i * 3 + 1] += color[1] * g
        this.dye[i * 3 + 2] += color[2] * g
      }
    }
  }

  /** Bilinear sample of a `stride`-component field at continuous texel coords. */
  private sample(field: Float32Array, stride: number, sx: number, sy: number, out: Float32Array): void {
    const fx = sx - 0.5
    const fy = sy - 0.5
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const i00 = this.idx(x0, y0) * stride
    const i10 = this.idx(x0 + 1, y0) * stride
    const i01 = this.idx(x0, y0 + 1) * stride
    const i11 = this.idx(x0 + 1, y0 + 1) * stride
    for (let c = 0; c < stride; c++) {
      const a = field[i00 + c] + (field[i10 + c] - field[i00 + c]) * tx
      const b = field[i01 + c] + (field[i11 + c] - field[i01 + c]) * tx
      out[c] = a + (b - a) * ty
    }
  }

  advectVelocity(dt: number): void {
    const decay = Math.exp(-this.config.velocityDissipation * dt)
    const tmp = new Float32Array(2)
    const { width, height, velocity, velocityBack } = this
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 2
        const sx = x + 0.5 - dt * velocity[i]
        const sy = y + 0.5 - dt * velocity[i + 1]
        this.sample(velocity, 2, sx, sy, tmp)
        velocityBack[i] = tmp[0] * decay
        velocityBack[i + 1] = tmp[1] * decay
      }
    }
    this.swapVelocity()
  }

  computeCurl(): void {
    const { width, height, velocity, curl } = this
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const vL = velocity[this.idx(x - 1, y) * 2 + 1]
        const vR = velocity[this.idx(x + 1, y) * 2 + 1]
        const uB = velocity[this.idx(x, y - 1) * 2]
        const uT = velocity[this.idx(x, y + 1) * 2]
        curl[y * width + x] = 0.5 * (vR - vL - (uT - uB))
      }
    }
  }

  applyVorticity(dt: number): void {
    const { width, height, velocity, curl } = this
    const strength = this.config.curl
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const gx = 0.5 * (Math.abs(curl[this.idx(x + 1, y)]) - Math.abs(curl[this.idx(x - 1, y)]))
        const gy = 0.5 * (Math.abs(curl[this.idx(x, y + 1)]) - Math.abs(curl[this.idx(x, y - 1)]))
        const len = Math.hypot(gx, gy) + 1e-5
        const w = curl[y * width + x]
        const i = (y * width + x) * 2
        velocity[i] += strength * w * (gy / len) * dt
        velocity[i + 1] += strength * w * (-gx / len) * dt
      }
    }
  }

  computeDivergence(): void {
    const { width, height, velocity, divergence } = this
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 2
        const cu = velocity[i]
        const cv = velocity[i + 1]
        const uL = x === 0 ? -cu : velocity[(y * width + x - 1) * 2]
        const uR = x === width - 1 ? -cu : velocity[(y * width + x + 1) * 2]
        const vB = y === 0 ? -cv : velocity[((y - 1) * width + x) * 2 + 1]
        const vT = y === height - 1 ? -cv : velocity[((y + 1) * width + x) * 2 + 1]
        divergence[y * width + x] = 0.5 * (uR - uL + vT - vB)
      }
    }
  }

  solvePressure(): void {
    const { width, height, divergence } = this
    const warm = this.config.pressure
    for (let i = 0; i < this.pressure.length; i++) this.pressure[i] *= warm
    for (let it = 0; it < this.config.pressureIterations; it++) {
      const p = this.pressure
      const next = this.pressureBack
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const L = p[this.idx(x - 1, y)]
          const R = p[this.idx(x + 1, y)]
          const B = p[this.idx(x, y - 1)]
          const T = p[this.idx(x, y + 1)]
          next[y * width + x] = (L + R + B + T - divergence[y * width + x]) * 0.25
        }
      }
      this.pressureBack = p
      this.pressure = next
    }
  }

  subtractGradient(): void {
    const { width, height, velocity, pressure } = this
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const L = pressure[this.idx(x - 1, y)]
        const R = pressure[this.idx(x + 1, y)]
        const B = pressure[this.idx(x, y - 1)]
        const T = pressure[this.idx(x, y + 1)]
        const i = (y * width + x) * 2
        velocity[i] -= 0.5 * (R - L)
        velocity[i + 1] -= 0.5 * (T - B)
      }
    }
  }

  advectDye(dt: number): void {
    const decay = Math.exp(-this.config.dyeDissipation * dt)
    const tmp = new Float32Array(3)
    const { width, height, velocity, dye, dyeBack } = this
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const vi = (y * width + x) * 2
        const sx = x + 0.5 - dt * velocity[vi]
        const sy = y + 0.5 - dt * velocity[vi + 1]
        this.sample(dye, 3, sx, sy, tmp)
        const di = (y * width + x) * 3
        dyeBack[di] = tmp[0] * decay
        dyeBack[di + 1] = tmp[1] * decay
        dyeBack[di + 2] = tmp[2] * decay
      }
    }
    const t = this.dye
    this.dye = this.dyeBack
    this.dyeBack = t
  }

  /** One full frame in the same order as the GPU pipeline. */
  step(dt: number): void {
    this.advectVelocity(dt)
    this.computeCurl()
    this.applyVorticity(dt)
    this.computeDivergence()
    this.solvePressure()
    this.subtractGradient()
    this.advectDye(dt)
  }

  /** Root-mean-square divergence of the current velocity field. */
  rmsDivergence(): number {
    this.computeDivergence()
    let sum = 0
    for (let i = 0; i < this.divergence.length; i++) sum += this.divergence[i] * this.divergence[i]
    return Math.sqrt(sum / this.divergence.length)
  }

  totalDye(): number {
    let sum = 0
    for (let i = 0; i < this.dye.length; i++) sum += this.dye[i]
    return sum
  }

  kineticEnergy(): number {
    let sum = 0
    for (let i = 0; i < this.velocity.length; i++) sum += this.velocity[i] * this.velocity[i]
    return 0.5 * sum
  }

  private swapVelocity(): void {
    const t = this.velocity
    this.velocity = this.velocityBack
    this.velocityBack = t
  }
}
