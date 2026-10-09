import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { paletteHex, RAMPS, type PaletteKey } from "../palette";
import { lightAnchor } from "../light-anchor";
import { box, flat, glow, group, lathe } from "../shapes";
import { TILE, type Mood, type RoomDefinition } from "../room";
import { panelling, pixelTexture, svgTexture, TEXELS_PER_METRE, wallpaper } from "../textures";

/*
 * The starting tile prints three rooms on one long tile: the Grand Staircase,
 * the Foyer and the Entrance Hall, joined by open passages. In the house they
 * are one hall, so they share one floor, wall, wainscot, trim and light here.
 * Their textures share seeds on purpose (every other room has its own): each
 * pattern repeats a whole number of times across a tile, so with one seed the
 * marble, paper and panels run on unbroken through the passages. The Upper
 * Landing, where the grand staircase arrives, wears the same dress.
 */

const SEED = "starting-tile";

const MARBLE = 64;
const SQUARE = 16;

/** A chequered marble floor of half-metre squares, pale and dark, veined and
 *  here and there cracked. 64 texels repeat three times across a tile. */
function marbleRows(): string[] {
  const rng = createRng(`${SEED}:marble`);
  const grid: string[][] = Array.from({ length: MARBLE }, (_, y) =>
    Array.from({ length: MARBLE }, (_, x) => ((Math.floor(x / SQUARE) + Math.floor(y / SQUARE)) % 2 === 0 ? "p" : "d")),
  );
  const vein = (x0: number, y0: number, steps: number) => {
    let x = x0;
    let y = y0;
    for (let i = 0; i < steps; i++) {
      const cell = grid[y % MARBLE][x % MARBLE];
      grid[y % MARBLE][x % MARBLE] = cell === "p" || cell === "v" ? "v" : "w";
      x += rng.next() < 0.6 ? 1 : 0;
      y += rng.next() < 0.7 ? 1 : 0;
    }
  };
  for (let i = 0; i < 14; i++) vein(Math.floor(rng.next() * MARBLE), Math.floor(rng.next() * MARBLE), 6 + Math.floor(rng.next() * 10));
  for (let i = 0; i < MARBLE; i += SQUARE) {
    for (let j = 0; j < MARBLE; j++) {
      grid[i][j] = "g";
      grid[j][i] = "g";
    }
  }
  return grid.map((row) => row.join(""));
}

export const SUITE: Pick<RoomDefinition, "floor" | "wall" | "wainscot" | "trim"> = {
  floor: () => pixelTexture(marbleRows(), { p: "stone", v: "stoneLight", d: "sootLight", w: "ash", g: "stoneDark" }, true),
  wall: () => wallpaper({ ground: "moonDark", stripe: "soot", motif: "moon", seed: SEED }),
  wainscot: () => panelling({ ramp: RAMPS.wood, seed: SEED }),
  trim: "woodDark",
};

/** The grand staircase's measure, shared by the flight on the ground floor
 *  and its head on the Upper Landing. On the ground floor it climbs the top
 *  wall from its foot near the Foyer (+x) to the left wall. */
export const STAIR = {
  steps: 14,
  rise: 0.225,
  going: 0.29,
  foot: 1.28,
  back: -2.72,
  front: -1.44,
  carpet: 0.8,
};
/** The rail stands this high above each nosing. */
export const RAIL = 0.85;

/** The newel post at the foot of the flight, crowned with a lamp whose globe
 *  lights the stair. */
export function newel(): THREE.Group {
  const post = flat("woodDark");
  const cap = flat("woodMid");
  const brass = flat("brass");
  const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), glow("amber"));
  globe.position.y = 1.42;
  const result = group(
    box([0.2, 0.12, 0.2], cap, [0, 0, 0]),
    box([0.15, 0.95, 0.15], post, [0, 0.12, 0]),
    box([0.2, 0.06, 0.2], cap, [0, 1.07, 0]),
    lathe([[0, 0], [0.07, 0], [0.03, 0.06], [0.025, 0.18], [0.06, 0.22], [0, 0.24]], brass, 8).translateY(1.13),
    globe,
  );
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  result.add(lightAnchor({ colour: "amber", intensity: 4, range: 7, flicker: 0.06, shadow: true }, [0.25, 1.45, 0.35]));
  return result;
}

