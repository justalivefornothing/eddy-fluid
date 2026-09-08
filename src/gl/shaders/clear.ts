/**
 * Scales a scalar field by `u_value`. Used to warm-start the Jacobi solver:
 * last frame's pressure times the `pressure` setting is a far better initial
 * guess than zero, so fewer iterations reach the same quality.
 */
export const CLEAR_SOURCE = /* glsl */ `
uniform sampler2D u_texture;
uniform float u_value;

void main() {
  fragColor = writeScalar(readScalar(u_texture, v_uv) * u_value);
}
`
