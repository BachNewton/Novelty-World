import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { chamberstick, crate, lantern } from "../kit";
import { trunk } from "../kit/trunk";
import { paletteHex, type PaletteKey } from "../palette";
import { CUT_HEIGHT, onWall, type RoomDefinition } from "../room";
import { batch, group, type Batch } from "../shapes";
import { shiny, SHINES, type Shine } from "../shine";
import { panelling, plaster, woodPlanks } from "../textures";

const SEED = "storeroom";

/** The slatted bay in the bottom-right corner: its posts' centres, in room metres, and its height. */
const BAY = { x: [0.7, 2.66], z: [0.7, 2.66], height: 1.8 } as const;
const POST = 0.08;
const SLAT = { width: 0.1, gap: 0.15, thick: 0.025 };
/** How high the lantern's hook hangs from the beam. */
const HOOK = 1.1;
/** The open way into the bay in its face towards the door: the posts either side, as x. */
const OPENING: [number, number] = [1.2, 2.2];

type Flat = [x: number, z: number];

/**
 * One slatted face of the bay, from post `a` to post `b` along x or z: a
 * rail top and bottom between the posts, and upright boards nailed to the
 * side of them facing `out`, a hand's width apart.
 */
function slattedFace(b: Batch, a: Flat, to: Flat, out: 1 | -1): void {
  const alongX = a[1] === to[1];
  const [from, end] = alongX ? [a[0], to[0]] : [a[1], to[1]];
  const fixed = alongX ? a[1] : a[0];
  const length = end - from;
  const at = (t: number, off: number, y: number): [number, number, number] => (alongX ? [t, y, fixed + off] : [fixed + off, y, t]);
  const size = (l: number, h: number, d: number): [number, number, number] => (alongX ? [l, h, d] : [d, h, l]);
  for (const y of [0.1, BAY.height - 0.16]) b.block(size(length - POST, 0.07, 0.06), "woodDark", at(from + length / 2, 0, y));
  const span = length - POST;
  const count = Math.floor((span + SLAT.gap) / (SLAT.width + SLAT.gap));
  const margin = (span - (count * SLAT.width + (count - 1) * SLAT.gap)) / 2;
  for (let k = 0; k < count; k++) {
    const t = from + POST / 2 + margin + SLAT.width / 2 + k * (SLAT.width + SLAT.gap);
    const shade: PaletteKey = k % 3 === 1 ? "woodMid" : "wood";
    b.block(size(SLAT.width, BAY.height - 0.08, SLAT.thick), shade, at(t, out * (0.03 + SLAT.thick / 2 + 0.002), 0.04));
  }
}

/**
 * The store bay: slatted timber walling off the corner, boards on rails
 * between posts, open above, with a beam across its top for the lantern.
 * Its face towards the door has an open way in, no door in it. Built in
 * room metres.
 */
function storeBay(): THREE.Group {
  const b = batch();
  const [x0, x1] = BAY.x;
  const [z0, z1] = BAY.z;
  const [o0, o1] = OPENING;
  for (const x of [x0, x1]) for (const z of [z0, z1]) b.block([POST, BAY.height, POST], "woodDark", [x, 0, z]);
  for (const x of OPENING) b.block([POST, BAY.height, POST], "woodDark", [x, 0, z0]);
  slattedFace(b, [x0, z0], [o0, z0], -1);
  slattedFace(b, [o1, z0], [x1, z0], -1);
  slattedFace(b, [x0, z0], [x0, z1], -1);
  slattedFace(b, [x0, z1], [x1, z1], 1);
  slattedFace(b, [x1, z0], [x1, z1], 1);
  // The lintel over the way in.
  b.block([o1 - o0 - POST, 0.1, 0.07], "woodDark", [(o0 + o1) / 2, BAY.height - 0.18, z0]);
  // The beam across the top the lantern hangs from.
  b.block([x1 - x0 - POST, 0.08, 0.08], "woodDark", [(x0 + x1) / 2, BAY.height - 0.08, (z0 + z1) / 2]);
  // The lantern's chain, down from the beam to its hook.
  b.block([0.03, BAY.height - 0.07 - HOOK - 0.035, 0.03], "soot", [(x0 + x1) / 2, HOOK + 0.035, (z0 + z1) / 2]);
  return group(b.mesh());
}

