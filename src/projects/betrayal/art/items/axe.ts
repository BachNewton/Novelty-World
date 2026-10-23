import * as THREE from "three";
import { rod, roundBox, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, blade, bowed, FACE_UP, itemModel, piece } from "./item";

/*
 * The Axe (item, weapon): a woodsman's felling axe, its haft gripped near the
 * foot and its head up by the holder's shoulder: a pale, curved haft, a dark
 * iron head with a broad bright bit that flares to a curved edge, and a
 * square poll behind. It reads by the head's wedge against the haft, the
 * axe-murderer silhouette. Carried upright, the bit out to the side away
 * from the body (−x, in a right hand), so it shows broad face on.
 */

/** Along the haft, from the grip: its foot, where the head sits, and its top. Built half again life-size. */
const HAFT = { foot: -0.15, head: 0.7, top: 0.76, radius: 0.019 };
/** The head's eye round the haft, how far the bit reaches out (−x, the back of a right hand), and the poll behind (+x). */
const HEAD = { eye: 0.032, half: 0.042, reach: -0.24, poll: 0.055, flare: 0.11 };

/** The haft: an ash handle swelling to a knob at its foot, and narrowing, then thickening again into the head. */
function haftGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, HAFT.foot, 0], [0, HAFT.head - 0.1, 0], HAFT.radius * 1.05, HAFT.radius * 0.85), "woodLight")
    .add(rod([0, HAFT.head - 0.1, 0], [0, HAFT.top, 0], HAFT.radius * 0.85, HAFT.radius), "woodLight", 0.02)
    // The knob at its foot, so the hand never slips off.
    .add(rod([0, HAFT.foot - 0.025, 0], [0, HAFT.foot + 0.02, 0.006], HAFT.radius * 1.3, HAFT.radius * 1.05), "woodLight", 0.012)
    .geometry(0.0045);
}

/** The head: the eye's block round the haft's top, a square poll behind it, and the bit flaring out ahead to its curved edge. */
function headGeometry(): THREE.BufferGeometry {
  const { eye, half, reach, poll, flare } = HEAD;
  const middle = HAFT.head;
  // The bit's outline in the haft's plane, [x, y]: from the eye's top out along a sweeping top edge, down the curved
  // edge, and back along the bearded underside, which drops lower than the top rises.
  const outline: [number, number][] = [
    [-eye * 0.4, middle + half * 0.75],
    ...bowed([-eye * 0.4, middle + half * 0.75], [reach, middle + flare * 0.9], -0.018, 6),
    ...bowed([reach, middle + flare * 0.9], [reach + 0.012, middle - flare * 1.1], -0.05, 9),
    ...bowed([reach + 0.012, middle - flare * 1.1], [-eye * 0.4, middle - half * 0.85], 0.03, 6),
  ];
  return sculpt()
    .add(roundBox([poll / 2 - eye / 2, middle, 0], [(poll + eye) / 2, half, 0.021], 0.008), "stoneDark")
    .add(blade(outline, { thickness: 0.03, edge: 0.0065, bevel: 0.1, flat: "z" }), "stoneDark", 0.012)
    // The bright, ground edge: the last few centimetres of the bit, polished where it's sharpened.
    .paint((x, y) => x - (reach + 0.055) + 0.02 * Math.cos(((y - middle) / flare) * 1.2), "stoneLight")
    .geometry(0.0032);
}

const PARTS = figureParts("item:axe", () => ({ haft: haftGeometry(), head: headGeometry() }));

function axe(): THREE.Group {
  const parts = PARTS.get();
  const haft = piece(parts.haft, "axe haft");
  const head = piece(parts.head, "axe head", SHINES.steel);
  return assembled("axe", [haft, head], [{ between: [haft, head], at: [0, HAFT.head, 0], radius: HEAD.half * 1.8 }]);
}

export const AXE = itemModel({
  card: "axe",
  parts: [PARTS],
  held: () => ({ object: axe(), handle: HAFT.radius, carry: "upright" }),
  plate: FACE_UP,
});
