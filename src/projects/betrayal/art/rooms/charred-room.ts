import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { chair, cobweb } from "../kit";
import { fire } from "../kit/flame";
import { solidLathe } from "../kit/vessel";
import { lightAnchor } from "../light-anchor";
import { flickerOf } from "../lighting";
import type { PaletteKey } from "../palette";
import { crossLanes, INNER, onWall, type RoomDefinition } from "../room";
import { batch, box, flat, glow, group, lightMaterial, pixelPlane } from "../shapes";
import { shiny, SHINES } from "../shine";
import { panelling, pixelTexture, TEXELS_PER_METRE, wallpaper } from "../textures";
import type { WallMark } from "../wall-marks";
import type { Edge } from "../../types";

const SEED = "charred-room";
/** Where the armchair stands, where the fire began: the heart of the burn. */
const CHAIR: [x: number, z: number] = [-1.35, -1.25];
/** The chair faces across the room, out of its corner. */
const CHAIR_TURN = 45;
/** A big wingback, built a size up so it holds the room from across the house. */
const CHAIR_SCALE = 1.2;
/** The flame signal the chair's embers smoulder with. */
const SMOULDER = 2;
/** The fallen beam: its high end on the rubble in the corner, its low end out towards the middle of the room. */
const BEAM = (() => {
  const from: [x: number, z: number] = [-2.15, 2.15];
  const turn = 134;
  const length = 2.0;
  const angle = (turn * Math.PI) / 180;
  return { from, turn, length, end: [from[0] + Math.sin(angle) * length, from[1] + Math.cos(angle) * length] as [x: number, z: number] };
})();
/** The flame signal the fallen beam's end smoulders with. */
const BEAM_SIGNAL = 3;
/** Texels across the tile. */
const TILE_PX = 192;
/** Floorboard width in texels (25 cm). */
const PLANK_PX = 8;

/**
 * How hard the fire burnt at a point of the floor: 1 at the chair, 0 at the
 * burn's ragged edge, below 0 beyond it. It spread further along the boards
 * (x) than across them, and its edge runs out in uneven tongues.
 */
function heat(x: number, z: number): number {
  const dx = (x - CHAIR[0]) * 0.78;
  const dz = z - CHAIR[1];
  const angle = Math.atan2(dz, dx);
  const reach = 2.5 * (0.82 + 0.14 * Math.sin(3 * angle + 0.6) + 0.09 * Math.sin(7 * angle + 2.1) + 0.05 * Math.sin(13 * angle + 0.4));
  return 1 - Math.hypot(dx, dz) / reach;
}

/** The floor's char, from unburnt boards (0) to boards burnt to ash (3). */
type Char = 0 | 1 | 2 | 3;

function charOf(h: number): Char {
  return h > 0.62 ? 3 : h > 0.36 ? 2 : h > 0.1 ? 1 : 0;
}

/**
 * The whole tile's boards, burnt: for each texel (indexed from the tile's
 * corner, x then z) the floor's colour and, where the boards still glow, the
 * glow's. Laid out plank by plank, each plank burnt in blocks a few texels
 * long, so the char reads as burnt boards and not as noise.
 */
