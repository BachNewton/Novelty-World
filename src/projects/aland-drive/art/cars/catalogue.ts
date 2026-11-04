import type { ArtModel } from "../catalogue";
import { distantGeometry, worldGeometry } from "./fleet";
import { groundY } from "./build";
import { buildCarArt } from "./model";
import { CARS, WORLD_CARS } from "./specs";

/** Every car the gallery shows: the fourteen drivable cars at both details, body and glass together, and the world cars. */
export function artModels(): ArtModel[] {
  const drivable = CARS.flatMap((spec) =>
    (["hero", "far"] as const).flatMap((detail) => {
      const { body, glass, wheel } = buildCarArt(spec, detail);
      return [
        { name: `${spec.name} ${detail}`, geometries: { body: glass === null ? body : [body, glass] }, groundY: groundY(spec) },
        { name: `${spec.name} ${detail} wheel`, geometries: { wheel }, groundY: -spec.wheel.radiusM },
      ];
    }),
  );
  const world = WORLD_CARS.map((spec) => ({ name: `world ${spec.name}`, geometries: { near: worldGeometry(spec), far: distantGeometry(spec) } }));
  return [...drivable, ...world];
}
