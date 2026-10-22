import * as THREE from "three";
import { ball, drum, rod, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { burning, itemModel, o, onPlate, piece } from "./item";

/*
 * The Candle (item): a stand-in still, carried over from the first held
 * props, to be finished to the weapons' standard. It is always in hand and
 * lit, since it carries a live light.
 */

/** The candle's height of wax above the fist, and where its flame burns. */
const CANDLE = { radius: o(0.011), top: o(0.085), flame: o(0.1) };

/** A candle held in the fist, its wax rising above the thumb, a drip down its side, and the wick on top. */
function candleGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(drum([0, (CANDLE.top + o(-0.012)) / 2, 0], CANDLE.radius, (CANDLE.top - o(-0.012)) / 2, o(0.003)), "boneLight")
    .add(rod([CANDLE.radius * 0.8, CANDLE.top - o(0.006), o(0.004)], [CANDLE.radius * 0.95, CANDLE.top - o(0.03), o(0.005)], o(0.0028), o(0.002)), "boneLight", o(0.002))
    .add(rod([0, CANDLE.top - o(0.002), 0], [0, CANDLE.top + o(0.008), 0], o(0.0012)), "soot")
    .geometry(o(0.0018));
}

/** The flame, a teardrop above the wick, its middle at the origin. */
function flameGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(ball([0, -o(0.004), 0], o(0.0055)), "flame")
    .add(rod([0, -o(0.004), 0], [0, o(0.012), 0], o(0.0052), o(0.0008)), "flame", o(0.004))
    .geometry(o(0.0015));
}

const PARTS = figureParts("item:candle", () => ({ candle: candleGeometry(), flame: flameGeometry() }));

const wax = () => piece(PARTS.get().candle, "candle", SHINES.wax);

/** A lit candle, lighting the room round whoever holds it as they go; on the floor, it stands unlit. */
export const CANDLE_MODEL = itemModel({
  card: "candle",
  parts: [PARTS],
  held: () => ({ object: burning(wax(), PARTS.get().flame, new THREE.Vector3(0, CANDLE.flame, 0)), handle: CANDLE.radius, carry: "upright" }),
  plate: { lie: new THREE.Euler(), spin: 0 },
  floor: () => onPlate(wax(), { lie: new THREE.Euler(), spin: 0 }),
});
