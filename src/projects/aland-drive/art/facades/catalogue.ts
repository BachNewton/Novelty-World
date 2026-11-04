import { themeColor } from "@/shared/lib/three/theme-color";
import type { ArtModel } from "../catalogue";
import { landmarkGeometry } from "../landmarks/catalogue";
import { ADD_ON_MODELS } from "./add-ons";
import { buildChurch } from "./church";
import { CHURCHES } from "./churches";
import { painter } from "./paint";
import { fuelStation, supermarketEntrance } from "./roadside-shops";

/** Every model the facades gallery stands in the world: the stone churches near and far, the villas' add-ons and the shops' fronts. */
export function artModels(): ArtModel[] {
  const ink = (name: string) => `#${themeColor(`--color-aland-drive-${name}`).getHexString()}`;
  const paint = painter(ink);
  return [
    ...CHURCHES.map((spec) => {
      const { near, far } = buildChurch(spec, ink, () => 0);
      return { name: spec.id, geometries: { near: landmarkGeometry(near), far: landmarkGeometry(far) } };
    }),
    ...Object.entries(ADD_ON_MODELS).map(([kind, build]) => ({ name: kind, geometries: { model: landmarkGeometry(build(paint)) } })),
    { name: "fuel station", geometries: { model: landmarkGeometry(fuelStation(paint, "TÄRNAN", 1)) } },
    { name: "supermarket entrance", geometries: { model: landmarkGeometry(supermarketEntrance(paint, "MATHOLMEN", 1)) } },
  ];
}
