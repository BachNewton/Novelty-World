import * as THREE from "three";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { candle, cobweb } from "../kit";
import { lightAnchor } from "../light-anchor";
import { paletteHex, RAMPS, type PaletteKey } from "../palette";
import { INNER, TILE, onWall, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group, lightMaterial, projectUvs, textured, type Batch } from "../shapes";
import { flagstones, pixelTexture } from "../textures";

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

/** Coursed brick, three texels a course, laid in stretcher bond above the stone footing. */
function brick(): THREE.Texture {
  const rng = createRng("chasm-brick");
  const size = 64;
  const bodies = ["w", "m", "m", "s", "w", "m"];
  const rows: string[] = [];
  for (let course = 0; course < size / 4; course++) {
    const shift = course % 2 === 0 ? 0 : 4;
    const [top, middle, foot] = [[], [], []].map(() => Array<string>(size).fill(" "));
    for (let b = 0; b < size / 8; b++) {
      const body = pick(rng, bodies);
      const chip = rng.next() < 0.3 ? 1 + Math.floor(rng.next() * 5) : -1;
      for (let k = 0; k < 7; k++) {
        const x = (shift + b * 8 + k) % size;
        top[x] = k === 0 ? "l" : body;
        middle[x] = k === chip ? "d" : body;
        foot[x] = "d";
      }
    }
    rows.push(top.join(""), middle.join(""), foot.join(""), " ".repeat(size));
  }
  return pixelTexture(rows, { " ": "soot", w: "woodMid", m: "wood", s: "stoneDark", d: "woodDark", l: "woodLight" }, true);
}

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
  const result = group(...pieces.map((piece) => new THREE.Mesh(piece, material)), haze(-0.9, 0.12), haze(-1.6, 0.25), haze(-2.6, 0.5), shell());
  // The glow far below, lighting the underside of the bridge and the walls where the gulf meets them.
  result.add(lightAnchor({ colour: "wraithLight", intensity: 14, range: 4.5, flicker: 0.1 }, [0, -3.6, -1.4]));
  result.add(lightAnchor({ colour: "wraithLight", intensity: 14, range: 4.5, flicker: 0.1 }, [0, -3.6, 1.5]));
  return result;
}

/** A sheet of sickly light across the gulf at `y`, brightest down its middle. */
function haze(y: number, opacity: number): THREE.Mesh {
  const [x0, x1] = GULF_X;
  const geometry = new THREE.PlaneGeometry(x1 - x0, TILE - 0.4, 4, 1).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, 0);
  const centre = (x0 + x1) / 2;
  const half = (x1 - x0) / 2;
  const position = geometry.getAttribute("position");
  const colours: number[] = [];
  const bright = new THREE.Color(paletteHex("wraithLight"));
  for (let i = 0; i < position.count; i++) {
    const fall = 1 - Math.abs(position.getX(i) - centre) / half;
    colours.push(...bright.clone().multiplyScalar(0.25 + 0.75 * fall).toArray());
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  return new THREE.Mesh(geometry, lightMaterial(opacity, { vertexColors: true }));
}

/** The dark round and under the gulf, in the background's own colour. */
function shell(): THREE.Group {
  const dark = glow("soot");
  dark.side = THREE.DoubleSide;
  // The background is drawn without tone mapping, so the shell must be too to match it exactly.
  dark.toneMapped = false;
  const top = -0.2;
  const bottom = -6;
  const height = top - bottom;
  const [x0, x1] = [GULF_X[0] - 0.06, GULF_X[1] + 0.06];
  const [z0, z1] = [-TILE / 2, TILE / 2];
  const side = (w: number, d: number, x: number, z: number) => box([w, height, d], dark, [x, bottom, z]);
  return group(
    side(x1 - x0, 0.01, (x0 + x1) / 2, z0),
    side(x1 - x0, 0.01, (x0 + x1) / 2, z1),
    side(0.01, z1 - z0, x0, 0),
    side(0.01, z1 - z0, x1, 0),
    box([x1 - x0, 0.01, z1 - z0], dark, [(x0 + x1) / 2, bottom, 0]),
  );
}

/** A box from `a` to `b` (its centreline), `thick` square: a rope's length, a leaning plank. */
function strand(b: Batch, a: THREE.Vector3, to: THREE.Vector3, thick: number, colour: PaletteKey) {
  const along = to.clone().sub(a);
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), along.clone().normalize());
  const middle = a.clone().add(to).multiplyScalar(0.5);
  b.add([along.length() + thick * 0.6, thick, thick], colour, new THREE.Matrix4().compose(middle, turn, new THREE.Vector3(1, 1, 1)));
}

/** A rope slung between two points, sagging `sag` at its middle. */
function slung(b: Batch, a: THREE.Vector3, to: THREE.Vector3, sag: number, colour: PaletteKey = "boneDark") {
  const steps = 8;
  const point = (t: number) => a.clone().lerp(to, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0));
  for (let i = 0; i < steps; i++) strand(b, point(i / steps), point((i + 1) / steps), 0.025, colour);
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