const BOARDS = (() => {
  const rng = createRng(`${SEED}-boards`);
  const floor = Array.from({ length: TILE_PX }, () => Array.from({ length: TILE_PX }, () => "a"));
  const embers = Array.from({ length: TILE_PX }, () => Array.from({ length: TILE_PX }, () => "."));
  const metres = (texel: number) => (texel + 0.5) / TEXELS_PER_METRE - 3;
  for (let top = 0; top < TILE_PX; top += PLANK_PX) {
    const z = metres(top + PLANK_PX / 2);
    for (let x = -Math.floor(rng.next() * 40); x < TILE_PX; ) {
      const length = 28 + Math.floor(rng.next() * 42);
      const body = pick(rng, ["a", "b"] as const);
      const ash = pick(rng, ["k", "t", "k"] as const);
      const charred = pick(rng, ["s", "l", "l", "h"] as const);
      const jitter = (rng.next() - 0.5) * 0.18;
      for (let block = x; block < x + length; ) {
        const span = 3 + Math.floor(rng.next() * 4);
        const h = heat(metres(block + span / 2), z) + jitter + (rng.next() - 0.5) * 0.08;
        const char = charOf(h);
        const glowing = h > 0.6;
        // Only some lengths of a seam still glow, so the embers read as broken dashes, not a lattice.
        const ember = rng.next() < 0.5;
        const colours: Record<Char, { body: string; seam: string; checked: boolean }> = {
          0: { body, seam: "d", checked: false },
          1: { body: "d", seam: "s", checked: false },
          2: { body: charred, seam: "v", checked: true },
          3: { body: ash, seam: "v", checked: true },
        };
        const { body: fill, seam, checked } = colours[char];
        for (let col = block; col < Math.min(block + span, x + length); col++) {
          if (col < 0 || col >= TILE_PX) continue;
          const end = col === x + length - 1;
          const crack = checked && col === block;
          for (let row = top; row < top + PLANK_PX; row++) {
            floor[row][col] = row === top || end ? seam : crack ? "v" : fill;
            if (glowing && row === top && ember) embers[row][col] = h > 0.82 ? "a" : "e";
          }
        }
        block += span;
      }
      x += length;
    }
  }
  return { floor, embers };
})();

const FLOOR_LEGEND = { a: "wood", b: "woodMid", d: "woodDark", s: "soot", l: "sootLight", v: "void", h: "ash", k: "stoneDark", t: "stone" } as const;

/** The floor's texture over the whole tile: a texel's column is x × 32 and its row z × 32, wrapping at the tile's edge. */
function burntBoards(): THREE.Texture {
  const rows = Array.from({ length: TILE_PX }, (_, r) => BOARDS.floor[(r + TILE_PX / 2) % TILE_PX].join(""));
  const shifted = rows.map((row) => row.slice(TILE_PX / 2) + row.slice(0, TILE_PX / 2));
  return pixelTexture(shifted, FLOOR_LEGEND, true);
}

/** A flat decal over the floor, `y` up off the boards, with its texels on the floor's grid when its corner is. */
function floorDecal(texture: THREE.Texture, y: number, material?: THREE.Material): THREE.Mesh {
  const plane = pixelPlane(texture, { alpha: true });
  if (material) plane.material = material;
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = y;
  plane.userData.noShadow = true;
  return plane;
}

/** Texels of the glowing seams' patch, from the tile's corner. */
const EMBER_PATCH = { col: 24, row: 28, size: 96 };

/** The seams of the boards nearest the chair, still glowing, wavering with its embers. Built in room metres. */
function glowingSeams(): THREE.Group {
  const { col, row, size } = EMBER_PATCH;
  const rows = BOARDS.embers.slice(row, row + size).map((line) => line.slice(col, col + size).join(""));
  const texture = pixelTexture(rows, { a: "amber", e: "ember" });
  const material = lightMaterial(1, { map: texture });
  const plane = floorDecal(texture, 0.004, material);
  plane.position.x = (col + size / 2) / TEXELS_PER_METRE - 3;
  plane.position.z = (row + size / 2) / TEXELS_PER_METRE - 3;
  return group(
    animated(plane, (seconds) => {
      material.opacity = 0.75 + 0.25 * flickerOf(seconds, SMOULDER);
    }),
  );
}

