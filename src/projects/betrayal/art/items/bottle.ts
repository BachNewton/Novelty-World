import * as THREE from "three";
import { drum, ellipsoid, intersect, ring, rod, roundBox, sculpt, skin } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, itemModel, o, ON_ITS_SIDE, piece } from "./item";

/*
 * The Bottle (item): an old bottle of something nobody should drink, in
 * sickly green glass (the colour of poison and the corrupt), stoppered with
 * a cork, a stained paper label round its body.
 * It reads by the tall green shape with its long neck and the pale cork,
 * apart from the Smelling Salts' small blue vial under its silver cap.
 * Gripped round its body and carried upright, cork up; on the floor it lies
 * on its side.
 */

/** Along the bottle from the grip: its foot, where the body ends at the shoulder, the neck's top, and the cork's. */
const BOTTLE = { radius: o(0.0145), foot: o(-0.026), shoulder: o(0.06), neck: o(0.105), cork: o(0.118) };
const NECK = o(0.0062);
/** The label's band round the body, above the fist. */
const LABEL = { low: o(0.026), high: o(0.052) };

/** The glass: a straight body, a rounded shoulder into a long neck, and a lip round its top. */
function bodyShape() {
  const { radius, foot, shoulder } = BOTTLE;
  return drum([0, (foot + shoulder) / 2, 0], radius, (shoulder - foot) / 2, o(0.003));
}

function glassGeometry(): THREE.BufferGeometry {
  const { radius, shoulder, neck } = BOTTLE;
  return sculpt()
    .add(bodyShape(), "wraith")
    .add(ellipsoid([0, shoulder, 0], [radius, o(0.014), radius]), "wraith", o(0.004))
    .add(rod([0, shoulder, 0], [0, neck, 0], NECK * 1.1, NECK), "wraith", o(0.008))
    .add(ring([0, neck - o(0.002), 0], NECK, o(0.0022)), "wraith", o(0.0015))
    .geometry(o(0.0016));
}

/** The cork, pressed into the neck and standing proud of it. */
function corkGeometry(): THREE.BufferGeometry {
  const { neck, cork } = BOTTLE;
  return sculpt()
    .add(drum([0, (neck - o(0.012) + cork) / 2, 0], NECK * 0.95, (cork - neck + o(0.012)) / 2, o(0.0015)), "woodLight")
    .add(drum([0, cork - o(0.004), 0], NECK * 1.12, o(0.004), o(0.0018)), "woodLight", o(0.001))
    .geometry(o(0.0013));
}

/** The paper label, a band clear of the glass round the body, with a dark rule across it. */
function labelGeometry(): THREE.BufferGeometry {
  const band = roundBox([0, (LABEL.low + LABEL.high) / 2, 0], [o(0.03), (LABEL.high - LABEL.low) / 2, o(0.03)], o(0.002));
  return sculpt()
    .add(intersect(skin(bodyShape(), o(0.0008), o(0.0025)), band), "bone")
    .paint((x, y) => Math.abs(y - (LABEL.low + LABEL.high) / 2) - o(0.0015), "boneDark")
    .geometry(o(0.0009));
}

const PARTS = figureParts("item:bottle", () => ({ glass: glassGeometry(), cork: corkGeometry(), label: labelGeometry() }));

function bottle(): THREE.Group {
  const parts = PARTS.get();
  const glass = piece(parts.glass, "bottle", SHINES.glass);
  const cork = piece(parts.cork, "bottle cork");
  const label = piece(parts.label, "bottle label");
  return assembled("bottle", [glass, cork, label], [{ between: [glass, cork], at: [0, BOTTLE.neck, 0], radius: NECK * 3 }]);
}

export const BOTTLE_MODEL = itemModel({
  card: "bottle",
  parts: [PARTS],
  held: () => ({ object: bottle(), handle: BOTTLE.radius, carry: "upright" }),
  plate: ON_ITS_SIDE,
});
