import * as THREE from "three";
import { ball, ellipsoid, rod, roundBox, sculpt, union } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, itemModel, piece } from "./item";

/*
 * The Music Box (item): a little rosewood music box, lacquered to a gleam,
 * its lid inlaid with a gold line, gilt caps on its corners, a gilt lock
 * plate on its front, and a big gilt butterfly key in its side to wind it.
 * It reads by the polished box with the winding key standing out of it,
 * apart from the Puzzle Box's pale patterned cube. Gripped round the box,
 * lid up, the key away from the body; on the floor it stands.
 */

/** The box's half-sizes across the hand (x) and along it (z), its foot and top along the grip, the lid's depth, and how far forward of the grip it sits. */
const BOX = { x: 0.031, z: 0.041, foot: -0.028, top: 0.074, lid: 0.014, round: 0.005, reach: 0.006 };
/** The winding key: out of the box's side away from the body (−x), where it stands, and its wings' reach. */
const KEY = { y: 0.047, shaft: 0.014, wing: 0.019 };

/** The box and its lid, lacquered, the seam between them sunk, and the gold line round the lid's top. */
function boxGeometry(): THREE.BufferGeometry {
  const { x, z, foot, top, lid, round } = BOX;
  const seam = top - lid;
  return sculpt()
    .add(roundBox([0, (foot + seam) / 2, 0], [x, (seam - foot) / 2, z], round), "woodMid")
    .add(roundBox([0, seam + lid / 2, 0], [x + 0.0015, lid / 2, z + 0.0015], round), "woodMid", 0.001)
    // A gentle dome to the lid.
    .add(ellipsoid([0, top - 0.004, 0], [x * 0.85, 0.008, z * 0.85]), "woodMid", 0.006)
    .carve(roundBox([0, seam, 0], [x + 0.004, 0.0009, z + 0.004], 0.0005), { blend: 0.0008, colour: "woodDark" })
    // The inlaid gold line, a border in from the lid's edge.
    .paint((px, py, pz) => (py < top - 0.004 ? 1 : Math.abs(Math.max(Math.abs(px) - (x - 0.008), Math.abs(pz) - (z - 0.008))) - 0.0014), "brass")
    .geometry(0.0013);
}

/** The gilt: the corner caps at the lid's corners, the lock plate on the front, and the key in the side. */
function giltGeometry(): THREE.BufferGeometry {
  const { x, z, top } = BOX;
  const shape = sculpt();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) shape.add(ball([sx * (x - 0.001), top - 0.006, sz * (z - 0.001)], 0.0062), "gold");
  // The lock plate, on the face out from the fingers' end (+z).
  shape.add(roundBox([0, top - BOX.lid - 0.004, z + 0.001], [0.008, 0.008, 0.0022], 0.0018), "gold", 0.001);
  // The key: its shaft out of the side, a collar, and two round wings across it.
  shape.add(rod([-x + 0.004, KEY.y, 0], [-x - KEY.shaft, KEY.y, 0], 0.0032), "gold", 0.002);
  shape.add(rod([-x - 0.002, KEY.y, 0], [-x - 0.005, KEY.y, 0], 0.0062), "gold", 0.002);
  const wings = union(
    ellipsoid([-x - KEY.shaft - 0.002, KEY.y, KEY.wing * 0.55], [0.0035, 0.011, KEY.wing * 0.6]),
    ellipsoid([-x - KEY.shaft - 0.002, KEY.y, -KEY.wing * 0.55], [0.0035, 0.011, KEY.wing * 0.6]),
  );
  shape.add(wings, "gold", 0.004);
  return shape.geometry(0.0011);
}

const PARTS = figureParts("item:music-box", () => ({ box: boxGeometry(), gilt: giltGeometry() }));

function musicBox(): THREE.Group {
  const parts = PARTS.get();
  const box = piece(parts.box, "music box", SHINES.lacquer);
  const gilt = piece(parts.gilt, "music box gilt", SHINES.gilt);
  const { x, z, top } = BOX;
  const model = assembled("music box", [box, gilt], [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ between: [box, gilt] as [THREE.Mesh, THREE.Mesh], at: [sx * x, top - 0.006, sz * z] as THREE.Vector3Tuple, radius: 0.012 }))),
    { between: [box, gilt], at: [0, top - BOX.lid - 0.004, z], radius: 0.016 },
    { between: [box, gilt], at: [-x, KEY.y, 0], radius: 0.012 },
  ]);
  // Forward in the fist, towards the fingertips, so its back clears the wrist as a running arm bends it.
  model.position.z = BOX.reach;
  return model;
}

export const MUSIC_BOX = itemModel({
  card: "music-box",
  parts: [PARTS],
  held: () => ({ object: musicBox(), handle: 0.034, carry: "upright" }),
  plate: { lie: new THREE.Euler(), spin: 0.5 },
});