/** A rug burnt away up to a ragged black edge on the side towards the chair. Built in room metres. */
function burntRug(): THREE.Group {
  const [left, top, width, length] = [-16, -26, 72, 90];
  const rng = createRng(`${SEED}-rug`);
  const rows: string[] = [];
  for (let r = 0; r < length; r++) {
    let line = "";
    for (let c = 0; c < width; c++) {
      const h = heat((left + c + 0.5) / TEXELS_PER_METRE, (top + r + 0.5) / TEXELS_PER_METRE) + (rng.next() - 0.5) * 0.05;
      const edge = Math.min(c, width - 1 - c, r - 3, length - 4 - r);
      const fringe = (r < 3 || r >= length - 3) && c % 2 === 1;
      // The pattern: a border band, a fine line inside it, and a diamond in the field.
      const diamond = Math.abs(c - width / 2) / (width * 0.3) + Math.abs(r - length / 2) / (length * 0.28);
      const pattern = fringe ? "f" : r < 3 || r >= length - 3 ? "." : edge < 6 ? "o" : edge === 8 ? "m" : diamond < 0.35 ? "m" : diamond < 0.55 ? "o" : "r";
      line += h > 0.2 ? "." : h > 0.12 ? (pattern === "." ? "." : pick(rng, ["v", "s"] as const)) : pattern;
    }
    rows.push(line);
  }
  const rug = floorDecal(pixelTexture(rows, { r: "blood", o: "bloodDark", m: "brass", f: "boneDark", v: "void", s: "soot" }), 0.006);
  rug.position.set((left + width / 2) / TEXELS_PER_METRE, 0.006, (top + length / 2) / TEXELS_PER_METRE);
  return group(rug);
}

/** A bare iron coil spring of three turns standing on `at`, leaning by `lean`, added to `parts`. */
function spring(parts: THREE.BufferGeometry[], at: THREE.Vector3, lean: number): void {
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.TorusGeometry(0.05 - (i === 1 ? 0.012 : 0), 0.008, 4, 10).rotateX(Math.PI / 2);
    ring.translate(0, 0.02 + i * 0.065, 0).rotateZ(lean).translate(at.x, at.y, at.z);
    parts.push(ring);
  }
}

/**
 * The burnt-out skeleton of a wingback armchair where the fire began: its
 * upholstery gone, its charred frame open to the bare springs, one wing burnt
 * to a stump and its top rail broken and sagging. Faces +z.
 */
function burntArmchair(): THREE.Group {
  const b = batch();
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const rail = (size: [number, number, number], tint: PaletteKey, at: THREE.Vector3, turn = new THREE.Euler()) =>
    b.add(size, tint, new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(turn), v(1, 1, 1)));
  // Short legs, the front two charred thinner.
  for (const [x, z, w] of [[-0.33, -0.3, 0.07], [0.33, -0.3, 0.07], [-0.33, 0.3, 0.05], [0.33, 0.3, 0.055]] as const) b.block([w, 0.2, w], "void", [x, 0, z]);
  // The seat's frame, and the stretchers the springs stood on.
  b.block([0.74, 0.14, 0.06], "soot", [0, 0.2, 0.3]);
  b.block([0.74, 0.14, 0.06], "soot", [0, 0.2, -0.3]);
  b.block([0.06, 0.14, 0.54], "sootLight", [-0.34, 0.2, 0]);
  b.block([0.06, 0.13, 0.54], "soot", [0.34, 0.2, 0]);
  // The back posts, raked a little, and what is left of its rails.
  for (const x of [-0.33, 0.33]) rail([0.07, 0.92, 0.07], x < 0 ? "soot" : "sootLight", v(x, 0.66, -0.34), new THREE.Euler(-0.08, 0, 0));
  rail([0.6, 0.06, 0.05], "soot", v(0, 0.58, -0.36), new THREE.Euler(-0.08, 0, 0));
  rail([0.34, 0.06, 0.06], "sootLight", v(-0.15, 1.08, -0.39), new THREE.Euler(-0.08, 0, 0.04));
  // The top rail's other half, burnt through and hanging from its post.
  rail([0.3, 0.05, 0.05], "soot", v(0.22, 0.98, -0.39), new THREE.Euler(-0.08, 0, 0.75));
  // Webbing, burnt to a few hanging strips.
  for (const [x, top, drop] of [[-0.14, 1.04, 0.3], [0.02, 0.98, 0.22], [-0.24, 1.0, 0.16]] as const) rail([0.04, drop, 0.008], "void", v(x, top - drop / 2, -0.37), new THREE.Euler(-0.08, 0, 0));
  // The arms: a front post and a rail on each side, the left rail burnt short.
  for (const x of [-0.36, 0.36]) b.block([0.07, 0.42, 0.07], "soot", [x, 0.2, 0.28]);
  b.block([0.1, 0.05, 0.66], "sootLight", [-0.36, 0.6, -0.02]);
  b.block([0.09, 0.05, 0.38], "soot", [0.36, 0.6, 0.12]);
  // A last scrap of its red velvet on the right arm, scorched black at its edges.
  b.block([0.11, 0.025, 0.2], "bloodDark", [-0.36, 0.645, -0.12]);
  b.block([0.012, 0.12, 0.16], "bloodDark", [-0.415, 0.53, -0.12]);
  // The wings: the right one's frame whole, the left one burnt to a stump.
  b.block([0.05, 0.05, 0.3], "soot", [-0.36, 1.0, -0.2]);
  b.block([0.045, 0.42, 0.045], "soot", [-0.36, 0.62, -0.06]);
  b.block([0.05, 0.2, 0.05], "void", [0.36, 0.62, -0.08]);
  // Charred lumps of stuffing round its feet.
  const rng = createRng(`${SEED}-chair-ash`);
  for (let i = 0; i < 9; i++) {
    const angle = rng.next() * Math.PI * 2;
    const r = 0.44 + rng.next() * 0.16;
    const size = 0.05 + rng.next() * 0.05;
    rail([size, 0.018 + i * 0.0015, size * 1.2], pick(rng, ["ash", "sootLight", "stoneDark"] as const), v(Math.cos(angle) * r, 0.006, Math.sin(angle) * r), new THREE.Euler(0, angle, 0));
  }
  const frame = b.mesh();
  const coils: THREE.BufferGeometry[] = [];
  for (const x of [-0.2, 0, 0.2]) for (const z of [-0.16, 0.02, 0.2]) spring(coils, v(x, 0.22, z), x === 0.2 && z === 0.2 ? 0.5 : x * z * 3);
  const springs = new THREE.Mesh(mergeGeometries(coils), shiny(flat("stoneDark"), SHINES.iron));
  // A web strung across the corner of the back's frame, though the chair still smoulders.
  const web = cobweb({ form: "fan" });
  web.position.set(-0.3, 1.05, -0.34);
  const chair = group(frame, springs, web);
  chair.scale.setScalar(CHAIR_SCALE);
  return group(chair);
}

