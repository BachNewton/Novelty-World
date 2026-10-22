import * as THREE from "three";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { groundFog } from "../kit";
import { solidLathe, vessel } from "../kit/vessel";
import type { PaletteKey } from "../palette";
import type { PropPlacement, RoomDefinition } from "../room";
import { batch, box, flat, glow, group, projectUvs, textured } from "../shapes";
import { earth, flagstones, pixelTexture } from "../textures";

/** The fountain's basin: its outer radius at the rim, and its height. */
const BASIN = { radius: 1.05, height: 0.48 };
/** The gravel ring walked round the fountain: its inner and outer radius. */
const RING = { inner: 1.18, outer: 1.78 };
/** The radius walks keep to round the fountain, on the gravel ring. */
const WALK = 1.6;
/** The parterre's four beds fill the corners from here out to `BED_OUT`, both ways. */
const BED_IN = 1.62;
const BED_OUT = 2.5;
/** Where the rose's red light glows, among its blooms on the side the rose spills over the rim. */
const ROSE_LIGHT: [number, number, number] = [0.32, 1.1, 0.32];

/** A hedge's foliage: dark yew, in rounded clumps of leaf each shadowed beneath, with a few dead brown patches where it has been let go. */
function hedgeLeaves(seed: string): THREE.Texture {
  const size = 64;
  const rng = createRng(`gardens-hedge:${seed}`);
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => "d"));
  const set = (x: number, y: number, c: string) => {
    grid[(y + size) % size][(x + size) % size] = c;
  };
  for (let clump = 0; clump < 70; clump++) {
    const cx = Math.floor(rng.next() * size);
    const cy = Math.floor(rng.next() * size);
    const r = 2 + Math.floor(rng.next() * 2);
    const dead = rng.next() < 0.07;
    for (let y = -r; y <= r + 1; y++) {
      for (let x = -r; x <= r; x++) {
        const inside = x * x + y * y <= r * r + 1;
        const under = x * x + (y - 1) * (y - 1) <= r * r + 1;
        if (inside) set(cx + x, cy + y, dead ? "b" : y < -r / 2 ? "l" : y < 0 ? "m" : "d");
        else if (under) set(cx + x, cy + y, "s");
      }
    }
  }
  return pixelTexture(grid.map((row) => row.join("")), { d: "wraithDark", m: "verdigrisDark", l: "wraith", s: "soot", b: "woodDark" }, true);
}

const LEAVES = () => hedgeLeaves("walls");

/** The fountain's dry basin, a broad round stone bowl, its floor drifted with dead leaves. Round, centred on its origin. */
function basin(): THREE.Group {
  const { radius, height } = BASIN;
  const stone = flat("stone");
  const bowl = vessel(
    [
      [radius - 0.06, 0],
      [radius - 0.03, 0.06],
      [radius - 0.03, height - 0.07],
      [radius, height - 0.05],
      [radius, height],
    ],
    stone,
    { wall: 0.12, depth: height - 0.12, sides: 20 },
  );
  const litter = solidLathe(
    [
      [radius - 0.16, 0],
      [radius - 0.16, 0.05],
    ],
    textured(earth({ soil: ["soot", "woodDark", "wood"], grass: [], seed: "gardens-leaves" })),
    20,
  );
  litter.position.y = 0.11;
  return group(bowl, litter);
}

/**
 * The fountain's column rising from the middle of the basin: a turned shaft
 * carrying a small upper bowl, and on it the broken feet of the figure that
 * stood there, snapped off at the ankles. Round, centred on its origin.
 */
function fountainColumn(): THREE.Group {
  const stone = flat("stone");
  const dark = flat("stoneDark");
  const shaft = solidLathe(
    [
      [0.22, 0],
      [0.2, 0.12],
      [0.12, 0.2],
      [0.1, 0.62],
      [0.15, 0.72],
      [0.12, 0.8],
    ],
    stone,
    10,
  );
  const upper = vessel(
    [
      [0.1, 0],
      [0.32, 0.12],
      [0.4, 0.18],
      [0.4, 0.22],
    ],
    stone,
    { wall: 0.05, depth: 0.12, sides: 14 },
  );
  upper.position.y = 0.79;
  const plinth = box([0.2, 0.12, 0.2], dark, [0, 0.9, 0]);
  // The figure's two feet, snapped off above the ankle, one a little forward.
  const feet = group(box([0.07, 0.11, 0.15], stone, [-0.045, 1.02, 0.01]), box([0.07, 0.08, 0.14], stone, [0.05, 1.02, -0.02]));
  return group(shaft, upper, plinth, feet);
}

/**
 * The climbing rose that has taken the dead fountain: a thicket of dark
 * leaf grown up out of the dry basin round the column, spilling over the rim,
 * in full red bloom when nothing else in the garden lives. The blooms'
 * hearts glow faintly, the only red in the night. Grown in room metres
 * round the fountain's middle.
 */