/** An iron lantern, hung from its ring: a pierced cage round a candle, the one
 *  warm light of the room. Its origin is the hook. */
function lantern(): THREE.Group {
  const iron = flat("soot");
  const cage = batch();
  const w = 0.16;
  const h = 0.22;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cage.block([0.02, h, 0.02], "ash", [(sx * w) / 2, -h - 0.05, (sz * w) / 2]);
  cage.block([w + 0.04, 0.03, w + 0.04], "ash", [0, -h - 0.08, 0]);
  const panes = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, h - 0.02, w - 0.02).translate(0, -h / 2 - 0.05, 0), lightMaterial(0.3));
  (panes.material as THREE.MeshBasicMaterial).color.set(paletteHex("amber"));
  const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0).scale(1, 2, 1).translate(0, -h + 0.02, 0), glow("flame"));
  const result = group(
    cage.mesh(),
    cylinder(0.1, 0.06, iron, [0, -0.05, 0], { top: 0.02, sides: 4 }),
    cylinder(0.025, 0.05, iron, [0, -0.05, 0], { sides: 4 }),
    cylinder(0.03, 0.09, flat("bone"), [0, -h - 0.05, 0], { sides: 6 }),
    flame,
    panes,
  );
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  result.add(lightAnchor({ colour: "amber", intensity: 3.2, range: 6, flicker: 0.15 }, [0, -h + 0.06, 0]));
  return result;
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
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const c = ((k + 1) / 10) * Math.PI * 2;
    strand(b, new THREE.Vector3(0.22 + Math.cos(a) * 0.16, 0.015, 0.18 + Math.sin(a) * 0.13), new THREE.Vector3(0.22 + Math.cos(c) * 0.16, 0.015, 0.18 + Math.sin(c) * 0.13), 0.03, "boneDark");
  }
  return group(b.mesh());
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

/** Stacked crates and a barrel, stores left in the cellar. Backs onto −z. */
function stores(): THREE.Group {
  const b = batch();
  const crate = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    b.block([w, h, d], "wood", [x, y, z]);
    for (const sx of [-1, 1]) b.block([0.05, h + 0.01, d + 0.02], "woodDark", [x + (sx * (w - 0.05)) / 2, y - 0.005, z]);
    b.block([w - 0.1, 0.05, d + 0.015], "woodMid", [x, y + h / 2 - 0.025, z]);
  };
  crate(0.6, 0.5, 0.55, 0, 0, 0);
  crate(0.5, 0.42, 0.45, 0.04, 0.5, -0.02);
  crate(0.5, 0.45, 0.5, 0.62, 0, 0.05);
  return group(b.mesh());
}

/** An upright cask on its end, hooped in iron. */
function cask(): THREE.Group {
  const staves = flat("woodMid");
  const hoop = flat("soot");
  return group(
    cylinder(0.24, 0.72, staves, [0, 0, 0], { sides: 10, top: 0.24 }),
    cylinder(0.255, 0.04, hoop, [0, 0.1, 0], { sides: 10 }),
    cylinder(0.255, 0.04, hoop, [0, 0.58, 0], { sides: 10 }),
    cylinder(0.22, 0.02, flat("wood"), [0, 0.72, 0], { sides: 10 }),
  );
}

/** The Chasm: a ragged gulf splits the cellar floor from wall to wall, and the
 *  only way over is a deck of old planks on two joists, under a lone lantern,
 *  with a sickly glow far below. */
export const CHASM: RoomDefinition = {
  id: "chasm",
  floor: () => flagstones({ seed: "chasm" }),
  wall: brick,
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
    { build: lantern, at: [-POST_X + 0.3, -RAIL_Z], y: 1.0, contacts: [{ with: "handLines", because: "its ring hangs on the arm of the near post" }] },
    { build: ropeDown, at: [1.45, -1.3], contacts: [{ with: "gulf", because: "the rope runs over the edge and down the rock" }, { with: "floor", because: "the rope bends over the floor's broken edge" }] },
    { build: tippedFlag, at: [COURSE[3].x[0], 1.25], contacts: [{ with: "gulf", because: "it has broken from the edge and tipped into the gulf" }, { with: "floor", because: "its back edge still rests on the floor" }] },
    { build: rubble, at: [-1.75, 1.55], contacts: [{ with: "floor", because: "the broken stone lies bedded in the floor's dust" }] },
    { build: rubble, at: [1.9, 2.1], turn: 70, contacts: [{ with: "floor", because: "the broken stone lies bedded in the floor's dust" }] },
    { build: stores, ...onWall("top", -1.65, { out: 0.32 }) },
    { build: cask, at: [2.25, -2.3] },
    { build: () => candle({ height: 0.08, intensity: 1.8 }), name: "candle", at: [2.3, -2.25], y: 0.74 },
    { build: () => candle({ height: 0.12, intensity: 1.8 }), name: "candle", at: [-1.55, -2.45], y: 0.92 },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [INNER - 0.29, -INNER + 0.29], y: 3.05, turn: -135, walls: ["right", "top"] },
  ],
  focus: [0, 0.3, 0],
  pawn: [-2.0, 0],
};
