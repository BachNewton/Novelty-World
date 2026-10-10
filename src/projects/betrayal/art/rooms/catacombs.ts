import * as THREE from "three";
import { createRng, pick, type Rng } from "@/shared/lib/seeded-random";
import { candle, cobweb } from "../kit";
import type { PaletteKey } from "../palette";
import { clearOfMarks, INNER, type LightSpec, type RoomDefinition } from "../room";
import { batch, group, type Batch } from "../shapes";
import { earth, flagstones } from "../textures";

/** The bone bank across the middle of the room, wall to wall between the two
 *  doors: half its depth either side of z = 0, and its height. */
const BANK = { half: 0.42, height: 0.72 };
/** Half the way through the bank, under the arch of skulls: the crossing. */
const GAP = 0.45;
/** The arch's pillars, outside the gap, and the height of its lintel. */
const PILLAR = 0.32;
const ARCH_TOP = 2.15;

/** The bones' colours: old bone, darker with age. */
const BONES: PaletteKey[] = ["bone", "boneDark", "boneDark", "bone", "boneLight"];

/** One skull facing +z, its eyes and nose a dark recess, into `bones`; its
 *  eye sockets' glow into `eyes` when it has one. `at` is the middle of its base. */
function skull(bones: Batch, eyes: Batch | null, at: THREE.Vector3, turn: number, rng: Rng, size = 1) {
  const s = size * (0.92 + rng.next() * 0.16);
  const place = (offset: [number, number, number]) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(...offset).multiplyScalar(s).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).add(at),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn),
      new THREE.Vector3(1, 1, 1),
    );
  const colour = pick(rng, BONES);
  bones.add([0.15 * s, 0.12 * s, 0.17 * s], colour, place([0, 0.085, -0.01]));
  bones.add([0.11 * s, 0.05 * s, 0.1 * s], colour, place([0, 0.03, 0.02]));
  bones.add([0.12 * s, 0.03 * s, 0.07 * s], "boneDark", place([0, 0.008, 0.045]));
  // The sockets: dark, or holding the glow that watches whoever crosses.
  for (const x of [-0.035, 0.035]) bones.add([0.04 * s, 0.035 * s, 0.01 * s], "void", place([x, 0.095, 0.072]));
  bones.add([0.02 * s, 0.03 * s, 0.01 * s], "void", place([0, 0.05, 0.072]));
  if (eyes) for (const x of [-0.035, 0.035]) eyes.add([0.03 * s, 0.026 * s, 0.01 * s], "wraithLight", place([x, 0.098, 0.077]));
}

/** A row of long bones laid into the bank, their knuckled ends out to its
 *  face, `length` metres along x at height `y`. */
function boneCourse(bones: Batch, x0: number, x1: number, y: number, face: number, rng: Rng) {
  for (let x = x0 + 0.04 + rng.next() * 0.03; x < x1 - 0.04; x += 0.065) {
    const out = face * (BANK.half - 0.01 - rng.next() * 0.025);
    const colour = pick(rng, BONES);
    const lift = y + rng.next() * 0.012;
    bones.add([0.045, 0.045, 0.34], colour, new THREE.Matrix4().makeTranslation(x, lift + 0.03, out - face * 0.17));
    // Its knuckle end is no taller than a course's rise less the lift, so the knuckles of two courses never overlap.
    bones.add([0.06, 0.048, 0.05], colour, new THREE.Matrix4().makeTranslation(x, lift + 0.03, out - face * 0.005));
  }
}

/** An eye-glow batch drawn as its own light, never shadowing. */
function eyeMesh(eyes: Batch): THREE.Mesh {
  const mesh = new THREE.Mesh(eyes.mesh().geometry, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  mesh.userData.noShadow = true;
  return mesh;
}

/**
 * One length of the ossuary bank, from `x0` to `x1`: a dark core faced on
 * both sides with courses of long bones, their ends out, between two bands
 * of skulls whose sockets glow sick green. Runs along x, faces ±z.
 */
function bank(x0: number, x1: number, seed: string): THREE.Group {
  const rng = createRng(`catacombs-${seed}`);
  const bones = batch();
  const eyes = batch();
  // The core reaches a little past the courses' first and last bones, so its ends never share a plane with theirs.
  bones.block([x1 - x0 - 0.01, BANK.height - 0.16, BANK.half * 2 - 0.16], "boneDark", [(x0 + x1) / 2, 0, 0]);
  for (const face of [-1, 1]) {
    const turn = face > 0 ? 0 : Math.PI;
    boneCourse(bones, x0, x1, 0, face, rng);
    boneCourse(bones, x0, x1, 0.06, face, rng);
    for (let x = x0 + 0.13; x < x1 - 0.1; x += 0.21) skull(bones, rng.next() < 0.85 ? eyes : null, new THREE.Vector3(x, 0.13, face * (BANK.half - 0.13)), turn, rng, 1.25);
    boneCourse(bones, x0, x1, 0.32, face, rng);
    // Set a little higher than the core's top would allow a skull's crown to meet it in one plane.
    for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.21) skull(bones, rng.next() < 0.7 ? eyes : null, new THREE.Vector3(x, 0.405, face * (BANK.half - 0.13)), turn, rng, 1.2);
  }
  // The top: long bones laid along it, and a few skulls set loose on them.
  // They lie between the bands of skulls along the faces, never over them, so a crown never meets a bone in one plane.
  for (let x = x0 + 0.06; x < x1 - 0.05; x += 0.07) bones.block([0.05, 0.05, 0.3], pick(rng, BONES), [x, BANK.height - 0.165 + rng.next() * 0.02, 0]);
  for (let x = x0 + 0.25; x < x1 - 0.2; x += 0.45 + rng.next() * 0.4) {
    // Set on the bones a little higher than their tops reach, so no part of a skull meets a bone's top in one plane.
    skull(bones, rng.next() < 0.5 ? eyes : null, new THREE.Vector3(x, BANK.height - 0.11, (rng.next() - 0.5) * 0.3), (rng.next() < 0.5 ? 0 : Math.PI) + (rng.next() - 0.5) * 0.8, rng, 0.9);
  }
  return group(bones.mesh(), eyeMesh(eyes));
}

