/**
 * Resampling copy, used when the user changes sim/dye resolution so the
 * fluid that is currently on screen survives the re-allocation instead of
 * being wiped. COPY_FIELD variant goes through the encoded vec2 helpers.
 */
export const COPY_SOURCE = /* glsl */ `
uniform sampler2D u_source;
uniform vec2 u_sourceTexel;

void main() {
#ifdef COPY_FIELD
  fragColor = writeVec2(sampleVec2(u_source, v_uv, u_sourceTexel));
#else
  fragColor = sampleColor(u_source, v_uv, u_sourceTexel);
#endif
}
`