/**
 * The embers still smouldering in the chair's burnt-out seat, under its
 * springs, low flames licking up between them: the room's light, from below.
 * Faces +z with the chair.
 */
function smoulder(): THREE.Group {
  const rows = [
    "eeaeeeveeaeeeeaee",
    "eavaeeeeaeveeaeve",
    "eeeeaveeeeeaeeeee",
    "aeveeeeafaeeveeae",
    "eeeeaeeaaaeeeaeee",
    "eveeeefaafeeeeeve",
    "eeaeeeeaaeeaveeee",
    "eeeveaeeeeeeeeaee",
    "eaeeeeeveeaeeveee",
    "eeeeaeeeeeeeaeeae",
    "evaeeeaeveeeeeeee",
    "eeeeeeeeeeeaeveae",
    "eaeveeaeeaeeeeeee",
    "eeeeeeeeeeeeaeeve",
  ];
  const texture = pixelTexture(rows, { e: "ember", a: "amber", f: "flame", v: "soot" });
  const bed = box([0.56, 0.02, 0.48], glow("ember", texture), [0, 0.19, 0]);
  bed.userData.noShadow = true;
  // The bed brightens and dims with the light it throws.
  const pulse = lightMaterial(0.5, { map: texture });
  const breath = box([0.56, 0.002, 0.48], pulse, [0, 0.212, 0]);
  breath.userData.noShadow = true;
  const flames = fire({ width: 0.42, depth: 0.32, height: 0.13, signal: SMOULDER });
  flames.position.y = 0.2;
  const embers = group(
    bed,
    animated(breath, (seconds) => {
      pulse.opacity = 0.35 + 0.35 * flickerOf(seconds, SMOULDER);
    }),
    flames,
    lightAnchor({ colour: "amber", intensity: 16, range: 10, flicker: 0.3, signal: SMOULDER, kind: "fire" }, [0, 0.5, 0.05]),
  );
  embers.scale.setScalar(CHAIR_SCALE);
  return group(embers);
}

