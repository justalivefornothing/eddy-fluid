/**
 * Splat: adds a Gaussian blob of `u_value` around `u_point`.
 *
 * Distances are measured in world units (short side of the viewport = 1)
 * via `u_worldScale`, so a splat is a perfect circle regardless of the
 * viewport aspect or the target texture's aspect. The same body is compiled
 * twice: with SPLAT_FIELD it accumulates a velocity impulse into an encoded
 * vec2 field, without it accumulates dye colour.
 */
export const SPLAT_SOURCE = /* glsl */ `
uniform sampler2D u_target;
uniform vec2 u_worldScale;
uniform vec2 u_point;
uniform vec3 u_value;
uniform float u_radius;

void main() {
  vec2 d = (v_uv - u_point) * u_worldScale;
  float falloff = exp(-dot(d, d) / (u_radius * u_radius));
#ifdef SPLAT_FIELD
  vec2 base = readVec2(u_target, v_uv);
  fragColor = writeVec2(base + u_value.xy * falloff);
#else
  vec3 base = texture(u_target, v_uv).rgb;
  fragColor = vec4(base + u_value * falloff, 1.0);
#endif
}
`
