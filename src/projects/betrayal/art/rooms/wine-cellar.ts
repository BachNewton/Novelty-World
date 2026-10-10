import * as THREE from "three";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { candle, cask, cobweb } from "../kit";
import { lightAnchor } from "../light-anchor";
import type { PaletteKey } from "../palette";
import { CUT_HEIGHT, INNER, onWall, type FlickerSignal, type PropPlacement, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, group, textured } from "../shapes";
import { bricks, flagstones, pixelTexture, TEXELS_PER_METRE } from "../textures";

/** A great cask's radius and length, and how high its cradle holds it. */
const CASK = { radius: 0.4, length: 0.95, lift: 0.1 };
/** Where the casks lie along the left wall, heads to the aisle. */
const CASK_X = -INNER + CASK.length / 2 + 0.04;
const RANK = [-1.95, -1.05, -0.15, 0.75, 1.65];
/** The one that burst. */
const BURST = 3;
/** The bottle racks along the right wall. */
const RACK = { length: 4.2, depth: 0.36, top: 2.05 };

/** A tube of radius `r` and length `length` lying along x, centred on the origin. */
function lying(r: number, length: number, material: THREE.Material, sides = 14): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, length, sides).rotateZ(Math.PI / 2), material);
}

/** A chalk tally scrawled on a cask's head: the vintage, or what is left. */
function tally(marks: number): THREE.Mesh {
  const rows = Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 12 }, (_, x) => {
      const stroke = Math.floor(x / 2.5);
      if (stroke < marks && x % 2.5 < 1 && y < 6) return "x";
      return marks >= 4 && y === 7 - Math.floor(x / 2) && x < 12 ? "x" : ".";
    }).join(""),
  );
  const geometry = new THREE.PlaneGeometry(rows[0].length / TEXELS_PER_METRE, rows.length / TEXELS_PER_METRE).rotateY(Math.PI / 2);
  return new THREE.Mesh(geometry, textured(pixelTexture(rows, { x: "boneLight" }), true));
}

/**
 * A great cask lying on its cradle, its pale head to +x with a brass tap and
 * a chalked tally. Burst, its head is stove in on the dark inside, it has
 * slumped off one chock, and staves lie sprung on the floor before it.
 */
function greatCask({ burst = false, marks = 3 }: { burst?: boolean; marks?: number } = {}): THREE.Group {
  const { radius: r, length, lift } = CASK;
  const body = group(lying(r, length, flat("woodMid")));
  for (const x of [-0.38, -0.13, 0.13, 0.38]) body.add(lying(r + 0.015, 0.045, flat("soot")).translateX(x * length));
  const head = burst ? lying(r - 0.05, 0.02, flat("void")) : lying(r - 0.03, 0.02, flat("woodLight"));
  head.position.x = length / 2 + (burst ? -0.04 : 0.006);
  body.add(head);
  if (!burst) {
    body.add(box([0.06, 0.05, 0.05], flat("brass"), [length / 2 + 0.03, -r * 0.62, 0]), box([0.03, 0.06, 0.03], flat("brass"), [length / 2 + 0.05, -r * 0.62 - 0.06, 0]));
    const chalk = tally(marks);
    chalk.position.set(length / 2 + 0.02, r * 0.15, 0);
    body.add(chalk);
  }
  body.position.y = r + lift;
  const cradle = batch();
  for (const x of [-0.3, 0.3]) cradle.block([0.12, lift + 0.16, r * 1.7], "woodDark", [x * length, 0, 0]);
  const result = group(cradle.mesh(), body);
  if (burst) {
    // Slumped off its front chock, head down towards the aisle.
    body.rotation.z = -0.12;
    body.position.y = r + lift - 0.07;
    const b = batch();
    const rng = createRng("wine-cellar:staves");
    for (let k = 0; k < 5; k++) {
      const at = new THREE.Vector3(length / 2 + 0.25 + rng.next() * 0.45, 0.02, (rng.next() - 0.5) * 0.9);
      b.add([0.65, 0.025, 0.09], pick(rng, ["woodMid", "wood", "woodLight"] as PaletteKey[]), new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.next() * 3, 0.04)), new THREE.Vector3(1, 1, 1)));
    }
    b.add([0.07, 0.07, 0.07], "soot", new THREE.Matrix4().makeTranslation(length / 2 + 0.95, 0.035, 0.3));
    result.add(b.mesh());
  }
  return result;
}

