/*
 * Lettering as geometry: capitals and figures as strokes on a grid 4 wide and 6 tall, with corners cut rather than
 * curves. A stroke is one flat quad, so a word on a sign costs tens of triangles, stays sharp at any distance and
 * needs no texture.
 */

export type Stroke = readonly (readonly [x: number, y: number])[];

const O: Stroke = [[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]];
const A: Stroke[] = [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]], [[0, 3], [4, 3]]];
const DOTS: Stroke[] = [[[1, 6.9], [1, 7.7]], [[3, 6.9], [3, 7.7]]];

const GLYPHS: Readonly<Record<string, readonly Stroke[]>> = {
  A,
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]]],
  D: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 1], [3, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[2, 0], [2, 6]]],
  J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0, 2.5]], [[1.4, 3.6], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [O],
  P: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
  R: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[2, 3], [4, 0]]],
  S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [1, 0], [2, 4], [3, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  Å: [...A, [[1.3, 7.1], [2, 7.8], [2.7, 7.1], [2, 6.5], [1.3, 7.1]]],
  Ä: [...A, ...DOTS],
  Ö: [O, ...DOTS],
  "0": [O],
  "1": [[[1, 5], [2, 6], [2, 0]]],
  "2": [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
  "3": [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1.5, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  "4": [[[3, 0], [3, 6], [0, 2], [4, 2]]],
  "5": [[[4, 6], [0, 6], [0, 3], [3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  "6": [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]],
  "7": [[[0, 6], [4, 6], [1.5, 0]]],
  "8": [[[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  "9": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [4, 3]]],
  "€": [[[4, 5], [3, 6], [2, 6], [1, 5], [1, 1], [2, 0], [3, 0], [4, 1]], [[0, 3.8], [3, 3.8]], [[0, 2.2], [3, 2.2]]],
  "-": [[[1, 3], [3, 3]]],
  "+": [[[2, 1.5], [2, 4.5]], [[0.5, 3], [3.5, 3]]],
  ".": [[[2, 0], [2, 0.5]]],
};

const WIDE_M = 4;
const GAP_M = 1.5;
const SPACE_M = 3.5;
/** Narrow letters take less room than the grid's full width. */
const NARROW: Readonly<Record<string, number>> = { I: 0, ".": 0, "1": 2 };

const widthOf = (letter: string) => NARROW[letter] ?? WIDE_M;

/** A line's width in grid units. */
export function lineWidth(line: string): number {
  return [...line].reduce((sum, letter, index) => sum + (letter === " " ? SPACE_M : widthOf(letter)) + (index === 0 ? 0 : GAP_M), 0);
}

export const GLYPH_HEIGHT = 6;

/** A line's strokes in grid units, its left end at x 0. */
export function lineStrokes(line: string): Stroke[] {
  const strokes: Stroke[] = [];
  let x = 0;
  for (const letter of line) {
    if (letter === " ") {
      x += SPACE_M + GAP_M;
      continue;
    }
    const glyph = GLYPHS[letter] as readonly Stroke[] | undefined;
    if (glyph === undefined) throw new Error(`no glyph for ${letter}`);
    const inset = NARROW[letter] === 0 ? -2 : 0;
    for (const stroke of glyph) strokes.push(stroke.map(([px, py]) => [x + px + inset, py] as const));
    x += widthOf(letter) + GAP_M;
  }
  return strokes;
}
