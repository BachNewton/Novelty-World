import type { ArtModel } from "../catalogue";
import { distantGeometry, fullestSeed, placeWorldCar, REACH_M, SWAP_M, worldGeometry } from "./fleet";
import { groundY } from "./build";
import { buildCarArt } from "./model";
import { CARS, WORLD_CARS } from "./specs";

/** Every car the gallery shows: the fourteen drivable cars at both details, body and glass together, and the world cars. */
export function artModels(): ArtModel[] {
  const drivable = CARS.flatMap((spec) =>
    (["hero", "far"] as const).flatMap((detail): ArtModel[] => {
      const { body, glass, wheel } = buildCarArt(spec, detail);
      return [
        { name: `${spec.name} ${detail}`, geometries: { body: glass === null ? body : [body, glass] }, groundY: groundY(spec) },
        { name: `${spec.name} ${detail} wheel`, geometries: { wheel }, groundY: -spec.wheel.radiusM },
      ];
    }),
  );
  // A world car is drawn with all it can carry, so a rack or a band its stand-in drops would show.
  const world = WORLD_CARS.map((spec): ArtModel => {
    const [near, far] = [worldGeometry(spec), distantGeometry(spec)];
    const seed = fullestSeed(spec);
    return {
      name: `world ${spec.name}`,
      geometries: { near, far },
      drawn: { model: { near, far, swapM: SWAP_M, reachM: REACH_M }, place: (version, swapM, { sun, hazed }) => placeWorldCar(spec, seed, version, swapM, sun, hazed) },
    };
  });
  return [...drivable, ...world];
}
