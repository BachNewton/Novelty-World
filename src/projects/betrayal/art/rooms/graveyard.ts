import * as THREE from "three";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { lantern } from "../kit";
import { lightAnchor } from "../light-anchor";
import { paletteHex, type PaletteKey } from "../palette";
import type { PropPlacement, RoomDefinition } from "../room";
import { box, cylinder, flat, glow, group, lightMaterial, projectUvs, textured } from "../shapes";
import { earth, flagstones, pixelTexture, TEXELS_PER_METRE } from "../textures";

/** The open grave's hole in the ground, in room metres. */
const GRAVE = { x: [-0.45, 0.45] as [number, number], z: [-1.85, 0.05] as [number, number], depth: 0.9 };
const GRAVE_MIDDLE = (GRAVE.z[0] + GRAVE.z[1]) / 2;
/** The wisp hangs over the head of the grave, before its headstone, so its light falls on ground and stone, not into the pit. */
const WISP_Z = -1.75;

const STONE_FACE: Record<string, PaletteKey | null> = { s: "stone", d: "stoneDark", l: "stoneLight", m: "verdigrisDark", g: "wraith", ".": null };

function between(rng: Rng, low: number, high: number): number {
  return low + Math.floor(rng.next() * (high - low + 1));
}

/** A headstone's face as pixel rows, `w` × `h` texels: weathered stone with
 *  a cut border, lines of worn lettering and a crust of lichen at the foot. */
function stoneFace(w: number, h: number, seed: string): string[] {
  const rng = createRng(`graveyard:${seed}`);
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => "s"));
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && x < w && y >= 0 && y < h) grid[y][x] = c;
  };
  for (let x = 1; x < w - 1; x++) {
    set(x, 2, "d");
    set(x, h - 3, "d");
  }
  for (let y = 2; y < h - 2; y++) {
    set(1, y, "d");
    set(w - 2, y, "d");
  }
  for (let line = 5; line < h - 6; line += 3) {
    const width = between(rng, Math.floor(w / 3), w - 6);
    const start = Math.floor((w - width) / 2);
    for (let x = start; x < start + width; x++) if (rng.next() < 0.75) set(x, line, "d");
  }
  for (let i = 0; i < w * 2; i++) {
    const x = between(rng, 0, w - 1);
    const y = h - 1 - Math.floor(Math.abs(rng.next() - rng.next()) * h * 0.8);
    set(x, y, rng.next() < 0.3 ? "g" : "m");
  }
  for (let i = 0; i < w / 2; i++) set(between(rng, 0, w - 1), between(rng, 0, h - 1), "l");
  return grid.map((row) => row.join(""));
}

/** A box with the pixel face on its front (+z), sized so its pixels match the room's. */
function facedSlab(width: number, height: number, depth: number, seed: string): THREE.Mesh {
  const w = Math.round(width * TEXELS_PER_METRE);
  const h = Math.round(height * TEXELS_PER_METRE);
  const face = textured(pixelTexture(stoneFace(w, h, seed), STONE_FACE));
  const side = flat("stoneDark");
  const top = flat("stone");
  const geometry = new THREE.BoxGeometry(w / TEXELS_PER_METRE, h / TEXELS_PER_METRE, depth).translate(0, h / TEXELS_PER_METRE / 2, 0);
  return new THREE.Mesh(geometry, [side, side, top, side, face, side]);
}

type Shape = "round" | "pointed" | "cross" | "low";

/** A headstone, facing +z, its foot sunk a little in the earth: a slab with a
 *  rounded or gabled head, a cross on a plinth, or a low kerbed marker. `lean`
 *  tips it back (positive) or forward, `tilt` sideways, both in degrees. */