/**
 * The arch of skulls over the way through the bank: two pillars of stacked
 * skulls and long bones either side of the gap, and a lintel of skulls
 * across them, every socket watching both ways. Open below the lintel.
 */
function skullArch(): THREE.Group {
  const rng = createRng("catacombs-arch");
  const bones = batch();
  const eyes = batch();
  for (const side of [-1, 1]) {
    const x = side * (GAP + PILLAR / 2);
    // The pillar's core stops under the lintel's, so their faces never share a plane.
    bones.block([PILLAR - 0.08, ARCH_TOP - 0.1, BANK.half * 2 - 0.2], "boneDark", [x, 0, 0]);
    for (let y = 0; y < ARCH_TOP - 0.35; y += 0.24) {
      for (const face of [-1, 1]) {
        skull(bones, eyes, new THREE.Vector3(x, y + 0.05, face * (BANK.half - 0.13)), face > 0 ? 0 : Math.PI, rng, 1.25);
        bones.add([PILLAR - 0.02, 0.045, 0.3], pick(rng, BONES), new THREE.Matrix4().makeTranslation(x, y + 0.025, face * (BANK.half - 0.17)));
      }
      // The gap's side of the pillar, skulls looking across the way.
      skull(bones, eyes, new THREE.Vector3(x - side * (PILLAR / 2 - 0.1), y + 0.05, 0), side > 0 ? -Math.PI / 2 : Math.PI / 2, rng, 1.1);
    }
  }
  const span = 2 * (GAP + PILLAR);
  bones.block([span, 0.26, BANK.half * 2 - 0.2], "boneDark", [0, ARCH_TOP - 0.1, 0]);
  for (const face of [-1, 1]) {
    // Small enough never to overlap the next skull along, so two crowns never meet in one plane.
    for (let x = -span / 2 + 0.11; x < span / 2 - 0.05; x += 0.2) skull(bones, eyes, new THREE.Vector3(x, ARCH_TOP - 0.05, face * (BANK.half - 0.13)), face > 0 ? 0 : Math.PI, rng, 1.2);
  }
  // Its top: a ridge of skulls looking both ways.
  for (let x = -span / 2 + 0.12; x < span / 2 - 0.08; x += 0.2) {
    // Back to back but clear of each other, so the sides of two skulls of nearly one size never meet in one plane.
    for (const face of [-1, 1]) skull(bones, eyes, new THREE.Vector3(x, ARCH_TOP + 0.16, face * 0.135), face > 0 ? 0 : Math.PI, rng, 1.1);
  }
  // Under the lintel, a row of skulls looking straight down on the way through.
  for (let x = -GAP + 0.1; x < GAP - 0.05; x += 0.2) bones.block([0.15, 0.03, 0.15], pick(rng, BONES), [x, ARCH_TOP - 0.13, 0]);
  return group(bones.mesh(), eyeMesh(eyes));
}

/** Bones spilled flat across the way through, trodden into the floor:
 *  low enough to walk over, so it reads as the way, not a wall. */
function trodden(): THREE.Group {
  const rng = createRng("catacombs-trodden");
  const bones = batch();
  // Each bone lies a hair higher than the last, so no two tops share a plane, and the heap steps over the plane of the
  // choice marks' glow rather than putting a top in it.
  let over = 0;
  for (let k = 0; k < 26; k++) {
    const top = 0.0255 + k * 0.0011 + over;
    if (clearOfMarks(top) !== top) over += 0.0024;
    const at = new THREE.Vector3((rng.next() - 0.5) * GAP * 1.2, 0.013 + k * 0.0011 + over, (rng.next() - 0.5) * 1.6);
    const turn = rng.next() * Math.PI;
    bones.add([0.035, 0.025, 0.2 + rng.next() * 0.16], pick(rng, BONES), new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(1, 1, 1)));
  }
  return group(bones.mesh());
}

/** The lower wall of a burial gallery: a low shelf of stacked long bones
 *  under one band of skulls, dark-eyed, backed against a side wall. Runs
 *  along x unturned, faces +z, `length` long. */
