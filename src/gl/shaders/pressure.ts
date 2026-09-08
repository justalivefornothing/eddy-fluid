/**
 * One Jacobi relaxation sweep of the pressure Poisson equation
 * laplacian(p) = divergence, discretised with the 5-point stencil and h = 1:
 *
 *   p = (pL + pR + pT + pB - div) / 4
 *
 * The pass is ping-ponged N times (15-40). CLAMP_TO_EDGE sampling gives the
 * Neumann boundary condition (dp/dn = 0) for free at the walls.
 */
export const PRESSURE_SOURCE = /* glsl */ `
uniform sampler2D u_pressure;
uniform sampler2D u_divergence;

void main() {
  float pLeft = readScalar(u_pressure, v_left);
  float pRight = readScalar(u_pressure, v_right);
  float pBottom = readScalar(u_pressure, v_bottom);
  float pTop = readScalar(u_pressure, v_top);
  float divergence = readScalar(u_divergence, v_uv);
  float pressure = (pLeft + pRight + pBottom + pTop - divergence) * 0.25;
  fragColor = writeScalar(pressure);
}
`
