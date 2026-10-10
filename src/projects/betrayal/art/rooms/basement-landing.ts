import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { candle, cask, cobweb, crate } from "../kit";
import { lightAnchor } from "../light-anchor";
import { INNER, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group, projectUvs, textured } from "../shapes";
import { bricks, flagstones, pixelTexture, TEXELS_PER_METRE } from "../textures";

/** Half the width of each arm of the cross of flags joining the four doors. */
const ARM = 0.65;
/** The cross lies this far above the brick floor, as the hall runner does. */
const PAVED = 0.006;
/** Chalk and footprints lie this far above the cross. */
const MARKED = PAVED + 0.008;
const DRAIN = 0.46;
/** Where the lit lamp-standard stands, in the top-left corner. */
const LAMP: [x: number, z: number] = [-2.25, -2.25];

/** The worn flags of the cross, paler than the brick round them. */
function crossStone(): THREE.Texture {
  return flagstones({ ramp: ["stoneDark", "stone", "stoneLight", "boneDark"], mortar: "ash", stonePx: 14, seed: "basement-landing:cross" });
}

/** A flat rectangle of floor, x and z ranges in room metres, `y` up. */
function floorPatch(x: [number, number], z: [number, number], y: number, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(x[1] - x[0], z[1] - z[0]).rotateX(-Math.PI / 2).translate((x[0] + x[1]) / 2, y, (z[0] + z[1]) / 2);
  return new THREE.Mesh(geometry, material);
}

/** Pixel rows drawn twice as large, so a chalk line is two texels thick. */
function doubled(rows: readonly string[]): string[] {
  return rows.flatMap((row) => {
    const wide = [...row].map((cell) => cell + cell).join("");
    return [wide, wide];
  });
}

const ARROW = [
  ".........x....",
  "..........x...",
  "...........x..",
  "xxxxxxxxxxxxx.",
  "...........x..",
  "..........x...",
  ".........x....",
];
/** A chalked cross: not this way. */
const CROSS = [
  "x........x",
  ".x......x.",
  "..x....x..",
  "...x..x...",
  "....xx....",
  "....xx....",
  "...x..x...",
  "..x....x..",
  ".x......x.",
  "x........x",
];

/** A chalk mark flat on the floor: an arrow pointing +x (someone marked the
 *  way out), or a cross. */
function chalk(struck: boolean): THREE.Mesh {
  const rows = doubled(struck ? CROSS : ARROW);
  const texture = pixelTexture(rows, { x: "boneLight" });
  const geometry = new THREE.PlaneGeometry(rows[0].length / TEXELS_PER_METRE, rows.length / TEXELS_PER_METRE).rotateX(-Math.PI / 2);
  return new THREE.Mesh(geometry, textured(texture, true));
}

const FOOT = [".xx..xxxx.x", "xxxx.xxxxx.", "xxxx.xxxxxx", ".xx..xxxx.x"];

/**
 * Bare wet footprints walking out of the drain towards +x, drying as they go:
 * the later prints lose more of their pixels. `length` in metres.
 */
function footprints(length: number): THREE.Mesh {
  const width = 12;
  const long = Math.round(length * TEXELS_PER_METRE);
  const grid = Array.from({ length: width }, () => Array<string>(long).fill("."));
  const rng = createRng("basement-landing:prints");
  for (let step = 0, x = 0; x + FOOT[0].length <= long; step++, x += 14) {
    const left = step % 2 === 0;
    const top = left ? 1 : 7;
    const dry = x / long;
    FOOT.forEach((row, dy) => {
      const line = left ? row : FOOT[FOOT.length - 1 - dy];
      [...line].forEach((cell, dx) => {
        if (cell === "x" && rng.next() > dry * dry * 0.8) grid[top + dy][x + dx] = rng.next() < 0.25 ? "s" : "w";
      });
    });
  }
  const texture = pixelTexture(
    grid.map((row) => row.join("")),
    { w: "void", s: "tideDark" },
  );
  const geometry = new THREE.PlaneGeometry(long / TEXELS_PER_METRE, width / TEXELS_PER_METRE).rotateX(-Math.PI / 2);
  return new THREE.Mesh(geometry, textured(texture, true));
}

/**
 * The heart of the basement: a cross of pale flags laid door to door through
 * the brick floor, a round iron drain where its arms meet, chalk arrows
 * pointing out of three doors and a struck-out one at the fourth, and a trail
 * of wet bare footprints leading from the drain out of that door (−x).
 */
