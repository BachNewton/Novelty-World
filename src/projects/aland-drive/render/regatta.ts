import type { Scene } from "three/webgpu";
import { uniform } from "three/tsl";
import { buildRegatta, type RegattaCourse, type RegattaInputs } from "../art/boats/index";
import { seaSeconds } from "../sea/clock";

/*
 * The fleets racing out on open water where Åland sails: off Mariehamn's
 * Västerhamn, where the town's sailing club races, and across Lumparn, the wide
 * water in the middle of the island. Each course runs into the summer's
 * south-westerly, so a fleet beats up it and runs back. A fleet is drawn only
 * past 1.5 km, so every course keeps 1.6 km from any land joined to a road: no
 * car can come near enough to see a fleet vanish.
 *
 * Every fleet sails by the sea's clock (`sea/clock.ts`), UTC, wrapped at a day, not
 * by the game's own time: every player sees the same boats in the same places, and
 * pausing the game doesn't stop the race.
 */

const DAY_S = 86_400;
/** The drawn water's height out on the open sea. */
const SEA_Y = -0.05;

export const COURSES: readonly RegattaCourse[] = [
  { from: { x: -7404, z: 10958 }, to: { x: -5796, z: 9042 }, y: SEA_Y, wideM: 500, count: 14, seed: 11, periodS: DAY_S },
  { from: { x: 7763, z: 3237 }, to: { x: 10237, z: 763 }, y: SEA_Y, wideM: 700, count: 20, seed: 23, periodS: DAY_S },
];


export function createRegattas(scene: Scene, inputs: Omit<RegattaInputs, "time">) {
  const time = uniform(seaSeconds() % DAY_S);
  const fleets = COURSES.map((course) => buildRegatta({ ...inputs, time }, course));
  for (const fleet of fleets) scene.add(fleet);
  return {
    /** The sea's clock, which a tool may hold. */
    update(seconds = seaSeconds()) {
      time.value = seconds % DAY_S;
    },
    dispose() {
      for (const fleet of fleets) {
        scene.remove(fleet);
        fleet.geometry.dispose();
        for (const material of [fleet.material].flat()) material.dispose();
      }
    },
  };
}
