import type { FBO } from './fbo'

/**
 * One oversized triangle that covers clip space. Cheaper than a two-triangle
 * quad (no diagonal seam, no index buffer) and every pass in the pipeline
 * draws exactly this once.
 */
export class FullscreenTriangle {
  private readonly vao: WebGLVertexArrayObject
  private readonly vbo: WebGLBuffer
  private readonly gl: WebGL2RenderingContext

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
    const vao = gl.createVertexArray()
    const vbo = gl.createBuffer()
    if (!vao || !vbo) throw new Error('FullscreenTriangle: allocation failed')
    this.vao = vao
    this.vbo = vbo
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
  }

  /**
   * Render the currently bound program into `target` (null = default
   * framebuffer of the given size).
   */
  draw(target: FBO | null, fallbackWidth = 1, fallbackHeight = 1): void {
    const gl = this.gl
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
      gl.viewport(0, 0, target.width, target.height)
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, fallbackWidth, fallbackHeight)
    }
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  dispose(): void {
    this.gl.deleteBuffer(this.vbo)
    this.gl.deleteVertexArray(this.vao)
  }
}
