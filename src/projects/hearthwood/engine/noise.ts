import { createRng } from "@/shared/lib/seeded-random";

/*
 * Smooth 2D gradient noise from a seed, and the layered kinds the land is
 * built from. Pure: the same seed gives the same field everywhere.
 */

export type Noise2 = (x: number, y: number) => number;

const TABLE = 256;

/** Gradient noise in about [-1, 1], one feature per unit. */
export function gradientNoise(seed: string): Noise2 {
  const rng = createRng(seed);
  const perm = new Uint8Array(TABLE * 2);
  const order = Array.from({ length: TABLE }, (_, i) => i);
  for (let i = TABLE - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let i = 0; i < TABLE * 2; i++) perm[i] = order[i % TABLE];
  const gx = new Float32Array(TABLE);
  const gy = new Float32Array(TABLE);
  for (let i = 0; i < TABLE; i++) {
    const angle = rng.next() * Math.PI * 2;
    gx[i] = Math.cos(angle);
    gy[i] = Math.sin(angle);
  }
  const dot = (ix: number, iy: number, fx: number, fy: number): number => {
    const g = perm[perm[ix & 255] + (iy & 255)];
    return gx[g] * fx + gy[g] * fy;
  };
  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const u = fade(fx);
    const v = fade(fy);
    const a = dot(ix, iy, fx, fy);
    const b = dot(ix + 1, iy, fx - 1, fy);
    const c = dot(ix, iy + 1, fx, fy - 1);
    const d = dot(ix + 1, iy + 1, fx - 1, fy - 1);
    return 1.41 * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
  };
}

/** Octaves of noise, each twice as fine and half as strong, normalised to about [-1, 1]. */
export function fbm(noise: Noise2, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * noise(x * frequency + i * 17.3, y * frequency - i * 9.1);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

/** Sharp-crested noise in [0, 1], for ridges and peaks. */
export function ridged(noise: Noise2, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(x * frequency + i * 31.7, y * frequency + i * 5.3));
    sum += amplitude * n * n;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(x: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, x));
}