function headstone(shape: Shape, seed: string, { lean = 0, tilt = 0, scale = 1 } = {}): THREE.Group {
  const stone = flat("stone");
  const tilted = group();
  if (shape === "cross") {
    tilted.add(box([0.42, 0.14, 0.3], flat("stoneDark"), [0, 0, 0]));
    tilted.add(facedSlab(0.14, 0.95, 0.11, seed).translateY(0.13));
    tilted.add(box([0.47, 0.13, 0.1], stone, [0, 0.73, 0]));
  } else if (shape === "low") {
    tilted.add(facedSlab(0.5, 0.38, 0.12, seed));
    tilted.add(box([0.54, 0.05, 0.16], flat("stoneLight"), [0, 0.37, 0]));
  } else {
    const height = 0.68;
    tilted.add(facedSlab(0.5, height, 0.11, seed));
    const head =
      shape === "round"
        ? new THREE.CylinderGeometry(0.25, 0.25, 0.1, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2)
        : new THREE.CylinderGeometry(0.29, 0.29, 0.1, 3).rotateX(-Math.PI / 2).scale(1, 0.55, 1);
    const crown = new THREE.Mesh(head.translate(0, height - (shape === "round" ? 0.01 : -0.06), 0), stone);
    tilted.add(crown);
  }
  tilted.rotation.set(THREE.MathUtils.degToRad(-lean), 0, THREE.MathUtils.degToRad(tilt));
  tilted.scale.setScalar(scale);
  tilted.position.y = -0.015;
  return group(tilted);
}

/** A headstone placed in the yard; one that leans or tilts sinks a corner into the earth. */
function grave(shape: Shape, seed: string, at: [number, number], options: { lean?: number; tilt?: number; scale?: number } = {}, name = "headstone"): PropPlacement {
  const tipped = (options.lean ?? 0) !== 0 || (options.tilt ?? 0) !== 0;
  return { build: () => headstone(shape, seed, options), name, at, contacts: tipped ? [{ with: "floor", because: "it has settled askew, a corner sunk in the soft earth" }] : [] };
}

/** A tall obelisk on a stepped base, the grandest memorial in the yard. Square, so it faces every way. */
function obelisk(): THREE.Group {
  const dark = flat("stoneDark");
  const stone = flat("stone");
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 1.45, 4).rotateY(Math.PI / 4).translate(0, 0.47 + 0.725, 0), stone);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.13 * Math.SQRT1_2 * Math.SQRT2, 0.2, 4).rotateY(Math.PI / 4).translate(0, 0.47 + 1.45 + 0.1, 0), flat("stoneLight"));
  return group(box([0.7, 0.15, 0.7], dark), box([0.5, 0.2, 0.5], stone, [0, 0.15, 0]), facedSlab(0.38, 0.12, 0.38, "obelisk").translateY(0.35), shaft, tip);
}

const SOIL = ["soot", "woodDark", "wood"] as const;
const GROUND = ["soot", "sootLight", "woodDark"] as const;

/** The open grave: a pit dug into the ground, its earth walls running down to
 *  a dark floor where a faint sickly glow gathers. Built in room metres. */
function openGrave(): THREE.Group {
  const dirt = textured(earth({ soil: SOIL, grass: [], seed: "graveyard-pit" }));
  const [x0, x1] = GRAVE.x;
  const [z0, z1] = GRAVE.z;
  const deep = GRAVE.depth;
  const wall = 0.06;
  const grip = 0.003;
  // The rim stands a little proud, earth loosened by the digging, so its top never lies in the ground's plane.
  const tall = deep + 0.025;
  const pit = group(
    box([wall, tall, z1 - z0], dirt, [x0 + wall / 2 - grip, -deep, (z0 + z1) / 2]),
    box([wall, tall, z1 - z0], dirt, [x1 - wall / 2 + grip, -deep, (z0 + z1) / 2]),
    box([x1 - x0 - wall * 2, tall, wall], dirt, [0, -deep, z0 + wall / 2 - grip]),
    box([x1 - x0 - wall * 2, tall, wall], dirt, [0, -deep, z1 - wall / 2 + grip]),
    box([x1 - x0 - wall * 2, 0.05, z1 - z0 - wall * 2], flat("soot"), [0, -deep, (z0 + z1) / 2]),
  );
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - wall * 2, z1 - z0 - wall * 2).rotateX(-Math.PI / 2), lightMaterial(0.2));
  haze.material.color.set(paletteHex("wraith"));
  haze.position.set(0, -0.75, (z0 + z1) / 2);
  pit.add(haze);
  pit.add(lightAnchor({ colour: "wraith", intensity: 1.6, range: 2.5, flicker: 0.2 }, [0, -0.35, (z0 + z1) / 2]));
  return pit;
}

