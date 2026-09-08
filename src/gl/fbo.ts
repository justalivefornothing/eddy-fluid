import type { TextureFormat } from './formats'

/**
 * A texture with a framebuffer wrapped around it, plus the texel size the
 * shaders need to find their neighbours. Sizes are integers in texels.
 */
export class FBO {
  readonly texture: WebGLTexture
  readonly framebuffer: WebGLFramebuffer
  readonly width: number
  readonly height: number
  readonly texelX: number
  readonly texelY: number
  readonly format: TextureFormat
  private readonly gl: WebGL2RenderingContext

  constructor(gl: WebGL2RenderingContext, width: number, height: number, format: TextureFormat, linear: boolean) {
    this.gl = gl
    this.width = Math.max(1, Math.floor(width))
    this.height = Math.max(1, Math.floor(height))
    this.texelX = 1 / this.width
    this.texelY = 1 / this.height
    this.format = format

    const texture = gl.createTexture()
    const framebuffer = gl.createFramebuffer()
    if (!texture || !framebuffer) throw new Error('FBO: failed to allocate GL objects')
    this.texture = texture
    this.framebuffer = framebuffer

    const filter = linear ? gl.LINEAR : gl.NEAREST
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, format.internalFormat, this.width, this.height, 0, format.format, format.type, null)

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.deleteTexture(texture)
      gl.deleteFramebuffer(framebuffer)
      throw new Error(`FBO: incomplete framebuffer (status 0x${status.toString(16)}) for ${format.label}`)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Bind this texture to a unit and return the unit index for the sampler uniform. */
  attach(unit: number): number {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit)
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture)
    return unit
  }

  dispose(): void {
    this.gl.deleteFramebuffer(this.framebuffer)
    this.gl.deleteTexture(this.texture)
  }
}

/**
 * Ping-pong pair. A pass reads from `read` and writes to `write`, then
 * `swap()` flips them so the next pass sees the fresh data. Textures can
 * never be sampled and rendered to at the same time, so every in-place
 * update in the solver (advect, vorticity, Jacobi, projection, splat) goes
 * through one of these.
 */
export class DoubleFBO {
  private a: FBO
  private b: FBO
  swaps = 0

  constructor(a: FBO, b: FBO) {
    this.a = a
    this.b = b
  }

  get read(): FBO {
    return this.a
  }

  get write(): FBO {
    return this.b
  }

  get width(): number {
    return this.a.width
  }

  get height(): number {
    return this.a.height
  }

  get texelX(): number {
    return this.a.texelX
  }

  get texelY(): number {
    return this.a.texelY
  }

  swap(): void {
    const t = this.a
    this.a = this.b
    this.b = t
    this.swaps++
  }

  dispose(): void {
    this.a.dispose()
    this.b.dispose()
  }
}

export function createDoubleFBO(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  format: TextureFormat,
  linear: boolean,
): DoubleFBO {
  return new DoubleFBO(new FBO(gl, width, height, format, linear), new FBO(gl, width, height, format, linear))
}
