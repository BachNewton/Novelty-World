import * as THREE from "three";
import { createRng, pick, uniform } from "@/shared/lib/seeded-random";
import type { Edge } from "../../types";
import { animated } from "../animate";
import { candle, cobweb } from "../kit";
import { lightAnchor } from "../light-anchor";
import { paletteHex, RAMPS, type PaletteKey } from "../palette";
import { INNER, onWall, type PropPlacement, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group, lathe, lightMaterial, pixelPlane, textured } from "../shapes";
import { flagstones, pixelTexture, woodPlanks } from "../textures";

interface BrickOptions {
  bodies: readonly PaletteKey[];
  mortar: PaletteKey;
  speck: PaletteKey;
  seed: string;
}

/** Brick in stretcher bond, 8 by 4 texels a brick with its joint, as a
 *  repeating pixel texture: each brick a body colour, a few flecked. */
function brickwork({ bodies, mortar, speck, seed }: BrickOptions): THREE.Texture {
  const size = 64;
  const rng = createRng(`kitchen-brick:${seed}`);
  const keys = ["a", "b", "c", "d"].slice(0, bodies.length);
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => "m"));
  for (let course = 0; course < size / 4; course++) {
    const offset = (course % 2) * 4;
    for (let brick = -1; brick < size / 8; brick++) {
      const body = pick(rng, keys);
      for (let y = course * 4; y < course * 4 + 3; y++) {
        for (let x = 0; x < 7; x++) grid[y][(brick * 8 + offset + x + size) % size] = body;
      }
      if (rng.next() < 0.3) grid[course * 4 + 1 + Math.floor(rng.next() * 2)][(brick * 8 + offset + 1 + Math.floor(rng.next() * 5) + size) % size] = "s";
    }
  }
  const legend: Record<string, PaletteKey> = { m: mortar, s: speck };
  keys.forEach((key, i) => (legend[key] = bodies[i]));
  return pixelTexture(grid.map((row) => row.join("")), legend, true);
}

/** Old, grimy limewash over brick above the dado; bare, smoke-browned brick below it. */
const LIMEWASH = (): THREE.Texture => brickwork({ bodies: ["boneDark", "boneDark", "stoneLight"], mortar: "stone", speck: "stoneDark", seed: "wash" });
const BARE_BRICK = (): THREE.Texture => brickwork({ bodies: ["woodMid", "wood", "woodLight"], mortar: "stoneDark", speck: "soot", seed: "dado" });

/** Scrubbed deal: the pale boards of a working table. */
const DEAL: readonly PaletteKey[] = ["boneDark", "bone", "bone", "boneLight"];

/** A piece holding a light, or glowing, must not throw a shadow over it. */
function noShadows(object: THREE.Object3D): THREE.Object3D {
  object.traverse((child) => {
    child.userData.noShadow = true;
  });
  return object;
}

/** An open pot of `radius` and `height`, its contents `below` the rim, as a
 *  lathe so the liquid shows inside it. Stands on y = 0. */
function pot(radius: number, height: number, metal: PaletteKey, below = 0.05): THREE.Group {
  const wall = 0.014;
  const shell = lathe(
    [
      [0, 0],
      [radius * 0.92, 0],
      [radius, 0.03],
      [radius, height],
      [radius - wall, height],
      [radius - wall, height - below],
      [0, height - below],
    ],
    flat(metal),
    10,
  );
  const surface = cylinder(radius - wall + 0.002, 0.012, glow("wraithLight"), [0, height - below, 0], { sides: 10 });
  const result = group(shell, surface);
  const bubbles = createRng(`bubbles:${radius}`);
  for (let i = 0; i < 4; i++) {
    const bubble = new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 0), glow("boneLight"));
    const angle = bubbles.next() * Math.PI * 2;
    const r = Math.sqrt(bubbles.next()) * (radius - 0.04);
    bubble.position.set(Math.cos(angle) * r, height - below + 0.012, Math.sin(angle) * r);
    bubble.scale.y = 0.6;
    result.add(bubble);
  }
  return result;
}

/** Steam rising off a pot from `y`, wisps that swell and fade as they climb,
 *  tinted by the light under them. It rises though nothing heats it. */
function steam(x: number, y: number, z: number, phase: number, spread = 0.08): THREE.Group {
  const wisps = group();
  const count = 4;
  const parts = Array.from({ length: count }, (_, i) => {
    const material = lightMaterial(0.2);
    material.color.set(paletteHex("wraith"));
    const wisp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), material);
    wisps.add(wisp);
    return { wisp, material, offset: i / count };
  });
  noShadows(wisps);
  wisps.position.set(x, y, z);
  return animated(wisps, (seconds) => {
    for (const { wisp, material, offset } of parts) {
      const life = (seconds / 3.2 + offset + phase) % 1;
      wisp.position.set(Math.sin(life * 5 + offset * 9) * spread * life, life * 0.75, Math.cos(life * 4 + offset * 7) * spread * 0.6 * life);
      wisp.scale.setScalar(0.6 + life * 1.4);
      wisp.rotation.y = life * 2 + offset * 3;
      material.opacity = 0.24 * Math.sin(life * Math.PI);
    }
  });
}

