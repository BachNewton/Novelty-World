import * as THREE from "three";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { candle, cask, cobweb, coil, crate, lantern, pitHaze, pitShell, slung, strand } from "../kit";
import { lightAnchor } from "../light-anchor";
import { paletteHex, RAMPS, type PaletteKey } from "../palette";
import { INNER, TILE, onWall, type RoomDefinition } from "../room";
import { batch, box, group, projectUvs, textured, type Size } from "../shapes";
import { bricks, flagstones } from "../textures";

/** The gulf, wall to wall from the top edge to the bottom: one stretch of its
 *  ragged course after another, each with the floor's broken edge either side. */
const COURSE: { z: [number, number]; x: [number, number] }[] = [
  { z: [-INNER, -1.9], x: [-0.75, 0.95] },
  { z: [-1.9, -0.7], x: [-0.95, 0.7] },
  { z: [-0.7, 0.7], x: [-0.85, 0.85] },
  { z: [0.7, 1.8], x: [-1.05, 0.6] },
  { z: [1.8, INNER], x: [-0.7, 0.9] },
];
const SPAN = COURSE[2].x;
/** How deep the rock lining of the gulf goes before it is only dark. */
const DEPTH = 4;
/** The lining's thickness, standing inside the edge of the floor it lines. */
const LINING = 0.04;
/** Where the beams of the bridge stand either side of the way across, and their top. */
const BEAM_Z = 0.27;
const DECK = 0.012;
const POST_X = 1.08;
const RAIL_Z = 0.46;
const GULF_X: [number, number] = [Math.min(...COURSE.map((c) => c.x[0])), Math.max(...COURSE.map((c) => c.x[1]))];

/** Rough rock, for the sides of the gulf. */
function rock(): THREE.Texture {
  return flagstones({ ramp: RAMPS.stone, mortar: "void", stonePx: 10, seed: "chasm-rock" });
}

/** How the gulf's sides are lit, by depth: the room's dim light at the lip,
 *  dark below it, then the sickly glow welling up from far below. */
const DEPTH_LIGHT: [y: number, colour: PaletteKey, strength: number][] = [
  [0, "moonDark", 0.7],
  [-0.2, "void", 1],
  [-0.6, "wraithDark", 1.2],
  [-1.3, "wraith", 2],
  [-2.2, "wraithLight", 2.4],
  [-DEPTH, "wraithLight", 2.6],
];

function depthLight(y: number): THREE.Color {
  const below = DEPTH_LIGHT.findIndex(([at]) => at < y);
  const [y1, c1, s1] = DEPTH_LIGHT[below === -1 ? DEPTH_LIGHT.length - 1 : below];
  const [y0, c0, s0] = DEPTH_LIGHT[Math.max(0, (below === -1 ? DEPTH_LIGHT.length : below) - 1)];
  const t = y0 === y1 ? 0 : (y0 - y) / (y0 - y1);
  const top = new THREE.Color(paletteHex(c0)).multiplyScalar(s0);
  return top.lerp(new THREE.Color(paletteHex(c1)).multiplyScalar(s1), t);
}

/**
 * The gulf itself: its rock sides falling away from the floor's edge, a
 * sickly haze hanging at three depths over the faint glow far below, and a
 * shell in the background's own colour round it all, so from outside the
 * room nothing shows below the floor. The sides carry their own light, dark
 * near the top and sick green deep down, rather than taking the house's
 * fill, which would light them as brightly as the floor and make the gulf
 * read as a shallow pit.
 */
