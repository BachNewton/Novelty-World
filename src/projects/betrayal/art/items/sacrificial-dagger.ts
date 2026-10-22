import * as THREE from "three";
import { ball, drum, ring, rod, roundBox, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, blade, itemModel, ON_ITS_SIDE, piece } from "./item";

/*
 * The Sacrificial Dagger (item, weapon): a ritual knife that twists in the
 * hand. A pale steel blade curving like a young moon, a gilt guard and a
 * gilt pommel shaped as a crescent, over a carved bone grip. It reads apart
 * from the Blood Dagger by its curve, its pale bone and its gold. Carried
 * hanging, its blade out past the thumb, curving up away from the fingers.
 */

/** Along the handle, from the grip: the pommel, the guard, and the blade from its base to its point. Built nearly twice life-size. */
const HILT = { pommel: -0.07, guard: 0.056, radius: 0.0135 };
const BLADE = { base: 0.062, point: 0.35, half: 0.027, curve: 0.045 };

/** The blade's outline, [z, y]: curving away from the fingers (−z, up as it hangs, clear of a skirt) as it rises, its belly on the outside of the curve. */
function outline(): [number, number][] {
  const steps = 18;
  const along = Array.from({ length: steps + 1 }, (_, k) => k / steps);
  const middle = (t: number) => -BLADE.curve * t * t;
  const width = (t: number) => BLADE.half * (1 - t) ** 0.55 + 0.0015;
  const y = (t: number) => BLADE.base + (BLADE.point - BLADE.base) * t - 0.03 * t * t;
  const outside = along.slice(0, -1).map((t): [number, number] => [middle(t) + width(t) * 1.2, y(t)]);
  const inside = along.slice(0, -1).map((t): [number, number] => [middle(t) - width(t) * 0.8, y(t)]).reverse();
  return [...outside, [middle(1), y(1)], ...inside];
}

function bladeGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(blade(outline(), { thickness: 0.011, edge: 0.005, bevel: 0.018 }), "stoneLight")
    .geometry(0.0024);
}

/** The gilt: an oval guard across the blade's base, a collar under it, and a crescent pommel with its horns up round the grip's foot. */
function giltGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(roundBox([0, HILT.guard, 0.002], [0.011, 0.007, 0.042], 0.006), "gold")
    .add(drum([0, HILT.guard - 0.011, 0], HILT.radius * 1.2, 0.006, 0.003), "gold", 0.004)
    .add(ring([0, HILT.pommel - 0.004, 0], 0.024, 0.0075, [0, 0, Math.PI / 2]), "gold")
    .carve(roundBox([0, HILT.pommel + 0.03, 0], [0.02, 0.022, 0.03], 0.004))
    .add(ball([0, HILT.pommel - 0.006, 0], HILT.radius * 1.1), "gold", 0.004)
    .geometry(0.0022);
}

/** The bone grip, swelling in the middle and carved in rings. */
function gripGeometry(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, HILT.pommel + 0.004, 0], [0, -0.005, 0], HILT.radius * 0.95, HILT.radius * 1.08), "bone")
    .add(rod([0, -0.005, 0], [0, HILT.guard - 0.01, 0], HILT.radius * 1.08, HILT.radius * 0.95), "bone", 0.01);
  for (const y of [HILT.pommel + 0.03, -0.012, 0.03]) shape.carve(ring([0, y, 0], HILT.radius * 1.08, 0.0026), { blend: 0.002, colour: "boneDark" });
  return shape.geometry(0.0022);
}

const PARTS = figureParts("item:sacrificial-dagger", () => ({ blade: bladeGeometry(), gilt: giltGeometry(), grip: gripGeometry() }));

function sacrificialDagger(): THREE.Group {
  const parts = PARTS.get();
  const steel = piece(parts.blade, "sacrificial dagger blade", SHINES.steel);
  const gilt = piece(parts.gilt, "sacrificial dagger gilt", SHINES.gilt);
  const grip = piece(parts.grip, "sacrificial dagger grip");
  return assembled("sacrificial dagger", [steel, gilt, grip], [
    { between: [steel, gilt], at: [0, HILT.guard, 0], radius: 0.035 },
    { between: [grip, gilt], at: [0, HILT.guard - 0.01, 0], radius: 0.03 },
    { between: [grip, gilt], at: [0, HILT.pommel, 0], radius: 0.035 },
  ]);
}

export const SACRIFICIAL_DAGGER = itemModel({
  card: "sacrificial-dagger",
  parts: [PARTS],
  held: () => ({ object: sacrificialDagger(), handle: HILT.radius * 1.08, carry: "hang" }),
  plate: ON_ITS_SIDE,
});