const RANGE = { width: 1.5, depth: 0.62, hob: 0.86, back: 0.04 };
const PIER = { x: 0.97, width: 0.42, depth: 0.72 };
/** The stone slab capping the piers, where the hung chimney breast begins. */
const CAP_TOP = RANGE.hob + 0.05;

/**
 * The kitchener: a black iron range with an oven either side of its grate and
 * a high back and shelf, set between brick piers. The grate is cold and full
 * of grey ash, yet every pot on the hob is boiling, lit green from inside.
 * Its back is to the wall; it faces +z.
 */
function range(): THREE.Group {
  const { width, depth, hob, back } = RANGE;
  const front = back + depth;
  const iron = batch();
  iron.block([width, 0.08, depth + 0.02], "void", [0, 0, back + (depth + 0.02) / 2]);
  iron.block([width, hob - 0.14, depth - 0.04], "soot", [0, 0.08, back + (depth - 0.04) / 2]);
  iron.block([width + 0.08, 0.06, depth + 0.04], "sootLight", [0, hob - 0.06, back + (depth + 0.04) / 2]);
  const face = front - 0.04;
  for (const side of [-1, 1]) {
    const x = side * 0.48;
    iron.block([0.44, 0.44, 0.03], "sootLight", [x, 0.18, face + 0.01]);
    iron.block([0.34, 0.32, 0.02], "soot", [x, 0.24, face + 0.03]);
    iron.block([0.2, 0.035, 0.035], "brass", [x, 0.52, face + 0.055]);
    iron.block([0.05, 0.05, 0.02], "brass", [x - side * 0.15, 0.36, face + 0.04]);
  }
  iron.block([0.46, 0.52, 0.03], "sootLight", [0, 0.18, face + 0.01]);
  iron.block([0.36, 0.34, 0.02], "void", [0, 0.27, face + 0.025]);
  iron.block([0.3, 0.06, 0.12], "stone", [0, 0.27, face - 0.02]);
  for (let i = 0; i < 5; i++) iron.block([0.025, 0.34, 0.025], "sootLight", [-0.14 + i * 0.07, 0.27, face + 0.045]);
  iron.block([0.36, 0.06, 0.03], "ash", [0, 0.2, face + 0.035]);
  // The brass rail along the front, with a cloth hung over it.
  iron.block([width + 0.06, 0.03, 0.03], "brass", [0, hob - 0.16, front + 0.08]);
  for (const side of [-1, 1]) iron.block([0.03, 0.03, 0.11], "brass", [side * (width / 2 + 0.01), hob - 0.16, front + 0.03]);
  iron.block([0.3, 0.3, 0.02], "bone", [0.38, hob - 0.45, front + 0.106]);
  iron.block([0.3, 0.02, 0.07], "bone", [0.38, hob - 0.145, front + 0.08]);
  // A low back, so the pots show from behind when its wall is cut away.
  iron.block([width + 0.02, 0.2, 0.05], "soot", [0, hob, back + 0.025]);
  iron.block([width + 0.02, 0.03, 0.08], "sootLight", [0, hob + 0.2, back + 0.04]);

  const brick = textured(BARE_BRICK());
  const stone = textured(flagstones({ stonePx: 6, size: 32, seed: "kitchen-cap", ramp: RAMPS.stone }));
  const result = group(iron.mesh());
  for (const side of [-1, 1]) {
    result.add(
      box([PIER.width, hob, PIER.depth], brick, [side * PIER.x, 0, back + PIER.depth / 2]),
      box([PIER.width + 0.04, CAP_TOP - hob, PIER.depth + 0.04], stone, [side * PIER.x, hob, back + PIER.depth / 2 + 0.01]),
    );
  }

  const pots = group(
    pot(0.17, 0.32, "sootLight").translateX(-0.4).translateY(hob).translateZ(back + 0.36),
    pot(0.12, 0.14, "brass", 0.035).translateX(0.12).translateY(hob).translateZ(back + 0.42),
    pot(0.1, 0.1, "sootLight", 0.03).translateX(0.48).translateY(hob).translateZ(back + 0.32),
    box([0.2, 0.025, 0.03], flat("sootLight"), [0.12, hob + 0.12, back + 0.62]),
    box([0.03, 0.025, 0.2], flat("sootLight"), [0.62, hob + 0.075, back + 0.42]),
  );
  for (const x of [-0.4 - 0.18, -0.4 + 0.18]) pots.add(box([0.03, 0.04, 0.06], flat("sootLight"), [x, hob + 0.26, back + 0.36]));
  noShadows(pots);
  result.add(
    pots,
    steam(-0.4, hob + 0.3, back + 0.36, 0, 0.1),
    steam(0.12, hob + 0.12, back + 0.42, 0.4),
    steam(0.48, hob + 0.08, back + 0.32, 0.7, 0.06),
    lightAnchor({ colour: "wraith", intensity: 11, range: 7, flicker: 0.2 }, [0, hob + 0.3, back + 0.66]),
  );
  return result;
}

