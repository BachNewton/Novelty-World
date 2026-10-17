import { Color } from "three";
import type { FeatureArt } from "../feature-art";
import { smooth } from "../light/sun";
import { SKY_NOISE_GLSL } from "./sky-noise";
import { skyColours } from "./tokens";

/*
 * The stars (`stars`): a field fixed to the sphere of the stars, which turns
 * round the celestial pole as the night goes on (the engine's celestial
 * frame, `uCelestial`). The sphere is cut into cells over the faces of a
 * cube, each holding one star at a seeded spot with a seeded brightness, as
 * many faint ones and few bright ones as the real sky has.
 *
 * Each star is drawn as a small soft spot never narrower than a pixel and
 * carrying the same light however wide it is drawn, worked out exactly at
 * every pixel rather than sampled, so the field holds still as the camera
 * turns, with no twinkle or shimmer. A star shows only once it is brighter
 * than the sky behind it, so the brightest come out first as dusk deepens,
 * the darkest part of the sky fills first, and none show in the glow of a
 * midsummer night.
 */

const uniforms = {
  uHwStarWarm: { value: new Color() },
  uHwStarCool: { value: new Color() },
  /** How far the night has come for the stars: none while the sun is up. */
  uHwStarsShow: { value: 0 },
};

/** Cells along each side of each of the cube's faces. */
const CELLS = 80;

const HEAD = /* glsl */ `
uniform vec3 uHwStarWarm;
uniform vec3 uHwStarCool;
uniform float uHwStarsShow;
${SKY_NOISE_GLSL}

// The middle of a cell on a cube face, as a direction.
vec3 hwStarCell(float face, vec2 uv) {
  float side = mod(face, 2.0) < 0.5 ? 1.0 : -1.0;
  if (face < 1.5) return normalize(vec3(side, uv));
  if (face < 3.5) return normalize(vec3(uv.x, side, uv.y));
  return normalize(vec3(uv, side));
}
`;

const COLOUR = /* glsl */ `
  vec3 dir = normalize(vHwWorld - cameraPosition);
  if (uHwStarsShow > 0.0 && dir.y > -0.02) {
    vec3 c = dir * uCelestial;
    vec3 a = abs(c);
    float face;
    vec2 uv;
    if (a.x >= a.y && a.x >= a.z) { face = c.x > 0.0 ? 0.0 : 1.0; uv = c.yz / a.x; }
    else if (a.y >= a.z) { face = c.y > 0.0 ? 2.0 : 3.0; uv = c.xz / a.y; }
    else { face = c.z > 0.0 ? 4.0 : 5.0; uv = c.xy / a.z; }
    vec2 grid = (uv * 0.5 + 0.5) * ${CELLS}.0;
    vec2 cell = floor(grid);
    vec4 h = hwSkyHash4(vec3(cell, face * 17.0 + 3.0));
    vec2 spot = (cell + 0.22 + 0.56 * h.xy) / ${CELLS}.0 * 2.0 - 1.0;
    float apart = length(c - hwStarCell(face, spot));
    // As many faint stars and as few bright ones as the real sky has: each magnitude brighter is about three times rarer.
    float magnitude = 6.4 + 2.1 * log(max(h.z, 1e-5)) / log(10.0);
    float light = pow(10.0, -0.4 * magnitude);
    // Never narrower than a pixel, and the same light however wide.
    float width = max(0.00012, uSkyPixel * 0.75);
    float spotLight = exp(-apart * apart / (2.0 * width * width)) / (width * width);
    float behind = dot(hwColour, vec3(0.2126, 0.7152, 0.0722));
    float shows = smoothstep(0.6, 2.0, light * 3.0 / (behind + 0.002));
    float low = smoothstep(-0.02, 0.22, dir.y);
    vec3 tint = mix(uHwStarCool, uHwStarWarm, h.w * h.w);
    hwColour += tint * light * spotLight * 2.0e-6 * shows * low * uHwStarsShow;
  }
`;

export const STARS_ART: FeatureArt = {
  feature: "stars",
  uniforms,
  chunks: [{ kinds: ["sky"], fragmentHead: HEAD, colour: COLOUR }],
  frame: ({ day }) => {
    const colours = skyColours();
    uniforms.uHwStarWarm.value.copy(colours["star-warm"]);
    uniforms.uHwStarCool.value.copy(colours["star-cool"]);
    uniforms.uHwStarsShow.value = 1 - smooth(-8, -3, day.sky.sun.elevation);
  },
};
