import type { Scene } from "three/webgpu";
import { sharedUniform } from "../art/shared-uniform";
import { buildRegatta, type RegattaCourse, type RegattaInputs } from "../art/boats/index";
import { seaSeconds } from "../sea/clock";
import type { SeaSeason } from "./boats-under-way";
import { isOutAt } from "../climate/placed-season";
import { dialsNow } from "../art/season";

/*
 * The fleets racing out on open water where Åland sails: off Mariehamn's
 * Västerhamn, where the town's sailing club races, and across Lumparn, the wide
 * water in the middle of the island. Each course runs into the summer's
 * south-westerly, so a fleet beats up it and runs back. A fleet is drawn only
 * past 1.5 km, so every course keeps 1.6 km from any land joined to a road: no
 * car can come near enough to see a fleet vanish.
 *
 * Every fleet sails by the world's clock (`sea/clock.ts`), wrapped at 24 hours, not
 * by the game's own time: every player sees the same boats in the same places, and
 * pausing the game doesn't stop the race.
 *
 * A fleet races only in the sailing season, while boats are afloat, each course on its own threshold, and never on
 * ice: then it isn't drawn at all.
 */

const DAY_S = 86_400;
/** The drawn water's height out on the open sea. */
const SEA_Y = -0.05;
/** A course's season rolls from its start, as a moored boat's does from its place. */
const RACING = { dial: "boatsAfloat", salt: 7317 } as const;

export const COURSES: readonly RegattaCourse[] = [
  { from: { x: -7404, z: 10958 }, to: { x: -5796, z: 9042 }, y: SEA_Y, wideM: 500, count: 14, seed: 11, periodS: DAY_S },
  { from: { x: 7763, z: 3237 }, to: { x: 10237, z: 763 }, y: SEA_Y, wideM: 700, count: 20, seed: 23, periodS: DAY_S },
];


export function createRegattas(scene: Scene, inputs: Omit<RegattaInputs, "time">, courses: readonly RegattaCourse[] = COURSES, sea?: SeaSeason) {
  const time = sharedUniform(seaSeconds() % DAY_S);
  const fleets = courses.map((course) => buildRegatta({ ...inputs, time }, course));
  for (const fleet of fleets) scene.add(fleet);
  return {
    /** The sea's clock, which a tool may hold. */
    update(seconds = seaSeconds()) {
      time.value = seconds % DAY_S;
      if (!sea) return;
      const shares = dialsNow(sea.season);
      courses.forEach(({ from, to }, index) => {
        fleets[index].visible = isOutAt(shares, from.x, from.z, RACING) && !sea.frozenAt(from.x, from.z) && !sea.frozenAt(to.x, to.z);
      });
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
