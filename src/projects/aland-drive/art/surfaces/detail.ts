import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, RGBAFormat } from "three/webgpu";

/*
 * One square of tiling close-up relief, made in code when the game starts: grass
 * in red, pebbles in green, rock with its cracks in blue and soil in alpha. Each
 * channel is what that surface looks like lit, not its height: the sun never
 * moves and the square is laid out on the world's axes, so the light can be baked
 * in and a lit pebble costs one texture read.
 *
 * Every channel averages one half, and mips average towards it, so laid over the
 * photo as a multiplier the detail goes to exactly nothing with distance: it
 * can't shimmer and it can't shift the land's colour.
 */

export const DETAIL_PIXELS = 512;
const MIDDLE = 128;
const SPREAD = 44;
const ANISOTROPY = 8;

export interface Sun {
  azimuthDeg: number;
  elevationDeg: number;
}

type ToSun = ReturnType<typeof sunInSquare>;

/** A small seeded generator, so every run's ground is the same. */
function randoms(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (at: number, size: number) => ((at % size) + size) % size;

/** The unit vector towards the sun in the square, whose x is east and y is the scene's z, south. */
function sunInSquare({ azimuthDeg, elevationDeg }: Sun) {
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevation = (elevationDeg * Math.PI) / 180;
  return { x: Math.sin(azimuth) * Math.cos(elevation), y: -Math.cos(azimuth) * Math.cos(elevation), up: Math.sin(elevation) };
}

/** Tiling smooth noise from 0 to 1: octaves on whole-number lattices, so each repeats exactly. */
function tilingNoise(size: number, firstCells: number, octaves: number, seed: number): Float32Array {
  const random = randoms(seed);
  const total = new Float32Array(size * size);
  let weight = 1;
  let weights = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const cells = firstCells << octave;
    const lattice = Float32Array.from({ length: cells * cells }, random);
    for (let y = 0; y < size; y++) {
      const atY = (y / size) * cells;
      const rowA = Math.floor(atY);
      const rowB = (rowA + 1) % cells;
      const easeY = (atY - rowA) ** 2 * (3 - 2 * (atY - rowA));
      for (let x = 0; x < size; x++) {
        const atX = (x / size) * cells;
        const columnA = Math.floor(atX);
        const columnB = (columnA + 1) % cells;
        const easeX = (atX - columnA) ** 2 * (3 - 2 * (atX - columnA));
        const top = lattice[rowA * cells + columnA] * (1 - easeX) + lattice[rowA * cells + columnB] * easeX;
        const bottom = lattice[rowB * cells + columnA] * (1 - easeX) + lattice[rowB * cells + columnB] * easeX;
        total[y * size + x] += (top * (1 - easeY) + bottom * easeY) * weight;
      }
    }
    weights += weight;
    weight *= 0.55;
  }
  for (let at = 0; at < total.length; at++) total[at] /= weights;
  return total;
}

/** A height field as it looks under the sun: its slope towards the sun, as a light level round zero. */
function lit(height: Float32Array, size: number, sun: ToSun, relief: number): Float32Array {
  const shown = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const slopeX = height[y * size + wrap(x + 1, size)] - height[y * size + wrap(x - 1, size)];
      const slopeY = height[wrap(y + 1, size) * size + x] - height[wrap(y - 1, size) * size + x];
      shown[y * size + x] = -(slopeX * sun.x + slopeY * sun.y) * relief;
    }
  }
  return shown;
}

/** Blades laid one over another, dark at the root and bright at the tip, lighter the later they're laid. */
function grass(size: number, sun: ToSun): Float32Array {
  const random = randoms(11);
  const field = new Float32Array(size * size).fill(-1.1);
  const clump = tilingNoise(size, 14, 2, 12);
  const blades = Math.round(size * size * 0.3);
  for (let blade = 0; blade < blades; blade++) {
    const late = blade / blades;
    let x = random() * size;
    let y = random() * size;
    const lean = clump[Math.floor(y) * size + Math.floor(x)] * Math.PI * 2 + (random() - 0.5) * 4.5;
    const steps = 6 + random() * 13;
    const stepX = Math.cos(lean);
    const stepY = Math.sin(lean);
    const turned = (stepX * sun.x + stepY * sun.y) * 0.25;
    const shade = -0.75 + late * 1.25 + turned + (random() - 0.5) * 0.5;
    for (let step = 0; step < steps; step++) {
      const at = wrap(Math.floor(y), size) * size + wrap(Math.floor(x), size);
      field[at] = shade + (step / steps) * 0.65;
      x += stepX;
      y += stepY;
    }
  }
  return field;
}

