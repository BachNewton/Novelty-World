/*
 * Noise for what is drawn in the sky, in three dimensions so a pattern can
 * lie on the sphere of the stars or on a moon with no seam. Several of the
 * sky's features use it, each from its own chunk, so it is guarded to be
 * declared once however many of them are on.
 */

export const SKY_NOISE_GLSL = /* glsl */ `
#ifndef HW_SKY_NOISE
#define HW_SKY_NOISE
vec4 hwSkyHash4(vec3 p) {
  vec4 q = vec4(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)), dot(p, vec3(246.1, 124.6, 311.7)));
  return fract(sin(q) * 43758.5453);
}

float hwSkyNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hwSkyHash4(i).x;
  float b = hwSkyHash4(i + vec3(1.0, 0.0, 0.0)).x;
  float c = hwSkyHash4(i + vec3(0.0, 1.0, 0.0)).x;
  float d = hwSkyHash4(i + vec3(1.0, 1.0, 0.0)).x;
  float e = hwSkyHash4(i + vec3(0.0, 0.0, 1.0)).x;
  float g = hwSkyHash4(i + vec3(1.0, 0.0, 1.0)).x;
  float h = hwSkyHash4(i + vec3(0.0, 1.0, 1.0)).x;
  float k = hwSkyHash4(i + vec3(1.0, 1.0, 1.0)).x;
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}

// A few octaves of it, each half the last.
float hwSkyFbm3(vec3 p) {
  float sum = 0.0;
  float weight = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += weight * hwSkyNoise3(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    weight *= 0.5;
  }
  return sum / 0.9375;
}
#endif
`;