/** Lifts a built piece so its lowest point rests on the floor. */
function onFloor(piece: THREE.Object3D): THREE.Group {
  piece.updateMatrixWorld(true);
  piece.position.y -= new THREE.Box3().setFromObject(piece).min.y;
  return group(piece);
}

/** The chair's little tripod table, knocked over onto its side, one foot burnt off. Its top falls towards +z. */
function toppledTable(): THREE.Group {
  const b = batch();
  b.block([0.05, 0.62, 0.05], "soot", [0, 0.06, 0]);
  for (let i = 0; i < 2; i++) {
    const angle = (i / 3) * Math.PI * 2;
    b.add([0.04, 0.04, 0.3], "void", new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(angle) * 0.14, 0.05, Math.cos(angle) * 0.14), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, angle, 0)), new THREE.Vector3(1, 1, 1)));
  }
  const table = group(b.mesh(), cylinder8(0.26, 0.03, "sootLight", 0.68));
  table.rotation.x = 1.42;
  return onFloor(table);
}

/** A flat-faced eight-sided disc. */
function cylinder8(radius: number, height: number, colour: PaletteKey, y: number): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 8).translate(0, y + height / 2, 0);
  return new THREE.Mesh(geometry, flat(colour));
}

/** The oil lamp that stood on the table, lying where it fell, its chimney in pieces round it. Lies along x. */
function fallenLamp(): THREE.Group {
  const metal = shiny(flat("brass"), SHINES.tarnishedBrass);
  const font = solidLathe([[0.04, 0], [0.075, 0.03], [0.08, 0.08], [0.05, 0.13], [0.025, 0.15], [0.03, 0.18]], metal, 10);
  const foot = solidLathe([[0.065, 0], [0.06, 0.02], [0.025, 0.04], [0.03, 0.06]], flat("sootLight"), 8);
  foot.position.y = -0.06;
  const lamp = group(font, foot);
  lamp.rotation.z = Math.PI / 2 - 0.1;
  lamp.position.set(0, 0.078, 0);
  const shards = batch();
  const rng = createRng(`${SEED}-glass`);
  for (let i = 0; i < 9; i++) {
    const at = new THREE.Vector3(-0.15 - rng.next() * 0.25, 0.004 + i * 0.0007, (rng.next() - 0.5) * 0.4);
    shards.add([0.03 + rng.next() * 0.04, 0.006, 0.02 + rng.next() * 0.03], pick(rng, ["stoneLight", "stone"] as const), new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.next() * 3, 0)), new THREE.Vector3(1, 1, 1)));
  }
  const glass = shards.mesh();
  shiny(glass.material, SHINES.glass);
  return group(lamp, glass);
}

/** A charred ceiling beam come down across the corner, its high end on a heap of plaster and laths. Runs along +z. */
function fallenBeam(): THREE.Group {
  const { length } = BEAM;
  const tilt = Math.asin(0.24 / length);
  const b = batch();
  b.add([0.2, 0.2, length], "ash", new THREE.Matrix4().compose(new THREE.Vector3(0, 0.15 + 0.12 * Math.cos(tilt), length / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)), new THREE.Vector3(1, 1, 1)));
  // Char checks across its top, a step proud of it.
  for (let i = 1; i < 9; i++) {
    const z = (i / 9) * length;
    b.add([0.21, 0.012, 0.03], "soot", new THREE.Matrix4().compose(new THREE.Vector3(0, 0.25 + 0.24 * (1 - z / length) + 0.004, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)), new THREE.Vector3(1, 1, 1)));
  }
  // The heap under its high end: lumps of ceiling plaster and the laths it hung from.
  const rng = createRng(`${SEED}-rubble`);
  for (let i = 0; i < 26; i++) {
    const r = Math.sqrt(rng.next()) * 0.42;
    const angle = rng.next() * Math.PI * 2;
    const size = 0.06 + rng.next() * 0.1;
    const y = Math.max(0, 0.2 * (1 - r / 0.42));
    b.add([size, size * 0.45, size * 0.8], pick(rng, ["boneDark", "stone", "boneDark", "stoneDark", "ash"] as const), new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(angle) * r, y + size * 0.3, -0.1 + Math.sin(angle) * r * 0.8), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.next() * 0.25, rng.next() * 3, rng.next() * 0.25)), new THREE.Vector3(1, 1, 1)));
  }
  for (let i = 0; i < 9; i++) {
    // Laid in steps of a couple of millimetres, every one below the house's marks on the floor.
    const at = new THREE.Vector3((rng.next() - 0.5) * 0.7, 0.004 + i * 0.002, 0.3 + rng.next() * 1.2);
    b.add([0.03, 0.008, 0.6 + rng.next() * 0.4], pick(rng, ["woodDark", "soot", "wood"] as const), new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (rng.next() - 0.5) * 1.6, 0)), new THREE.Vector3(1, 1, 1)));
  }
  return group(b.mesh());
}