/** The earth dug out of the grave, heaped long beside it. Its long side runs along z. */
function spoilHeap(): THREE.Group {
  const dirt = textured(earth({ soil: SOIL, grass: [], seed: "graveyard-heap" }));
  const geometry = new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.42, 0.4, 0.95).toNonIndexed();
  const rng = createRng("graveyard-heap");
  const position = geometry.getAttribute("position");
  const lumps = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) < 0.01) continue;
    const key = `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(3)},${position.getZ(i).toFixed(3)}`;
    const lump = lumps.get(key) ?? 0.8 + rng.next() * 0.4;
    lumps.set(key, lump);
    position.setXYZ(i, position.getX(i) * lump, position.getY(i) * lump, position.getZ(i) * lump);
  }
  geometry.computeVertexNormals();
  const heap = new THREE.Mesh(projectUvs(geometry, earth({ soil: SOIL, grass: [], seed: "graveyard-heap" })), new THREE.MeshLambertMaterial({ map: dirt.map, flatShading: true }));
  const clods = group();
  for (const [x, z, s] of [[0.33, 0.55, 0.11], [-0.3, -0.7, 0.09], [0.36, -0.3, 0.08]]) clods.add(box([s, s * 0.7, s], dirt, [x, -0.01, z]));
  return group(heap, clods);
}

/** A spade driven into the heap, its handle leaning out. Blade down, handle up. */
function spade(): THREE.Group {
  const blade = box([0.2, 0.28, 0.025], flat("ash"), [0, -0.28, 0]);
  const shaft = cylinder(0.018, 0.85, flat("woodMid"), [0, 0, 0], { sides: 6 });
  const grip = box([0.16, 0.035, 0.035], flat("woodMid"), [0, 0.85, 0]);
  const tool = group(blade, shaft, grip);
  tool.rotation.set(THREE.MathUtils.degToRad(-12), 0, THREE.MathUtils.degToRad(-24));
  return group(tool);
}

/** The will-o'-the-wisp: a sickly green light hanging over the open grave,
 *  bobbing and drifting. Three crossed haloes round a bright core read as one
 *  soft orb from every view. */
function wisp(): THREE.Group {
  const rows: string[] = [];
  const n = 22;
  for (let y = 0; y < n; y++) {
    let row = "";
    for (let x = 0; x < n; x++) {
      const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      const dither = (x + y) % 2 === 0;
      row += r < 0.35 ? "l" : r < 0.6 ? "w" : r < 0.85 && dither ? "d" : ".";
    }
    rows.push(row);
  }
  const map = pixelTexture(rows, { l: "wraithLight", w: "wraith", d: "wraithDark", ".": "void" });
  const halo = () => new THREE.PlaneGeometry(n / TEXELS_PER_METRE, n / TEXELS_PER_METRE);
  const glowing = lightMaterial(0.9, { map });
  const orb = group(
    new THREE.Mesh(halo(), glowing),
    new THREE.Mesh(halo().rotateY(Math.PI / 2), glowing),
    new THREE.Mesh(halo().rotateX(Math.PI / 2), glowing),
    new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), glow("flame")),
  );
  return group(
    animated(orb, (seconds) => {
      orb.position.set(Math.sin(seconds * 0.7) * 0.12, Math.sin(seconds * 1.3) * 0.07, Math.cos(seconds * 0.5) * 0.18);
    }),
  );
}

/** A lantern on an iron post by the gate, its candle guttering behind smoked glass. Faces +z. */
function gateLantern(): THREE.Group {
  const iron = flat("soot");
  const light = lantern({ width: 0.15, height: 0.17, intensity: 1.3, range: 4.5, flicker: 0.2 });
  light.position.set(0.27, 1.34, 0);
  return group(box([0.18, 0.06, 0.18], iron), cylinder(0.03, 1.45, iron, [0, 0, 0], { sides: 6 }), box([0.32, 0.03, 0.03], iron, [0.14, 1.36, 0]), light);
}

/** Low fog lying over the yard in drifting layers of moonlit haze, thickest
 *  near the ground. Built in room metres, over the whole walkable floor. */
