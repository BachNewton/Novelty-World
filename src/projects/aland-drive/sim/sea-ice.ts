import { seedOfWhole, unitOfSeed } from "../art/hash-of";

/*
 * How exposed each place on the water is, from 0 (the most sheltered bay) to 1 (the open Sea of Åland): what the
 * season's `iceReach` and `iceDrivable` are read against (`climate/season.ts`). Water more sheltered than the reach is
 * frozen, and more sheltered than the drivable reach bears a car.
 *
 * It is worked out once from the overview's image, whose alpha is the land: the share of water round a place at three
 * sizes, from a few hundred metres to several kilometres, so an inlet or a lake is sheltered, the archipelago between
 * its islands half so, and only water with no land for kilometres is open. The result is one small grid of bytes over
 * the whole world. The simulation reads it here, and the shader reads the same bytes as a texture (`render/sea-ice.ts`),
 * with the same ragged edge rolled from the place on both sides (`art/hash.ts`), so the ice a car is on is the ice drawn.
 */

/** The grid's cell, metres: a few of the overview image's pixels. */
const CELL_PIXELS = 4;
/** The sizes the water round a place is measured at, metres, and how much each counts. */
const SHELTER = [
  { radiusM: 400, weight: 0.3 },
  { radiusM: 1200, weight: 0.3 },
  { radiusM: 4000, weight: 0.4 },
] as const;
/** The measure's own floor and span: a share this low is the most sheltered, and the open sea reads a little under 1. */
const FLOOR = 0.04;
const SPAN = 0.9;

/** The ragged edge: noise on the exposure at two sizes of patch, metres, and how far each moves it. */
export const EDGE_NOISE = [
  { cellM: 340, amount: 0.07, salt: 6007 },
  { cellM: 70, amount: 0.035, salt: 6011 },
] as const;

/** The exposure as a grid of bytes: each cell's middle is at `west + (column + 0.5) * stepM`, `-north + (row + 0.5) * stepM`. */
export interface ExposureGrid {
  west: number;
  north: number;
  stepM: number;
  columns: number;
  rows: number;
  values: Uint8Array;
}

/** A box blur along rows or columns, with water beyond the edges. */
function boxBlur(values: Float32Array, columns: number, rows: number, radius: number, alongRows: boolean): Float32Array {
  const out = new Float32Array(values.length);
  const [lines, length] = alongRows ? [rows, columns] : [columns, rows];
  const at = (line: number, index: number) => (alongRows ? line * columns + index : index * columns + line);
  const width = 2 * radius + 1;
  for (let line = 0; line < lines; line++) {
    let sum = 0;
    for (let index = -radius; index <= radius; index++) sum += index < 0 || index >= length ? 1 : values[at(line, index)];
    for (let index = 0; index < length; index++) {
      out[at(line, index)] = sum / width;
      const leaving = index - radius;
      const coming = index + radius + 1;
      sum += (coming >= length ? 1 : values[at(line, coming)]) - (leaving < 0 ? 1 : values[at(line, leaving)]);
    }
  }
  return out;
}

/** Three box blurs each way: near enough a Gaussian. */
function blurred(values: Float32Array, columns: number, rows: number, radius: number): Float32Array {
  let out = values;
  for (let pass = 0; pass < 3; pass++) out = boxBlur(boxBlur(out, columns, rows, radius, true), columns, rows, radius, false);
  return out;
}

/** The exposure grid from the overview's image (RGBA, north at the top, alpha the land) and where it lies. */
export function exposureOfLand(image: Uint8Array, width: number, height: number, overview: { west: number; north: number; columns: number; stepM: number }): ExposureGrid {
  const pixelM = ((overview.columns - 1) * overview.stepM) / width;
  const columns = Math.floor(width / CELL_PIXELS);
  const rows = Math.floor(height / CELL_PIXELS);
  const water = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      let land = 0;
      for (let down = 0; down < CELL_PIXELS; down++) {
        for (let across = 0; across < CELL_PIXELS; across++) land += image[((row * CELL_PIXELS + down) * width + column * CELL_PIXELS + across) * 4 + 3];
      }
      water[row * columns + column] = 1 - land / (255 * CELL_PIXELS * CELL_PIXELS);
    }
  }
  const stepM = pixelM * CELL_PIXELS;
  const measures = SHELTER.map(({ radiusM }) => blurred(water, columns, rows, Math.max(1, Math.round(radiusM / stepM))));
  const values = new Uint8Array(columns * rows);
  for (let cell = 0; cell < values.length; cell++) {
    const shelter = SHELTER.reduce((product, { weight }, index) => product * Math.max(measures[index][cell], 1e-6) ** weight, 1);
    values[cell] = Math.round(255 * Math.min(1, Math.max(0, (shelter - FLOOR) / SPAN)));
  }
  return { west: overview.west, north: overview.north, stepM, columns, rows, values };
}

/** The same exposure everywhere: for a test, or a world with no overview. */
export function evenExposure(exposure: number): ExposureGrid {
  return { west: 0, north: 0, stepM: 1e6, columns: 1, rows: 1, values: Uint8Array.of(Math.round(exposure * 255)) };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Noise from 0 to 1 between whole cells' rolls, eased: `render/sea-ice.ts`'s `valueNoise` on the CPU. */
export function valueNoiseOf(x: number, z: number, cellM: number, salt: number): number {
  const [u, v] = [Math.fround(x / cellM), Math.fround(z / cellM)];
  const [column, row] = [Math.floor(u), Math.floor(v)];
  const [across, down] = [smooth(u - column), smooth(v - row)];
  const roll = (c: number, r: number) => unitOfSeed(seedOfWhole(c, r), salt);
  const top = roll(column, row) + (roll(column + 1, row) - roll(column, row)) * across;
  const bottom = roll(column, row + 1) + (roll(column + 1, row + 1) - roll(column, row + 1)) * across;
  return top + (bottom - top) * down;
}

/** The grid's exposure at a place, read between its four nearest cells as a texture's linear filter does, and clamped at its edges. */
export function gridExposureAt({ west, north, stepM, columns, rows, values }: ExposureGrid, x: number, z: number): number {
  const u = Math.min(Math.max((x - west) / stepM - 0.5, 0), columns - 1);
  const v = Math.min(Math.max((z + north) / stepM - 0.5, 0), rows - 1);
  const [column, row] = [Math.min(Math.floor(u), columns - 2), Math.min(Math.floor(v), rows - 2)];
  if (column < 0 || row < 0) return values[Math.round(v) * columns + Math.round(u)] / 255;
  const [across, down] = [u - column, v - row];
  const at = row * columns + column;
  const top = values[at] + (values[at + 1] - values[at]) * across;
  const bottom = values[at + columns] + (values[at + columns + 1] - values[at + columns]) * across;
  return (top + (bottom - top) * down) / 255;
}

/** A place's exposure with its ragged edge: what the ice's reach is read against, here and in the shader. */
export function exposureAt(grid: ExposureGrid, x: number, z: number): number {
  return EDGE_NOISE.reduce((sum, { cellM, amount, salt }) => sum + (valueNoiseOf(x, z, cellM, salt) - 0.5) * amount, gridExposureAt(grid, x, z));
}
