import { describe, expect, it } from 'vitest'
import { FORMAT_R16F, FORMAT_RG16F, FORMAT_RGBA16F, FORMAT_RGBA8, chooseFormatProfile, type FormatCapabilities, type TextureFormat } from './formats'

function caps(overrides: Partial<FormatCapabilities> & { renderable?: readonly TextureFormat[] }): FormatCapabilities {
  const renderable = overrides.renderable ?? [FORMAT_RGBA16F, FORMAT_RG16F, FORMAT_R16F, FORMAT_RGBA8]
  return {
    colorBufferFloat: overrides.colorBufferFloat ?? true,
    halfFloatLinear: overrides.halfFloatLinear ?? true,
    canRenderTo: overrides.canRenderTo ?? ((f) => renderable.includes(f)),
  }
}

describe('chooseFormatProfile (EXT_color_buffer_float / OES_texture_half_float_linear negotiation)', () => {
  it('uses narrow half-float formats with hardware filtering on a full-featured GPU', () => {
    const p = chooseFormatProfile(caps({}))
    expect(p.mode).toBe('half-float')
    expect(p.color).toBe(FORMAT_RGBA16F)
    expect(p.vec2).toBe(FORMAT_RG16F)
    expect(p.scalar).toBe(FORMAT_R16F)
    expect(p.colorLinear).toBe(true)
    expect(p.fieldLinear).toBe(true)
    expect(p.defines).toEqual([])
  })

  it('falls back to RGBA8 with packed 16-bit fields when EXT_color_buffer_float is missing', () => {
    const p = chooseFormatProfile(caps({ colorBufferFloat: false }))
    expect(p.mode).toBe('byte')
    expect(p.color).toBe(FORMAT_RGBA8)
    expect(p.vec2).toBe(FORMAT_RGBA8)
    expect(p.scalar).toBe(FORMAT_RGBA8)
    expect(p.defines).toContain('PACKED_FIELDS')
    expect(p.defines).toContain('MANUAL_BILINEAR_FIELDS')
    // Bytes always filter in hardware, so colour can stay LINEAR.
    expect(p.colorLinear).toBe(true)
    expect(p.fieldLinear).toBe(false)
  })

  it('falls back to RGBA8 when the extension is advertised but RGBA16F is not actually renderable', () => {
    const p = chooseFormatProfile(caps({ renderable: [FORMAT_RGBA8] }))
    expect(p.mode).toBe('byte')
    expect(p.label).toMatch(/RGBA8/)
  })

  it('switches to shader-side bilinear when OES_texture_half_float_linear is absent (SwiftShader)', () => {
    const p = chooseFormatProfile(caps({ halfFloatLinear: false }))
    expect(p.mode).toBe('half-float-nearest')
    expect(p.color).toBe(FORMAT_RGBA16F)
    expect(p.colorLinear).toBe(false)
    expect(p.fieldLinear).toBe(false)
    expect(p.defines).toEqual(['MANUAL_BILINEAR_FIELDS', 'MANUAL_BILINEAR_COLOR'])
  })

  it('widens RG16F / R16F individually when a driver refuses to render to them', () => {
    const noNarrow = chooseFormatProfile(caps({ renderable: [FORMAT_RGBA16F, FORMAT_RGBA8] }))
    expect(noNarrow.vec2).toBe(FORMAT_RGBA16F)
    expect(noNarrow.scalar).toBe(FORMAT_RGBA16F)

    const noScalar = chooseFormatProfile(caps({ renderable: [FORMAT_RGBA16F, FORMAT_RG16F, FORMAT_RGBA8] }))
    expect(noScalar.vec2).toBe(FORMAT_RG16F)
    expect(noScalar.scalar).toBe(FORMAT_RG16F)
  })

  it('formats carry the right GL enum triplets', () => {
    expect(FORMAT_RGBA16F).toMatchObject({ internalFormat: 0x881a, format: 0x1908, type: 0x140b })
    expect(FORMAT_RGBA8).toMatchObject({ internalFormat: 0x8058, format: 0x1908, type: 0x1401 })
    expect(FORMAT_RG16F.format).toBe(0x8227)
    expect(FORMAT_R16F.format).toBe(0x1903)
  })
})
