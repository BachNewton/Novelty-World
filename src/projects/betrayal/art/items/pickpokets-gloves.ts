import * as THREE from "three";
import { chain, ellipsoid, rod, roundBox, sculpt, union, type Solid, type Vec3 } from "../forms";
import { figureParts } from "../figure-parts";
import { group } from "../shapes";
import { itemModel, ON_ITS_SIDE, piece } from "./item";

/*
 * Pickpocket's Gloves (item; the card prints "Pickpoket's"): a pair of thin
 * navy kid gloves with dark leather gauntlet cuffs, held together by their
 * cuffs and hanging from the fist, empty and limp. Their one-second read is
 * two five-fingered outlines dangling from a hand, in a cold blue no skin
 * has, so they read as gloves and never as hands (grey or tan leather, under
 * a room's warm light, read as a pair of hands): the only thing held that is
 * itself the shape of a hand.
 *
 * Held, not worn. The card is spent as it is used ("discard this item to
 * take any item"), so the gloves show in that one beat, as any item does,
 * not on the body all game: worn, they would be part of the figure's
 * inventory on show, which only clothing earns. And a glove on a figure's hand
 * would have to follow every knuckle of a hand that curls (a fit no stretched
 * model makes), only to read as a slightly different colour of hand from the
 * house's distance. Held up as a pair, they read by their outline.
 *
 * Carried hanging: their cuffs rolled together in the fist, along the grip,
 * the gloves draped over the top of it and hanging past the fingers.
 */

/** The rolled cuffs the fist closes round: their radius, and how far they run along the grip. */
const ROLL = { radius: 0.012, from: -0.03, to: 0.05 };

/** One glove, flat through x, in its own frame: its cuff at the top of the fist, hanging along +z, its fingers
 *  spread along y with the thumb nearest the fist. Thin leather keeps no shape of its own, so the fingers droop
 *  and splay a little, each its own length. */
function glove(): { leather: Solid; cuff: Solid } {
  const fingers: Solid[] = [
    [0.038, 0.06, 0.188],
    [0.057, 0.064, 0.206],
    [0.075, 0.08, 0.212],
    [0.092, 0.1, 0.198],
  ].map(([root, tip, reach], i): Solid => {
    const bend: Vec3 = [i % 2 === 0 ? 0.003 : -0.003, (root + tip) / 2, 0.15 + (reach - 0.15) * 0.55];
    return chain([[0, root, 0.13], bend, [0, tip, reach]], [0.0085, 0.0078, 0.0068]);
  });
  const leather = union(
    ellipsoid([0, 0.066, 0.092], [0.01, 0.038, 0.048]),
    rod([0, 0.04, 0.09], [0, 0.012, 0.142], 0.0092, 0.0078),
    ...fingers,
  );
  const cuff = roundBox([0, 0.068, 0.03], [0.0115, 0.031, 0.026], 0.008);
  return { leather, cuff };
}

/** The pair: the rolled cuffs along the grip, and the two gloves hanging over the top of the fist side by side,
 *  fanned a little, so each one's outline shows. */
function gloves(): THREE.BufferGeometry {
  const shape = sculpt().add(rod([0, ROLL.from, 0], [0, ROLL.to, 0.004], ROLL.radius), "woodMid");
  for (const [x, turn] of [
    [-0.011, -0.1],
    [0.011, 0.14],
  ] as const) {
    const { leather, cuff } = glove();
    const placed = (solid: Solid): Solid => {
      const [c, s] = [Math.cos(turn), Math.sin(turn)];
      // Turned about the cuff's top, at the fist, and set to one side.
      return {
        distance: (px, py, pz) => {
          const [y, z] = [py - 0.045, pz];
          return solid.distance(px - x, 0.045 + y * c + z * s, -y * s + z * c);
        },
        min: [-0.04, -0.06, -0.06],
        max: [0.04, 0.2, 0.25],
      };
    };
    shape.add(placed(cuff), "woodDark", 0.006).add(placed(leather), "moon", 0.008);
  }
  return shape.geometry(0.0028);
}

const PARTS = figureParts("item:pickpokets-gloves", () => ({ gloves: gloves() }));

function pair(): THREE.Group {
  return group(piece(PARTS.get().gloves, "gloves"));
}

export const PICKPOKETS_GLOVES = itemModel({
  card: "pickpokets-gloves",
  parts: [PARTS],
  held: () => ({ object: pair(), handle: ROLL.radius, carry: "hang" }),
  plate: ON_ITS_SIDE,
});
