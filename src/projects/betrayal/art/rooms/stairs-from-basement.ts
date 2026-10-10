import * as THREE from "three";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { candle, chair, cobweb } from "../kit";
import { paletteHex, type PaletteKey } from "../palette";
import { INNER, onWall, type PropPlacement, type RoomDefinition } from "../room";
import { batch, cylinder, flat, group, lightMaterial } from "../shapes";
import { flagstones } from "../textures";

/** The stone flight up to the Foyer: it climbs the left wall from its foot
 *  near the middle of the room (+z) to the top wall, and on through the
 *  ceiling to the secret door. */
const FLIGHT = { steps: 15, rise: 0.21, going: 0.27, foot: 1.25, width: 1.05 };
/** The open side of the flight, away from the wall. */
const SIDE = -INNER + FLIGHT.width;
const MID_X = -INNER + FLIGHT.width / 2;
/** The flight is the room's identity, so when its wall is cut it is cut
 *  higher than the wall, as the Grand Staircase's is: its first steps stay. */
const STAIR_CUT = 7 * FLIGHT.rise;
const LOW_STEPS = Math.floor(STAIR_CUT / FLIGHT.rise + 1e-6);
/** How high the hand-rail stands above each nosing. */
const RAIL = 0.9;
/** Where the light from the Foyer falls in, over the head of the flight. */
const HEAD_LIGHT: [number, number, number] = [SIDE + 0.35, 2.95, -2.2];

/** The front (nosing) edge of step `i`, counted from 1 at the foot. */
const nosing = (i: number) => FLIGHT.foot - (i - 1) * FLIGHT.going;

function beam(b: ReturnType<typeof batch>, from: THREE.Vector3, to: THREE.Vector3, size: [number, number], colour: PaletteKey) {
  const along = to.clone().sub(from);
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), along.clone().normalize());
  const middle = from.clone().add(to).multiplyScalar(0.5);
  b.add([size[0], size[1], along.length()], colour, new THREE.Matrix4().compose(middle, turn, new THREE.Vector3(1, 1, 1)));
}

/**
 * The flight, built in room metres, as the part of it between heights `from`
 * and `to`, dropped by `from` so it can be placed at that height: the part
 * below the stair's cut stands on the floor, the rest hangs with the walls it
 * climbs and hides when the camera cuts either away. Solid stone, its treads
 * worn pale in the middle, iron posts up its open side.
 */
function flight(from: number, to: number): THREE.Group {
  const b = batch();
  const rng = createRng("stairs-from-basement:treads");
  const x0 = -INNER + 0.005;
  const cx = (x0 + SIDE) / 2;
  const width = SIDE - x0;
  const whole = (i: number) => i <= LOW_STEPS === (from === 0);
  for (let i = 1; i <= FLIGHT.steps; i++) {
    const z1 = nosing(i);
    // The last step stops just short of the top wall, as the flight stops short of the left: its end never shares the plane of the walls' faces or dressing.
    const z0 = Math.max(z1 - FLIGHT.going, -INNER + 0.005);
    const top = i * FLIGHT.rise;
    const tread = pick(rng, ["stoneLight", "stoneLight", "boneDark"] as PaletteKey[]);
    // The step's body, from the floor (or the cut) up to its tread.
    const low = Math.max(0, from);
    const high = Math.min(top - 0.04, to);
    const going = z1 - z0;
    if (high - low > 0.005) b.block([width, high - low, going], "stone", [cx, low - from, (z0 + z1) / 2]);
    if (from === 0 && !whole(i)) {
      // Cut down with its wall, the step's cut top still reads as a step.
      b.block([width - 0.01, 0.03, going - 0.01], tread, [cx, to, (z0 + z1) / 2]);
      continue;
    }
    if (!whole(i)) continue;
    const at = (y: number) => y - from;
    b.block([width + 0.02, 0.04, going + 0.03], tread, [cx + 0.01, at(top - 0.04), (z0 + z1) / 2 + 0.015]);
    // Worn hollow down the middle of the tread, where every foot has gone.
    b.block([0.42, 0.012, going - 0.06], "bone", [MID_X + 0.05, at(top - 0.005), (z0 + z1) / 2 + 0.01]);
    if (i % 2 === 1 && i > 2) b.block([0.035, RAIL, 0.035], "ash", [SIDE - 0.06, at(top), z1 - FLIGHT.going / 2]);
  }
  if (from > 0) {
    const nose = (z: number) => ((FLIGHT.foot - z) / FLIGHT.going) * FLIGHT.rise;
    const rail = (z: number) => new THREE.Vector3(SIDE - 0.06, nose(z) + RAIL + FLIGHT.rise - from, z);
    // The rail is torn from its lowest posts: it starts in the air above the fifth step.
    beam(b, rail(nosing(5)), rail(-INNER + 0.05), [0.05, 0.05], "ash");
  }
  return group(b.mesh());
}

/** The two lowest rail posts, wrenched out of the first steps and bent over
 *  towards the room, the torn rail end still on one. */
function tornPosts(): THREE.Group {
  const b = batch();
  const bent = (z: number, y: number, lean: number) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(SIDE - 0.06, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, -lean)), new THREE.Vector3(1, 1, 1));
    b.add([0.035, RAIL, 0.035], "ash", m.multiply(new THREE.Matrix4().makeTranslation(0, RAIL / 2, 0)));
  };
  bent(nosing(1) - FLIGHT.going / 2, FLIGHT.rise, 0.75);
  bent(nosing(3) - FLIGHT.going / 2, 3 * FLIGHT.rise, 0.4);
  return group(b.mesh());
}

