import * as THREE from "three";
import { ball, chain, drum, ellipsoid, ring, rod, roughened, sculpt, union } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, itemModel, ON_ITS_SIDE, piece } from "./item";

/*
 * The Rabbit's Foot (item): the old charm, a white rabbit's hind foot in a
 * brass cap with a ring for a chain, its fur soft and tufted, its toes
 * curled forward. It reads by the fluffy white club rising out of the fist
 * over the bright cap, about two and a half times life-size, apart from the
 * Lucky Stone's flat pebble. Gripped round the foot, toes up, and held
 * up for its reroll; on the floor it lies on its side.
 */

/** Along the foot from the grip: the cap's foot and top, and the toes; the fur's radius at the ankle and at the toes. */
const FOOT = { cap: -0.052, ankle: -0.03, toes: 0.12, radius: 0.019, paw: 0.024 };

/** The fur: from the ankle, swelling along the foot to the curled toes, tufted. */
function furGeometry(): THREE.BufferGeometry {
  const { ankle, toes, radius, paw } = FOOT;
  // A hind foot: slim at the ankle, its heel bulging back (−z) above the fist, then long and curving forward to a
  // full, rounded paw.
  const body = union(
    chain([[0, ankle, 0], [0, 0.03, -0.004], [0, 0.075, 0.006], [0, toes - 0.02, 0.02]], [radius, radius * 1.08, paw * 0.92, paw]),
    ellipsoid([0, 0.04, -0.012], [radius * 0.95, 0.03, radius * 0.9]),
    ellipsoid([0, toes - 0.008, 0.026], [paw * 0.95, 0.03, paw * 1.1]),
  );
  return sculpt()
    .add(roughened(body, 0.0011, 0.016), "boneLight", 0.012)
    // The toes' tufts, three soft lobes at the tip, a shade warmer, and the claws' dark points among them.
    .add(roughened(union(...[-1, 0, 1].map((k) => ball([k * 0.012, toes + 0.006 - Math.abs(k) * 0.007, 0.036], 0.012))), 0.0008, 0.012), "boneLight", 0.01)
    .paint((_, y, z) => Math.max(0.03 - z, toes - 0.01 - y), "bone")
    .add(union(...[-1, 0, 1].map((k) => rod([k * 0.012, toes + 0.004 - Math.abs(k) * 0.007, 0.044], [k * 0.0135, toes - 0.004 - Math.abs(k) * 0.007, 0.053], 0.0024, 0.0012))), "boneDark", 0.002)
    .geometry(0.0016);
}

/** The brass cap closing the foot's end, a collar of beads round its mouth, and the ring for the chain. */
function capGeometry(): THREE.BufferGeometry {
  const { cap, ankle, radius } = FOOT;
  return sculpt()
    .add(drum([0, (cap + ankle) / 2 + 0.003, 0], radius * 1.08, (ankle - cap) / 2, 0.004), "brass")
    .add(ring([0, ankle + 0.005, 0], radius * 1.02, 0.0028), "brass", 0.002)
    .add(ring([0, cap - 0.008, 0], 0.0085, 0.0026, [0, 0, Math.PI / 2]), "brass", 0.002)
    .geometry(0.0012);
}

const PARTS = figureParts("item:rabbits-foot", () => ({ fur: furGeometry(), cap: capGeometry() }));

function rabbitsFoot(): THREE.Group {
  const parts = PARTS.get();
  const fur = piece(parts.fur, "rabbit's foot");
  const cap = piece(parts.cap, "rabbit's foot cap", SHINES.brass);
  return assembled("rabbit's foot", [fur, cap], [{ between: [fur, cap], at: [0, FOOT.ankle, 0], radius: FOOT.radius * 2 }]);
}

export const RABBITS_FOOT = itemModel({
  card: "rabbits-foot",
  parts: [PARTS],
  held: () => ({ object: rabbitsFoot(), handle: FOOT.radius, carry: "upright" }),
  plate: ON_ITS_SIDE,
});