/** The chimney breast above the range, hung on its wall: the piers carried
 *  up, a brick arch over the hob, a mantel shelf of tins, and the stack to
 *  the ceiling. Its origin is the top of the pier caps. */
function chimneyBreast(): THREE.Group {
  const brick = textured(BARE_BRICK());
  const wash = textured(LIMEWASH());
  const { back } = RANGE;
  const arch = 1.0;
  const span = PIER.x * 2 + PIER.width;
  const result = group(
    box([span, 0.32, PIER.depth], brick, [0, arch, back + PIER.depth / 2]),
    box([span, 3.15 - CAP_TOP - arch - 0.36, PIER.depth - 0.1], wash, [0, arch + 0.36, back + (PIER.depth - 0.1) / 2]),
    box([span + 0.16, 0.06, 0.24], flat("woodDark"), [0, arch + 0.32, back + PIER.depth - 0.06]),
  );
  const inner = PIER.x - PIER.width / 2;
  for (const side of [-1, 1]) {
    result.add(box([PIER.width, arch, PIER.depth], brick, [side * PIER.x, -0.004, back + PIER.depth / 2]));
  }
  // The range's high back and plate shelf, hung here so they hide with the wall.
  const iron = batch();
  const bottom = RANGE.hob + 0.23 - CAP_TOP;
  iron.block([PIER.x * 2 - PIER.width - 0.02, arch - bottom + 0.01, 0.04], "soot", [0, bottom, back + 0.02]);
  iron.block([RANGE.width - 0.2, 0.04, 0.03], "brass", [0, bottom + 0.12, back + 0.055]);
  iron.block([PIER.x * 2 - PIER.width - 0.02, 0.04, 0.22], "sootLight", [0, bottom + 0.4, back + 0.11]);
  for (const x of [-0.45, -0.2, 0.3]) {
    iron.add([0.22, 0.22, 0.02], "boneLight", new THREE.Matrix4().makeRotationX(-0.15).setPosition(x, bottom + 0.55, back + 0.1));
  }
  // Iron cheeks lining the arch, sooted black.
  for (const side of [-1, 1]) iron.block([0.03, arch - bottom, PIER.depth - 0.1], "soot", [side * (inner - 0.01), bottom, back + 0.05 + (PIER.depth - 0.1) / 2]);
  result.add(iron.mesh());
  const tins = batch();
  const shelf = arch + 0.38;
  const z = back + PIER.depth + 0.02;
  const sizes: [w: number, h: number, colour: PaletteKey][] = [
    [0.16, 0.22, "moon"], [0.14, 0.18, "moon"], [0.12, 0.15, "moon"],
    [0.1, 0.24, "brass"], [0.18, 0.12, "blood"], [0.13, 0.2, "verdigris"], [0.13, 0.2, "verdigris"],
  ];
  let x = -0.95;
  for (const [w, h, colour] of sizes) {
    tins.block([w, h, 0.13], colour, [x + w / 2, shelf, z]);
    tins.block([w + 0.01, 0.025, 0.14], "sootLight", [x + w / 2, shelf + h, z]);
    x += w + 0.06;
  }
  result.add(tins.mesh());
  return result;
}

const TABLE = { length: 2.2, width: 1.0, height: 0.8 };

/** The big scrubbed kitchen table, pale from years of sand and soda, with a
 *  drawer at each end. Its length runs along x. */
function kitchenTable(): THREE.Group {
  const { length, width, height } = TABLE;
  const top = textured(woodPlanks({ ramp: DEAL, plankPx: 7, seed: "kitchen-table" }));
  const frame = batch();
  const leg = 0.09;
  const lx = length / 2 - 0.12;
  const lz = width / 2 - 0.1;
  for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) {
    frame.block([leg, height - 0.05, leg], "woodMid", [x, 0, z]);
    frame.block([leg + 0.03, 0.06, leg + 0.03], "wood", [x, 0.06, z]);
  }
  frame.block([length - 0.3, 0.14, 0.03], "woodMid", [0, height - 0.19, lz]);
  frame.block([length - 0.3, 0.14, 0.03], "woodMid", [0, height - 0.19, -lz]);
  for (const side of [-1, 1]) {
    frame.block([0.03, 0.14, width - 0.2], "woodMid", [side * lx, height - 0.19, 0]);
    frame.block([0.02, 0.1, 0.4], "wood", [side * (lx + 0.05), height - 0.17, 0]);
    frame.block([0.03, 0.03, 0.08], "brass", [side * (lx + 0.07), height - 0.13, 0]);
  }
  frame.block([length - 0.3, 0.04, 0.05], "wood", [0, 0.12, 0]);
  return group(frame.mesh(), box([length, 0.05, width], top, [0, height - 0.05, 0]));
}

