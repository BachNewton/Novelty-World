/*
 * The clouds' one texture: four tiling fields, worked out once from a fixed seed and sampled a few times a pixel, so the
 * sky's fragment shader does no noise of its own. Each channel is flattened to an even spread of values, so a threshold of
 * 0.6 leaves about 40% of the sky over it, and a look's cloud cover means what it says.
 *
 *   r  billows: the clouds' shape
 *   g  fine billows: what eats their edges
 *   b  a slow field: where clouds gather
 *   a  another: bends the shapes off the lattice, and is the high cirrus
 */

const SHAPE_CELLS = [4, 8, 16];
const DETAIL_CELLS = [14, 28, 56];
const SLOW_CELLS = [3, 6, 12, 24];
const FALLOFF = 0.5;
/** How much of the shape is soft rolling noise under the billows, which joins them into banks instead of lone puffs. */
const SHAPE_ROLLING = 0.35;
const LEVELS = 4096;

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A value per lattice cell, read wrapped, so a pattern on it repeats. */
function lattice(cells: number, seed: number): Float32Array {
  const values = new Float32Array(cells * cells);
  for (let row = 0; row < cells; row++) for (let column = 0; column < cells; column++) values[row * cells + column] = hash(column, row, seed);
  return values;
}

/** Smooth noise on a lattice that repeats every tile. */
function rollingOctave(field: Float32Array, size: number, cells: number, seed: number, weight: number) {
  const values = lattice(cells, seed);
  const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  for (let row = 0; row < size; row++) {
    const y = (row / size) * cells;
    const top = Math.floor(y);
    const down = ease(y - top);
    const [rowA, rowB] = [top * cells, ((top + 1) % cells) * cells];
    for (let column = 0; column < size; column++) {
      const x = (column / size) * cells;
      const left = Math.floor(x);
      const across = ease(x - left);
      const right = (left + 1) % cells;
      const upper = values[rowA + left] + (values[rowA + right] - values[rowA + left]) * across;
      const lower = values[rowB + left] + (values[rowB + right] - values[rowB + left]) * across;
      field[row * size + column] += (upper + (lower - upper) * down) * weight;
    }
  }
}

/** Round bumps on a lattice that repeats every tile: one less the distance to the nearest of a point per cell. */
function billowOctave(field: Float32Array, size: number, cells: number, seed: number, weight: number) {
  const pointX = lattice(cells, seed);
  const pointY = lattice(cells, seed + 1);
  for (let row = 0; row < size; row++) {
    const y = (row / size) * cells;
    const top = Math.floor(y);
    for (let column = 0; column < size; column++) {
      const x = (column / size) * cells;
      const left = Math.floor(x);
      let nearest = 4;
      for (let j = -1; j <= 1; j++) {
        const cellRow = (top + j + cells) % cells;
        for (let i = -1; i <= 1; i++) {
          const cell = cellRow * cells + (left + i + cells) % cells;
          const dx = left + i + pointX[cell] - x;
          const dy = top + j + pointY[cell] - y;
          const distance = dx * dx + dy * dy;
          if (distance < nearest) nearest = distance;
        }
      }
      field[row * size + column] += (1 - Math.min(Math.sqrt(nearest), 1)) * weight;
    }
  }
}

type Octave = typeof rollingOctave;

/** A field of octaves, each a finer lattice at a smaller weight, summing to at most `share`. */
function layered(field: Float32Array, size: number, octave: Octave, cells: readonly number[], seed: number, share = 1) {
  const whole = (1 - FALLOFF ** cells.length) / (1 - FALLOFF);
  cells.forEach((count, at) => octave(field, size, count, seed + at * 2, (share * FALLOFF ** at) / whole));
}

/** Rewrites a field so its values are spread evenly over 0 to 1, in order. */
function flatten(field: Float32Array): void {
  let [low, high] = [Infinity, -Infinity];
  for (const value of field) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  const bin = (value: number) => Math.min(Math.floor(((value - low) / (high - low)) * LEVELS), LEVELS - 1);
  const counts = new Uint32Array(LEVELS);
  for (const value of field) counts[bin(value)]++;
  const below = new Float32Array(LEVELS);
  let seen = 0;
  for (let level = 0; level < LEVELS; level++) {
    below[level] = (seen + counts[level] / 2) / field.length;
    seen += counts[level];
  }
  field.forEach((value, at) => {
    field[at] = below[bin(value)];
  });
}

/** An RGBA square of `size` pixels a side, tiling every way. */
export function cloudPixels(size: number): Uint8Array {
  const fields = [0, 1, 2, 3].map(() => new Float32Array(size * size));
  layered(fields[0], size, billowOctave, SHAPE_CELLS, 10, 1 - SHAPE_ROLLING);
  layered(fields[0], size, rollingOctave, SHAPE_CELLS, 20, SHAPE_ROLLING);
  layered(fields[1], size, billowOctave, DETAIL_CELLS, 30);
  layered(fields[2], size, rollingOctave, SLOW_CELLS, 40);
  layered(fields[3], size, rollingOctave, SLOW_CELLS, 50);
  fields.forEach(flatten);
  const pixels = new Uint8Array(size * size * 4);
  fields.forEach((field, channel) => {
    field.forEach((value, at) => {
      pixels[at * 4 + channel] = Math.round(value * 255);
    });
  });
  return pixels;
}