function groundFog(): THREE.Group {
  const fog = group();
  const size = 64;
  const layers: [height: number, opacity: number, seed: string][] = [
    [0.08, 0.55, "low"],
    [0.24, 0.3, "high"],
  ];
  for (const [height, opacity, seed] of layers) {
    const rng = createRng(`graveyard-fog:${seed}`);
    const cells = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
    for (let bank = 0; bank < 6; bank++) {
      const cx = rng.next() * size;
      const cy = rng.next() * size;
      const rx = 6 + rng.next() * 12;
      const ry = 3 + rng.next() * 6;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = Math.min(Math.abs(x - cx), size - Math.abs(x - cx)) / rx;
          const dy = Math.min(Math.abs(y - cy), size - Math.abs(y - cy)) / ry;
          cells[y][x] += Math.max(0, 1 - dx * dx - dy * dy);
        }
      }
    }
    const rows = cells.map((row, y) =>
      row
        .map((v, x) => {
          const dither = ((x * 3 + y * 5) % 4) / 4;
          return v > 0.95 ? "m" : v > 0.4 ? "d" : v > 0.2 && dither < 0.5 ? "d" : ".";
        })
        .join(""),
    );
    const map = pixelTexture(rows, { m: "moon", d: "moonDark", ".": "void" }, true);
    const span = 5.5;
    const geometry = new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2);
    const repeat = span / (size / TEXELS_PER_METRE);
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeat, uv.getY(i) * repeat);
    const layer = new THREE.Mesh(geometry, lightMaterial(opacity, { map }));
    layer.position.y = height;
    fog.add(layer);
  }
  return fog;
}

/** The gravel path from the gate to the foot of the open grave. Runs along z. */
function gravelPath(): THREE.Mesh {
  return box([0.9, 0.02, 2.5], textured(flagstones({ ramp: ["soot", "ash", "stoneDark", "stone"], mortar: "soot", stonePx: 4, size: 32, seed: "graveyard-path" })));
}

/** The Graveyard: crooked rows of headstones round a freshly opened grave,
 *  out under the moon, with a will-o'-the-wisp hanging over the empty pit
 *  and low fog lying over everything. */
export const GRAVEYARD: RoomDefinition = {
  id: "graveyard",
  floor: () => earth({ soil: GROUND, seed: "graveyard" }),
  wall: () => flagstones({ stonePx: 6, size: 64, seed: "graveyard-wall" }),
  trim: "ash",
  floorOpenings: [{ x: GRAVE.x, z: GRAVE.z }],
  props: [
    { build: openGrave, at: [0, 0] },
    { build: spoilHeap, at: [1.0, GRAVE_MIDDLE] },
    { build: spade, at: [1.1, GRAVE_MIDDLE - 0.35], y: 0.3, contacts: [{ with: "spoilHeap", because: "it is driven into the heap" }] },
    grave("round", "head", [0, -2.2], { lean: 22 }, "graveHead"),
    { build: wisp, at: [0, WISP_Z], y: 0.85 },
    { build: obelisk, at: [-2.15, -2.15] },
    grave("round", "l1", [-1.3, -1.6], { lean: 6 }),
    grave("cross", "l2", [-2.25, -0.75], { tilt: 9 }),
    grave("pointed", "l3", [-1.35, -0.3], { lean: -9 }),
    grave("low", "l4", [-2.2, 0.6]),
    grave("round", "l5", [-1.35, 1.05], { tilt: -7, scale: 0.85 }),
    grave("cross", "l6", [-2.25, 1.9], { lean: 8 }),
    grave("pointed", "r1", [1.4, -2.3], { tilt: -10 }),
    grave("cross", "r2", [2.3, -1.6], { lean: -6 }),
    grave("round", "r3", [2.25, -0.35], { tilt: 5 }),
    grave("low", "r4", [1.75, 0.35]),
    grave("round", "r5", [2.35, 1.3], { lean: 12, scale: 0.9 }),
    { build: gravelPath, at: [0, 1.55], contacts: [{ with: "doorway bottom", because: "it is the path the walk comes in on, lying flat on the ground" }] },
    { build: gateLantern, at: [-0.95, 2.35] },
    { build: groundFog, at: [0, 0] },
  ],
  lights: [{ at: [0, 0.85, WISP_Z], colour: "wraithLight", intensity: 10, range: 6, flicker: 0.25 }],
  focus: [0, 0.5, GRAVE_MIDDLE],
  pawn: [1.1, 1.45],
};
