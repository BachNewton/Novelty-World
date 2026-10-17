import type { FeatureArt } from "../feature-art";

/** The art of the shadows' and foliage's features (see `features/shadows-and-foliage.ts`). */
export const SHADOWS_AND_FOLIAGE_ART: readonly FeatureArt[] = [
  {
    feature: "sway",
    chunks: [
      {
        kinds: ["foliage"],
        // A plant's shape is one unit tall, so its height squared bends the crown and leaves the root.
        vertex: /* glsl */ `
          #ifdef USE_INSTANCING
            vec3 hwRoot = instanceMatrix[3].xyz;
            float hwPhase = uHwTime * 1.3 + hwRoot.x * 0.21 + hwRoot.z * 0.17;
            float hwBend = position.y * position.y;
            transformed.x += sin(hwPhase) * 0.035 * hwBend;
            transformed.z += cos(hwPhase * 0.8) * 0.025 * hwBend;
          #endif
        `,
      },
    ],
  },
];