/** A plank bench with splayed legs, as long as the table. Faces +z. */
function form(): THREE.Group {
  const b = batch();
  b.block([1.8, 0.05, 0.3], "woodMid", [0, 0.42, 0]);
  for (const x of [-0.75, 0.75]) {
    for (const z of [-0.09, 0.09]) {
      const legMatrix = new THREE.Matrix4().makeRotationX(Math.sign(z) * 0.18).multiply(new THREE.Matrix4().makeRotationZ(Math.sign(x) * -0.12));
      legMatrix.setPosition(x + Math.sign(x) * 0.022, 0.21, z + Math.sign(z) * 0.018);
      b.add([0.05, 0.44, 0.05], "wood", legMatrix);
    }
  }
  b.block([1.5, 0.05, 0.04], "wood", [0, 0.16, 0]);
  return group(b.mesh());
}

/** A three-legged stool, pushed back from the table. */
function stool(): THREE.Group {
  const b = batch();
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const leg = new THREE.Matrix4()
      .makeRotationY(angle)
      .multiply(new THREE.Matrix4().makeRotationX(0.14))
      .setPosition(Math.sin(angle) * 0.13, 0.23, Math.cos(angle) * 0.13);
    b.add([0.04, 0.48, 0.04], "wood", leg);
  }
  const seat = cylinder(0.18, 0.045, flat("woodMid"), [0, 0.45, 0], { sides: 9 });
  return group(b.mesh(), seat);
}

/** Knives laid out on the table with a ruler's care: graded by length, every
 *  handle on one line, every blade parallel, the spacing exact. Blades point −z. */
function knives(): THREE.Group {
  const b = batch();
  const lengths = [0.36, 0.32, 0.28, 0.25, 0.22, 0.19, 0.16];
  lengths.forEach((blade, i) => {
    const x = -0.21 + i * 0.07;
    const handle = 0.12;
    b.block([0.035, 0.022, handle], "woodDark", [x, 0, 0]);
    b.block([0.03, 0.03, 0.012], "brass", [x, 0, -handle / 2 - 0.004]);
    b.block([0.04 - i * 0.003, 0.015, blade], "stoneLight", [x, 0, -handle / 2 - blade / 2 - 0.008]);
  });
  return group(b.mesh());
}

/** A chopping board with a turnip half cut into slices, the knife that cut
 *  it missing: it lies with the others. */
function choppingBoard(): THREE.Group {
  const turnip = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07, 0), flat("boneLight"));
  turnip.scale.set(1, 0.85, 1);
  turnip.position.set(-0.1, 0.085, 0);
  const top = cylinder(0.035, 0.05, flat("bruise"), [-0.1, 0.13, 0], { top: 0.01, sides: 5 });
  const b = batch();
  b.block([0.5, 0.035, 0.32], "woodLight", [0, 0, 0]);
  for (let i = 0; i < 5; i++) {
    b.add([0.11, 0.11, 0.018], "boneLight", new THREE.Matrix4().makeRotationX(-0.5 - i * 0.12).setPosition(0.04 + i * 0.03, 0.07, 0.01));
  }
  for (let i = 0; i < 4; i++) b.block([0.035, 0.02, 0.035], "bone", [0.14 + (i % 2) * 0.05, 0.035, -0.09 + i * 0.04]);
  return group(b.mesh(), turnip, top);
}

/** A cabbage with a wedge cut from it. */
function cabbage(): THREE.Group {
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), flat("verdigris"));
  head.position.y = 0.1;
  head.scale.y = 0.9;
  const leaf = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06, 0), flat("verdigrisLight"));
  leaf.position.set(0.05, 0.16, 0.04);
  return group(head, leaf);
}

/** A loaf with three slices cut and fallen against each other. */
function loaf(): THREE.Group {
  const b = batch();
  b.block([0.22, 0.1, 0.14], "woodLight", [0, 0, 0]);
  b.block([0.2, 0.04, 0.12], "woodMid", [0, 0.1, 0]);
  b.block([0.012, 0.11, 0.13], "bone", [0.107, 0.005, 0]);
  for (let i = 0; i < 3; i++) {
    b.add([0.02, 0.13, 0.13], i === 2 ? "bone" : "woodLight", new THREE.Matrix4().makeRotationZ(-0.9 - i * 0.22).setPosition(0.17 + i * 0.045, 0.05 - i * 0.008, 0.01 * i));
  }
  return group(b.mesh());
}

