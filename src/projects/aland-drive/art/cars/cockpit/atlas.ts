/*
 * The cockpit's instrument sheet: one image a car draws its dial faces on, a
 * grid of square cells, and the cell of figures every readout reads its digits
 * from. The faces' texture coordinates, the drawing and the shader all go by it.
 */

export const ATLAS = { columns: 4, rows: 2, cellPixels: 512 } as const;

/** Which cell holds what. The digital cluster's face takes two cells side by side. */
export const SLOT = { speed: 0, revs: 1, fuel: 2, water: 3, oil: 4, digital: 5, figures: 7 } as const;

/** The figures' cell is a grid of glyphs: the digits, then these. A gear reads a glyph past the digits as itself: an electric car's D. */
export const GLYPH = { reverse: 10, neutral: 11, minus: 12, drive: 13, blank: 15 } as const;
export const GLYPH_GRID = 4;

/** What a needle, readout or lamp reads. The values are the shader's. */
export const SOURCE = { speed: 0, revs: 1, fuel: 2, water: 3, oil: 4, power: 5, gear: 6, clock: 7, outside: 8, none: 15 } as const;

/** A readout's glyph is this wide for its height, and its face is built to it. */
export const GLYPH_ASPECT = 0.62;
export type Source = (typeof SOURCE)[keyof typeof SOURCE];

/** A cell's texture coordinates: its corner, and a cell's size, with v growing up the image as three reads it. */
export function cellUv(slot: number): { u: number; v: number; width: number; height: number } {
  const column = slot % ATLAS.columns;
  const row = Math.floor(slot / ATLAS.columns);
  return { u: column / ATLAS.columns, v: 1 - (row + 1) / ATLAS.rows, width: 1 / ATLAS.columns, height: 1 / ATLAS.rows };
}

/** A readout's parameter: what it reads and how many glyphs wide it is. */
export const readoutParam = (source: Source, glyphs: number) => source * 16 + glyphs;