function gulf(): THREE.Group {
  const texture = rock();
  const pieces: THREE.BufferGeometry[] = [];
  const wall = (x0: number, x1: number, z0: number, z1: number) => {
    const geometry = new THREE.BoxGeometry(x1 - x0, DEPTH, z1 - z0, 1, 16, 1).translate((x0 + x1) / 2, -DEPTH / 2 - 0.01, (z0 + z1) / 2);
    projectUvs(geometry, texture);
    const position = geometry.getAttribute("position");
    const colours: number[] = [];
    for (let i = 0; i < position.count; i++) colours.push(...depthLight(position.getY(i)).toArray());
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    pieces.push(geometry);
  };
  for (const [i, { z, x }] of COURSE.entries()) {
    wall(x[0], x[0] + LINING, z[0], z[1]);
    wall(x[1] - LINING, x[1], z[0], z[1]);
    const next = COURSE.at(i + 1);
    if (!next) continue;
    const at = z[1];
    // Where the edge steps, the floor between the two stretches shows its broken end: line it too.
    for (const side of [0, 1] as const) {
      const [here, there] = [x[side], next.x[side]];
      if (here === there) continue;
      const opensInto = side === 0 ? there < here : there > here;
      const [lo, hi] = [Math.min(here, there), Math.max(here, there)];
      if (opensInto) wall(lo, hi, at, at + LINING);
      else wall(lo, hi, at - LINING, at);
    }
  }
  wall(COURSE[0].x[0], COURSE[0].x[1], -INNER, -INNER + LINING);
  const last = COURSE[COURSE.length - 1];
  wall(last.x[0], last.x[1], INNER - LINING, INNER);
  const material = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, fog: false });
  const haze = (y: number, opacity: number) => pitHaze({ x: GULF_X, z: [-TILE / 2 + 0.2, TILE / 2 - 0.2], y, colour: "wraithLight", opacity, fade: true });
  const shell = pitShell({ x: [GULF_X[0] - 0.06, GULF_X[1] + 0.06], z: [-TILE / 2, TILE / 2], bottom: -6 });
  const result = group(...pieces.map((piece) => new THREE.Mesh(piece, material)), haze(-0.9, 0.12), haze(-1.6, 0.25), haze(-2.6, 0.5), shell);
  // The glow far below, lighting the underside of the bridge and the walls where the gulf meets them.
  result.add(lightAnchor({ colour: "wraithLight", intensity: 14, range: 4.5, flicker: 0.1 }, [0, -3.6, -1.4]));
  result.add(lightAnchor({ colour: "wraithLight", intensity: 14, range: 4.5, flicker: 0.1 }, [0, -3.6, 1.5]));
  return result;
}

/**
 * The way across: two old joists laid over the gulf, their ends let into the
 * floor, decked with planks laid crosswise, one gone and one snapped and
 * hanging. It runs along x, the way the house walks through the room.
 */
function bridge(): THREE.Group {
  const b = batch();
  const length = SPAN[1] - SPAN[0] + 0.9;
  for (const z of [-BEAM_Z, BEAM_Z]) b.block([length, 0.14, 0.13], "woodDark", [0, DECK - 0.03 - 0.14, z]);
  const rng = createRng("chasm-planks");
  const width = 0.17;
  const missing = 5;
  const snapped = 2;
  const count = Math.floor((SPAN[1] - SPAN[0] - 0.1) / (width + 0.02));
  const start = -((count - 1) * (width + 0.02)) / 2;
  for (let i = 0; i < count; i++) {
    const x = start + i * (width + 0.02);
    if (i === missing) continue;
    const plank = 0.68 + rng.next() * 0.12;
    const shift = (rng.next() - 0.5) * 0.08;
    if (i === snapped) {
      // Snapped near one beam: its short end still nailed down, the rest hanging into the gulf.
      b.block([width, 0.03, 0.14], pick(rng, ["wood", "woodMid"]), [x, DECK - 0.03, -BEAM_Z - 0.04]);
      const hang = new THREE.Matrix4().compose(
        new THREE.Vector3(x, DECK - 0.03 - 0.3, -BEAM_Z + 0.06),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(1.25, 0, 0.15)),
        new THREE.Vector3(1, 1, 1),
      );
      b.add([width, 0.03, 0.62], "wood", hang);
      continue;
    }
    b.block([width, 0.03, plank], pick(rng, ["wood", "woodMid", "woodMid", "woodLight"]), [x, DECK - 0.03, shift]);
  }
  return group(b.mesh());
}

