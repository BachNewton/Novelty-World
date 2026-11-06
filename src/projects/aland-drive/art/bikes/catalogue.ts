import { rigidParts, type ArtModel } from "../catalogue";
import { BIKE_REACH_M, bikeSwapM, checkedGeometry, placeCrowdBike } from "./crowd";
import { buildBikeArt } from "./model";
import { BIKES } from "./specs";

/**
 * Every bike the gallery shows, with its rider, at both details: each part on its own pivot. And each as the crowd
 * draws it, posed, so the LOD check measures where it swaps.
 */
export const artModels = (): ArtModel[] => [
  ...BIKES.flatMap((spec) =>
    (["near", "far"] as const).map((detail) => {
      const { geometry } = buildBikeArt(spec, detail);
      const tag = geometry.getAttribute("bikeTag");
      return { name: `${spec.name} ${detail}`, geometries: rigidParts(detail, geometry, (vertex) => tag.getX(vertex)), onGround: false };
    }),
  ),
  ...BIKES.map(
    (spec): ArtModel => ({
      name: `${spec.name} riding`,
      geometries: {},
      drawn: {
        model: { near: checkedGeometry(spec, "near"), far: checkedGeometry(spec, "far"), swapM: bikeSwapM(spec), reachM: BIKE_REACH_M },
        place: (version, swapM, { sun, hazed }) => placeCrowdBike(spec, version, swapM, sun, hazed),
      },
    }),
  ),
];