const FLOUR = [
  "..f.....f....",
  ".ff.ffff..f..",
  "ffffffffff...",
  ".fffffffffff.",
  "ffffffffffff.",
  ".fffffffffff.",
  "..fffffffff..",
  ".f.fffffff.f.",
  "....f..f.....",
];

/** Pastry rolled out on a dusting of flour, the pin left on it, and a bowl
 *  of dough beside it. */
function pastry(): THREE.Group {
  const dust = pixelPlane(pixelTexture(FLOUR, { f: "boneLight" }), { alpha: true });
  dust.rotation.x = -Math.PI / 2;
  dust.position.y = 0.004;
  const sheet = box([0.3, 0.018, 0.24], flat("bone"), [0.02, 0.004, 0]);
  const pin = cylinder(0.03, 0.42, flat("woodLight"), [0, 0, 0], { sides: 7 });
  pin.rotation.z = Math.PI / 2;
  pin.rotation.y = 0.35;
  pin.position.set(0.24, 0.052, 0.02);
  const bowl = lathe(
    [
      [0, 0],
      [0.07, 0],
      [0.16, 0.1],
      [0.15, 0.1],
      [0.13, 0.07],
      [0, 0.07],
    ],
    flat("boneDark"),
    10,
  );
  bowl.position.set(-0.35, 0, -0.08);
  const dough = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08, 0), flat("bone"));
  dough.scale.y = 0.6;
  dough.position.set(-0.35, 0.09, -0.08);
  return group(dust, sheet, pin, bowl, dough);
}

/** A brass chamberstick with a candle burnt halfway. */
function chamberstick(intensity: number): THREE.Group {
  const brass = flat("brass");
  const taper = candle({ height: 0.12, intensity });
  taper.position.y = 0.06;
  return group(
    noShadows(group(
      cylinder(0.09, 0.02, brass, [0, 0, 0], { top: 0.08, sides: 8 }),
      cylinder(0.03, 0.04, brass, [0, 0.02, 0], { sides: 6 }),
      box([0.1, 0.012, 0.02], brass, [0.11, 0.012, 0]),
    )),
    taper,
  );
}

/** The ceiling rack over the table: a wooden frame on four chains, hung with
 *  copper and iron pans, a ladle and bunches of drying herbs. Its origin is
 *  the floor below it; it runs along x. */
function panRack(): THREE.Group {
  const rail = 2.05;
  const b = batch();
  for (const z of [-0.22, 0.22]) b.block([1.7, 0.05, 0.06], "woodMid", [0, rail, z]);
  for (const x of [-0.75, 0, 0.75]) b.block([0.05, 0.04, 0.52], "wood", [x, rail + 0.05, 0]);
  for (const x of [-0.75, 0.75]) {
    for (let y = rail + 0.09, i = 0; y < 3.2; y += 0.09, i++) {
      const across = i % 2 === 0;
      b.block([across ? 0.035 : 0.012, 0.1, across ? 0.012 : 0.035], "sootLight", [x, y, 0]);
    }
  }
  const result = group();
  const hang: [x: number, z: number, kind: "pan" | "pot" | "ladle" | "herbs", metal: PaletteKey, size: number][] = [
    [-0.62, 0.22, "pan", "brass", 0.16],
    [-0.32, 0.22, "pan", "brass", 0.12],
    [-0.05, 0.22, "ladle", "sootLight", 0],
    [0.22, 0.22, "pan", "sootLight", 0.15],
    [0.55, 0.22, "pan", "brass", 0.1],
    [-0.5, -0.22, "herbs", "verdigrisDark", 0],
    [-0.15, -0.22, "pot", "brass", 0.11],
    [0.3, -0.22, "herbs", "wraithDark", 0],
    [0.6, -0.22, "herbs", "verdigrisDark", 0],
  ];
  for (const [x, z, kind, colour, size] of hang) {
    b.block([0.012, 0.06, 0.012], "sootLight", [x, rail - 0.05, z]);
    if (kind === "pan") {
      const handle = 0.22;
      b.block([0.03, handle, 0.018], colour, [x, rail - 0.05 - handle, z]);
      const dish = cylinder(size, 0.045, flat(colour), [0, 0, 0], { top: size * 1.08, sides: 10 });
      dish.rotation.x = Math.PI / 2;
      dish.position.set(x, rail - 0.05 - handle - size + 0.01, z);
      result.add(dish);
    } else if (kind === "pot") {
      b.block([0.012, 0.12, 0.012], "sootLight", [x, rail - 0.17, z]);
      const body = cylinder(size, size * 1.3, flat(colour), [x, rail - 0.17 - size * 1.3, z], { top: size * 0.95, sides: 9 });
      result.add(body);
    } else if (kind === "ladle") {
      b.block([0.025, 0.42, 0.015], colour, [x, rail - 0.47, z]);
      const cup = cylinder(0.055, 0.05, flat(colour), [x, rail - 0.52, z + 0.02], { top: 0.07, sides: 8 });
      result.add(cup);
    } else {
      b.block([0.05, 0.08, 0.05], "boneDark", [x, rail - 0.13, z]);
      const bunch = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 5), flat(colour));
      bunch.position.set(x, rail - 0.29, z);
      result.add(bunch);
    }
  }
  result.add(b.mesh());
  return result;
}

