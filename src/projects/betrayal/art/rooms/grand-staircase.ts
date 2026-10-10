import * as THREE from "three";
import { candle, pictureFrame } from "../kit";
import type { PaletteKey } from "../palette";
import { CUT_HEIGHT, INNER, onWall, type PropPlacement, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, group, type Batch } from "../shapes";
import { newel, RAIL, runner, STAIR, SUITE } from "./starting-tile";

const STAIR_MID = (STAIR.back + STAIR.front) / 2;
/** The flight rises through the ceiling here: the balustrade stops where its
 *  rail would meet it. */
const LAST_BALUSTER = Math.floor((3.2 - RAIL) / STAIR.rise);
/** The flight is the room's identity, so when its wall is cut it is cut
 *  higher than the wall: its first steps stay, and the cut top of the rest
 *  reads as a landing, rather than a stub no higher than the skirting. */
const STAIR_CUT = 7 * STAIR.rise;
/** Steps whose treads stay below the stair's cut stay when the top wall is cut. */
const LOW_STEPS = Math.floor(STAIR_CUT / STAIR.rise + 1e-6);

/** The front (riser) edge of step `i`, counted from 1 at the foot. */
const riserX = (i: number) => STAIR.foot - (i - 1) * STAIR.going;

function beam(b: Batch, from: THREE.Vector3, to: THREE.Vector3, size: [number, number], colour: PaletteKey) {
  const along = to.clone().sub(from);
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), along.clone().normalize());
  const middle = from.clone().add(to).multiplyScalar(0.5);
  b.add([along.length(), size[0], size[1]], colour, new THREE.Matrix4().compose(middle, turn, new THREE.Vector3(1, 1, 1)));
}

/**
 * The staircase, built in room coordinates, as the part of it between heights
 * `from` and `to`, dropped by `from` so it can be placed at that height: the
 * part below the stair's cut stands on the floor, the rest hangs with the top
 * wall and hides when the camera cuts that wall away.
 */
function staircase(from: number, to: number): THREE.Group {
  const b = batch();
  const depth = STAIR.front - STAIR.back;
  const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, colour: PaletteKey) => {
    const low = Math.max(y0, from);
    const high = Math.min(y1, to);
    if (high - low < 0.005) return;
    b.block([x1 - x0, high - low, z1 - z0], colour, [(x0 + x1) / 2, low - from, (z0 + z1) / 2]);
  };
  const whole = (i: number) => i <= LOW_STEPS === (from === 0);
  for (let i = 1; i <= STAIR.steps; i++) {
    const x1 = riserX(i);
    const x0 = x1 - STAIR.going;
    const top = i * STAIR.rise;
    slab(x0, x1, 0, top - 0.04, STAIR.back, STAIR.front, "woodDark");
    if (from === 0 && !whole(i)) {
      // Where the flight is cut down with its wall, its cut top shows the carpet, so the stub still reads as a stair.
      // The cap stands a little inside the step's sides, which the hung part above shares while the wall stands.
      b.block([STAIR.going - 0.01, 0.03, depth - 0.01], "woodMid", [(x0 + x1) / 2, to, STAIR_MID]);
      b.block([STAIR.going - 0.01, 0.03, STAIR.carpet], "blood", [(x0 + x1) / 2, to + 0.015, STAIR_MID]);
      b.block([0.03, 0.03, STAIR.carpet + 0.1], "brass", [x1 - 0.02, to + 0.03, STAIR_MID]);
    }
    if (!whole(i)) continue;
    const at = (y: number) => y - from;
    b.block([STAIR.going + 0.03, 0.04, depth + 0.03], "woodMid", [(x0 + x1) / 2 + 0.015, at(top - 0.04), STAIR_MID + 0.015]);
    b.block([STAIR.going, 0.025, STAIR.carpet], "blood", [(x0 + x1) / 2 - 0.02, at(top), STAIR_MID]);
    b.block([0.025, STAIR.rise - 0.04, STAIR.carpet], "blood", [x1 + 0.0125, at(top - STAIR.rise), STAIR_MID]);
    b.block([0.03, 0.03, STAIR.carpet + 0.1], "brass", [x1 + 0.03, at(top), STAIR_MID]);
    if (i <= LAST_BALUSTER) {
      for (const x of [x1 - 0.08, x1 - 0.22]) b.block([0.04, RAIL, 0.04], "woodMid", [x, at(top), STAIR.front - 0.06]);
    }
  }
  const nose = (x: number) => ((STAIR.foot - x) / STAIR.going) * STAIR.rise;
  const stringer = (x: number) => new THREE.Vector3(x, nose(x) - 0.05 - from, STAIR.front + 0.03);
  /** Where the stringer passes from the standing part of the flight to the hung part. */
  const split = riserX(LOW_STEPS + 1) - 0.1;
  if (from === 0) {
    // It overlaps the hung part by a centimetre, so the join shows no crack.
    beam(b, stringer(riserX(3) - 0.1), stringer(split - 0.01), [0.24, 0.06], "woodMid");
  } else {
    const railEnd = riserX(LAST_BALUSTER) - STAIR.going;
    const rail = (x: number) => new THREE.Vector3(x, nose(x) + RAIL + STAIR.rise - from, STAIR.front - 0.06);
    beam(b, rail(STAIR.foot - 0.05), rail(railEnd), [0.07, 0.08], "woodDark");
    beam(b, stringer(split), stringer(-INNER), [0.24, 0.06], "woodMid");
  }
  return group(b.mesh());
}