/** Sacks of grain or flour, stuffed full and slumped, tied at the neck: `count` of them in a row along x, `rows` deep, stacked `layers` high. */
function sacks({ count, rows = 1, layers = 1, seed }: { count: number; rows?: number; layers?: number; seed: string }): THREE.Group {
  const rng = createRng(`${SEED}:sacks:${seed}`);
  const b = batch();
  const [w, h, d] = [0.5, 0.3, 0.38];
  for (let layer = 0; layer < layers; layer++) {
    for (let row = 0; row < rows; row++) {
      for (let k = 0; k < count - layer; k++) {
        const x = (k - (count - layer - 1) / 2) * (w - 0.04) + (rng.next() - 0.5) * 0.04;
        const z = (row - (rows - 1) / 2) * (d - 0.02);
        const y = layer * (h - 0.06);
        const turn = new THREE.Euler((rng.next() - 0.5) * 0.08, (rng.next() - 0.5) * 0.2, (rng.next() - 0.5) * 0.08);
        const colour = pick(rng, ["woodLight", "brass", "boneDark"] as PaletteKey[]);
        b.add([w, h, d], colour, new THREE.Matrix4().compose(new THREE.Vector3(x, y + h / 2 + 0.005, z), new THREE.Quaternion().setFromEuler(turn), new THREE.Vector3(1, 1, 1)));
        // The stuffed belly bulging over the top.
        b.block([w * 0.8, 0.05, d * 0.8], colour, [x - w * 0.05, y + h - 0.025, z]);
        // The gathered neck and its tie.
        b.block([0.14, 0.08, 0.14], colour, [x + w * 0.3, y + h - 0.02, z]);
        b.block([0.15, 0.025, 0.15], "woodDark", [x + w * 0.3, y + h + 0.01, z]);
      }
    }
  }
  return group(b.mesh());
}

/** What a jar row is made of: the glass with its filling seen through it, the brass and tin lids, and the paper labels. */
const JAR_PARTS = { glass: SHINES.glass, brass: SHINES.brass, tin: SHINES.pewter, paper: null } satisfies Record<string, Shine | null>;

/** Preserving jars in a row along x, `length` long, of mixed sizes and fillings, a few gaps where one was taken. Base at y = 0. */
function jarRow(length: number, seed: string): THREE.Group {
  const rng = createRng(`${SEED}:jars:${seed}`);
  const parts = { glass: [], brass: [], tin: [], paper: [] } as Record<keyof typeof JAR_PARTS, THREE.BufferGeometry[]>;
  const add = (geometry: THREE.BufferGeometry, colour: PaletteKey, part: keyof typeof JAR_PARTS) => {
    const { r, g, b } = new THREE.Color(paletteHex(colour));
    const count = geometry.getAttribute("position").count;
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colours.set([r, g, b], i * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    parts[part].push(geometry.toNonIndexed());
  };
  const fillings: PaletteKey[] = ["bloodDark", "blood", "ember", "verdigris", "verdigrisDark", "boneDark", "woodMid", "bruise"];
  for (let x = -length / 2 + 0.07; x < length / 2 - 0.07; ) {
    const r = 0.045 + rng.next() * 0.03;
    if (rng.next() < 0.12) {
      x += r * 2 + 0.03;
      continue;
    }
    const h = 0.12 + rng.next() * 0.1;
    const z = (rng.next() - 0.5) * 0.05;
    add(new THREE.CylinderGeometry(r, r, h, 8).translate(x + r, h / 2, z), pick(rng, fillings), "glass");
    const brass = rng.next() < 0.5;
    add(new THREE.CylinderGeometry(r * 0.8, r * 0.85, 0.035, 8).translate(x + r, h + 0.0175, z), brass ? "brass" : "stone", brass ? "brass" : "tin");
    // A paper label, a little proud of the glass.
    add(new THREE.BoxGeometry(r * 1.1, h * 0.35, 0.01).translate(x + r, h * 0.45, z + r + 0.002), "boneLight", "paper");
    x += r * 2 + 0.02 + rng.next() * 0.03;
  }
  const result = group();
  for (const [part, shine] of Object.entries(JAR_PARTS) as [keyof typeof JAR_PARTS, Shine | null][]) {
    if (parts[part].length === 0) continue;
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    result.add(new THREE.Mesh(mergeGeometries(parts[part]), shine ? shiny(material, shine) : material));
    for (const geometry of parts[part]) geometry.dispose();
  }
  return result;
}

const SHELF = { length: 2.6, depth: 0.34 };

/** The low part of the jar shelving, below the cut height: a plinth and a bottom shelf of jars. Faces +z, its back at z = 0. */
function shelfBase(): THREE.Group {
  const b = batch();
  const { length, depth } = SHELF;
  b.block([length, 0.06, depth], "woodDark", [0, 0, depth / 2]);
  b.block([length, 0.035, depth], "wood", [0, CUT_HEIGHT - 0.04, depth / 2]);
  for (const x of [-length / 2 + 0.03, 0, length / 2 - 0.03]) b.block([0.05, CUT_HEIGHT - 0.1, depth - 0.02], "woodDark", [x, 0.06, depth / 2 - 0.01]);
  const jars = jarRow(length - 0.1, "base");
  jars.position.set(0, 0.06, depth / 2);
  return group(b.mesh(), jars);
}

/** The shelving above the cut height, hung on the wall: uprights and three shelves of jars. Its base at the cut height; faces +z. */
function shelvesAbove(): THREE.Group {
  const b = batch();
  const { length, depth } = SHELF;
  const top = 2.05 - CUT_HEIGHT;
  for (const x of [-length / 2 + 0.03, 0, length / 2 - 0.03]) b.block([0.05, top, depth - 0.02], "woodDark", [x, 0, depth / 2 - 0.01]);
  const result = group();
  [0.4, 0.8, 1.2].forEach((y, i) => {
    b.block([length, 0.035, depth], "wood", [0, y, depth / 2]);
    const jars = jarRow(length - 0.1, `above-${i}`);
    jars.position.set(0, y + 0.035, depth / 2);
    result.add(jars);
  });
  b.block([length + 0.04, 0.04, depth + 0.02], "woodDark", [0, top, depth / 2 + 0.01]);
  result.add(b.mesh());
  return result;
}

/** A sack truck stood on its wheels, handles leaning to the wall. Faces +z. */
function sackTruck(): THREE.Group {
  const b = batch();
  const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, 0, 0));
  const piece = (size: [number, number, number], colour: PaletteKey, at: [number, number, number]) =>
    b.add(size, colour, new THREE.Matrix4().compose(new THREE.Vector3(...at).applyQuaternion(lean), lean, new THREE.Vector3(1, 1, 1)));
  for (const x of [-0.18, 0.18]) piece([0.05, 1.2, 0.05], "woodLight", [x, 0.72, 0]);
  for (const y of [0.4, 0.75, 1.1]) piece([0.36, 0.035, 0.035], "woodMid", [0, y, 0]);
  piece([0.42, 0.02, 0.2], "stone", [0, 0.13, 0.1]);
  // A sack still on its plate, slumped back against the frame.
  piece([0.34, 0.42, 0.24], "brass", [0, 0.36, 0.15]);
  piece([0.12, 0.08, 0.12], "brass", [0.06, 0.6, 0.12]);
  const result = group(b.mesh());
  for (const x of [-0.24, 0.24]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 10).rotateZ(Math.PI / 2), shiny(new THREE.MeshLambertMaterial({ color: paletteHex("soot") }), SHINES.iron));
    wheel.position.set(x, 0.12, -0.02);
    result.add(wheel);
  }
  return result;
}

