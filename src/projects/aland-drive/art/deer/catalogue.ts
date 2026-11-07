import type { ArtModel } from "../catalogue";
import { CHECKED_POSES, checkedGeometry, DEER_REACH_M, deerGeometry, placeCheckedDeer } from "./herd";
import { buildDeer, DEER_KINDS } from "./shape";

/**
 * Every kind the gallery shows at rest, near and far, and each in every gait as the herd draws it, so the LOD check
 * measures where it swaps in each pose and the herd swaps at the furthest of them.
 */
export const artModels = (): ArtModel[] => [
  ...DEER_KINDS.map((kind): ArtModel => ({ name: kind, geometries: { near: deerGeometry(buildDeer(kind, "near")), far: deerGeometry(buildDeer(kind, "far")) } })),
  ...DEER_KINDS.flatMap((kind) =>
    CHECKED_POSES.map(
      (pose): ArtModel => ({
        name: `${kind} ${pose.gait}`,
        geometries: {},
        drawn: {
          model: { near: checkedGeometry(kind, "near", pose), far: checkedGeometry(kind, "far", pose), swapM: 40, reachM: DEER_REACH_M },
          place: (version, swapM, inputs) => placeCheckedDeer(inputs, kind, version, swapM, pose),
        },
      }),
    ),
  ),
];