/** Rounded stones, each its own shade, packed over a dark grit, lit from their domes. */
function pebbles(size: number, sun: ToSun): Float32Array {
  const random = randoms(21);
  const height = new Float32Array(size * size);
  const tone = new Float32Array(size * size);
  const stones = Math.round(size * size * 0.016);
  for (let stone = 0; stone < stones; stone++) {
    const centreX = random() * size;
    const centreY = random() * size;
    const radiusX = 1.6 + random() ** 2 * 5.5;
    const radiusY = radiusX * (0.65 + random() * 0.5);
    const turn = random() * Math.PI;
    const [cosine, sine] = [Math.cos(turn), Math.sin(turn)];
    const shade = (random() - 0.5) * 1.1;
    const reach = Math.ceil(Math.max(radiusX, radiusY));
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const u = (dx * cosine + dy * sine) / radiusX;
        const v = (-dx * sine + dy * cosine) / radiusY;
        const inside = 1 - u * u - v * v;
        if (inside <= 0) continue;
        const at = wrap(Math.floor(centreY) + dy, size) * size + wrap(Math.floor(centreX) + dx, size);
        const top = Math.sqrt(inside) * radiusX * 0.6;
        if (top > height[at]) {
          height[at] = top;
          tone[at] = shade;
        }
      }
    }
  }
  const relief = lit(height, size, sun, 0.55);
  for (let at = 0; at < relief.length; at++) relief[at] += height[at] > 0 ? tone[at] : -1.1;
  return relief;
}

/** Ridged folds with thin dark cracks along the noise's middle lines. */
function rock(size: number, sun: ToSun): Float32Array {
  const folds = tilingNoise(size, 5, 6, 31);
  const veins = tilingNoise(size, 7, 3, 32);
  const relief = lit(folds, size, sun, 90);
  for (let at = 0; at < relief.length; at++) {
    const fromCrack = Math.abs(veins[at] - 0.5);
    relief[at] += fromCrack < 0.005 ? -3.4 : (folds[at] - 0.5) * 2.2;
  }
  return relief;
}

/** Crumbs of earth over a broken surface. */
function soil(size: number, sun: ToSun): Float32Array {
  const clods = tilingNoise(size, 26, 4, 41);
  const relief = lit(clods, size, sun, 120);
  const fine = tilingNoise(size, 90, 2, 42);
  for (let at = 0; at < relief.length; at++) relief[at] += (fine[at] - 0.5) * 2 + (clods[at] - 0.5) * 3;
  return relief;
}

/** Settles a channel on the middle byte, with the same spread as the others, so one blend treats them alike. */
function settle(values: Float32Array, into: Uint8Array, channel: number): void {
  let sum = 0;
  let squares = 0;
  for (const value of values) {
    sum += value;
    squares += value * value;
  }
  const mean = sum / values.length;
  const deviation = Math.sqrt(squares / values.length - mean * mean);
  values.forEach((value, at) => {
    into[at * 4 + channel] = Math.max(0, Math.min(255, MIDDLE + ((value - mean) / deviation) * SPREAD));
  });
}

export function detailPixels(sun: Sun, size = DETAIL_PIXELS): Uint8Array {
  const toSun = sunInSquare(sun);
  const pixels = new Uint8Array(size * size * 4);
  settle(grass(size, toSun), pixels, 0);
  settle(pebbles(size, toSun), pixels, 1);
  settle(rock(size, toSun), pixels, 2);
  settle(soil(size, toSun), pixels, 3);
  return pixels;
}

export function detailTexture(sun: Sun): DataTexture {
  const texture = new DataTexture(detailPixels(sun), DETAIL_PIXELS, DETAIL_PIXELS, RGBAFormat);
  texture.colorSpace = NoColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = ANISOTROPY;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