function crossing(): THREE.Group {
  const stone = textured(crossStone());
  const arms = [
    floorPatch([-INNER + 0.01, INNER - 0.01], [-ARM, ARM], PAVED, stone),
    floorPatch([-ARM, ARM], [-INNER + 0.01, -ARM], PAVED, stone),
    floorPatch([-ARM, ARM], [ARM, INNER - 0.01], PAVED, stone),
  ];
  for (const arm of arms) {
    projectUvs(arm.geometry, crossStone());
    arm.receiveShadow = true;
  }
  const b = batch();
  // The grate: a ring of iron round parallel bars, over the dark of the drain.
  const ring = 0.05;
  const inner = DRAIN - 0.12;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const at = new THREE.Vector3(Math.cos(a) * (inner + ring / 2), 0.004, Math.sin(a) * (inner + ring / 2));
    b.add([ring, 0.03, inner * 0.44], "stoneDark", new THREE.Matrix4().compose(at.add(new THREE.Vector3(0, 0.015, 0)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a), new THREE.Vector3(1, 1, 1)));
  }
  for (let x = -inner + 0.07; x < inner - 0.04; x += 0.09) {
    const half = Math.sqrt(inner * inner - x * x);
    b.block([0.035, 0.03, half * 2], "ash", [x, 0.006, 0]);
  }
  const drain = group(
    cylinder(DRAIN, 0.03, flat("stoneLight"), [0, -0.01, 0], { sides: 16 }),
    cylinder(inner, 0.004, flat("void"), [0, 0.006, 0], { sides: 16 }),
    b.mesh(),
  );
  const marks: [THREE.Mesh, number, number, number][] = [
    [chalk(false), 1.7, 0, 0],
    [chalk(false), 0, -1.7, 90],
    [chalk(false), 0, 1.7, -90],
    [chalk(true), -1.9, 0.38, 0],
  ];
  const result = group(...arms, drain);
  for (const [mark, x, z, turn] of marks) {
    mark.position.set(x, MARKED, z);
    mark.rotation.y = (turn * Math.PI) / 180;
    result.add(mark);
  }
  const prints = footprints(2.0);
  prints.position.set(-0.55 - 1.0, MARKED, -0.18);
  prints.rotation.y = Math.PI;
  result.add(prints);
  return result;
}

/** The glazed head of the lamp-standard, its glass burning amber. */
function lampHead(): THREE.Group {
  const iron = flat("soot");
  const glass = 0.2;
  const height = 0.28;
  const hood = cylinder(0.18, 0.12, iron, [0, height + 0.03, 0], { top: 0.03, sides: 4 });
  hood.rotation.y = Math.PI / 4;
  const head = group(box([glass + 0.06, 0.03, glass + 0.06], iron, [0, 0, 0]), box([glass + 0.04, 0.025, glass + 0.04], iron, [0, height + 0.005, 0]), hood);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) head.add(box([0.025, height, 0.025], iron, [(x * (glass + 0.01)) / 2, 0.03, (z * (glass + 0.01)) / 2]));
  head.add(box([glass, height - 0.03, glass], glow("amber"), [0, 0.03, 0]), box([0.07, 0.13, 0.07], glow("flame"), [0, 0.06, 0]));
  return head;
}

const POST = 1.6;

/** An iron lamp-standard over the crossing, a glazed lamp on a post, its
 *  glass burning amber. */
function lampStandard(): THREE.Group {
  const iron = flat("soot");
  const result = group(
    cylinder(0.2, 0.05, iron, [0, 0, 0], { top: 0.16, sides: 8 }),
    cylinder(0.07, 0.14, flat("ash"), [0, 0.05, 0], { top: 0.035, sides: 6 }),
    box([0.05, POST, 0.05], iron, [0, 0.17, 0]),
    box([0.09, 0.05, 0.09], flat("ash"), [0, 0.17 + POST - 0.02, 0]),
  );
  const head = lampHead();
  head.position.y = 0.17 + POST + 0.02;
  result.add(head);
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  result.add(lightAnchor({ colour: "amber", intensity: 9, range: 10, flicker: 0.1, signal: 2 }, [0.25, 0.17 + POST + 0.16, 0.25]));
  return result;
}

/** Stores stacked in the corner: crates, a cask, and a candle stub burning on
 *  the top crate. */
function stores(): THREE.Group {
  const pieces: [THREE.Object3D, [number, number, number], number][] = [
    [crate([0.62, 0.52, 0.58]), [0, 0, 0], 0],
    [crate([0.5, 0.42, 0.48], "woodDark"), [0.05, 0.52, 0.02], 0.2],
    [crate([0.55, 0.48, 0.52]), [0.66, 0, -0.05], -0.1],
    [cask({ radius: 0.22, height: 0.68 }), [0.05, 0, 0.72], 0],
  ];
  const result = group();
  for (const [piece, at, turn] of pieces) {
    piece.position.set(...at);
    piece.rotation.y = turn;
    result.add(piece);
  }
  const stub = candle({ height: 0.07, intensity: 0.8, range: 4.5, lift: 0.4 });
  stub.position.set(0.05, 0.94, 0.02);
  result.add(stub);
  return result;
}

/** The Basement Landing: the crossing of the cellars, where a cross of pale
 *  flags joins its four doors through the brick floor round an iron drain,
 *  lit by one iron lamp-standard. Wet bare footprints walk out of the drain
 *  to the one door chalked "not this way". */
export const BASEMENT_LANDING: RoomDefinition = {
  id: "basement-landing",
  floor: () => bricks({ ramp: ["brickDark", "brick", "brick", "brickLight"], mortar: "soot", wear: 0.5, seed: "basement-landing" }),
  wall: () => flagstones({ ramp: ["stoneDark", "stone", "stone", "stoneLight"], mortar: "soot", stonePx: 12, seed: "basement-landing:ashlar" }),
  wainscot: () => flagstones({ ramp: ["soot", "ash", "stoneDark", "stone"], mortar: "void", stonePx: 16, seed: "basement-landing:plinth" }),
  trim: "stoneDark",
  props: [
    { build: crossing, at: [0, 0], contacts: [{ with: "floor", because: "the drain's stone ring is set into the floor" }] },
    { build: lampStandard, at: LAMP },
    { build: stores, at: [1.75, 2.35], turn: 180 },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [-(INNER - 0.29), INNER - 0.29], y: 3.05, turn: -45, walls: ["left", "bottom"] },
  ],
  focus: [-0.4, 0.4, 0.2],
  pawn: [-1.15, -1.0],
  spots: [[1.15, -1.0], [-1.15, 1.05], [1.15, 1.05], [0, 0], [-2.0, 1.15]],
};
