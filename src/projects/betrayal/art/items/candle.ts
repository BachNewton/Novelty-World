import * as THREE from "three";
import { ball, drum, ellipsoid, ring, rod, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, burning, itemModel, o, onPlate, piece } from "./item";

/*
 * The Candle (item): a thick ivory candle carried through the dark house,
 * held in the fist under a brass drip pan that catches its wax. It has
 * burned down a little: its top is a melted cup with one side slumped, wax
 * runs down it in drips, one pooled on the pan, and its wick is black and
 * bent. It reads by its flame and the light it carries: always in hand and
 * lit, the one item a figure always shows, and the pale wax column over the
 * bright brass disc. On the floor it stands unlit on its pan (a flame that
 * looks lit always lights something).
 */

/** Along the candle from the grip: its foot below the fist, the pan over the thumb, its melted top, and its flame. */
const CANDLE = { radius: o(0.0125), foot: o(-0.024), pan: o(0.026), top: o(0.092), flame: o(0.112) };
/** The brass pan: its radius, and its rim's. */
const PAN = { radius: o(0.026), rim: o(0.0022), thickness: o(0.0018) };

/** The wax: a column with a slumped, melted cup for a top, drips running down it, one pooled on the pan, and the wick. */
function waxGeometry(): THREE.BufferGeometry {
  const { radius, foot, top } = CANDLE;
  const shape = sculpt()
    .add(drum([0, (top + foot) / 2, 0], radius, (top - foot) / 2, o(0.004)), "boneLight")
    // The cup the flame has melted, its lip slumped lower on one side.
    .carve(ellipsoid([0, top + o(0.006), 0], [radius * 0.78, o(0.011), radius * 0.78]), { blend: o(0.002) })
    .carve(rod([0, top + o(0.004), radius * 0.4], [0, top + o(0.004), radius * 1.4], o(0.006)), { blend: o(0.004) });
  // Drips: each runs from the lip down the side, thickening to a bead where it stopped.
  const drips: [angle: number, length: number][] = [[0.4, 0.035], [1.9, 0.055], [2.9, 0.022], [4.3, 0.045], [5.4, 0.03]];
  for (const [angle, length] of drips) {
    const [x, z] = [Math.sin(angle) * radius * 0.92, Math.cos(angle) * radius * 0.92];
    const end = top - o(length);
    shape.add(rod([x, top - o(0.004), z], [x * 1.04, end, z * 1.04], o(0.0022), o(0.0032)), "boneLight", o(0.003));
    shape.add(ball([x * 1.05, end - o(0.001), z * 1.05], o(0.0036)), "boneLight", o(0.002));
  }
  // The long drip reaches the pan and pools on it.
  shape.add(ellipsoid([radius * 0.85, CANDLE.pan + PAN.thickness + o(0.002), radius * 0.35], [o(0.009), o(0.0025), o(0.007)]), "boneLight", o(0.004));
  // The wick, burnt black, bent over at its tip.
  shape.add(rod([0, top - o(0.004), 0], [0, top + o(0.006), 0], o(0.0012)), "soot");
  shape.add(rod([0, top + o(0.006), 0], [o(0.0025), top + o(0.009), 0], o(0.0011)), "soot", o(0.001));
  return shape.geometry(o(0.0014));
}

/** The pan: a brass dish round the candle above the fist, its rim turned up. */
function panGeometry(): THREE.BufferGeometry {
  const y = CANDLE.pan;
  return sculpt()
    .add(drum([0, y, 0], PAN.radius, PAN.thickness / 2, PAN.thickness * 0.45), "brass")
    .add(ring([0, y + PAN.thickness * 0.6, 0], PAN.radius - PAN.rim, PAN.rim), "brass", o(0.0015))
    .add(drum([0, y - o(0.003), 0], CANDLE.radius + o(0.002), o(0.004), o(0.0015)), "brass", o(0.002))
    .geometry(o(0.0012));
}

/** The flame, a teardrop above the wick, its middle at the origin. */
function flameGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(ball([0, -o(0.004), 0], o(0.0058)), "flame")
    .add(rod([0, -o(0.004), 0], [0, o(0.013), 0], o(0.0055), o(0.0008)), "flame", o(0.004))
    .geometry(o(0.0015));
}

const PARTS = figureParts("item:candle", () => ({ wax: waxGeometry(), pan: panGeometry(), flame: flameGeometry() }));

/** The candle on its pan, unlit. */
function candle(): THREE.Group {
  const parts = PARTS.get();
  const wax = piece(parts.wax, "candle", SHINES.wax);
  const pan = piece(parts.pan, "candle pan", SHINES.brass);
  return assembled("candle", [wax, pan], [{ between: [wax, pan], at: [0, CANDLE.pan, 0], radius: PAN.radius * 1.2 }]);
}

/** A lit candle, lighting the room round whoever holds it as they go; on the floor, it stands unlit. */
export const CANDLE_MODEL = itemModel({
  card: "candle",
  parts: [PARTS],
  held: () => ({ object: burning(candle(), PARTS.get().flame, new THREE.Vector3(0, CANDLE.flame, 0)), handle: CANDLE.radius, carry: "upright" }),
  plate: { lie: new THREE.Euler(), spin: 0 },
  floor: () => onPlate(candle(), { lie: new THREE.Euler(), spin: 0 }),
});
