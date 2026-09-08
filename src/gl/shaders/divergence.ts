/**
 * Divergence of velocity (central differences, texel units). The viewport
 * edge is a solid wall: a neighbour that falls outside the grid is replaced
 * by the mirrored centre value, so the normal component of velocity at the
 * wall is zero and fluid cannot flow out of the screen.
 */
export const DIVERGENCE_SOURCE = /* glsl */ `
uniform sampler2D u_velocity;

void main() {
  vec2 centre = readVec2(u_velocity, v_uv);
  float uLeft = readVec2(u_velocity, v_left).x;
  float uRight = readVec2(u_velocity, v_right).x;
  float vBottom = readVec2(u_velocity, v_bottom).y;
  float vTop = readVec2(u_velocity, v_top).y;

  if (v_left.x < 0.0) uLeft = -centre.x;
  if (v_right.x > 1.0) uRight = -centre.x;
  if (v_bottom.y < 0.0) vBottom = -centre.y;
  if (v_top.y > 1.0) vTop = -centre.y;

  float divergence = 0.5 * ((uRight - uLeft) + (vTop - vBottom));
  fragColor = writeScalar(divergence);
}
`
