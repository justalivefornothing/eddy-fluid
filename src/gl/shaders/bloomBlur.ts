/**
 * 3x3 binomial (tent) blur, used both to walk DOWN the bloom pyramid (each
 * level is half the size of the previous, so the tent effectively becomes
 * wider every level) and to walk back UP it with additive blending. Sampling
 * at whole source texels through `sampleColor` keeps it correct on GPUs that
 * cannot filter half-float textures.
 */
export const BLOOM_BLUR_SOURCE = /* glsl */ `
uniform sampler2D u_source;
uniform vec2 u_sourceTexel;

void main() {
  vec2 t = u_sourceTexel;
  vec3 sum = sampleColor(u_source, v_uv, t).rgb * 4.0;
  sum += sampleColor(u_source, v_uv + vec2(-t.x, 0.0), t).rgb * 2.0;
  sum += sampleColor(u_source, v_uv + vec2(t.x, 0.0), t).rgb * 2.0;
  sum += sampleColor(u_source, v_uv + vec2(0.0, -t.y), t).rgb * 2.0;
  sum += sampleColor(u_source, v_uv + vec2(0.0, t.y), t).rgb * 2.0;
  sum += sampleColor(u_source, v_uv + vec2(-t.x, -t.y), t).rgb;
  sum += sampleColor(u_source, v_uv + vec2(t.x, -t.y), t).rgb;
  sum += sampleColor(u_source, v_uv + vec2(-t.x, t.y), t).rgb;
  sum += sampleColor(u_source, v_uv + vec2(t.x, t.y), t).rgb;
  fragColor = vec4(sum / 16.0, 1.0);
}
`
