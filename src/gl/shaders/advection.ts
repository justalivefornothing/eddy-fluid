/**
 * Semi-Lagrangian advection. For every cell we ask "where was the material
 * that is here now one time step ago?", trace backwards along the velocity
 * and bilinearly sample the source there. Unconditionally stable because
 * we only ever interpolate existing values, never extrapolate.
 *
 * Velocity is in world units per second (short side = 1) so the back-trace
 * divides by `u_worldScale` to land in UV space. `u_decay` is the
 * pre-computed exp(-dissipation * dt), keeping the fade frame-rate
 * independent. Compiled with ADVECT_FIELD for velocity self-advection and
 * without it for dye.
 */
export const ADVECTION_SOURCE = /* glsl */ `
uniform sampler2D u_velocity;
uniform sampler2D u_source;
uniform vec2 u_velocityTexel;
uniform vec2 u_sourceTexel;
uniform vec2 u_worldScale;
uniform float u_dt;
uniform float u_decay;

void main() {
  vec2 velocity = sampleVec2(u_velocity, v_uv, u_velocityTexel);
  vec2 origin = v_uv - u_dt * velocity / u_worldScale;
#ifdef ADVECT_FIELD
  vec2 carried = sampleVec2(u_source, origin, u_sourceTexel);
  fragColor = writeVec2(carried * u_decay);
#else
  vec4 carried = sampleColor(u_source, origin, u_sourceTexel);
  fragColor = vec4(carried.rgb * u_decay, 1.0);
#endif
}
`
