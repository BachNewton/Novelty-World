import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import type { PaletteKey } from "../palette";
import { batch, box, flat, group } from "../shapes";
import { solidLathe, vessel, type Profile } from "./vessel";

/** The stone plinth an urn stands on: square, with a cap stone a little wider. */
export const URN_PLINTH = { width: 0.42, height: 0.34, cap: 0.05 };
/** The urn's turned outside, from its foot to its rim: a stem, a swelling bowl and a rolled lip. */
export const URN_BODY: Profile = [
  [0.1, 0],
  [0.1, 0.04],
  [0.06, 0.08],
  [0.06, 0.14],
  [0.16, 0.2],
  [0.22, 0.32],
  [0.23, 0.42],
  [0.25, 0.46],
  [0.25, 0.5],
];
const URN_WALL = 0.035;
/** How far below the urn's rim its earth lies. */
const URN_EARTH = 0.07;

export interface GardenUrnOptions {
  /** Whether the urn stands on the plinth, or the plinth is bare, a pale ring on its cap where one stood. */
  urn?: boolean;
  /** The stone it is cut from: the plinth's body, and the urn and cap a step lighter. */
  stone?: [body: PaletteKey, light: PaletteKey];
  seed?: string;
}

/** What an urn planted long ago holds now: dead stalks standing up out of its earth, a few snapped over. */
function deadStalks(seed: string): THREE.Mesh {
  const rng = createRng(`urn:${seed}`);
  const b = batch();
  for (let i = 0; i < 9; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = rng.next() * 0.13;
    const tall = 0.18 + rng.next() * 0.3;
    const lean = new THREE.Euler((rng.next() - 0.5) * 0.7, 0, (rng.next() - 0.5) * 0.7);
    const at = new THREE.Vector3(Math.cos(a) * r, tall / 2 - 0.02, Math.sin(a) * r);
    b.add([0.014, tall, 0.014], rng.next() < 0.5 ? "woodDark" : "wood", new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(lean), new THREE.Vector3(1, 1, 1)));
  }
  return b.mesh();
}

/**
 * A garden urn of weathered stone on its plinth, planted long ago and left to
 * die, as terraces and balconies have them at their corners. Round, so it
 * faces every way; its base at y = 0. About a metre tall.
 */
export function gardenUrn({ urn = true, stone = ["stoneDark", "stone"], seed = "urn" }: GardenUrnOptions = {}): THREE.Group {
  const [body, light] = stone;
  const { width, height, cap } = URN_PLINTH;
  const plinth = group(box([width, height, width], flat(body)), box([width + 0.06, cap, width + 0.06], flat(light), [0, height, 0]));
  const top = height + cap;
  if (!urn) {
    // Where the urn's foot stood, the cap stone is clean and pale: the lichen grew round it.
    plinth.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.006, 12).translate(0, top + 0.003, 0), flat("stoneLight")));
    return plinth;
  }
  const bowl = vessel(URN_BODY, flat(light), { wall: URN_WALL, depth: 0.3, sides: 12 });
  bowl.position.y = top - 0.005;
  const rim = URN_BODY[URN_BODY.length - 1];
  const earth = solidLathe([[rim[0] - URN_WALL - 0.002, 0], [rim[0] - URN_WALL - 0.002, 0.02]], flat("soot"), 12);
  earth.position.y = top + rim[1] - URN_EARTH - 0.02;
  const stalks = deadStalks(seed);
  stalks.position.y = top + rim[1] - URN_EARTH;
  return group(plinth, bowl, earth, stalks);
}