/** The dresser's base: drawers over two cupboards, a candle and crocks on
 *  its top. Backed against its wall, it faces +z. */
function dresserBase(): THREE.Group {
  const b = batch();
  const width = 1.8;
  const back = 0.04;
  b.block([width, 0.08, 0.48], "woodDark", [0, 0, back + 0.24]);
  b.block([width - 0.02, 0.76, 0.46], "wood", [0, 0.06, back + 0.23]);
  b.block([width + 0.06, 0.05, 0.54], "woodMid", [0, 0.82, back + 0.27]);
  const face = back + 0.46;
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.58;
    b.block([0.54, 0.17, 0.02], "woodMid", [x, 0.6, face + 0.005]);
    b.block([0.08, 0.03, 0.03], "brass", [x, 0.67, face + 0.025]);
  }
  for (const x of [-0.45, 0.45]) {
    b.block([0.8, 0.44, 0.02], "woodMid", [x, 0.12, face + 0.005]);
    b.block([0.66, 0.32, 0.02], "wood", [x, 0.18, face + 0.02]);
    b.block([0.03, 0.06, 0.03], "brass", [x - Math.sign(x) * 0.33, 0.33, face + 0.035]);
  }
  const result = group(b.mesh());
  const crock = lathe([[0, 0], [0.1, 0], [0.12, 0.12], [0.1, 0.24], [0.08, 0.26], [0, 0.26]], flat("boneDark"), 9);
  crock.position.set(-0.65, 0.87, back + 0.42);
  const jar = lathe([[0, 0], [0.07, 0], [0.08, 0.16], [0.05, 0.19], [0, 0.19]], flat("woodLight"), 8);
  jar.position.set(-0.4, 0.87, back + 0.42);
  const light = chamberstick(1.8);
  light.position.set(0.55, 0.87, back + 0.42);
  result.add(crock, jar, light);
  return result;
}

/** The dresser's open plate rack, hung on the wall above the base: three
 *  shelves of plates on edge and jugs on hooks. Its origin is the base's top. */
function dresserRack(): THREE.Group {
  const b = batch();
  const width = 1.8;
  const height = 1.35;
  const back = 0.04;
  const depth = 0.26;
  b.block([width - 0.04, height, 0.03], "woodDark", [0, 0, back + 0.015]);
  for (const side of [-1, 1]) b.block([0.04, height, depth], "wood", [side * (width / 2 - 0.02), 0, back + depth / 2]);
  b.block([width + 0.08, 0.08, depth + 0.06], "woodMid", [0, height, back + (depth + 0.06) / 2]);
  const rng = createRng("kitchen-plates");
  const result = group();
  for (const level of [0.02, 0.45, 0.88]) {
    b.block([width - 0.06, 0.03, depth - 0.02], "woodMid", [0, level, back + depth / 2]);
    if (level > 0.1) b.block([width - 0.06, 0.025, 0.02], "wood", [0, level + 0.1, back + depth - 0.01]);
    let x = -width / 2 + 0.16;
    while (x < width / 2 - 0.15) {
      const radius = uniform(rng, 0.1, 0.13);
      const plate = cylinder(radius, 0.02, flat(pick(rng, ["boneLight", "boneLight", "moon", "moonLight"] as const)), [0, 0, 0], { sides: 10 });
      plate.rotation.x = Math.PI / 2 - 0.14;
      plate.position.set(x, level + 0.03 + radius, back + 0.1);
      result.add(plate);
      x += radius * 2 + uniform(rng, 0.02, 0.05);
    }
  }
  for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) {
    b.block([0.012, 0.04, 0.012], "brass", [x, 0.4, back + depth - 0.02]);
    const jug = lathe([[0, 0], [0.05, 0], [0.065, 0.06], [0.045, 0.12], [0.055, 0.14], [0, 0.14]], flat(x === 0 ? "moon" : "bone"), 8);
    jug.position.set(x, 0.26, back + depth - 0.02);
    result.add(jug);
  }
  result.add(b.mesh());
  return result;
}

/** A shallow stone sink on brick piers, a cast-iron pump at its back and a
 *  pail beneath. Backed against its wall, it faces +z. */
