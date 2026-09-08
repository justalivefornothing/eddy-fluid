/**
 * Texture format negotiation.
 *
 * WebGL2 guarantees very little about floating point render targets:
 *  - rendering INTO RGBA16F/RG16F/R16F needs EXT_color_buffer_float
 *    (some ANGLE/D3D stacks expose the extension but still fail the FBO
 *    completeness check for RG/R, so every format is probed for real);
 *  - LINEAR filtering of half-float textures is core in WebGL2 (the WebGL1
 *    extension OES_texture_half_float_linear was promoted), but the decision
 *    tree still carries a `halfFloatLinear` flag so the 4-tap shader-side
 *    bilinear path is exercised by tests and stays available for a WebGL1
 *    or buggy-driver future;
 *  - RGBA8 always works, always filters, but is unsigned 8-bit.
 *
 * `chooseFormatProfile` is a pure function of the observed capabilities so
 * the decision tree is unit-tested without a GPU; `negotiateFormats` feeds
 * it the answers from a live context.
 */

export interface TextureFormat {
  readonly internalFormat: number
  readonly format: number
  readonly type: number
  readonly label: string
}

export type FormatMode = 'half-float' | 'half-float-nearest' | 'byte'

export interface FormatProfile {
  readonly mode: FormatMode
  /** Format for dye / bloom colour targets. */
  readonly color: TextureFormat
  /** Format for the vec2 velocity field. */
  readonly vec2: TextureFormat
  /** Format for scalar fields (pressure, divergence, curl). */
  readonly scalar: TextureFormat
  /** Hardware LINEAR filtering allowed on colour textures. */
  readonly colorLinear: boolean
  /** Hardware LINEAR filtering allowed on field textures. */
  readonly fieldLinear: boolean
  /** Compile-time switches for the fragment preamble. */
  readonly defines: readonly string[]
  /** Human readable summary for the HUD / README. */
  readonly label: string
}

export interface FormatCapabilities {
  /** EXT_color_buffer_float present. */
  readonly colorBufferFloat: boolean
  /** OES_texture_half_float_linear present. */
  readonly halfFloatLinear: boolean
  /** Returns true when a texture of the given format is renderable. */
  readonly canRenderTo: (format: TextureFormat) => boolean
}

// Numeric GL constants, spelled out so this module has no GL dependency.
const GL_RGBA = 0x1908
const GL_RG = 0x8227
const GL_RED = 0x1903
const GL_UNSIGNED_BYTE = 0x1401
const GL_HALF_FLOAT = 0x140b
const GL_RGBA8 = 0x8058
const GL_RGBA16F = 0x881a
const GL_RG16F = 0x822f
const GL_R16F = 0x822d

export const FORMAT_RGBA16F: TextureFormat = { internalFormat: GL_RGBA16F, format: GL_RGBA, type: GL_HALF_FLOAT, label: 'RGBA16F' }
export const FORMAT_RG16F: TextureFormat = { internalFormat: GL_RG16F, format: GL_RG, type: GL_HALF_FLOAT, label: 'RG16F' }
export const FORMAT_R16F: TextureFormat = { internalFormat: GL_R16F, format: GL_RED, type: GL_HALF_FLOAT, label: 'R16F' }
export const FORMAT_RGBA8: TextureFormat = { internalFormat: GL_RGBA8, format: GL_RGBA, type: GL_UNSIGNED_BYTE, label: 'RGBA8' }

export function chooseFormatProfile(caps: FormatCapabilities): FormatProfile {
  const halfFloatRenderable = caps.colorBufferFloat && caps.canRenderTo(FORMAT_RGBA16F)

  if (!halfFloatRenderable) {
    return {
      mode: 'byte',
      color: FORMAT_RGBA8,
      vec2: FORMAT_RGBA8,
      scalar: FORMAT_RGBA8,
      colorLinear: true,
      fieldLinear: false,
      defines: ['PACKED_FIELDS', 'MANUAL_BILINEAR_FIELDS'],
      label: 'RGBA8 · packed 16-bit fields',
    }
  }

  // Prefer the narrow formats (half the bandwidth) but fall back to RGBA16F
  // individually when a driver refuses to render to them.
  const vec2 = caps.canRenderTo(FORMAT_RG16F) ? FORMAT_RG16F : FORMAT_RGBA16F
  const scalar = caps.canRenderTo(FORMAT_R16F) ? FORMAT_R16F : vec2

  if (caps.halfFloatLinear) {
    return {
      mode: 'half-float',
      color: FORMAT_RGBA16F,
      vec2,
      scalar,
      colorLinear: true,
      fieldLinear: true,
      defines: [],
      label: `${FORMAT_RGBA16F.label}/${vec2.label}/${scalar.label} · linear`,
    }
  }

  return {
    mode: 'half-float-nearest',
    color: FORMAT_RGBA16F,
    vec2,
    scalar,
    colorLinear: false,
    fieldLinear: false,
    defines: ['MANUAL_BILINEAR_FIELDS', 'MANUAL_BILINEAR_COLOR'],
    label: `${FORMAT_RGBA16F.label}/${vec2.label}/${scalar.label} · shader bilinear`,
  }
}

/**
 * Query a live WebGL2 context. Each candidate format is verified by
 * attaching a tiny texture to a framebuffer and checking completeness,
 * because extension strings alone lie on some ANGLE backends.
 */
export function negotiateFormats(gl: WebGL2RenderingContext): FormatProfile {
  const colorBufferFloat = gl.getExtension('EXT_color_buffer_float') !== null
  // OES_texture_half_float_linear is a WebGL1 extension that WebGL2 promoted
  // to core: every 16F format is texture-filterable in GLES 3.0, so most
  // WebGL2 implementations (ANGLE/D3D11, SwiftShader) do not even list the
  // string. Treat the extension as present on any WebGL2 context and only
  // consult the string as a belt-and-braces signal (32F linear stays optional).
  const halfFloatLinear = isWebGL2(gl) || gl.getExtension('OES_texture_half_float_linear') !== null

  const canRenderTo = (fmt: TextureFormat): boolean => {
    const texture = gl.createTexture()
    const framebuffer = gl.createFramebuffer()
    if (!texture || !framebuffer) return false
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, 4, 4, 0, fmt.format, fmt.type, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE && gl.getError() === gl.NO_ERROR
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.deleteFramebuffer(framebuffer)
    gl.deleteTexture(texture)
    return ok
  }

  return chooseFormatProfile({ colorBufferFloat, halfFloatLinear, canRenderTo })
}

/** True for a genuine WebGL2 context (as opposed to a WebGL1 context typed loosely). */
export function isWebGL2(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  return typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
}