function climbingRose(): THREE.Group {
  const rng = createRng("gardens-rose");
  const leaves: PaletteKey[] = ["wraithDark", "wraithDark", "verdigrisDark", "soot"];
  const thicket = group();
  const clumpGeometry = (r: number) => new THREE.IcosahedronGeometry(r, 0);
  const materials = new Map<PaletteKey, THREE.Material>();
  const material = (key: PaletteKey) => {
    let found = materials.get(key);
    if (!found) materials.set(key, (found = flat(key)));
    return found;
  };
  /** Where the thicket grows: round the column up to the upper bowl, and out over the rim on one side. */
  const spots: [number, number, number, number][] = [];
  for (let k = 0; k < 26; k++) {
    const a = rng.next() * Math.PI * 2;
    const up = rng.next();
    const r = 0.2 + (1 - up) * 0.3 + rng.next() * 0.12;
    spots.push([Math.cos(a) * r, 0.18 + up * 0.9, Math.sin(a) * r, 0.13 + (1 - up) * 0.1 + rng.next() * 0.05]);
  }
  // A spill of it over the rim, towards the bottom right, and down to the ground.
  for (const [x, y, z, s] of [[0.62, 0.42, 0.58, 0.2], [0.82, 0.48, 0.42, 0.17], [0.78, 0.25, 0.56, 0.14], [0.7, 0.55, 0.75, 0.14], [0.64, 0.15, 0.74, 0.11], [0.4, 0.5, 0.86, 0.15]] as const) spots.push([x, y, z, s]);
  for (const [x, y, z, s] of spots) {
    const clump = new THREE.Mesh(clumpGeometry(s), material(pick(rng, leaves)));
    clump.position.set(x, y, z);
    clump.rotation.set(rng.next() * 3, rng.next() * 3, rng.next() * 3);
    thicket.add(clump);
  }
  // Canes: thick old stems twisting up the column.
  const canes = batch();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rng.next() * 0.4;
    for (let y = 0.15; y < 1.05; y += 0.18) {
      const turn = a + y * 1.6;
      canes.add([0.03, 0.22, 0.03], "woodDark", new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(turn) * 0.16, y + 0.11, Math.sin(turn) * 0.16), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(turn) * 0.5, 0, -Math.cos(turn) * 0.5)), new THREE.Vector3(1, 1, 1)));
    }
  }
  thicket.add(canes.mesh());
  // The blooms, on the outside of the thicket: blood-red petals round a glowing heart.
  const petals = flat("blood");
  const outer = flat("bloodLight");
  const heart = glow("scarlet");
  for (const [x, y, z, s] of spots) {
    if (rng.next() < 0.35) continue;
    const out = new THREE.Vector3(x, 0, z).normalize();
    const at = new THREE.Vector3(x, y + s * 0.3, z).addScaledVector(out, s * 0.7);
    const bloom = group(
      new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), rng.next() < 0.5 ? petals : outer),
      new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), heart).translateOnAxis(out, 0.04).translateY(0.015),
    );
    bloom.position.copy(at);
    thicket.add(bloom);
  }
  thicket.traverse((child) => {
    child.userData.noShadow = true;
  });
  return thicket;
}

/** Petals shed round the foot of the fountain, red on the gravel: flat flakes, built in room metres. */
function fallenPetals(): THREE.Mesh {
  const rng = createRng("gardens-petals");
  const b = batch();
  const laid: THREE.Vector2[] = [];
  // Never one on another: flakes lying in one plane would fight where they overlap.
  for (let k = 0; k < 60 && laid.length < 32; k++) {
    const a = 0.2 + rng.next() * 1.6;
    const r = RING.inner + 0.03 + Math.abs(rng.next() - rng.next()) * 0.6;
    const at = new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
    if (laid.some((other) => other.distanceTo(at) < 0.075)) continue;
    laid.push(at);
    b.add([0.05, 0.004, 0.04], rng.next() < 0.6 ? "blood" : "bloodLight", new THREE.Matrix4().compose(new THREE.Vector3(at.x, 0.0255, at.y), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * Math.PI), new THREE.Vector3(1, 1, 1)));
  }
  const mesh = b.mesh();
  mesh.userData.noShadow = true;
  return mesh;
}

const GRAVEL = () => flagstones({ ramp: ["soot", "sootLight", "ash", "ash"], mortar: "soot", stonePx: 6, size: 32, seed: "gardens-gravel" });

/** The gravel walk: a ring round the fountain, and a straight path from it to each gate. Flat on the ground, in room metres. */
function gravelWalk(): THREE.Group {
  const texture = GRAVEL();
  const gravel = textured(texture);
  const ring = new THREE.Mesh(projectUvs(new THREE.RingGeometry(RING.inner, RING.outer, 40).rotateX(-Math.PI / 2), texture), gravel);
  ring.position.y = 0.022;
  const width = 0.9;
  const out = 3 - RING.outer + 0.1;
  return group(ring, box([width, 0.016, out], gravel, [0, 0, -(RING.outer - 0.1 + out / 2)]), box([width, 0.016, out], gravel, [0, 0, RING.outer - 0.1 + out / 2]));
}