function galleryShelf(length: number, seed: string): THREE.Group {
  const rng = createRng(`catacombs-shelf-${seed}`);
  const bones = batch();
  const depth = 0.34;
  bones.block([length - 0.02, 0.4, depth - 0.08], "soot", [0, 0, -0.04]);
  for (let x = -length / 2 + 0.04; x < length / 2 - 0.03; x += 0.065) {
    for (const y of [0, 0.06, 0.29]) {
      const colour = pick(rng, BONES);
      bones.add([0.045, 0.045, 0.26], colour, new THREE.Matrix4().makeTranslation(x, y + 0.03, -0.03));
      bones.add([0.06, 0.06, 0.05], colour, new THREE.Matrix4().makeTranslation(x, y + 0.03, depth / 2 - 0.035 - rng.next() * 0.02));
    }
  }
  for (let x = -length / 2 + 0.1; x < length / 2 - 0.08; x += 0.17) {
    if (rng.next() < 0.12) continue;
    skull(bones, null, new THREE.Vector3(x, 0.13, depth / 2 - 0.12), 0, rng, 0.95);
  }
  // The bones laid along the top stand a little proud of the dark core, so their tops never share its plane.
  for (let x = -length / 2 + 0.05; x < length / 2 - 0.04; x += 0.07) bones.block([0.05, 0.04, depth - 0.1], pick(rng, BONES), [x, 0.365, -0.04]);
  return group(bones.mesh());
}

/** A skull fallen from the bank and come to rest on the floor, staring at
 *  the doorway: the only one out of its place. Faces +z. */
function strayStare(): THREE.Group {
  const rng = createRng("catacombs-stray");
  const bones = batch();
  const eyes = batch();
  skull(bones, eyes, new THREE.Vector3(0, 0, 0), 0, rng, 1.15);
  return group(bones.mesh(), eyeMesh(eyes));
}

/** Where the two halves' bank lengths end at the walls. */
const WALL_END = INNER;

/** The sick light off the bank, low along both its faces: the eyes' glow, cast. */
const EYE_LIGHTS: LightSpec[] = [-1.65, 1.65].flatMap((x) =>
  [-1, 1].map((face): LightSpec => ({ at: [x, 0.5, face * (BANK.half + 0.35)], colour: "wraithLight", intensity: 3.6, range: 4, flicker: 0.08 })),
);

/** The Catacombs: a wall of the dead stacked across the cellar from wall to
 *  wall, long bones and skulls, every socket glowing sick green, pierced
 *  only by one narrow arch of skulls: to cross is to walk under their gaze. */
export const CATACOMBS: RoomDefinition = {
  id: "catacombs",
  floor: () => earth({ soil: ["sootLight", "ash", "stoneDark"], grass: [], patches: 0, seed: "catacombs" }),
  wall: () => flagstones({ ramp: ["void", "soot", "sootLight", "ash"], mortar: "void", stonePx: 6, seed: "catacombs-rock" }),
  trim: "ash",
  props: [
    { build: () => bank(-WALL_END, -GAP - PILLAR, "left"), name: "bank", at: [0, 0] },
    { build: () => bank(GAP + PILLAR, WALL_END, "right"), name: "bank", at: [0, 0] },
    { build: skullArch, at: [0, 0] },
    { build: trodden, at: [0, 0] },
    { build: () => galleryShelf(2.0, "lt"), name: "galleryShelf", at: [-INNER + 0.17, -1.6], turn: 90 },
    { build: () => galleryShelf(2.0, "lb"), name: "galleryShelf", at: [-INNER + 0.17, 1.6], turn: 90 },
    { build: () => galleryShelf(2.0, "rt"), name: "galleryShelf", at: [INNER - 0.17, -1.6], turn: -90 },
    { build: () => galleryShelf(2.0, "rb"), name: "galleryShelf", at: [INNER - 0.17, 1.6], turn: -90 },
    { build: strayStare, at: [1.95, -0.75], turn: 220 },
    { build: () => candle({ height: 0.07, intensity: 2.4, range: 5 }), name: "candle", at: [-2.62, -0.95], y: 0.4 },
    { build: () => candle({ height: 0.1, intensity: 2.4, range: 5 }), name: "candle", at: [2.62, 1.05], y: 0.4 },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [-INNER + 0.29, INNER - 0.29], y: 3.05, turn: 45, walls: ["left", "bottom"] },
  ],
  lights: EYE_LIGHTS,
  focus: [0, 0.6, 0],
  pawn: [-1.2, -1.5],
  spots: [[1.75, 0.95], [1.9, -1.95], [-1.5, 1.1], [0.45, -1.05], [0.15, 1.55]],
  overflow: [[1.55, -1.15], [1.65, 2.15], [-0.55, -1.05], [-1.5, 2.3], [-1.7, -2.1], [-0.5, 1.1]],
  // Through the bank under the arch of skulls.
  crossing: [
    [0, 0, -(BANK.half + 0.6)],
    [0, 0, BANK.half + 0.6],
  ],
};
