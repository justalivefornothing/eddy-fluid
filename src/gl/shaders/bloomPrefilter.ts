/**
 * Bloom bright-pass. Keeps only the part of each pixel above `u_threshold`,
 * with a quadratic "knee" so the cut-off is a smooth curve instead of a hard
 * step (which would make the glow flicker as dye fades through it).
 */
export const BLOOM_PREFILTER_SOURCE = /* glsl */ `
uniform sampler2D u_source;
uniform vec2 u_sourceTexel;
uniform float u_threshold;
uniform float u_knee;

void main() {
  vec3 colour = sampleColor(u_source, v_uv, u_sourceTexel).rgb;
  float peak = max(colour.r, max(colour.g, colour.b));
  float soft = clamp(peak - u_threshold + u_knee, 0.0, 2.0 * u_knee);
  soft = soft * soft / (4.0 * u_knee + 1e-4);
  float keep = max(soft, peak - u_threshold) / max(peak, 1e-4);
  fragColor = vec4(colour * keep, 1.0);
}
`