/** The posts at each end of the bridge, and the hand-line slung between
 *  them: the near one whole, the far one parted and trailing into the dark. */
function handLines(): THREE.Group {
  const b = batch();
  const height = 1.15;
  for (const x of [-POST_X, POST_X]) {
    for (const z of [-RAIL_Z, RAIL_Z]) {
      b.block([0.1, height, 0.1], "woodDark", [x, 0, z]);
      b.block([0.13, 0.04, 0.13], "wood", [x, height, z]);
    }
  }
  const top = height - 0.1;
  slung(b, new THREE.Vector3(-POST_X + 0.05, top, -RAIL_Z), new THREE.Vector3(POST_X - 0.05, top, -RAIL_Z), 0.32);
  // The far line has parted: its two ends hang down into the gulf from their posts.
  const fall = (from: number, toward: number) => {
    const a = new THREE.Vector3(from, top, RAIL_Z);
    const lip = new THREE.Vector3(toward, -0.05, RAIL_Z + 0.04);
    strand(b, a, lip, 0.025, "boneDark");
    strand(b, lip, new THREE.Vector3(toward + Math.sign(toward) * -0.06, -1.3, RAIL_Z + 0.1), 0.025, "boneDark");
  };
  fall(-POST_X + 0.05, SPAN[0] + 0.12);
  fall(POST_X - 0.05, SPAN[1] - 0.15);
  // An arm off the near post for the lantern.
  b.block([0.32, 0.05, 0.05], "woodDark", [-POST_X + 0.18, height - 0.12, -RAIL_Z]);
  return group(b.mesh());
}

/** An iron ring bolted into the floor, with a rope knotted to it running off
 *  over the gulf's edge and straight down: someone went down, or tried to. */
function ropeDown(): THREE.Group {
  const b = batch();
  b.block([0.12, 0.02, 0.12], "soot", [0, 0, 0]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const c = ((k + 1) / 6) * Math.PI * 2;
    strand(b, new THREE.Vector3(Math.cos(a) * 0.07, 0.07 + Math.sin(a) * 0.05, 0), new THREE.Vector3(Math.cos(c) * 0.07, 0.07 + Math.sin(c) * 0.05, 0), 0.02, "ash");
  }
  const lip = new THREE.Vector3(COURSE[1].x[1] - 1.45 + 0.02, 0.02, 0.15);
  const knot = new THREE.Vector3(-0.06, 0.04, 0);
  strand(b, knot, lip, 0.03, "boneDark");
  strand(b, lip, new THREE.Vector3(lip.x - 0.04, -2.4, lip.z + 0.05), 0.03, "boneDark");
  // The slack, coiled beside the ring.
  const slack = coil({ radii: [0.15], thick: 0.015 });
  slack.position.set(0.22, 0, 0.18);
  return group(b.mesh(), slack);
}

/** A flagstone broken from the gulf's edge, tipped half into the dark. */
function tippedFlag(): THREE.Group {
  const stone = textured(flagstones({ seed: "chasm" }));
  const slab = box([0.55, 0.08, 0.5], stone, [0.27, -0.08, 0]);
  const tipped = group(slab);
  tipped.rotation.z = -0.55;
  return group(tipped);
}

/** Rubble fallen from the gulf's broken edge: a low heap of broken stone. */
function rubble(): THREE.Group {
  const b = batch();
  const rng = createRng("chasm-rubble");
  for (let k = 0; k < 14; k++) {
    const r = Math.sqrt(rng.next()) * 0.5;
    const a = rng.next() * Math.PI * 2;
    const s = 0.08 + rng.next() * 0.14 * (1 - r);
    const at = new THREE.Vector3(Math.cos(a) * r, s * 0.35, Math.sin(a) * r * 0.7);
    b.add([s * 1.3, s * 0.7, s], pick(rng, ["stoneDark", "stone", "ash", "stone"]), new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.next() * 0.5, rng.next() * 3, rng.next() * 0.5)), new THREE.Vector3(1, 1, 1)));
  }
  return group(b.mesh());
}

