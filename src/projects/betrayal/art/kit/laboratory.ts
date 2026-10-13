import * as THREE from "three";
import type { PaletteKey } from "../palette";
import { batch, box, cylinder, flat, group } from "../shapes";
import type { RoomDefinition } from "../room";
import { shiny, shinyBatch, SHINES } from "../shine";
import { pixelTexture } from "../textures";
import { solidLathe, vessel, type Profile } from "./vessel";

/** The laboratories' shared dress: the colours their benches, glass and steel are made of. */
const LAB = { carcass: "woodDark", front: "wood", slate: "sootLight", glass: "moon", steel: "stoneLight" } as const satisfies Record<string, PaletteKey>;

export interface LabBenchOptions {
  /** Along x, in metres. */
  length?: number;
  /** Along z, in metres. */
  depth?: number;
  height?: number;
  /** Drawers on both long sides, for a bench standing free in the room; one side (+z) by default. */
  doubleSided?: boolean;
}

/**
 * A laboratory bench: a carcass of dark oak drawers and cupboards on a sunk
 * plinth, under a thick black slate top. Its brass pulls shine; the slate is
 * matte. Faces +z, centred on its footprint, base at y = 0.
 */
export function labBench({ length = 2, depth = 0.7, height = 0.92, doubleSided = false }: LabBenchOptions = {}): THREE.Group {
  const slab = 0.06;
  const plinth = 0.1;
  const body = height - slab - plinth;
  const wood = batch();
  const brass = batch();
  wood.block([length - 0.1, plinth, depth - 0.16], "soot", [0, 0, 0]);
  wood.block([length - 0.04, body + 0.01, depth - 0.08], LAB.carcass, [0, plinth - 0.005, 0]);
  const bays = Math.max(1, Math.round((length - 0.04) / 0.55));
  const bay = (length - 0.04) / bays;
  const drawer = 0.17;
  for (const side of doubleSided ? [1, -1] : [1]) {
    const face = side * ((depth - 0.08) / 2 + 0.008);
    for (let k = 0; k < bays; k++) {
      const x = -length / 2 + 0.02 + bay * (k + 0.5);
      const top = plinth + body;
      wood.block([bay - 0.03, drawer - 0.03, 0.02], LAB.front, [x, top - drawer, face]);
      wood.block([bay - 0.03, body - drawer - 0.04, 0.02], LAB.front, [x, plinth + 0.015, face]);
      // A panel sunk in the cupboard door: a darker slice, flush with nothing.
      wood.block([bay - 0.13, body - drawer - 0.16, 0.024], LAB.carcass, [x, plinth + 0.075, face]);
      const out = side * 0.022;
      brass.block([0.08, 0.018, 0.02], "brass", [x, top - drawer / 2 - 0.024, face + out]);
      brass.block([0.02, 0.06, 0.02], "brass", [x + (k % 2 ? -1 : 1) * (bay / 2 - 0.07), plinth + body / 2 - 0.1, face + out]);
    }
  }
  return group(wood.mesh(), shinyBatch(brass, SHINES.tarnishedBrass), box([length, slab, depth], flat(LAB.slate), [0, height - slab, 0]));
}

/** The laboratories' glass, empty: for glass pieces a room shapes itself. */
export function labGlassMaterial(): THREE.MeshLambertMaterial {
  return shiny(flat(LAB.glass), SHINES.glass);
}

/** The shapes of laboratory glass. */
export type GlassKind = "flask" | "conical" | "beaker" | "bottle" | "jar" | "tube" | "carboy";