/** The Storeroom: the house's stores kept in good order, sacks stacked, jars
 *  shelved and labelled, crates squared up; and in the corner a slatted
 *  bay, open to the room, where a lantern burns that nobody
 *  could have lit, throwing the shadows of its boards in long bars of amber
 *  across the floor. */
export const STOREROOM: RoomDefinition = {
  id: "storeroom",
  floor: () => woodPlanks({ ramp: ["wood", "woodMid", "woodLight", "boneDark"], plankPx: 9, seed: SEED, glints: false }),
  wall: () => plaster({ ramp: ["stoneDark", "boneDark", "bone"], seed: SEED }),
  wainscot: () => panelling({ ramp: ["soot", "sootLight", "woodDark", "wood"], panelPx: 6, seed: SEED, glints: false }),
  trim: "woodDark",
  shine: { glass: SHINES.glass },
  props: [
    { build: storeBay, at: [0, 0] },
    { build: () => lantern({ width: 0.12, height: 0.2, intensity: 18, range: 12, flicker: 0.12 }), name: "lantern", at: [(BAY.x[0] + BAY.x[1]) / 2, (BAY.z[0] + BAY.z[1]) / 2], y: HOOK },
    // Inside the bay, against its back walls, out of the lantern's way to the slats.
    { build: () => crate([0.6, 0.55, 0.55]), name: "crate", at: [2.25, 2.25] },
    { build: () => crate([0.5, 0.45, 0.5], "woodMid"), name: "crate", at: [2.25, 2.25], y: 0.55, turn: 6 },
    { build: () => trunk({ size: [0.8, 0.42, 0.45], body: "moonDark" }), name: "trunk", at: [1.35, 2.3] },
    { build: () => sacks({ count: 2, seed: "bay" }), name: "sacks", at: [2.3, 1.45], turn: 90 },
    // Along the left wall: the jar shelving, split at the cut height.
    { build: shelfBase, ...onWall("left", 0.2, { out: 0.01 }) },
    { build: shelvesAbove, ...onWall("left", 0.2, { y: CUT_HEIGHT, out: 0.01 }) },
    // Right of the door: sacks squared up on the boards.
    { build: () => sacks({ count: 3, rows: 2, layers: 2, seed: "top" }), name: "sacks", at: [1.75, -2.35] },
    // Top left: crates stacked square.
    { build: () => crate([0.6, 0.55, 0.6]), name: "crate", at: [-2.3, -2.35] },
    { build: () => crate([0.5, 0.45, 0.5], "woodMid"), name: "crate", at: [-2.3, -2.35], y: 0.55, turn: 4 },
    { build: () => crate([0.5, 0.4, 0.5]), name: "crate", at: [-1.6, -2.45] },
    { build: () => chamberstick({ height: 0.08, intensity: 2.2, range: 6 }), name: "chamberstick", at: [-1.6, -2.45], y: 0.4 },
    // Bottom left: a sack truck by the wall.
    { build: sackTruck, ...onWall("bottom", 1.6, { out: 0.3 }) },
  ],
  focus: [1.2, 0.8, 1.2],
  prime: [-0.5, 0.2],
  // Before the way into the bay, and the bay itself, where a figure would stand half hidden behind the slats.
  keepClear: [
    { from: [1.0, 0.25], to: [2.0, 0.25], radius: 0.3 },
    { from: [1.25, 1.68], to: [2.1, 1.68], radius: 0.95 },
  ],
};
