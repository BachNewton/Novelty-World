import type { FeatureArt } from "../feature-art";

/*
 * Caustics: the dancing web of light on the bed of shallow water, where the
 * ripples gather the sun into bright lines. A web of cell walls whose
 * points drift on their own slow circles, warped by noise and laid over a
 * second, finer web, lights the bed by the key light alone (shadows keep
 * them out), strongest a hand or two down and fading with depth as the
 * light spreads, and fading out with distance before it could shimmer.
 *
 * It lights the land itself under the water, so refraction shows it through
 * the surface; without refraction, the water's own stand-in for its bed
 * takes it instead.
 */

const HEAD = /* glsl */ `
#ifndef HW_CAUSTIC_WEB
#define HW_CAUSTIC_WEB
// How near a point is to a wall between drifting cells: 0 on the wall.
float hwCausticWalls(vec2 p, float t) {
  vec2 cell = floor(p);
  vec2 at = fract(p);
  float first = 8.0;
  float second = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 seed = vec2(hwHash(cell + g), hwHash(cell + g + 17.31));
      vec2 point = g + 0.5 + 0.38 * sin(t * (0.55 + 0.6 * seed) + 6.2831 * seed);
      float d = length(point - at);
      if (d < first) {
        second = first;
        first = d;
      } else if (d < second) {
        second = d;
      }
    }
  }
  return second - first;
}

// The caustics' brightness at a point of the bed, about 0 to 1, for a pixel covering footprint metres.
float hwCaustics(vec2 p, float t, float footprint) {
  vec2 warp = vec2(hwValueNoise(p * 0.3 + t * 0.12), hwValueNoise(p * 0.3 - t * 0.1 + 9.0)) - 0.5;
  warp += 0.5 * (vec2(hwValueNoise(p * 1.1 - t * 0.2 + 4.0), hwValueNoise(p * 1.1 + t * 0.23 + 2.0)) - 0.5);
  vec2 q = p * 0.8 + warp * 1.4;
  // The lines thin and thicken, and the light gathers brighter in some places than others.
  float width = mix(0.03, 0.11, hwValueNoise(p * 0.5 + t * 0.1));
  float bright = mix(0.45, 1.0, hwValueNoise(p * 0.21 - t * 0.07 + 5.0));
  float coarse = hwCausticWalls(q, t);
  float fine = hwCausticWalls(mat2(0.8, -0.6, 0.6, 0.8) * q * 1.7 + 3.7, t * 1.25);
  float web = exp(-coarse * coarse / (width * width)) + 0.55 * exp(-fine * fine / (width * width * 0.6));
  return min(web, 1.3) * bright * (1.0 - smoothstep(0.1, 0.3, footprint));
}

// How strongly the caustics light a bed this far down: from a hand down, fading as the light spreads.
float hwCausticDepth(float under) {
  return smoothstep(0.02, 0.2, under) * exp(-under * 0.45);
}
#endif
`;

/** The land under the water: its water table is the second of its fields. */
const LAND_LIGHT = /* glsl */ `
  float under = vFields.y - vHwWorld.y;
  float footprint = length(fwidth(vHwWorld.xz));
  if (under > 0.0) {
    hwDirect *= 1.0 + 1.6 * hwCaustics(vHwWorld.xz, uHwTime, footprint) * hwCausticDepth(under);
  }
`;

/** The water's stand-in for its bed, when it can't see the real one. */
const WATER_SURFACE = /* glsl */ `
  #ifndef HW_REFRACTION
    float footprint = length(fwidth(hwP));
    float key = dot(uHwSunLight, vec3(0.3, 0.59, 0.11)) / max(dot(hwLight, vec3(0.3, 0.59, 0.11)), 1e-3);
    hwBed *= 1.0 + 1.6 * key * hwCaustics(hwP, uHwTime, footprint) * hwCausticDepth(hwDepth);
  #endif
`;

export const CAUSTICS_ART: FeatureArt = {
  feature: "caustics",
  chunks: [
    { kinds: ["land"], fragmentHead: HEAD, light: LAND_LIGHT },
    { kinds: ["water"], fragmentHead: HEAD, surface: WATER_SURFACE },
  ],
};
