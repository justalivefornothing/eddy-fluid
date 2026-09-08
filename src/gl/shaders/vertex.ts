/**
 * The single vertex program shared by every pass. We draw one oversized
 * triangle that covers clip space, so there is no index buffer and no
 * per-pass geometry. Besides the centre UV it hands the fragment stage the
 * four axis neighbours (one texel away) so the stencil passes (curl,
 * divergence, pressure, gradient) never recompute them per fragment.
 */
export const VERTEX_SOURCE = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;

uniform vec2 u_texelSize;

out vec2 v_uv;
out vec2 v_left;
out vec2 v_right;
out vec2 v_top;
out vec2 v_bottom;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  v_left = v_uv - vec2(u_texelSize.x, 0.0);
  v_right = v_uv + vec2(u_texelSize.x, 0.0);
  v_top = v_uv + vec2(0.0, u_texelSize.y);
  v_bottom = v_uv - vec2(0.0, u_texelSize.y);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`
