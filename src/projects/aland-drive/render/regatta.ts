import type { Scene } from "three/webgpu";
import { uniform } from "three/tsl";
import { buildRegatta, type RegattaCourse, type RegattaInputs } from "../art/boats/index";

/*
 * The fleets racing out on open water where Åland sails: off Mariehamn's
 * Västerhamn, where the town's sailing club races, and across Lumparn, the wide
 * water in the middle of the island. Each course runs into the summer's
 * south-westerly, so a fleet beats up it and runs back. A fleet is drawn only
 * past 1.5 km, from the shore roads round it.
 *
 * Every fleet sails by the wall clock, wrapped at a day, not by the game's own
 * time: every player sees the same boats in the same places, and pausing the
 * game doesn't stop the race.
 */

const DAY_S = 86_400;
/** The drawn water's height out on the open sea. */
const SEA_Y = -0.05;

export const COURSES: readonly RegattaCourse[] = [
  { from: { x: -7900, z: 10600 }, to: { x: -5300, z: 8700 }, y: SEA_Y, wideM: 500, count: 14, seed: 11, periodS: DAY_S },
  { from: { x: 7200, z: 3900 }, to: { x: 10900, z: 300 }, y: SEA_Y, wideM: 700, count: 20, seed: 23, periodS: DAY_S },
];

/** Seconds into today, by the wall clock. */
const clockSeconds = () => (Date.now() / 1000) % DAY_S;

export function createRegattas(scene: Scene, inputs: Omit<RegattaInputs, "time">) {
  const time = uniform(clockSeconds());
  const fleets = COURSES.map((course) => buildRegatta({ ...inputs, time }, course));
  for (const fleet of fleets) scene.add(fleet);
  return {
    update() {
      time.value = clockSeconds();
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
