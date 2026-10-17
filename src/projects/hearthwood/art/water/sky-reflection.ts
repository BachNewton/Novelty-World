import type { FeatureArt } from "../feature-art";

/*
 * The sky mirrored: the live sky's colour along the reflected ray, from the
 * same uniforms the sky's dome is drawn from, and as much of it as water
 * really reflects: little looking straight down, nearly all at a grazing
 * look (Schlick's Fresnel, for water's index). The key light glints off
 * the ripples: the sun by day, the moon by night, each as bright as it
 * shines, a sharp core in a path of sparkles, in a broad sheen.
 */

const LIGHT = /* glsl */ `
  vec3 ray = reflect(-hwView, hwNormal);
  ray.y = abs(ray.y);
  hwReflect = hwSkyAlong(ray);
  float facing = max(dot(hwView, hwNormal), 0.0);
  hwFresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  float toKey = max(dot(ray, uHwSunDir), 0.0);
  float keyUp = smoothstep(-0.02, 0.06, uHwSunDir.y);
  // Wavelets finer than the ripples break the glint into sparkles that come and go; finer than the pixel, they average out.
  vec2 grid = hwP * 7.0 + vec2(uHwTime * 1.7, uHwTime * -1.3);
  vec2 cell = floor(grid);
  float flash = floor(uHwTime * 3.0 + hwHash(cell) * 3.0);
  vec2 spot = vec2(hwHash(cell + flash + 0.5), hwHash(cell - flash + 7.1)) * 0.6 + 0.2;
  float sparkle = step(0.75, hwHash(cell + flash)) * smoothstep(0.16, 0.05, length(fract(grid) - spot));
  sparkle = mix(0.06, sparkle, 1.0 - smoothstep(0.06, 0.2, length(fwidth(hwP))));
  hwSpecular += uHwSunLight * (40.0 * pow(toKey, 2000.0) + 220.0 * sparkle * pow(toKey, 300.0) + 0.8 * pow(toKey, 40.0)) * keyUp;
`;

export const SKY_REFLECTION_ART: FeatureArt = {
  feature: "skyReflection",
  chunks: [{ kinds: ["water"], light: LIGHT }],
};