/** The hall's shared light: candle-warm lamps against a cool, low fill. */
export function suiteMood(moon: number): Mood {
  return {
    ambient: moon > 0 ? 0.4 : 0.55,
    ambientColour: "moon",
    moon,
    fog: { colour: "soot", density: 0.4 },
  };
}

const RUNNER_WIDTH = 1.0;
const FRINGE = 3;

/**
 * The hall runner, lying along x at z = `z`, from `from` to `to` in room
 * metres. A `finished` end is bound and fringed; an open end runs on into the
 * next room. Its pattern repeats every metre from the tile's edge, so the
 * pieces in the three rooms join into one carpet.
 */
export function runner({ from, to, z = 0, finished = [] }: { from: number; to: number; z?: number; finished?: ("from" | "to")[] }): THREE.Mesh {
  const hex = (key: PaletteKey) => paletteHex(key);
  const w = Math.round((to - from) * TEXELS_PER_METRE);
  const h = Math.round(RUNNER_WIDTH * TEXELS_PER_METRE);
  const origin = Math.round((from + TILE / 2) * TEXELS_PER_METRE);
  const x0 = finished.includes("from") ? FRINGE : 0;
  const x1 = finished.includes("to") ? w - FRINGE : w;
  const body = (x: number, y: number, width: number, height: number, key: PaletteKey) => {
    const left = Math.max(x, x0);
    const right = Math.min(x + width, x1);
    return right > left ? `<rect x="${left}" y="${y}" width="${right - left}" height="${height}" fill="${hex(key)}"/>` : "";
  };
  const parts: string[] = [
    body(0, 0, w, h, "blood"),
    body(0, 0, w, 4, "bloodDark"),
    body(0, h - 4, w, 4, "bloodDark"),
    body(0, 5, w, 1, "amber"),
    body(0, h - 6, w, 1, "amber"),
  ];
  const period = TEXELS_PER_METRE;
  const cy = h / 2;
  for (let k = Math.floor(origin / period) - 1; k * period < origin + w + period; k++) {
    const cx = k * period + period / 2 - origin;
    if (cx < x0 + 10 || cx > x1 - 10) continue;
    parts.push(
      `<path d="M${cx} ${cy - 8} L${cx + 9} ${cy} L${cx} ${cy + 8} L${cx - 9} ${cy}Z" fill="${hex("bloodDark")}"/>`,
      `<path d="M${cx} ${cy - 5} L${cx + 5} ${cy} L${cx} ${cy + 5} L${cx - 5} ${cy}Z" fill="${hex("amber")}"/>`,
      `<rect x="${cx - 1}" y="${cy - 1}" width="2" height="2" fill="${hex("bloodDark")}"/>`,
    );
  }
  for (let k = Math.floor(origin / period); k * period < origin + w + period; k++) {
    const edge = k * period - origin;
    for (const y of [cy - 3, cy + 1]) parts.push(body(edge - 1, y, 2, 2, "amber"));
  }
  for (const end of finished) {
    const fringe = end === "from" ? 0 : w - FRINGE;
    parts.push(body(end === "from" ? x0 : x1 - 3, 0, 3, h, "bloodDark"));
    for (let y = 1; y < h; y += 2) parts.push(`<rect x="${fringe}" y="${y}" width="${FRINGE}" height="1" fill="${hex("bone")}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${parts.join("")}</svg>`;
  const geometry = new THREE.PlaneGeometry(w / TEXELS_PER_METRE, h / TEXELS_PER_METRE);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(from + w / TEXELS_PER_METRE / 2, 0.006, z);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: svgTexture(svg, w, h), alphaTest: 0.5 }));
  mesh.receiveShadow = true;
  return mesh;
}
