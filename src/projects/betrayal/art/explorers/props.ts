import * as THREE from "three";
import { animated } from "../animate";
import { ball, drum, figureMaterial, form, ring, rod, roundBox, sculpt } from "../forms";
import { CARRIED_LIGHT, carriedLight, flickerOf } from "../lighting";
import { glow, group } from "../shapes";
import type { ExplorerBuilder } from "../stage";
import { handsOf, holdIn, type Prop } from "./hands";

/*
 * Stand-in props for the hands to hold, until the items get art of their
 * own: one of each way a thing is carried. Each is built round its grip, as
 * `Prop` says: its handle's axis along +y through the origin, +z along the
 * hand towards the fingertips.
 *
 * Held things are oversized, as a tabletop miniature's are, so they read at
 * a glance from the house's distance: about one and a half to two times
 * their real size, a weapon most of all, and the handle as thick as the
 * oversized thing needs, which the hand closes round.
 */

/** How much bigger than life a held thing is built. */
const OVERSIZE = 1.8;
const o = (metres: number) => metres * OVERSIZE;

/** A long-barrelled revolver: a wooden grip in the fist, the frame and the
 *  fluted cylinder above it, a hammer cocked back over the thumb, a trigger
 *  guard, and a long barrel with its ejector rod and front sight running on
 *  along the hand. Carried hanging at the side, muzzle down. */
function revolverGeometry(): THREE.BufferGeometry {
  const shape = sculpt()
    // The grip, raked back from the frame, with a rounded butt.
    .add(roundBox([0, o(-0.006), o(-0.006)], [o(0.0085), o(0.03), o(0.011)], o(0.006), [0.22, 0, 0]), "woodMid")
    // The frame over the fist, from behind the hammer to the barrel.
    .add(roundBox([0, o(0.034), o(0.016)], [o(0.0075), o(0.011), o(0.03)], o(0.004)), "stone", o(0.004))
    // The cylinder, its axis along the barrel.
    .add(drum([0, o(0.04), o(0.03)], o(0.0145), o(0.016), o(0.003), [Math.PI / 2, 0, 0]), "stoneLight", o(0.002))
    // The barrel, and the ejector rod under it.
    .add(rod([0, o(0.046), o(0.045)], [0, o(0.046), o(0.17)], o(0.0058)), "stone", o(0.003))
    .add(rod([0, o(0.036), o(0.05)], [0, o(0.036), o(0.13)], o(0.0032)), "stone", o(0.002))
    // The front sight at the muzzle, and the hammer cocked back.
    .add(rod([0, o(0.05), o(0.162)], [0, o(0.056), o(0.166)], o(0.0022)), "stone", o(0.001))
    .add(rod([0, o(0.042), o(-0.01)], [0, o(0.058), o(-0.022)], o(0.0034), o(0.0026)), "stone", o(0.002))
    // The trigger guard below the frame, and the trigger in it.
    .add(ring([0, o(0.019), o(0.016)], o(0.009), o(0.0022), [0, Math.PI / 2, 0]), "stone", o(0.002))
    .add(rod([0, o(0.026), o(0.014)], [0, o(0.016), o(0.018)], o(0.002)), "stone", o(0.001));
  // Flutes down the cylinder catch the light as dark grooves.
  for (let k = 0; k < 6; k++) {
    const angle = (k / 6) * Math.PI * 2;
    shape.paint(rod([o(0.0145) * Math.cos(angle), o(0.04) + o(0.0145) * Math.sin(angle), o(0.018)], [o(0.0145) * Math.cos(angle), o(0.04) + o(0.0145) * Math.sin(angle), o(0.042)], o(0.003)), "stoneDark");
  }
  return shape.geometry(o(0.0022));
}

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

/** A spear carried upright: a long wooden shaft held a third of the way up,
 *  a broad iron head on top and a butt cap below. */
function spearGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.4, 0], [0, 1.08, 0], 0.016, 0.014), "woodMid")
    .add(rod([0, -0.43, 0], [0, -0.36, 0], 0.019), "ash", 0.005)
    .add(rod([0, 1.05, 0], [0, 1.12, 0], 0.022, 0.018), "ash", 0.005)
    .add(roundBox([0, 1.24, 0], [0.05, 0.14, 0.008], 0.006), "stoneLight", 0.014)
    .add(rod([0, 1.35, 0], [0, 1.42, 0], 0.018, 0.002), "stoneLight", 0.014)
    .geometry(0.007);
}

let meshed:
  | { revolver: THREE.BufferGeometry; candle: THREE.BufferGeometry; flame: THREE.BufferGeometry; spear: THREE.BufferGeometry }
  | undefined;

function parts() {
  meshed ??= { revolver: revolverGeometry(), candle: candleGeometry(), flame: flameGeometry(), spear: spearGeometry() };
  return meshed;
}

function prop(geometry: THREE.BufferGeometry, name: string): THREE.Mesh {
  const mesh = form(figureMaterial(), geometry);
  mesh.name = name;
  return mesh;
}

export function revolver(): Prop {
  return { object: prop(parts().revolver, "revolver"), handle: o(0.0095), carry: "hang" };
}

/**
 * A held thing that burns: its flame, a glowing teardrop at `at` (in the
 * prop's frame) that wavers, and the live light it gives (see
 * `carriedLight`), flickering with it. Any prop with a flame (a candle, a
 * lantern, a torch) carries its light this way, so the light goes wherever
 * the prop is carried.
 */
export function burning(body: THREE.Object3D, at: THREE.Vector3): THREE.Group {
  const flame = new THREE.Mesh(parts().flame, glow("flame"));
  flame.name = "flame";
  flame.position.copy(at);
  const light = carriedLight();
  light.position.copy(at);
  return animated(group(body, flame, light), (seconds) => {
    const waver = flickerOf(seconds, 1);
    light.intensity = CARRIED_LIGHT.intensity * (1 + CARRIED_LIGHT.flicker * waver);
    flame.scale.set(1 - 0.06 * waver, 1 + 0.18 * waver, 1 - 0.06 * waver);
  });
}

/** A lit candle, lighting the room round whoever holds it as they go. */
export function candle(): Prop {
  return { object: burning(prop(parts().candle, "candle"), new THREE.Vector3(0, CANDLE.flame, 0)), handle: CANDLE.radius, carry: "upright" };
}

export function spear(): Prop {
  return { object: prop(parts().spear, "spear"), handle: 0.016, carry: "upright" };
}

/** Every stand-in, by name, for the bench and the tests. */
export const STAND_INS = { revolver, candle, spear } as const;

/** A figure built holding a prop in its right hand. */
export function carrying(build: ExplorerBuilder, make: () => Prop): ExplorerBuilder {
  return (seed, gait) => {
    const figure = build(seed, gait);
    const hands = handsOf(figure);
    if (!hands) throw new Error("A figure without hands can't carry a prop");
    holdIn(hands.right, make());
    return figure;
  };
}