/** Stacked crates, stores left in the cellar. Backs onto −z. */
function stores(): THREE.Group {
  const stack: [Size, [number, number, number]][] = [
    [[0.6, 0.5, 0.55], [0, 0, 0]],
    [[0.5, 0.42, 0.45], [0.04, 0.5, -0.02]],
    [[0.5, 0.45, 0.5], [0.62, 0, 0.05]],
  ];
  return group(
    ...stack.map(([size, at]) => {
      const piece = crate(size);
      piece.position.set(...at);
      return piece;
    }),
  );
}

/** The Chasm: a ragged gulf splits the cellar floor from wall to wall, and the
 *  only way over is a deck of old planks on two joists, under a lone lantern,
 *  with a sickly glow far below. */
export const CHASM: RoomDefinition = {
  id: "chasm",
  floor: () => flagstones({ seed: "chasm" }),
  wall: () => bricks({ seed: "chasm-brick" }),
  wainscot: () => flagstones({ ramp: RAMPS.stone, stonePx: 10, seed: "chasm-footing" }),
  trim: "stoneDark",
  floorOpenings: COURSE,
  props: [
    { build: gulf, at: [0, 0] },
    {
      build: bridge,
      at: [0, 0],
      contacts: [
        { with: "floor", because: "the joists' ends are let into the floor either side of the gulf" },
        { with: "gulf", because: "the joists rest on the gulf's edge" },
      ],
    },
    { build: handLines, at: [0, 0] },
    { build: () => lantern({ width: 0.14, height: 0.2, intensity: 3.2, range: 6 }), name: "lantern", at: [-POST_X + 0.3, -RAIL_Z], y: 1.0, contacts: [{ with: "handLines", because: "its ring hangs on the arm of the near post" }] },
    { build: ropeDown, at: [1.45, -1.3], contacts: [{ with: "gulf", because: "the rope runs over the edge and down the rock" }, { with: "floor", because: "the rope bends over the floor's broken edge" }] },
    { build: tippedFlag, at: [COURSE[3].x[0], 1.25], contacts: [{ with: "gulf", because: "it has broken from the edge and tipped into the gulf" }, { with: "floor", because: "its back edge still rests on the floor" }] },
    { build: rubble, at: [-1.75, 1.55], contacts: [{ with: "floor", because: "the broken stone lies bedded in the floor's dust" }] },
    { build: rubble, at: [1.9, 2.1], turn: 70, contacts: [{ with: "floor", because: "the broken stone lies bedded in the floor's dust" }] },
    { build: stores, ...onWall("top", -1.65, { out: 0.32 }) },
    { build: () => cask(), name: "cask", at: [2.25, -2.3] },
    { build: () => candle({ height: 0.08, intensity: 1.8 }), name: "candle", at: [2.3, -2.25], y: 0.74 },
    { build: () => candle({ height: 0.12, intensity: 1.8 }), name: "candle", at: [-1.55, -2.45], y: 0.92 },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [INNER - 0.29, -INNER + 0.29], y: 3.05, turn: -135, walls: ["right", "top"] },
  ],
  focus: [0, 0.3, 0],
  pawn: [-1.6, -0.3],
  spots: [[1.6, -0.2], [-1.75, -1.2], [1.9, -1.05], [-1.7, 0.75], [1.7, 0.95]],
  // Over the bridge, down the middle of its deck, from the floor at one end to the other.
  crossing: [
    [-1.6, 0, 0],
    [SPAN[0] - 0.3, DECK, 0],
    [SPAN[1] + 0.3, DECK, 0],
    [1.6, 0, 0],
  ],
};