/** The fallen beam's low end, still glowing where it lies. Its end face looks along +z. */
function beamEmbers(): THREE.Group {
  const texture = pixelTexture(["eaee.e", "aeaeae", "eefaee", "eaeaea", "e.eeae", "aeeee."], { e: "ember", a: "amber", f: "flame", ".": "soot" });
  const end = box([0.19, 0.19, 0.01], glow("ember", texture), [0, 0.055, 0.008]);
  const material = end.material as THREE.MeshBasicMaterial;
  end.userData.noShadow = true;
  return group(
    animated(end, (seconds) => {
      material.color.setScalar(0.8 + 0.2 * flickerOf(seconds, BEAM_SIGNAL));
    }),
    lightAnchor({ colour: "ember", intensity: 1.5, range: 4, flicker: 0.3, signal: BEAM_SIGNAL, kind: "fire" }, [0, 0.35, 0.2]),
  );
}

/** A low cabinet against the wall, scorched, its doors gone but one, which hangs by a hinge, its books burnt to stubs. Faces +z. */
function burntCabinet(): THREE.Group {
  const b = batch();
  const [w, h, d] = [1.1, 0.42, 0.38];
  // Far from where the fire began, it is only scorched: blackened along its top, its wood still showing below.
  b.block([w, 0.04, d], "soot", [0, h - 0.04, 0]);
  b.block([0.04, h - 0.04, d - 0.02], "wood", [-w / 2 + 0.02, 0, 0]);
  b.block([0.04, h - 0.04, d - 0.02], "woodMid", [w / 2 - 0.02, 0, 0]);
  b.block([w - 0.08, 0.04, d - 0.02], "wood", [0, 0, 0]);
  b.block([w - 0.08, h - 0.08, 0.02], "soot", [0, 0.04, -d / 2 + 0.02]);
  b.block([0.03, h - 0.08, d - 0.06], "wood", [0, 0.04, 0]);
  // What is left of its contents: a few burnt book stubs.
  for (const [x, tall] of [[-0.4, 0.14], [-0.34, 0.11], [-0.29, 0.16], [0.25, 0.09]] as const) b.block([0.05, tall, 0.2], "sootLight", [x, 0.04, -0.03]);
  const result = group(b.mesh());
  const door = box([0.5, h - 0.1, 0.025], flat("woodMid"), [0.25, 0, 0]);
  const hinge = group(door);
  hinge.position.set(w / 2 - 0.03, 0.05, d / 2 + 0.015);
  hinge.rotation.set(0, -1.3, 0.04);
  result.add(hinge);
  return result;
}

/** A picture frame on the wall, its canvas burnt out of it but for a scorched lower edge, hung crooked. Back at z = 0. */
function burntFrame(): THREE.Group {
  const b = batch();
  const [w, h, border] = [0.62, 0.5, 0.06];
  b.block([w, border, 0.035], "soot", [0, 0, 0.018]);
  b.block([w, border, 0.035], "soot", [0, h - border, 0.018]);
  b.block([border - 0.006, h - border * 2 + 0.004, 0.03], "sootLight", [-w / 2 + border / 2, border - 0.002, 0.016]);
  b.block([border - 0.006, h - border * 2 + 0.004, 0.03], "brass", [w / 2 - border / 2, border - 0.002, 0.016]);
  // The canvas, burnt away to a ragged strip at the bottom.
  for (const [x, tall] of [[-0.225, 0.09], [-0.135, 0.13], [-0.045, 0.07], [0.045, 0.11], [0.135, 0.05], [0.225, 0.08]] as const) {
    b.block([0.088, tall, 0.006], "boneDark", [x, border, 0.01]);
    b.block([0.084, 0.02, 0.014], "void", [x, border + tall - 0.012, 0.01]);
  }
  const frame = group(b.mesh());
  frame.rotation.z = 0.11;
  return group(frame);
}