/**
 * One bed of the parterre, filling a corner: a low clipped box hedge round
 * a square of dark earth, where roses were cut back and died, their stumps
 * left standing. Built for the bottom-right corner; `turn` takes it to the others.
 */
function parterreBed(seed: string): THREE.Group {
  const box_ = textured(hedgeLeaves("box"));
  const side = BED_OUT - BED_IN;
  const mid = (BED_IN + BED_OUT) / 2;
  const tall = 0.3;
  const thick = 0.16;
  const soil = box([side - thick * 2 + 0.02, 0.05, side - thick * 2 + 0.02], textured(earth({ soil: ["void", "soot", "woodDark"], grass: [], seed: `gardens-bed-${seed}` })), [mid, 0, mid]);
  const hedge = group(
    box([side, tall, thick], box_, [mid, 0, BED_IN + thick / 2]),
    box([side, tall, thick], box_, [mid, 0, BED_OUT - thick / 2]),
    // The sides are a little thinner and lower than the ends they meet, so their faces never share the ends' planes.
    box([thick - 0.01, tall - 0.01, side - thick * 2 + 0.01], box_, [BED_IN + thick / 2, 0, mid]),
    box([thick - 0.01, tall - 0.01, side - thick * 2 + 0.01], box_, [BED_OUT - thick / 2, 0, mid]),
  );
  const rng = createRng(`gardens-stumps-${seed}`);
  const stumps = batch();
  for (let k = 0; k < 7; k++) {
    const x = mid + (rng.next() - 0.5) * (side - thick * 2 - 0.15);
    const z = mid + (rng.next() - 0.5) * (side - thick * 2 - 0.15);
    const tall_ = 0.15 + rng.next() * 0.3;
    stumps.add([0.025, tall_, 0.025], "woodDark", new THREE.Matrix4().compose(new THREE.Vector3(x, 0.04 + tall_ / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((rng.next() - 0.5) * 0.5, 0, (rng.next() - 0.5) * 0.5)), new THREE.Vector3(1, 1, 1)));
  }
  return group(soil, hedge, stumps.mesh());
}

/** A plain stone garden bench, a slab on two square legs. Faces +z. */
function gardenBench(): THREE.Group {
  const stone = flat("stone");
  const dark = flat("stoneDark");
  return group(box([0.2, 0.38, 0.32], dark, [-0.45, 0, 0]), box([0.2, 0.38, 0.32], dark, [0.45, 0, 0]), box([1.3, 0.07, 0.42], stone, [0, 0.38, 0]));
}

const BEDS: [turn: number, seed: string][] = [
  [0, "a"],
  [90, "b"],
  [180, "c"],
  [270, "d"],
];

/** The Gardens: a formal garden gone to ruin in the moonlight, its clipped
 *  yew hedges grown shaggy and its box-edged beds dead, round a dry stone
 *  fountain that a climbing rose has taken over, in full blood-red bloom
 *  when nothing else in the garden lives. */
export const GARDENS: RoomDefinition = {
  id: "gardens",
  floor: () => earth({ soil: ["void", "soot", "sootLight"], grass: ["soot", "wraithDark"], patches: 14, seed: "gardens" }),
  wall: LEAVES,
  trim: "ash",
  edging: "hedge",
  props: [
    { build: gravelWalk, at: [0, 0], contacts: [{ with: "doorway top", because: "the gravel path runs out through the gate, flat on the ground" }, { with: "doorway bottom", because: "the gravel path runs out through the gate, flat on the ground" }] },
    { build: basin, at: [0, 0] },
    { build: fountainColumn, at: [0, 0], y: 0.11, contacts: [{ with: "basin", because: "the column stands in the leaves drifted on the basin's floor" }] },
    { build: climbingRose, at: [0, 0], contacts: [{ with: "basin", because: "the rose grows out of the basin and over its rim" }, { with: "fountainColumn", because: "the rose climbs the column" }] },
    { build: fallenPetals, at: [0, 0] },
    ...BEDS.map(([turn, seed]): PropPlacement => ({ build: () => parterreBed(seed), name: "parterreBed", at: [0, 0], turn })),
    { build: gardenBench, at: [-2.3, 0], turn: 90 },
    { build: () => groundFog({ seed: "gardens-fog" }), name: "groundFog", at: [0, 0] },
  ],
  lights: [{ at: ROSE_LIGHT, colour: "scarlet", intensity: 6, range: 5.5, flicker: 0.06, kind: "glow" }],
  focus: [0, 0.7, 0],
  prime: [1.45, -0.85],
  // In front of the rose's spill over the rim, so no one stands across it.
  keepClear: [{ from: [0.85, 0.75], to: [1.2, 1.05], radius: 0.35 }],
  // Round the fountain by the gravel ring.
  lanes: [
    [
      [0, -2.2],
      [0, -WALK],
    ],
    [
      [0, 2.2],
      [0, WALK],
    ],
    Array.from({ length: 25 }, (_, i): [number, number] => {
      const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
      return [Math.round(Math.cos(a) * WALK * 1000) / 1000, Math.round(Math.sin(a) * WALK * 1000) / 1000];
    }),
  ],
};