/** A small door in the side of the flight, into the cupboard under the stairs,
 *  standing a little open on the dark. Faces +z. */
function cupboardDoor(): THREE.Group {
  const width = 0.62;
  const height = 1.35;
  const leaf = group(
    box([width, height, 0.035], flat("woodMid"), [width / 2, 0, 0.0175]),
    box([width - 0.14, height - 0.3, 0.02], flat("wood"), [width / 2, 0.15, 0.035]),
    box([0.04, 0.04, 0.04], flat("brass"), [width - 0.08, 0.7, 0.05]),
  );
  leaf.position.set(-width / 2, 0, 0.02);
  leaf.rotation.y = -0.55;
  return group(box([width, height, 0.02], flat("void"), [0, 0, 0.005]), box([width + 0.1, 0.05, 0.03], flat("woodDark"), [0, height, 0.015]), leaf);
}

/** A brass candle sconce on the wall above the flight, to light the climb. Faces +z. */
function sconce(): THREE.Group {
  const brass = flat("brass");
  const taper = candle({ height: 0.16, intensity: 2.2 });
  taper.position.set(0, 0.06, 0.18);
  const result = group(
    box([0.08, 0.22, 0.03], brass, [0, -0.1, 0.015]),
    box([0.03, 0.03, 0.18], brass, [0, -0.01, 0.09]),
    cylinder(0.06, 0.04, brass, [0, 0.02, 0.18], { top: 0.07, sides: 6 }),
  );
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  result.add(taper);
  return result;
}

const CANVAS_BACK = [
  "wwwwwwwwwwwwwwww",
  "wmmmmmmmmmmmmmmw",
  "wmbbbbbbbmbbbbmw",
  "wmbbbbbbbmbbbbmw",
  "wmbbbbbbbmbbbbmw",
  "wmbbbbbbbmbbbbmw",
  "wmbbbbbbbmbbbbmw",
  "wmbbbbbbbmbbbbmw",
  "wmmmmmmmmmmmmmmw",
  "wmbbbbbbbmbbbbmw",
  "wmbbbbbbbmbbbbmw",
  "wmbbbbbbbmbbbbmw",
  "wmbbbbbbbmbbbbmw",
  "wmbbbbbbbmbbbbmw",
  "wmbbbbbbbmbbbbmw",
  "wmbbbbbbbmbbbbmw",
  "wmbbbbbbbmbbbbmw",
  "wmbbbbbbbbbbbbmw",
  "wmmmmmmmmmmmmmmw",
  "wwwwwwwwwwwwwwww",
];

/** A portrait hung the wrong way round: its stretcher and bare canvas face
 *  the room. */
function turnedPortrait(): THREE.Group {
  return pictureFrame({ art: { rows: CANVAS_BACK, legend: { w: "woodDark", m: "wood", b: "boneDark" } }, frame: "woodDark", border: 0.03 });
}

/** A tall case clock with a pale face, its pendulum still. The case's foot
 *  stands on the floor; the rest hangs with its wall. Faces +z. */