/** Each kind's outer profile at its natural size, bottom to top. */
const GLASS_PROFILES: Record<GlassKind, Profile> = {
  flask: [[0.02, 0], [0.045, 0.012], [0.062, 0.045], [0.064, 0.065], [0.056, 0.092], [0.034, 0.115], [0.017, 0.126], [0.016, 0.21], [0.021, 0.216]],
  conical: [[0.064, 0], [0.066, 0.012], [0.022, 0.15], [0.017, 0.156], [0.017, 0.2], [0.022, 0.206]],
  beaker: [[0.042, 0], [0.045, 0.006], [0.045, 0.12]],
  bottle: [[0.036, 0], [0.039, 0.006], [0.039, 0.11], [0.03, 0.13], [0.015, 0.138], [0.015, 0.16], [0.024, 0.165], [0.024, 0.185], [0.012, 0.19]],
  jar: [[0.075, 0], [0.08, 0.01], [0.08, 0.27], [0.07, 0.282], [0.07, 0.29]],
  tube: [[0.008, 0], [0.012, 0.008], [0.012, 0.15], [0.014, 0.152]],
  carboy: [[0.16, 0], [0.2, 0.04], [0.21, 0.24], [0.17, 0.36], [0.07, 0.42], [0.05, 0.47], [0.06, 0.49]],
};

/** The kinds left open at the top, with a meniscus to look down on. */
const OPEN: readonly GlassKind[] = ["beaker", "tube"];

/** The part of a profile between two heights, its ends cut where the profile crosses them. */
function between(profile: Profile, low: number, high: number): Profile {
  const result: Profile = [];
  const cross = (a: [number, number], b: [number, number], y: number): [number, number] => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];
  profile.forEach((point, i) => {
    const previous = profile[i - 1] as [number, number] | undefined;
    if (previous) {
      for (const y of [low, high]) if ((previous[1] - y) * (point[1] - y) < 0) result.push(cross(previous, point, y));
    }
    if (point[1] >= low && point[1] <= high) result.push(point);
  });
  return result;
}

export interface GlassOptions {
  /** How big, against its natural size. */
  scale?: number;
  /** How full, from 0 to 1 of its height. */
  fill?: number;
  /** What fills it. */
  fluid?: PaletteKey;
  /** A lid on a jar or bottle: a glass stopper, a metal lid of a colour, or none. */
  lid?: PaletteKey | "stopper" | null;
}

/**
 * One piece of laboratory glass, the fluid in it seen through its lower part
 * and the glass empty above. Both shine as glass; an open beaker or tube is
 * a closed solid with its meniscus inside (see `vessel`). Base at y = 0.
 */
export function labGlass(kind: GlassKind, { scale = 1, fill = 0.5, fluid = "wraith", lid = null }: GlassOptions = {}): THREE.Group {
  const profile = GLASS_PROFILES[kind].map(([r, y]): [number, number] => [r * scale, y * scale]);
  const top = profile[profile.length - 1][1];
  const level = top * fill;
  const glassMaterial = labGlassMaterial();
  const fluidMaterial = shiny(flat(fluid), SHINES.glass);
  const sides = kind === "tube" ? 6 : 10;
  const result = group();
  if (OPEN.includes(kind)) {
    const wall = Math.max(0.003, profile[profile.length - 1][0] * 0.12);
    result.add(vessel(profile, glassMaterial, { wall, depth: top - level, sides }));
    // The fluid's top, a few millimetres over the vessel's inside floor.
    const inner = profile[profile.length - 1][0] - wall - 0.001;
    if (fill > 0.02) result.add(cylinder(inner, 0.004, fluidMaterial, [0, level, 0], { sides }));
    // Below the meniscus the fluid shows through the glass.
    if (fill > 0.02) result.add(solidLathe(between(profile, 0.002, level - 0.002).map(([r, y]) => [r + 0.0015, y]), fluidMaterial, sides));
    return result;
  }
  if (fill > 0) result.add(solidLathe(between(profile, 0, level), fluidMaterial, sides));
  result.add(solidLathe(fill > 0 ? between(profile, level, top) : profile, glassMaterial, sides));
  if (lid) {
    const [r] = profile[profile.length - 1];
    const lidMaterial = lid === "stopper" ? glassMaterial : shiny(flat(lid), lid === "brass" ? SHINES.tarnishedBrass : SHINES.pewter);
    result.add(cylinder(r + 0.006, 0.02 * scale, lidMaterial, [0, top - 0.004, 0], { sides }));
  }
  return result;
}

/**
 * A steel tray of instruments laid out in a row: scalpels, forceps, probes,
 * a pair of scissors and a kidney dish, all bright steel. Clean and ready, as
 * if for a procedure about to start. Long along x, base at y = 0.
 */
