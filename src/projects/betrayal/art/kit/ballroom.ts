import * as THREE from "three";
import type { PaletteKey } from "../palette";
import { RAMPS } from "../palette";
import type { RoomDefinition } from "../room";
import type { Batch } from "../shapes";
import { panelling, pixelTexture, wallpaper } from "../textures";
import { chair } from "./furniture";

/**
 * The ballroom's hall, which the Gallery looks down into: one tall room on
 * two floors, so both wear its dress. Old ivory paper with a gilt damask over
 * dark panelling, the trim gilded.
 */
export const BALLROOM_SHELL = {
  wall: () => wallpaper({ ground: "ash", stripe: "sootLight", motif: "brass", seed: "ballroom" }),
  wainscot: () => panelling({ ramp: RAMPS.wood, seed: "ballroom", glints: false }),
  trim: "brass",
} satisfies Pick<RoomDefinition, "wall" | "wainscot" | "trim">;

/** The parquet's size: one texture covers the whole tile, so its medallion lies once, in the middle. */
const PARQUET_PX = 192;
/** The basketweave's squares, and the strips each is laid in. */
const SQUARE_PX = 16;
const STRIP_PX = 8;
/** The medallion's rings, in texels out from the middle: the boss, its pale ring, the sunburst, the pale band round it and its dark edge. */
const MEDALLION = { boss: 13, bossRing: 16, burst: 57, band: 60, edge: 62 };
/** The sunburst's wedges, alternating two woods. */
const RAYS = 16;

/**
 * The ballroom's dance floor: dark basketweave parquet, and in the middle a
 * great inlaid medallion four metres across, a sunburst of two woods inside
 * a pale band. One texture is the whole tile; a floor's texture starts at the
 * tile's middle, so the medallion is drawn round the texture's corner and
 * meets itself there.
 */
export function ballroomParquet(): THREE.Texture {
  const rows: string[] = [];
  const half = PARQUET_PX / 2;
  for (let py = 0; py < PARQUET_PX; py++) {
    let row = "";
    for (let px = 0; px < PARQUET_PX; px++) {
      const cx = (px < half ? px : px - PARQUET_PX) + 0.5;
      const cy = (py < half ? py : py - PARQUET_PX) + 0.5;
      const r = Math.hypot(cx, cy);
      if (r < MEDALLION.boss) row += "m";
      else if (r < MEDALLION.bossRing) row += "p";
      else if (r < MEDALLION.burst) row += Math.floor(((Math.atan2(cy, cx) + Math.PI) / (2 * Math.PI)) * RAYS) % 2 === 0 ? "m" : "w";
      else if (r < MEDALLION.band) row += "p";
      else if (r < MEDALLION.edge) row += "d";
      else {
        const across = (Math.floor(px / SQUARE_PX) + Math.floor(py / SQUARE_PX)) % 2 === 0;
        const seam = (across ? py : px) % STRIP_PX === 0;
        row += seam ? "d" : "w";
      }
    }
    rows.push(row);
  }
  return pixelTexture(rows, { d: "woodDark", w: "wood", m: "woodMid", p: "boneDark" }, true);
}

/** The ballroom's gilt chairs, slight and low-backed, on red velvet seats. One faces +z. */
export function giltChair(): THREE.Group {
  return chair({ wood: ["woodDark", "brass"], cushion: "blood", back: 0.95 });
}

/** The Gallery's balustrade, which the Ballroom's fallen section matches: painted balusters between a plinth and a dark handrail. */
export const BALUSTRADE = {
  /** The handrail's top above the floor. */
  height: 1.0,
  spacing: 0.17,
  plinth: { height: 0.1, depth: 0.12 },
  rail: { height: 0.07, depth: 0.11 },
  colours: { baluster: "bone", plinth: "boneDark", rail: "woodDark" } satisfies Record<string, PaletteKey>,
};

/** One turned baluster, square-cut for its pixel size, standing on `at`'s origin between the plinth and the rail. */
export function baluster(b: Batch, at: THREE.Matrix4) {
  const tall = BALUSTRADE.height - BALUSTRADE.plinth.height - BALUSTRADE.rail.height;
  const colour = BALUSTRADE.colours.baluster;
  // Foot, shaft, belly, neck and head, each overlapping the next so no two meet only at a face.
  const parts: [w: number, h: number, y: number][] = [
    [0.07, 0.08, 0],
    [0.04, 0.2, 0.07],
    [0.075, 0.24, 0.25],
    [0.04, 0.2, 0.47],
    [0.065, tall - 0.65, 0.65],
  ];
  for (const [w, h, y] of parts) b.add([w, h, w], colour, at.clone().multiply(new THREE.Matrix4().makeTranslation(0, y + h / 2, 0)));
}

/** A straight run of the balustrade `length` long along x from `from`, standing on y = 0, in `at`'s frame. */
export function balustradeRun(b: Batch, from: number, length: number, at = new THREE.Matrix4()) {
  const { plinth, rail, height, spacing, colours } = BALUSTRADE;
  const piece = (size: [number, number, number], colour: PaletteKey, x: number, y: number) =>
    b.add(size, colour, at.clone().multiply(new THREE.Matrix4().makeTranslation(x, y + size[1] / 2, 0)));
  piece([length, plinth.height, plinth.depth], colours.plinth, from + length / 2, 0);
  piece([length, rail.height, rail.depth], colours.rail, from + length / 2, height - rail.height);
  const count = Math.max(1, Math.round(length / spacing));
  const step = length / count;
  for (let i = 0; i < count; i++) baluster(b, at.clone().multiply(new THREE.Matrix4().makeTranslation(from + (i + 0.5) * step, plinth.height - 0.01, 0)));
}