function clock(part: "foot" | "case"): THREE.Group {
  const wood = flat("wood");
  const dark = flat("woodDark");
  if (part === "foot") {
    return group(box([0.56, 0.1, 0.36], dark, [0, 0, 0.18]), box([0.5, CUT_HEIGHT - 0.1, 0.32], wood, [0, 0.1, 0.16]));
  }
  const face = cylinder(0.17, 0.02, flat("bone"), [0, 0, 0], { sides: 12 });
  face.rotation.x = Math.PI / 2;
  face.position.set(0, 1.35, 0.33);
  const hand = (length: number, turn: number) => {
    const piece = box([0.025, length, 0.015], flat("void"), [0, 0, 0]);
    const holder = group(piece);
    holder.position.set(0, 1.35, 0.345);
    holder.rotation.z = turn;
    return holder;
  };
  return group(
    box([0.42, 0.95, 0.28], wood, [0, 0, 0.14]),
    box([0.2, 0.62, 0.02], flat("soot"), [0, 0.18, 0.285]),
    box([0.04, 0.4, 0.02], flat("brass"), [0, 0.32, 0.3]),
    box([0.13, 0.13, 0.02], flat("brass"), [0, 0.24, 0.305]),
    box([0.5, 0.06, 0.34], dark, [0, 0.95, 0.17]),
    box([0.48, 0.55, 0.32], wood, [0, 1.01, 0.16]),
    face,
    hand(0.13, Math.PI * 0.62),
    hand(0.09, -Math.PI * 0.35),
    box([0.56, 0.08, 0.38], dark, [0, 1.56, 0.19]),
    box([0.3, 0.12, 0.3], dark, [0, 1.64, 0.15]),
  );
}

/** The Grand Staircase: a broad carpeted flight climbing the back wall into
 *  the dark of the floor above, lit from its foot by the newel lamp, with the
 *  tall window's moonlight on the marble. */
export const GRAND_STAIRCASE: RoomDefinition = {
  id: "grand-staircase",
  ...SUITE,
  props: [
    { build: () => runner({ from: 0.2, to: 3, finished: ["from"] }), at: [0, 0] },
    {
      build: () => staircase(0, STAIR_CUT),
      name: "flight",
      at: [0, 0],
      contacts: [{ with: "flight above the cut", because: "one flight in two parts: the cut part's cap and stringer reach into the part above, hidden while the wall stands" }],
    },
    {
      build: () => staircase(STAIR_CUT, 4),
      name: "flight above the cut",
      at: [0, 0],
      y: STAIR_CUT,
      walls: ["top"],
      contacts: [{ with: "left", because: "the flight's string runs into the wall it climbs to" }],
    },
    {
      build: newel,
      at: [STAIR.foot - 0.04, STAIR.front - 0.06],
      contacts: [
        { with: "flight", because: "the newel post is set into the foot of the flight" },
        { with: "flight above the cut", because: "the handrail runs into the newel's top" },
      ],
    },
    { build: cupboardDoor, at: [-1.2, STAIR.front + 0.01] },
    { build: sconce, ...onWall("top", -0.6, { y: 2.55, out: 0.02 }) },
    { build: () => pictureFrame({ frame: "brass" }), ...onWall("top", 0.75, { y: 1.45 }) },
    { build: () => pictureFrame({ frame: "woodLight" }), ...onWall("top", -0.15, { y: 2.1 }) },
    { build: turnedPortrait, ...onWall("top", -1.05, { y: 2.6 }) },
    { build: () => clock("foot"), ...onWall("left", -0.9) },
    { build: () => clock("case"), ...onWall("left", -0.9, { y: CUT_HEIGHT }) },
  ] satisfies PropPlacement[],
  focus: [0.4, 1.0, -1.6],
  pawn: [1.2, 0.5],
  spots: [[0.45, 0.15], [0.55, 1.05], [-0.2, 0.7], [-0.3, -0.2], [0.4, -0.75]],
  // Up the middle of the carpet, over the middle of each tread, into the dark above.
  stairs: {
    "upper-landing": [
      [STAIR.foot + 0.8, 0, STAIR_MID],
      [STAIR.foot + STAIR.going / 2, 0, STAIR_MID],
      [STAIR.foot - (STAIR.steps - 0.5) * STAIR.going, STAIR.steps * STAIR.rise, STAIR_MID],
    ],
  },
};
