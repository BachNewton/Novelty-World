import * as THREE from "three";
import { drum, ring, rod, roundBox, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, itemModel, o, ON_ITS_SIDE, piece } from "./item";

/*
 * The Revolver (item, weapon): a long-barrelled, nickel-plated six-gun with
 * a dark wooden grip. It reads by its whole silhouette at any distance: the
 * long barrel, the fluted cylinder, the cocked hammer, the trigger guard and
 * the raked grip; pale nickel, not blued steel, so it shows in a dark room,
 * and the light runs along its barrel. Carried hanging, muzzle down.
 */

/** The barrel's axis, along the hand above the fist, and where it ends. */
const BORE = { y: o(0.046), muzzle: o(0.172) };

/** The grip, raked back from the frame, with a rounded butt, in the fist. */
function gripGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(roundBox([0, o(-0.006), o(-0.006)], [o(0.0085), o(0.03), o(0.011)], o(0.006), [0.22, 0, 0]), "woodMid")
    .geometry(o(0.002));
}

/** Everything of steel: the frame over the fist, the fluted cylinder, the barrel with its rib, sight and bore, the ejector rod under it, the hammer cocked back, and the trigger in its guard. */
function steelGeometry(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(roundBox([0, o(0.033), o(0.015)], [o(0.0075), o(0.011), o(0.031)], o(0.004)), "stoneLight")
    // The cylinder, its axis along the barrel.
    .add(drum([0, o(0.04), o(0.03)], o(0.0145), o(0.016), o(0.003), [Math.PI / 2, 0, 0]), "stoneLight", o(0.002))
    // The barrel, a rib along its top, and the front sight at the muzzle.
    .add(rod([0, BORE.y, o(0.044)], [0, BORE.y, BORE.muzzle], o(0.0062)), "stoneLight", o(0.003))
    .add(roundBox([0, BORE.y + o(0.0055), o(0.1)], [o(0.0025), o(0.002), o(0.068)], o(0.0018)), "stoneLight", o(0.002))
    .add(roundBox([0, BORE.y + o(0.009), BORE.muzzle - o(0.008)], [o(0.0018), o(0.004), o(0.005)], o(0.0016)), "stoneLight", o(0.001))
    // The ejector rod's housing under the barrel.
    .add(rod([0, o(0.035), o(0.05)], [0, o(0.035), o(0.125)], o(0.0034)), "stoneLight", o(0.002))
    // The hammer, its spur cocked back over the thumb.
    .add(rod([0, o(0.04), o(-0.012)], [0, o(0.051), o(-0.022)], o(0.0036), o(0.0028)), "stoneLight", o(0.002))
    // The trigger guard below the frame, and the trigger in it.
    .add(ring([0, o(0.018), o(0.017)], o(0.0095), o(0.0024), [0, 0, Math.PI / 2]), "stoneLight", o(0.002))
    .add(rod([0, o(0.026), o(0.013)], [0, o(0.015), o(0.018)], o(0.0022)), "stoneLight", o(0.001))
    // The bore, a dark hole down the muzzle.
    .carve(rod([0, BORE.y, BORE.muzzle - o(0.012)], [0, BORE.y, BORE.muzzle + o(0.01)], o(0.0032)), { colour: "soot" });
  // Six flutes down the cylinder, between its chambers.
  for (let k = 0; k < 6; k++) {
    const angle = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const [x, y] = [o(0.017) * Math.cos(angle), o(0.04) + o(0.017) * Math.sin(angle)];
    shape.carve(rod([x, y, o(0.019)], [x, y, o(0.041)], o(0.0042)), { blend: o(0.0015) });
  }
  return shape.geometry(o(0.0019));
}

const PARTS = figureParts("item:revolver", () => ({ grip: gripGeometry(), steel: steelGeometry() }));

function revolver(): THREE.Group {
  const parts = PARTS.get();
  const grip = piece(parts.grip, "revolver grip");
  const steel = piece(parts.steel, "revolver", SHINES.steel);
  return assembled("revolver", [grip, steel], [{ between: [grip, steel], at: [0, o(0.024), o(0)], radius: o(0.022) }]);
}

export const REVOLVER = itemModel({
  card: "revolver",
  parts: [PARTS],
  held: () => ({ object: revolver(), handle: o(0.0095), carry: "hang" }),
  plate: ON_ITS_SIDE,
});