/** A dining chair, out of the fire's reach, knocked onto its back. Its seat faced +z before it fell. */
function fallenChair(): THREE.Group {
  const piece = chair({ cushion: "bloodDark" });
  piece.rotation.x = -Math.PI / 2 + 0.06;
  return onFloor(piece);
}

/** The soot and heat on one wall where the fire climbed it, `along` metres from its centre. */
function plume(edge: Edge, along: number, spread: number): WallMark[] {
  const seed = `${SEED}-${edge}-${along}`;
  return [
    { edge, along, y: 0.9, size: [2.6, 2.3], shape: "oval", soft: 0.35, change: { recolour: { stoneDark: "woodDark", ash: "soot", stone: "wood" } }, seed: `${seed}-heat` },
    { edge, along: along + spread * 0.1, y: 0.9, size: [1.5, 2.3], shape: "oval", soft: 0.3, change: { paint: "soot" }, seed: `${seed}-soot` },
    { edge, along: along + spread * 0.6, y: 2.3, size: [3.4, 1.0], shape: "oval", soft: 0.35, change: { paint: "soot" }, seed: `${seed}-ceiling` },
  ];
}

/** The smoke that hung under the ceiling and browned every wall there. */
function smokeLine(edge: Edge): WallMark {
  return { edge, along: 0, y: 2.6, size: [5.8, 0.6], soft: 0.25, change: { recolour: { stone: "stoneDark", stoneDark: "ash", ash: "sootLight" } }, seed: `${SEED}-${edge}-smoke` };
}

/** The Charred Room: a sitting room gutted by a fire that began in its
 *  wingback armchair and has never quite gone out. The chair is a black
 *  skeleton over its bare springs, embers still glowing in its seat and in
 *  the seams of the boards round it; the floor is burnt to ash about it, to
 *  char beyond, and only scorched at the walls, where the rug's far half
 *  survives. Cobwebs hang across the smouldering frame. */
export const CHARRED_ROOM: RoomDefinition = {
  id: "charred-room",
  floor: burntBoards,
  wall: () => wallpaper({ ground: "stoneDark", stripe: "ash", motif: "stone", seed: SEED }),
  wallMarks: [...plume("top", -1.5, 1), ...plume("left", 1.5, -1), ...(["top", "right", "bottom", "left"] as const).map(smokeLine)],
  wainscot: () => panelling({ ramp: ["void", "soot", "sootLight", "woodDark"], seed: SEED, glints: false }),
  trim: "soot",
  props: [
    { build: glowingSeams, at: [0, 0] },
    { build: burntRug, at: [0, 0] },
    { build: burntArmchair, at: CHAIR, turn: CHAIR_TURN },
    { build: smoulder, at: CHAIR, turn: CHAIR_TURN },
    { build: toppledTable, at: [-0.6, -2.3], turn: -90 },
    { build: fallenLamp, at: [-0.5, -1.75], turn: 30 },
    { build: fallenBeam, at: BEAM.from, turn: BEAM.turn },
    { build: beamEmbers, at: BEAM.end, turn: BEAM.turn },
    { build: burntCabinet, ...onWall("top", 1.7, { out: 0.23 }) },
    { build: burntFrame, ...onWall("top", 1.7, { y: 1.35 }) },
    { build: fallenChair, at: [2.0, 1.9], turn: 45 },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [INNER - 0.29, INNER - 0.29], y: 3.05, turn: 135, walls: ["right", "bottom"] },
  ],
  focus: [CHAIR[0], 0.55, CHAIR[1]],
  prime: [1.25, -0.85],
  keepClear: [{ from: [-0.95, -0.85], to: [-0.5, -0.4], radius: 0.45 }],
  lanes: crossLanes(),
};
