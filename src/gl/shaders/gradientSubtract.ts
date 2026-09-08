/**
 * Projection step: subtract the pressure gradient from velocity so the
 * result is (approximately) divergence free, i.e. incompressible. Uses the
 * same central-difference stencil as the divergence pass so the two
 * operators are consistent.
 */
export const GRADIENT_SUBTRACT_SOURCE = /* glsl */ `
uniform sampler2D u_pressure;
uniform sampler2D u_velocity;

void main() {
  float pLeft = readScalar(u_pressure, v_left);
  float pRight = readScalar(u_pressure, v_right);
  float pBottom = readScalar(u_pressure, v_bottom);
  float pTop = readScalar(u_pressure, v_top);
  vec2 velocity = readVec2(u_velocity, v_uv);
  velocity -= 0.5 * vec2(pRight - pLeft, pTop - pBottom);
  fragColor = writeVec2(velocity);
}
`