function sink(): THREE.Group {
  const brick = textured(BARE_BRICK());
  const back = 0.04;
  const b = batch();
  const top = 0.82;
  const [w, d] = [1.0, 0.56];
  b.block([w, 0.08, d], "stone", [0, top - 0.22, back + d / 2]);
  b.block([w, 0.14, 0.07], "stone", [0, top - 0.14, back + d - 0.035]);
  b.block([w, 0.14, 0.07], "stone", [0, top - 0.14, back + 0.035]);
  for (const side of [-1, 1]) b.block([0.07, 0.14, d - 0.14], "stone", [side * (w / 2 - 0.035), top - 0.14, back + d / 2]);
  b.block([w - 0.14, 0.02, d - 0.14], "tideDark", [0, top - 0.12, back + d / 2]);
  b.block([0.07, 0.62, 0.07], "sootLight", [-0.25, top - 0.14, back + 0.06]);
  b.block([0.05, 0.05, 0.22], "sootLight", [-0.25, top + 0.36, back + 0.17]);
  b.add([0.04, 0.04, 0.4], "sootLight", new THREE.Matrix4().makeRotationX(-0.6).setPosition(-0.25, top + 0.56, back + 0.2));
  for (let i = 0; i < 3; i++) b.block([0.22, 0.02, 0.22], "boneLight", [0.2 + i * 0.012, top - 0.1 + i * 0.022, back + 0.28]);
  const result = group(b.mesh());
  for (const side of [-1, 1]) result.add(box([0.16, top - 0.22, d - 0.06], brick, [side * 0.38, 0, back + (d - 0.06) / 2]));
  const pail = cylinder(0.13, 0.26, flat("stoneDark"), [0, 0, back + 0.28], { top: 0.15, sides: 9 });
  result.add(pail);
  return result;
}

/** A coal scuttle, full, and its shovel, by the cold range. */
function coalScuttle(): THREE.Group {
  const scuttle = lathe([[0, 0], [0.16, 0], [0.18, 0.3], [0, 0.3]], flat("sootLight"), 8);
  const coal = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), flat("void"));
  coal.scale.y = 0.4;
  coal.position.y = 0.3;
  const shovel = box([0.04, 0.5, 0.02], flat("sootLight"), [0, 0, 0]);
  shovel.rotation.z = 0.35;
  shovel.position.set(0.12, 0.22, 0.04);
  return group(scuttle, coal, shovel);
}

/** A meal chest, its lid propped open a crack, with a flour sack slumped
 *  against it. Backed against its wall, it faces +z. */
function mealChest(): THREE.Group {
  const b = batch();
  b.block([0.9, 0.66, 0.5], "woodMid", [0, 0, 0.29]);
  b.block([0.94, 0.06, 0.54], "wood", [0, 0.66, 0.29]);
  b.block([0.2, 0.04, 0.03], "sootLight", [0, 0.56, 0.555]);
  const result = group(b.mesh());
  const sack = lathe([[0, 0], [0.2, 0], [0.24, 0.18], [0.2, 0.42], [0.08, 0.52], [0.06, 0.6], [0, 0.6]], flat("boneDark"), 8);
  sack.rotation.z = -0.22;
  sack.position.set(0.72, 0.045, 0.3);
  return group(result, sack);
}

/** A slatted rack of stoneware crocks and jars. Backed against its wall, it faces +z. */
function crockRack(): THREE.Group {
  const b = batch();
  for (const x of [-0.58, 0.58]) b.block([0.04, 0.8, 0.36], "wood", [x, 0, 0.22]);
  for (const y of [0.12, 0.76]) b.block([1.18, 0.03, 0.36], "woodMid", [0, y, 0.22]);
  const result = group(b.mesh());
  const rng = createRng("kitchen-crocks");
  for (const [y, xs] of [[0.15, [-0.4, -0.1, 0.25]], [0.79, [-0.38, -0.12, 0.12, 0.38]]] as const) {
    for (const x of xs) {
      const r = uniform(rng, 0.07, 0.11);
      const h = uniform(rng, 0.14, 0.26);
      const crock = lathe([[0, 0], [r, 0], [r * 1.1, h * 0.6], [r * 0.8, h], [0, h]], flat(pick(rng, ["boneDark", "woodLight", "bone"] as const)), 8);
      crock.position.set(x, y + 0.03, 0.22);
      result.add(crock);
    }
  }
  return result;
}

/** A chopping block on three stout legs, a cabbage's outer leaves on it. */
function choppingBlock(): THREE.Group {
  const top = cylinder(0.28, 0.3, flat("woodLight"), [0, 0.5, 0], { sides: 10 });
  const ring = cylinder(0.285, 0.04, flat("sootLight"), [0, 0.7, 0], { sides: 10 });
  const b = batch();
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + 0.4;
    b.add([0.08, 0.54, 0.08], "woodMid", new THREE.Matrix4().makeRotationY(angle).multiply(new THREE.Matrix4().makeRotationX(0.12)).setPosition(Math.sin(angle) * 0.15, 0.26, Math.cos(angle) * 0.15));
  }
  for (const [x, z, turn] of [[0.06, 0.04, 0.3], [-0.1, -0.05, 1.4]]) {
    b.add([0.14, 0.02, 0.1], "verdigrisLight", new THREE.Matrix4().makeRotationY(turn).setPosition(x, 0.81, z));
  }
  return group(top, ring, b.mesh());
}