export function instrumentTray({ length = 0.5, width = 0.32 }: { length?: number; width?: number } = {}): THREE.Group {
  const steel = batch();
  const rim = 0.018;
  // The tray's floor sits inside its rims, so none of its faces share their planes.
  steel.block([length - 0.006, 0.008, width - 0.006], LAB.steel, [0, 0, 0]);
  for (const z of [-1, 1]) steel.block([length, rim, 0.008], LAB.steel, [0, 0, z * (width / 2 - 0.004)]);
  for (const x of [-1, 1]) steel.block([0.008, rim - 0.002, width - 0.016], LAB.steel, [x * (length / 2 - 0.004), 0, 0]);
  const floor = 0.008;
  const spacing = (width - 0.08) / 5;
  for (let i = 0; i < 6; i++) {
    const z = -width / 2 + 0.04 + i * spacing;
    const x = -length / 2 + 0.06;
    if (i % 3 === 0) {
      // A scalpel: its handle and a short blade.
      steel.block([0.11, 0.008, 0.012], "stone", [x + 0.055, floor, z]);
      steel.block([0.035, 0.004, 0.01], LAB.steel, [x + 0.128, floor + 0.002, z]);
    } else if (i % 3 === 1) {
      // Forceps, their two arms opened in a narrow V.
      for (const s of [-1, 1]) {
        steel.add([0.14, 0.006, 0.008], LAB.steel, new THREE.Matrix4().compose(new THREE.Vector3(x + 0.07, floor + 0.003, z + s * 0.006), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s * 0.05), new THREE.Vector3(1, 1, 1)));
      }
    } else {
      // A probe, long and thin.
      steel.block([0.16, 0.006, 0.008], "stone", [x + 0.08, floor, z]);
    }
  }
  // Scissors, their rings and blades.
  steel.block([0.03, 0.006, 0.03], "stone", [length / 2 - 0.16, floor, -0.04]);
  steel.block([0.03, 0.006, 0.03], "stone", [length / 2 - 0.16, floor, 0.0]);
  steel.block([0.1, 0.006, 0.012], LAB.steel, [length / 2 - 0.09, floor, -0.02]);
  const result = group(shinyBatch(steel, SHINES.silver));
  // A kidney dish at the far end.
  const dish = vessel([[0.035, 0], [0.05, 0.01], [0.055, 0.03]], shiny(flat(LAB.steel), SHINES.silver), { wall: 0.004, depth: 0.022, sides: 10 });
  dish.scale.set(1.5, 1, 0.9);
  dish.position.set(length / 2 - 0.11, floor, width / 2 - 0.08);
  result.add(dish);
  return result;
}

/** Rows of square glazed tiles, `px` texels a tile with a one-texel joint, in body colours picked by `pattern` (one character a tile). */
function tileRows(pattern: readonly string[], px: number): string[] {
  const rows: string[] = [];
  for (const line of pattern) {
    for (let y = 0; y < px; y++) rows.push([...line].map((tile) => (y === px - 1 ? "g".repeat(px) : tile.repeat(px - 1) + "g")).join(""));
  }
  return rows;
}

/**
 * The laboratories' shell, one family for both: walls of pale grey glazed
 * tile over a dado of dark green tile capped with a band, on a floor of
 * small plain grey quarry tiles, on which shadows read. Washable surfaces, matte as
 * every shell is; the trim is the benches' dark oak.
 */
export const LAB_SHELL: Pick<RoomDefinition, "floor" | "wall" | "wainscot" | "trim"> = {
  floor: () => pixelTexture(tileRows(["a"], 8), { a: "stoneDark", g: "ash" }, true),
  wall: () => pixelTexture(tileRows(["c"], 6), { c: "stone", g: "stoneDark" }, true),
  wainscot: () => {
    const tiles = tileRows(["vv", "vv", "vw", "vv", "vv"], 6);
    const band = ["gggggggggggg", "cccccccccccc", "cccccccccccc"];
    return pixelTexture([...band, ...tiles.slice(0, 29)], { v: "verdigrisDark", w: "verdigris", c: "verdigris", g: "soot" }, true);
  },
  trim: "woodDark",
};
