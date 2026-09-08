/**
 * Fragment preamble prepended to every pass. It abstracts two hardware
 * differences away from the physics code:
 *
 *  1. FIELD ENCODING. Velocity, pressure, divergence and curl are signed and
 *     unbounded, which is trivial in RGBA16F but impossible in RGBA8. When
 *     the GPU cannot render to half-float textures (`PACKED_FIELDS`) each
 *     signed component is stored as 16-bit fixed point across two bytes so
 *     the fallback keeps ~1/65534 precision instead of 8-bit steps.
 *
 *  2. INTERPOLATION. Half-float textures are only LINEAR-filterable with
 *     OES_texture_half_float_linear (absent on e.g. SwiftShader) and packed
 *     bytes can never be hardware filtered. `MANUAL_BILINEAR_FIELDS` and
 *     `MANUAL_BILINEAR_COLOR` switch the sampling helpers to a 4-tap
 *     bilinear reconstruction that decodes each tap before mixing.
 *
 * Every pass reads/writes through these helpers so the solver itself is
 * written once and stays format-agnostic.
 */
export const FIELD_RANGE = 64

export const FRAGMENT_PREAMBLE = /* glsl */ `
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
in vec2 v_left;
in vec2 v_right;
in vec2 v_top;
in vec2 v_bottom;

out vec4 fragColor;

// ---------------------------------------------------------------- encoding
#ifdef PACKED_FIELDS
const float FIELD_RANGE = ${FIELD_RANGE.toFixed(1)};
const float PACK_STEPS = 65534.0;

vec2 packUnit(float n) {
  float q = floor(clamp(n, 0.0, 1.0) * PACK_STEPS + 0.5);
  float hi = floor(q / 256.0);
  float lo = q - hi * 256.0;
  return vec2(hi, lo) / 255.0;
}

float unpackUnit(vec2 p) {
  return (floor(p.x * 255.0 + 0.5) * 256.0 + floor(p.y * 255.0 + 0.5)) / PACK_STEPS;
}

vec4 writeVec2(vec2 v) {
  vec2 n = v / (2.0 * FIELD_RANGE) + 0.5;
  return vec4(packUnit(n.x), packUnit(n.y));
}

vec2 readVec2(sampler2D s, vec2 uv) {
  vec4 p = texture(s, uv);
  return (vec2(unpackUnit(p.xy), unpackUnit(p.zw)) - 0.5) * (2.0 * FIELD_RANGE);
}

vec4 writeScalar(float x) {
  return vec4(packUnit(x / (2.0 * FIELD_RANGE) + 0.5), 0.0, 1.0);
}

float readScalar(sampler2D s, vec2 uv) {
  return (unpackUnit(texture(s, uv).xy) - 0.5) * (2.0 * FIELD_RANGE);
}
#else
vec4 writeVec2(vec2 v) { return vec4(v, 0.0, 1.0); }
vec2 readVec2(sampler2D s, vec2 uv) { return texture(s, uv).xy; }
vec4 writeScalar(float x) { return vec4(x, 0.0, 0.0, 1.0); }
float readScalar(sampler2D s, vec2 uv) { return texture(s, uv).x; }
#endif

// ---------------------------------------------------------------- sampling
// Bilinear reconstruction from texel centres; identical to hardware LINEAR
// with CLAMP_TO_EDGE but works on NEAREST-only and packed textures.
#ifdef MANUAL_BILINEAR_FIELDS
vec2 sampleVec2(sampler2D s, vec2 uv, vec2 texel) {
  vec2 st = uv / texel - 0.5;
  vec2 cell = floor(st);
  vec2 f = st - cell;
  vec2 base = (cell + 0.5) * texel;
  vec2 a = readVec2(s, base);
  vec2 b = readVec2(s, base + vec2(texel.x, 0.0));
  vec2 c = readVec2(s, base + vec2(0.0, texel.y));
  vec2 d = readVec2(s, base + texel);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
#else
vec2 sampleVec2(sampler2D s, vec2 uv, vec2 texel) { return readVec2(s, uv); }
#endif

#ifdef MANUAL_BILINEAR_COLOR
vec4 sampleColor(sampler2D s, vec2 uv, vec2 texel) {
  vec2 st = uv / texel - 0.5;
  vec2 cell = floor(st);
  vec2 f = st - cell;
  vec2 base = (cell + 0.5) * texel;
  vec4 a = texture(s, base);
  vec4 b = texture(s, base + vec2(texel.x, 0.0));
  vec4 c = texture(s, base + vec2(0.0, texel.y));
  vec4 d = texture(s, base + texel);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
#else
vec4 sampleColor(sampler2D s, vec2 uv, vec2 texel) { return texture(s, uv); }
#endif

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`