/** A wicker basket of potatoes. */
function potatoBasket(): THREE.Group {
  const basket = lathe([[0, 0], [0.2, 0], [0.24, 0.22], [0.22, 0.22], [0.18, 0.04], [0, 0.04]], flat("woodLight"), 10);
  const b = batch();
  const rng = createRng("kitchen-potatoes");
  for (let i = 0; i < 9; i++) {
    const angle = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * 0.14;
    b.add([0.08, 0.06, 0.06], pick(rng, ["boneDark", "woodLight"] as const), new THREE.Matrix4().makeRotationY(angle).setPosition(Math.cos(angle) * r, 0.17 + rng.next() * 0.04, Math.sin(angle) * r));
  }
  return group(basket, b.mesh());
}

/** A pail and a mop leaning into the corner. */
function mopAndPail(): THREE.Group {
  const pail = cylinder(0.14, 0.28, flat("stoneDark"), [0, 0, 0], { top: 0.16, sides: 9 });
  const water = cylinder(0.14, 0.01, flat("tideDark"), [0, 0.24, 0], { sides: 9 });
  const mop = group(box([0.035, 1.3, 0.035], flat("woodMid"), [0, 0.12, 0]), box([0.14, 0.14, 0.14], flat("boneDark"), [0, 0, 0]));
  mop.rotation.set(-0.2, 0, 0.2);
  mop.position.set(0.25, 0.01, 0.15);
  return group(pail, water, mop);
}

/** A cobweb across a corner; `x` and `z` give the corner's signs. */
function cornerWeb(x: 1 | -1, z: 1 | -1): PropPlacement {
  const inset = INNER - 0.29;
  const walls: Edge[] = [x > 0 ? "right" : "left", z > 0 ? "bottom" : "top"];
  return { build: () => cobweb({ form: "slung" }), name: "cornerWeb", at: [x * inset, z * inset], y: 3.05, turn: x * z > 0 ? 45 : -45, walls };
}

const TABLE_AT: [number, number] = [-0.2, -0.35];
const ON_TABLE = TABLE.height;
const at = (x: number, z: number): [number, number] => [TABLE_AT[0] + x, TABLE_AT[1] + z];

/** A below-stairs kitchen: a cold black range whose pots all boil, lit green
 *  from inside, between brick piers; a scrubbed table of food left half made
 *  under a rack of pans; the dresser, sink and stores round the walls. */
export const KITCHEN: RoomDefinition = {
  id: "kitchen",
  floor: () => flagstones({ stonePx: 16, seed: "kitchen" }),
  wall: LIMEWASH,
  wainscot: BARE_BRICK,
  trim: "woodDark",
  props: [
    { build: range, ...onWall("left", 0) },
    { build: chimneyBreast, ...onWall("left", 0, { y: CAP_TOP }) },
    { build: coalScuttle, at: [-2.45, -1.55] },

    { build: kitchenTable, at: TABLE_AT },
    { build: panRack, at: TABLE_AT },
    { build: form, at: [-0.2, -1.2] },
    { build: stool, at: [1.3, -0.15] },
    { build: knives, at: at(0.72, 0.08), y: ON_TABLE },
    { build: choppingBoard, at: at(-0.2, 0.12), y: ON_TABLE, turn: -6 },
    { build: cabbage, at: at(0.25, -0.22), y: ON_TABLE },
    { build: loaf, at: at(-0.78, 0.2), y: ON_TABLE, turn: 20 },
    { build: pastry, at: at(-0.55, -0.22), y: ON_TABLE },
    { build: () => chamberstick(1.6), name: "tableCandle", at: at(0.3, 0.3), y: ON_TABLE },

    { build: dresserBase, ...onWall("bottom", 1.0) },
    { build: dresserRack, ...onWall("bottom", 1.0, { y: 0.87 }) },
    { build: sink, ...onWall("top", -1.7) },
    { build: mealChest, ...onWall("top", 1.55) },
    { build: crockRack, ...onWall("right", -1.45) },
    { build: choppingBlock, at: [-2.25, 1.7] },
    { build: potatoBasket, at: [-2.5, 2.45] },
    { build: mopAndPail, at: [2.45, 2.4], turn: -45 },
    cornerWeb(-1, -1),
    cornerWeb(1, 1),
  ],
  focus: [-1.6, 0.9, 0],
  pawn: [1.45, 1.55],
};
