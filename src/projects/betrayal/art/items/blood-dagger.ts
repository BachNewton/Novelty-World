import * as THREE from "three";
import { ball, ring, rod, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, blade, itemModel, ON_ITS_SIDE, piece } from "./item";

/*
 * The Blood Dagger (item, weapon): a cursed dagger that binds itself to the
 * hand. Its blade snakes like a kris and is steel the colour of blood, so the
 * light runs red along it; black iron quillons sweep up round it like horns,
 * over a grip bound in dark red leather and a black pommel. It reads apart
 * from the Sacrificial Dagger by its wavy blade, its colour and its horns.
 * Carried hanging, its blade out past the thumb.
 */

/** Along the handle, from the grip: the pommel, the guard, and the blade from its base to its point. Built nearly twice life-size. */
const HILT = { pommel: -0.072, guard: 0.058, radius: 0.0145 };
const BLADE = { base: 0.062, point: 0.38, half: 0.03, waves: 2.5, sway: 0.009 };

/** The blade's outline, [z, y]: its middle snaking from side to side as it narrows to the point. */
function outline(): [number, number][] {
  const steps = 24;
  const along = Array.from({ length: steps + 1 }, (_, k) => k / steps);
  const middle = (t: number) => BLADE.sway * Math.sin(Math.PI * 2 * BLADE.waves * t) * Math.min(1, t * 4);
  const width = (t: number) => BLADE.half * (1 - t) ** 0.7 + 0.002;
  const y = (t: number) => BLADE.base + (BLADE.point - BLADE.base) * t;
  const right = along.slice(0, -1).map((t): [number, number] => [middle(t) + width(t), y(t)]);
  const left = along.slice(0, -1).map((t): [number, number] => [middle(t) - width(t), y(t)]).reverse();
  return [...right, [middle(1), BLADE.point], ...left];
}

function bladeGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(blade(outline(), { thickness: 0.012, edge: 0.005, bevel: 0.02 }), "blood")
    .geometry(0.0024);
}

/** The guard's quillons sweeping up either side of the blade like horns, and the pommel, both black iron. */
function ironGeometry(): THREE.BufferGeometry {
  const horn = (side: 1 | -1) => rod([0, HILT.guard, 0], [0, HILT.guard + 0.012, side * 0.05], 0.0085, 0.0055);
  const tip = (side: 1 | -1) => rod([0, HILT.guard + 0.012, side * 0.05], [0, HILT.guard + 0.045, side * 0.06], 0.0055, 0.0025);
  return sculpt()
    .add(rod([0, HILT.guard - 0.006, 0], [0, HILT.guard + 0.008, 0], 0.017, 0.015), "stoneDark")
    .add(horn(1), "stoneDark", 0.006)
    .add(horn(-1), "stoneDark", 0.006)
    .add(tip(1), "stoneDark", 0.004)
    .add(tip(-1), "stoneDark", 0.004)
    .add(ball([0, HILT.pommel, 0], 0.019), "stoneDark")
    .geometry(0.0024);
}

/** The grip, bound in dark red leather in raised turns. */
function gripGeometry(): THREE.BufferGeometry {
  const shape = sculpt().add(rod([0, HILT.pommel + 0.01, 0], [0, HILT.guard - 0.004, 0], HILT.radius, HILT.radius * 0.92), "bloodDark");
  for (let k = 0; k < 7; k++) shape.add(ring([0, HILT.pommel + 0.022 + k * 0.016, 0], HILT.radius * 0.95, 0.0028), "bloodDark", 0.003);
  return shape.geometry(0.0024);
}

const PARTS = figureParts("item:blood-dagger", () => ({ blade: bladeGeometry(), iron: ironGeometry(), grip: gripGeometry() }));

function bloodDagger(): THREE.Group {
  const parts = PARTS.get();
  const steel = piece(parts.blade, "blood dagger blade", SHINES.steel);
  const iron = piece(parts.iron, "blood dagger guard", SHINES.iron);
  const grip = piece(parts.grip, "blood dagger grip");
  return assembled("blood dagger", [steel, iron, grip], [
    { between: [steel, iron], at: [0, HILT.guard, 0], radius: 0.035 },
    { between: [grip, iron], at: [0, HILT.guard, 0], radius: 0.03 },
    { between: [grip, iron], at: [0, HILT.pommel, 0], radius: 0.03 },
  ]);
}

export const BLOOD_DAGGER = itemModel({
  card: "blood-dagger",
  parts: [PARTS],
  held: () => ({ object: bloodDagger(), handle: HILT.radius, carry: "hang" }),
  plate: ON_ITS_SIDE,
});
