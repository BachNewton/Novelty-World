import * as THREE from "three";
import { drum, rod, roundBox, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, itemModel, ON_ITS_SIDE, piece } from "./item";

/*
 * The Adrenaline Shot (item): an old glass-and-steel hypodermic syringe,
 * loaded with an amber dose, its long needle up. It reads by its needle and
 * the steel finger flange and plunger under the fist, a glass barrel with
 * the dose showing through it in warm amber over pale glass, and no other
 * item has its spike. Gripped round the barrel, needle up, ready to jab;
 * on the floor it lies on its side.
 */

/** Along the syringe from the grip: the barrel's foot and top, the nose and the needle's point; the dose's level. */
const BARREL = { foot: -0.05, top: 0.078, radius: 0.0125, dose: 0.058 };
const NEEDLE = { hub: 0.092, point: 0.17, radius: 0.0026 };
/** Under the barrel: the finger flange, the plunger's rod and its thumb press. */
const PLUNGER = { flange: -0.055, press: -0.105 };

/** The glass barrel: the amber dose low in it, clear above, with a dark scale marked up it. */
function barrelGeometry(): THREE.BufferGeometry {
  const { foot, top, radius, dose } = BARREL;
  const shape = sculpt()
    .add(drum([0, (foot + top) / 2, 0], radius, (top - foot) / 2, 0.002), "boneLight")
    .paint((_, y) => y - dose, "amber");
  for (let k = 0; k < 5; k++) shape.paint(drum([0, 0.03 + k * 0.009, 0], radius + 0.002, 0.0007), "stoneDark");
  return shape.geometry(0.0011);
}

/** The steel: the nose over the barrel's top, the needle's hub and the needle; the flange across the foot, the rod, and the thumb press. */
function steelGeometry(): THREE.BufferGeometry {
  const { foot, top, radius } = BARREL;
  return sculpt()
    // The nose, capping the barrel and tapering to the hub.
    .add(drum([0, top - 0.002, 0], radius * 1.12, 0.006, 0.002), "stoneLight")
    .add(rod([0, top + 0.002, 0], [0, NEEDLE.hub, 0], radius * 0.85, 0.0045), "stoneLight", 0.003)
    .add(rod([0, NEEDLE.hub - 0.002, 0], [0, NEEDLE.point, 0], NEEDLE.radius, NEEDLE.radius * 0.62), "stoneLight", 0.002)
    // The foot's cap and the flange across it for two fingers.
    .add(drum([0, foot + 0.002, 0], radius * 1.12, 0.006, 0.002), "stoneLight")
    .add(roundBox([0, PLUNGER.flange, 0], [0.005, 0.0035, 0.03], 0.003), "stoneLight", 0.003)
    // The plunger's rod and its thumb press.
    .add(rod([0, PLUNGER.flange, 0], [0, PLUNGER.press, 0], 0.0042), "stoneLight", 0.002)
    .add(drum([0, PLUNGER.press - 0.002, 0], 0.013, 0.003, 0.0022), "stoneLight", 0.003)
    .geometry(0.0011);
}

const PARTS = figureParts("item:adrenaline-shot", () => ({ barrel: barrelGeometry(), steel: steelGeometry() }));

function syringe(): THREE.Group {
  const parts = PARTS.get();
  const barrel = piece(parts.barrel, "adrenaline shot", SHINES.glass);
  const steel = piece(parts.steel, "adrenaline shot steel", SHINES.steel);
  return assembled("adrenaline shot", [barrel, steel], [
    { between: [barrel, steel], at: [0, BARREL.top, 0], radius: BARREL.radius * 2 },
    { between: [barrel, steel], at: [0, BARREL.foot, 0], radius: BARREL.radius * 2 },
  ]);
}

export const ADRENALINE_SHOT = itemModel({
  card: "adrenaline-shot",
  parts: [PARTS],
  held: () => ({ object: syringe(), handle: BARREL.radius, carry: "upright" }),
  plate: ON_ITS_SIDE,
});
