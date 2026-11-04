import { rigidParts, type ArtModel } from "../catalogue";
import { buildBikeArt } from "./model";
import { BIKES } from "./specs";

/** Every bike the gallery shows, with its rider, at both details: each part on its own pivot. */
export const artModels = (): ArtModel[] =>
  BIKES.flatMap((spec) =>
    (["near", "far"] as const).map((detail) => {
      const { geometry } = buildBikeArt(spec, detail);
      const tag = geometry.getAttribute("bikeTag");
      return { name: `${spec.name} ${detail}`, geometries: rigidParts(detail, geometry, (vertex) => tag.getX(vertex)) };
    }),
  );