/** The dark stain of the wine run out of the burst cask, spread across the
 *  floor towards the aisle. Lies flat, its long side along +x. */
function spill(): THREE.Mesh {
  const width = 48;
  const height = 36;
  const rng = createRng("wine-cellar:spill");
  const blobs = Array.from({ length: 7 }, (_, k) => ({ x: 6 + k * 6 + rng.next() * 4, y: height / 2 + (rng.next() - 0.5) * 12, r: 9 - k * 0.8 + rng.next() * 3 }));
  const rows = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const inside = blobs.some((blob) => Math.hypot(x - blob.x, (y - blob.y) * 1.2) < blob.r);
      if (!inside) return ".";
      return rng.next() < 0.08 ? "d" : "s";
    }).join(""),
  );
  const geometry = new THREE.PlaneGeometry(width / TEXELS_PER_METRE, height / TEXELS_PER_METRE).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, textured(pixelTexture(rows, { s: "bruiseDark", d: "bloodDark" }), true));
  mesh.position.y = 0.008;
  return mesh;
}

/** A face of bottle bins: wooden lattice with a dark bottle end in each,
 *  some catching the light, a few bins empty. `w` × `h` metres. */
function binFace(w: number, h: number, seed: string): THREE.Texture {
  const cell = 5;
  const width = Math.round((w * TEXELS_PER_METRE) / cell) * cell;
  const height = Math.round((h * TEXELS_PER_METRE) / cell) * cell;
  const rng = createRng(seed);
  const grid = Array.from({ length: height }, () => Array<string>(width).fill("f"));
  for (let cy = 0; cy < height; cy += cell) {
    for (let cx = 0; cx < width; cx += cell) {
      const empty = rng.next() < 0.12;
      const glass = rng.next() < 0.7 ? "g" : "r";
      for (let y = 1; y < cell; y++) {
        for (let x = 1; x < cell; x++) {
          const corner = (x === 1 || x === cell - 1) && (y === 1 || y === cell - 1);
          grid[cy + y][cx + x] = empty ? "v" : corner ? "v" : glass;
        }
      }
      if (!empty && rng.next() < 0.45) grid[cy + 2][cx + 2] = "h";
    }
  }
  return pixelTexture(
    grid.map((row) => row.join("")),
    { f: "woodMid", v: "void", g: "verdigrisDark", r: "bloodDark", h: "verdigrisLight" },
  );
}

/** Bottle racks against a wall, faces of bins: the part from `from` to `to`
 *  metres up, standing on `base` (`from` by default). Faces +z. */
function racks(from: number, to: number, base = from): THREE.Group {
  const h = to - from;
  const face = textured(binFace(RACK.length, h, `wine-cellar:bins:${from}`));
  const wood = flat("soot");
  const result = group(box([RACK.length, h - 0.01, RACK.depth], [wood, wood, wood, wood, face, wood], [0, 0.005, RACK.depth / 2]));
  // Uprights between the bays and at the ends, standing a little proud of the bins.
  for (const x of [-RACK.length / 2 + 0.03, -RACK.length / 6, RACK.length / 6, RACK.length / 2 - 0.03]) {
    result.add(box([0.1, h, RACK.depth + 0.04], flat("woodDark"), [x, 0, RACK.depth / 2 + 0.02]));
  }
  result.position.y = from - base;
  return group(result);
}

