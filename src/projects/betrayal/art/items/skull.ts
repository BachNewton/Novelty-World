import * as THREE from "three";
import { ball, ellipsoid, rod, roundBox, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { assembled, itemModel, piece } from "./item";

/*
 * The Skull (omen): a human skull, old and yellowed, that takes what would
 * break the mind and lets the body bear it. A domed cranium, a heavy brow
 * over two deep, dark sockets, the nose's hole, cheekbones, and a row of
 * teeth in the jaw. It reads by its face, the sockets and teeth turned to
 * whoever the holder faces, and its pale bone; the Crystal Ball, the other
 * round thing held up, is smooth cold glass on a stand. Built a little over
 * life-size: twice would outsize the holder's own head. Held upright, resting
 * on the fist as on a palm, its face to the front.
 */

/** The cranium's middle, a little behind the face; the face's front, and the sockets' height, all over the grip. */
const CRANIUM = { y: 0.14, z: -0.012, radii: [0.074, 0.078, 0.088] as const };
const FACE = { z: 0.072, eyes: 0.118, nose: 0.093, teeth: 0.066 };

function skullGeometry(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, CRANIUM.y, CRANIUM.z], [...CRANIUM.radii]), "bone")
    // The face under the brow: the cheeks and upper jaw, narrower than the cranium.
    .add(ellipsoid([0, FACE.nose - 0.006, 0.035], [0.056, 0.05, 0.05]), "bone", 0.02)
    .add(ball([0.044, FACE.nose + 0.004, 0.045], 0.02), "bone", 0.014)
    .add(ball([-0.044, FACE.nose + 0.004, 0.045], 0.02), "bone", 0.014)
    // The brow's ridge over the sockets.
    .add(rod([-0.05, FACE.eyes + 0.026, 0.058], [0.05, FACE.eyes + 0.026, 0.058], 0.013), "bone", 0.016)
    // The jaw, its chin forward and its sides back to under the ears.
    .add(roundBox([0, FACE.teeth - 0.02, 0.03], [0.04, 0.015, 0.035], 0.012), "bone", 0.014)
    .add(rod([0.042, FACE.teeth - 0.02, 0.005], [0.048, FACE.nose, -0.03], 0.012), "bone", 0.012)
    .add(rod([-0.042, FACE.teeth - 0.02, 0.005], [-0.048, FACE.nose, -0.03], 0.012), "bone", 0.012)
    // The teeth, a pale row across the front of the jaw, and the gaps between them.
    .paint((x, y, z) => Math.max(Math.abs(y - FACE.teeth) - 0.009, 0.045 - z, Math.abs(x) - 0.033), "boneLight")
    .paint((x, y, z) => Math.max(Math.abs(y - FACE.teeth) - 0.0095, 0.045 - z, Math.abs(Math.abs(((x / 0.0105 + 100.5) % 1) - 0.5) - 0.5) * 0.0105 - 0.0009, Math.abs(x) - 0.033), "boneDark")
    .paint((x, y, z) => Math.max(Math.abs(y - FACE.teeth) - 0.0012, 0.045 - z, Math.abs(x) - 0.034), "boneDark")
    // The sockets, deep and dark, and the nose's hole between and under them.
    .carve(ellipsoid([0.026, FACE.eyes, FACE.z], [0.021, 0.019, 0.026]), { colour: "soot", blend: 0.006 })
    .carve(ellipsoid([-0.026, FACE.eyes, FACE.z], [0.021, 0.019, 0.026]), { colour: "soot", blend: 0.006 })
    .carve(ellipsoid([0, FACE.nose, FACE.z + 0.005], [0.009, 0.014, 0.02]), { colour: "soot", blend: 0.004 })
    // The temples, a little hollow behind the sockets.
    .carve(ball([0.083, FACE.eyes + 0.005, 0.02], 0.022), { blend: 0.02 })
    .carve(ball([-0.083, FACE.eyes + 0.005, 0.02], 0.022), { blend: 0.02 });
  return shape.geometry(0.0032);
}

const PARTS = figureParts("item:skull", () => ({ skull: skullGeometry() }));

/** The skull rests with the back of its head over the fist, as on a palm, its face out past the fingers, clear of whoever holds it up close. */
const RESTING = 0.028;

function skull(): THREE.Group {
  const bone = piece(PARTS.get().skull, "skull");
  bone.position.z = RESTING;
  return assembled("skull", [bone]);
}

/** Held resting on the fist; on the floor it has tipped back on its skull, its face turned up. */
export const SKULL = itemModel({
  card: "skull",
  parts: [PARTS],
  held: () => ({ object: skull(), handle: 0.022, carry: "upright" }),
  plate: { lie: new THREE.Euler(-0.6, 0, 0), spin: -0.3 },
});
