/**
 * Bloom finalise: scales the accumulated pyramid by intensity and applies a
 * gentle Reinhard-style roll-off so hot cores glow instead of clipping to
 * flat white. The display pass adds the result on top of the dye.
 */
export const BLOOM_FINAL_SOURCE = /* glsl */ `
uniform sampler2D u_source;
uniform vec2 u_sourceTexel;
uniform float u_intensity;

void main() {
  vec3 glow = sampleColor(u_source, v_uv, u_sourceTexel).rgb * u_intensity;
  glow = glow / (1.0 + glow * 0.4);
  fragColor = vec4(glow, 1.0);
}
`