/** An empty bottle with a candle stub in its neck and wax run down it. */
function bottleCandle(lit: boolean, height: number, { intensity = 3, signal = 1 as FlickerSignal } = {}): THREE.Group {
  const glass = flat("verdigrisDark");
  const result = group(
    cylinder(0.04, height, glass, [0, 0, 0], { sides: 8 }),
    cylinder(0.04, 0.05, glass, [0, height, 0], { top: 0.016, sides: 8 }),
    cylinder(0.016, 0.05, glass, [0, height + 0.05, 0], { sides: 6 }),
  );
  const wax = batch();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + height * 7;
    const run = 0.04 + ((k * 37) % 9) * 0.012;
    wax.block([0.018, run, 0.018], "bone", [Math.cos(a) * 0.03, height + 0.1 - run, Math.sin(a) * 0.03]);
  }
  result.add(wax.mesh());
  const stub = candle({ height: 0.05, light: false, wax: "boneLight" });
  stub.position.y = height + 0.1;
  result.add(stub);
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  if (lit) result.add(lightAnchor({ colour: "amber", intensity, range: 7, flicker: 0.18, signal }, [0, height + 0.45, 0]));
  return result;
}

/** A cask stood on end for a table, three bottle candles burning on it and
 *  a tin cup. */
function tastingCask(): THREE.Group {
  const top = 0.76;
  const result = group(cask({ radius: 0.27, height: top - 0.02 }));
  const bottles: [number, number, number, boolean][] = [
    [-0.08, -0.06, 0.24, true],
    [0.1, -0.02, 0.2, false],
    [0.0, 0.12, 0.17, false],
  ];
  for (const [x, z, h, lit] of bottles) {
    const bottle = bottleCandle(lit, h, { intensity: 4.5 });
    bottle.position.set(x, top, z);
    result.add(bottle);
  }
  result.add(cylinder(0.035, 0.06, flat("stoneLight"), [0.13, top, 0.14], { sides: 8 }));
  return result;
}

/** The Wine Cellar: a rank of great casks lying on their cradles down one
 *  wall, heads to the aisle, and bottle racks down the other, lit by candles
 *  burning in old bottles on a cask stood on end. One great cask has burst
 *  its head and slumped, and its wine has run dark across the floor. */
export const WINE_CELLAR: RoomDefinition = {
  id: "wine-cellar",
  floor: () => flagstones({ ramp: ["ash", "stoneDark", "stone", "stoneLight"], mortar: "soot", stonePx: 10, seed: "wine-cellar:floor" }),
  wall: () => bricks({ mortar: "ash", wear: 0.25, seed: "wine-cellar" }),
  wainscot: () => flagstones({ ramp: ["soot", "ash", "stoneDark", "stone"], mortar: "void", stonePx: 16, seed: "wine-cellar:plinth" }),
  trim: "stoneDark",
  props: [
    ...RANK.map(
      (z, i): PropPlacement => ({
        build: () => greatCask({ burst: i === BURST, marks: 1 + ((i * 3) % 5) }),
        name: i === BURST ? "burstCask" : "greatCask",
        at: [CASK_X, z],
        contacts: i === BURST ? [{ with: "floor", because: "it has slumped off its chock, its rim down on the floor" }] : undefined,
      }),
    ),
    { build: spill, at: [CASK_X + CASK.length / 2 + 0.75, RANK[BURST] - 0.05] },
    // The base stops a little under the cut wall's top, so the two never share a plane; the part above reaches down to it.
    { build: () => racks(0, CUT_HEIGHT - 0.005), name: "rackBase", ...onWall("right", 0, { out: 0.005 }) },
    { build: () => racks(CUT_HEIGHT - 0.005, RACK.top, CUT_HEIGHT), name: "rackAbove", ...onWall("right", 0, { y: CUT_HEIGHT, out: 0.005 }) },
    { build: tastingCask, at: [-1.2, -1.05] },
    { build: () => bottleCandle(true, 0.26, { intensity: 2.2, signal: 3 }), name: "floorCandle", at: [2.22, 1.25] },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [-(INNER - 0.29), -(INNER - 0.29)], y: 3.05, turn: 45, walls: ["left", "top"] },
  ],
  focus: [-0.6, 0.6, 0.2],
  pawn: [0.6, 0.55],
  spots: [[-0.65, -0.4], [1.6, -0.65], [1.0, 2.05], [0.35, -1.6], [1.75, -2.3]],
  overflow: [[2.05, 2.35], [1.6, 0.55], [-0.4, 0.55], [0.25, -0.5], [1.7, 1.65], [1.95, -1.35]],
};
