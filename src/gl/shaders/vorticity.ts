/**
 * Vorticity confinement (Fedkiw et al.). Numerical dissipation in the
 * advection step smears out small eddies; this pass pushes energy back into
 * them. N is the normalised gradient of |omega| (it points towards the core
 * of each vortex); the force N x omega is perpendicular to it, so it spins
 * each eddy up rather than moving it.
 *
 * Because omega is measured in texel units and no cell size is applied, the
 * result is exactly the textbook eps * h * (N x omega) with a constant eps,
 * which keeps `u_strength` resolution independent.
 */
export const VORTICITY_SOURCE = /* glsl */ `
uniform sampler2D u_velocity;
uniform sampler2D u_curl;
uniform float u_strength;
uniform float u_dt;

void main() {
  float wLeft = abs(readScalar(u_curl, v_left));
  float wRight = abs(readScalar(u_curl, v_right));
  float wBottom = abs(readScalar(u_curl, v_bottom));
  float wTop = abs(readScalar(u_curl, v_top));
  float omega = readScalar(u_curl, v_uv);

  vec2 gradient = 0.5 * vec2(wRight - wLeft, wTop - wBottom);
  vec2 n = gradient / (length(gradient) + 1e-5);
  vec2 confinement = u_strength * omega * vec2(n.y, -n.x);

  vec2 velocity = readVec2(u_velocity, v_uv) + confinement * u_dt;
  fragColor = writeVec2(velocity);
}
`
