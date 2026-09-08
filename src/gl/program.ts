/**
 * Thin shader program wrapper: compiles, links, caches uniform locations and
 * exposes typed setters that silently ignore uniforms the compiler
 * optimised away (e.g. u_bloom in a display variant without BLOOM).
 */

export class ShaderCompileError extends Error {
  constructor(stage: 'vertex' | 'fragment' | 'link', log: string, source?: string) {
    super(`${stage} shader failed:\n${log}${source ? `\n---\n${numberLines(source)}` : ''}`)
    this.name = 'ShaderCompileError'
  }
}

function numberLines(src: string): string {
  return src
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(3, ' ')}  ${line}`)
    .join('\n')
}

export function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new ShaderCompileError(type === gl.VERTEX_SHADER ? 'vertex' : 'fragment', 'createShader returned null')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'no log'
    gl.deleteShader(shader)
    throw new ShaderCompileError(type === gl.VERTEX_SHADER ? 'vertex' : 'fragment', log, source)
  }
  return shader
}

export class Program {
  readonly handle: WebGLProgram
  private readonly uniforms = new Map<string, WebGLUniformLocation>()
  private readonly gl: WebGL2RenderingContext

  constructor(gl: WebGL2RenderingContext, vertex: WebGLShader, fragmentSource: string) {
    this.gl = gl
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
    const program = gl.createProgram()
    if (!program) throw new ShaderCompileError('link', 'createProgram returned null')
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    // The fragment object can be flagged for deletion right away; it lives on inside the program.
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'no log'
      gl.deleteProgram(program)
      throw new ShaderCompileError('link', log)
    }
    this.handle = program

    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i)
      if (!info) continue
      const location = gl.getUniformLocation(program, info.name)
      if (location) this.uniforms.set(info.name, location)
    }
  }

  use(): this {
    this.gl.useProgram(this.handle)
    return this
  }

  has(name: string): boolean {
    return this.uniforms.has(name)
  }

  float(name: string, x: number): this {
    const loc = this.uniforms.get(name)
    if (loc) this.gl.uniform1f(loc, x)
    return this
  }

  vec2(name: string, x: number, y: number): this {
    const loc = this.uniforms.get(name)
    if (loc) this.gl.uniform2f(loc, x, y)
    return this
  }

  vec3(name: string, x: number, y: number, z: number): this {
    const loc = this.uniforms.get(name)
    if (loc) this.gl.uniform3f(loc, x, y, z)
    return this
  }

  /** Bind a sampler uniform to a texture unit index. */
  sampler(name: string, unit: number): this {
    const loc = this.uniforms.get(name)
    if (loc) this.gl.uniform1i(loc, unit)
    return this
  }

  dispose(): void {
    this.gl.deleteProgram(this.handle)
    this.uniforms.clear()
  }
}
