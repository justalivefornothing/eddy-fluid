/**
 * Display: composites dye (+ bloom) to the screen or to a capture target.
 *
 * SHADING treats the dye's luminance as a height field: the gradient of the
 * four neighbours becomes a surface normal, lit by a fixed key light from
 * the top-left plus a small specular lobe. It gives the smoke a soft,
 * embossed volume without any extra simulation state.
 *
 * A hash-based ordered dither (+-0.5/255) is added before quantisation so
 * dark gradients do not band on 8-bit displays. No noise texture needed.
 */
export const DISPLAY_SOURCE = /* glsl */ `
uniform sampler2D u_dye;
uniform vec2 u_dyeTexel;
uniform sampler2D u_bloom;
uniform vec2 u_bloomTexel;

float hash21(vec2 p) {
  uvec2 q = uvec2(ivec2(p)) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  return float(n) * (1.0 / 4294967296.0);
}

void main() {
  vec3 colour = sampleColor(u_dye, v_uv, u_dyeTexel).rgb;

#ifdef SHADING
  vec2 t = u_dyeTexel;
  float hL = luma(sampleColor(u_dye, v_uv - vec2(t.x, 0.0), t).rgb);
  float hR = luma(sampleColor(u_dye, v_uv + vec2(t.x, 0.0), t).rgb);
  float hB = luma(sampleColor(u_dye, v_uv - vec2(0.0, t.y), t).rgb);
  float hT = luma(sampleColor(u_dye, v_uv + vec2(0.0, t.y), t).rgb);
  vec3 normal = normalize(vec3(hL - hR, hB - hT, 0.35));
  vec3 keyLight = normalize(vec3(-0.45, 0.6, 0.75));
  float lambert = clamp(dot(normal, keyLight), 0.0, 1.0);
  float rim = pow(lambert, 12.0);
  colour *= 0.62 + 0.38 * lambert;
  colour += colour * rim * 0.35;
#endif

#ifdef BLOOM
  colour += sampleColor(u_bloom, v_uv, u_bloomTexel).rgb;
#endif

  float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(clamp(colour + dither, 0.0, 1.0), 1.0);
}
`
