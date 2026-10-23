import * as THREE from "three";
import { ball, rod, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, blade, FACE_UP, itemModel, piece } from "./item";

/*
 * The Holy Symbol (omen): a priest's gilt cross, held up against the dark.
 * A bright gold cross with flaring arms, each ending in a round knop, a boss
 * at its crossing, bevelled so its faces catch the light, on a short rod that
 * runs down through the fist to a knop below it. It reads by the cross over
 * the fist and its gold, the house's colour of the holy (the Chapel, the
 * Blessing); nothing else held up is gold, and the Idol, the other figure on
 * a stem, is grey stone. Held upright by its foot, its face to the front.
 */

/** Along the foot, from the grip: the knop under the fist, where the cross's face begins, its crossing, and its top; how far its arms reach. */
const CROSS = { knop: -0.072, base: 0.035, crossing: 0.2, top: 0.33, reach: 0.098 };
/** The arms' half-widths: where they meet the crossing, and where they flare at their ends. */
const ARM = { waist: 0.0155, flare: 0.026 };
/** The foot's rod, in the fist. */
const FOOT = 0.013;

/** The cross's outline, [x, y]: four arms, each flaring from the crossing to its end, the lower one running straight into the foot. */
function outline(): [number, number][] {
  const { base, crossing: c, top, reach } = CROSS;
  const { waist: w, flare: f } = ARM;
  return [
    [w, base],
    [w, c - w],
    [reach, c - f],
    [reach, c + f],
    [w, c + w],
    [f, top],
    [-f, top],
    [-w, c + w],
    [-reach, c + f],
    [-reach, c - f],
    [-w, c - w],
    [-w, base],
  ];
}

/** The whole cross in gold: its bevelled face, a round knop at each arm's end, the boss at the crossing, and the foot through the fist. */
function crossGeometry(): THREE.BufferGeometry {
  const { knop, base, crossing: c, top, reach } = CROSS;
  return sculpt()
    .add(blade(outline(), { thickness: 0.024, edge: 0.011, bevel: 0.012, flat: "z" }), "gold")
    .add(ball([reach + 0.009, c, 0], 0.017), "gold", 0.006)
    .add(ball([-reach - 0.009, c, 0], 0.017), "gold", 0.006)
    .add(ball([0, top + 0.009, 0], 0.017), "gold", 0.006)
    .add(ball([0, c, 0.006], 0.019), "goldLight", 0.004)
    .add(rod([0, knop + 0.012, 0], [0, base + 0.03, 0], FOOT), "gold", 0.008)
    .add(ball([0, knop, 0], FOOT * 1.45), "gold", 0.006)
    .geometry(0.0024);
}

const PARTS = figureParts("item:holy-symbol", () => ({ cross: crossGeometry() }));

function holySymbol(): THREE.Group {
  return assembled("holy symbol", [piece(PARTS.get().cross, "holy symbol", SHINES.gilt)]);
}

export const HOLY_SYMBOL = itemModel({
  card: "holy-symbol",
  parts: [PARTS],
  held: () => ({ object: holySymbol(), handle: FOOT, carry: "upright" }),
  plate: FACE_UP,
});
