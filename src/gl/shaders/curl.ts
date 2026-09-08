/**
 * Curl (vorticity) of the 2-D velocity field: omega = dv/dx - du/dy, via
 * central differences in texel units (h = 1). Positive = anticlockwise.
 */
export const CURL_SOURCE = /* glsl */ `
uniform sampler2D u_velocity;

void main() {
  float vLeft = readVec2(u_velocity, v_left).y;
  float vRight = readVec2(u_velocity, v_right).y;
  float uBottom = readVec2(u_velocity, v_bottom).x;
  float uTop = readVec2(u_velocity, v_top).x;
  float vorticity = 0.5 * ((vRight - vLeft) - (uTop - uBottom));
  fragColor = writeScalar(vorticity);
}
`
