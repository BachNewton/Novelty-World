import type { World } from "../../engine/world";
import { pitchTrouble, type PitchGround } from "../../gameplay/camp";
import { forgetCamp, holdSettle, packUpCamp, pitchCamp, pitchCampAt, settledFor, type Camping } from "./camping";
import { packUpFromTheFire, type Hearth } from "./hearth";

/*
 * Camp's part of the world's probe (`window.__hearthwoodWorld.camping`), for
 * screenshots and tests: where camp is and whether it is carried, packing it
 * up (from the fire's card, as Elliott does, or at once), the ghost in front
 * of Elliott and whether pitching is offered, pitching there or at a chosen
 * spot, what keeps a spot from being pitched on, the nearest good spot to a
 * point, and the settling held at a moment.
 */

export interface CampingProbe {
  /** Where camp stands (or was packed up from), whether it is carried, the home camp, and how many seconds into going up it is. */
  state: () => { carried: boolean; x: number; z: number; y: number; turn: number; home: { x: number; z: number }; settled: number; leaving: boolean };
  /** Packs camp up from the fire's card, as its button does. */
  packFromTheFire: () => void;
  pack: () => void;
  /** Where the ghost stands and whether the ground there is good, while camp is carried and Elliott is looking for a spot. */
  ghost: () => { x: number; z: number; turn: number; good: boolean } | null;
  offered: () => boolean;
  /** Pitches camp where the ghost stands, as using the offer does. */
  pitch: () => void;
  /** Pitches camp with its fire at a spot, turned by `turn`; a spot that won't do throws. */
  pitchAt: (x: number, z: number, turn?: number) => void;
  /** What keeps camp from a spot: wet, steep or cluttered ground, or null where it can be pitched. */
  trouble: (x: number, z: number) => string | null;
  /** The nearest spot to a point, within `radius` metres, where camp can be pitched, searched for in rings outwards. */
  findPitch: (x: number, z: number, radius: number) => { x: number; z: number } | null;
  /** Holds camp this many seconds into going up, or lets it run with null. */
  hold: (seconds: number | null) => void;
  /** Camp back at home and nothing kept. */
  forget: () => void;
}

export function campingProbe(camping: Camping, hearth: Hearth, world: World, ground: PitchGround): CampingProbe {
  return {
    state: () => {
      const { camp, leaving } = camping.shown;
      return { carried: camp.carried, ...camp.site, home: { x: world.home.x, z: world.home.z }, settled: settledFor(camping), leaving: leaving !== null };
    },
    packFromTheFire: () => {
      packUpFromTheFire(hearth);
    },
    pack: () => {
      packUpCamp(camping);
    },
    ghost: () => {
      const ghost = camping.ghost;
      return ghost && { x: ghost.site.x, z: ghost.site.z, turn: ghost.site.turn, good: ghost.good };
    },
    offered: () => camping.shown.offered,
    pitch: () => {
      pitchCamp(camping);
    },
    pitchAt: (x, z, turn = 0) => {
      const trouble = pitchTrouble(ground, x, z);
      if (trouble !== null) throw new Error(`Camp can't be pitched at ${x.toFixed(1)}, ${z.toFixed(1)}: the ground is ${trouble}`);
      pitchCampAt(camping, { x, y: world.heightAt(x, z), z, turn });
    },
    trouble: (x, z) => pitchTrouble(ground, x, z),
    findPitch: (x, z, radius) => {
      if (pitchTrouble(ground, x, z) === null) return { x, z };
      for (let r = 2; r <= radius; r += 2) {
        const around = Math.max(6, Math.round((Math.PI * 2 * r) / 2));
        for (let k = 0; k < around; k++) {
          const a = (k / around) * Math.PI * 2;
          const px = x + Math.cos(a) * r;
          const pz = z + Math.sin(a) * r;
          if (pitchTrouble(ground, px, pz) === null) return { x: px, z: pz };
        }
      }
      return null;
    },
    hold: (seconds) => {
      holdSettle(camping, seconds);
    },
    forget: () => {
      forgetCamp(camping);
    },
  };
}