/** Warm light falling in from the Foyer over the head of the flight: a soft
 *  shaft from the ceiling onto the top steps. Hung with the walls it lies
 *  against. */
function shaft(): THREE.Mesh {
  const height = 1.6;
  const geometry = new THREE.BoxGeometry(FLIGHT.width - 0.15, height, 0.9).translate(0, height / 2, 0);
  const colours: number[] = [];
  const position = geometry.getAttribute("position");
  const warm = new THREE.Color(0xffffff);
  for (let i = 0; i < position.count; i++) {
    const t = position.getY(i) / height;
    colours.push(...warm.clone().multiplyScalar(t * t).toArray());
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  const material = lightMaterial(0.22, { vertexColors: true });
  material.color.set(paletteHex("amber"));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.noShadow = true;
  return mesh;
}

/** A low stone shelf along a wall with crocks and jars of preserves, a candle
 *  stub burning among them. Faces +z. */
function preserves(): THREE.Group {
  const length = 2.1;
  const depth = 0.42;
  const b = batch();
  b.block([length, 0.08, depth], "stone", [0, 0.36, depth / 2]);
  for (const x of [-length / 2 + 0.15, 0, length / 2 - 0.15]) b.block([0.16, 0.36, depth - 0.06], "stoneDark", [x, 0, depth / 2]);
  const rng = createRng("stairs-from-basement:jars");
  const result = group(b.mesh());
  for (let x = -length / 2 + 0.12; x < length / 2 - 0.1; x += 0.13 + rng.next() * 0.08) {
    if (Math.abs(x - 0.35) < 0.12) continue;
    const r = 0.04 + rng.next() * 0.03;
    const h = 0.12 + rng.next() * 0.12;
    const z = 0.12 + rng.next() * 0.16;
    result.add(
      cylinder(r, h, flat(pick(rng, ["boneDark", "bone", "verdigris", "brickLight"] as PaletteKey[])), [x, 0.44, z], { sides: 6 }),
      cylinder(r + 0.005, 0.025, flat(pick(rng, ["boneLight", "stoneLight"] as PaletteKey[])), [x, 0.44 + h, z], { sides: 6 }),
    );
  }
  const stub = candle({ height: 0.06, intensity: 1.0, range: 4.5, lift: 0.35 });
  stub.position.set(0.35, 0.44, 0.2);
  result.add(stub);
  return result;
}

/** The Stairs from Basement: a steep stone flight climbing the left wall
 *  towards a warm light falling from the Foyer above, its rail torn from the
 *  lowest posts, and a chair set at its foot facing up it, as if someone sat
 *  waiting for whatever comes down. */
export const STAIRS_FROM_BASEMENT: RoomDefinition = {
  id: "stairs-from-basement",
  floor: () => flagstones({ ramp: ["ash", "stoneDark", "stone", "stoneLight"], mortar: "soot", stonePx: 16, seed: "stairs-from-basement" }),
  wall: () => flagstones({ ramp: ["stoneDark", "stone", "stone", "stoneLight"], mortar: "soot", stonePx: 12, seed: "stairs-from-basement:ashlar" }),
  wainscot: () => flagstones({ ramp: ["soot", "ash", "stoneDark", "stone"], mortar: "void", stonePx: 16, seed: "stairs-from-basement:plinth" }),
  trim: "stoneDark",
  props: [
    {
      build: () => flight(0, STAIR_CUT),
      name: "flight",
      at: [0, 0],
      contacts: [{ with: "flight above the cut", because: "one flight in two parts, its cut caps hidden in the part above while the walls stand" }],
    },
    {
      build: () => flight(STAIR_CUT, 4),
      name: "flight above the cut",
      at: [0, 0],
      y: STAIR_CUT,
      walls: ["left", "top"],
    },
    { build: tornPosts, at: [0, 0], contacts: [{ with: "flight", because: "the bent posts are still set in the steps they were torn from" }] },
    { build: shaft, at: [MID_X, -2.25], y: 1.6, walls: ["left", "top"] },
    { build: () => chair({ cushion: null }), name: "chair", at: [-0.95, 0.15], turn: -70 },
    { build: preserves, ...onWall("right", 0.2, { out: 0.01 }) },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [INNER - 0.29, -(INNER - 0.29)], y: 3.05, turn: -45, walls: ["right", "top"] },
  ] satisfies PropPlacement[],
  lights: [{ at: HEAD_LIGHT, colour: "amber", intensity: 11, range: 8.5, flicker: 0.04 }],
  focus: [-1.6, 1.0, -0.4],
  pawn: [-0.7, 1.15],
  spots: [[0.35, 0.6], [0.6, -0.5], [-0.35, -1.45], [1.5, 0.95], [1.5, -1.4]],
  // Along the open side of the flight, wide of its foot, to where it starts.
  lanes: [[[MID_X, FLIGHT.foot + 0.8], [-0.6, 1.8], [0.2, 1.0], [0.2, -1.5]]],
  // Up the middle of the flight, over the middle of each tread, into the dark above.
  stairs: {
    foyer: [
      [MID_X, 0, FLIGHT.foot + 0.8],
      [MID_X, 0, FLIGHT.foot + FLIGHT.going / 2],
      [MID_X, FLIGHT.steps * FLIGHT.rise, FLIGHT.foot - (FLIGHT.steps - 0.5) * FLIGHT.going],
    ],
  },
};
