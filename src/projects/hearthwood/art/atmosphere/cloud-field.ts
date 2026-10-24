import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType, Vector2, Vector4, type Texture } from "three";
import type { FeatureFrame } from "../feature-art";

/*
 * The clouds as a field in the world: how dense the cloud is at any point,
 * the same for everything that draws them (the clouds in the sky, their
 * shadows on the land, the rays between them), so a shadow always lies under
 * its cloud. Two layers of tiling noise from one small texture give the
 * coverage, broad patches and the heaped cells inside them; a cloud is
 * rounded on top and flat underneath, eroded at its edges by a finer noise.
 * The weather sets how much of the sky is covered, how heaped the clouds are
 * and how low they sit, and the wind carries the whole field along.
 *
 * The noise texture is made once, only while some feature that draws clouds
 * is on, and freed when the last of them is switched off.
 */

const SIZE = 256;

/** Smooth tiling value noise on a square of `SIZE`, with `cells` cells a side, from a seed. */
function tilingValue(cells: number, seed: number): (x: number, y: number) => number {
  const lattice = new Float32Array(cells * cells);
  let state = seed >>> 0 || 1;
  for (let i = 0; i < lattice.length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    lattice[i] = (state >>> 0) / 4294967296;
  }
  const at = (i: number, j: number) => lattice[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
  return (x, y) => {
    const fx = (x / SIZE) * cells;
    const fy = (y / SIZE) * cells;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * su;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
    return a + (b - a) * sv;
  };
}

/** Tiling cellular noise: 1 at each of a grid of scattered points, falling to 0 between them, so it heaps into billows. */
function tilingBillows(cells: number, seed: number): (x: number, y: number) => number {
  const points = new Float32Array(cells * cells * 2);
  let state = seed >>> 0 || 1;
  for (let i = 0; i < points.length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    points[i] = (state >>> 0) / 4294967296;
  }
  return (x, y) => {
    const fx = (x / SIZE) * cells;
    const fy = (y / SIZE) * cells;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    let nearest = Infinity;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ci = (((i + di) % cells) + cells) % cells;
        const cj = (((j + dj) % cells) + cells) % cells;
        const px = i + di + points[(cj * cells + ci) * 2];
        const py = j + dj + points[(cj * cells + ci) * 2 + 1];
        nearest = Math.min(nearest, Math.hypot(px - fx, py - fy));
      }
    }
    return Math.max(0, 1 - nearest);
  };
}

function octaves(layers: readonly ((x: number, y: number) => number)[], x: number, y: number): number {
  let sum = 0;
  let total = 0;
  layers.forEach((layer, i) => {
    const weight = 1 / (1 << i);
    sum += layer(x, y) * weight;
    total += weight;
  });
  return sum / total;
}

/** Four tiling noises in one texture: broad patches (r), heaped billows (g), a fine eroding noise (b) and streaks for the high veils (a). */
function makeNoise(): DataTexture {
  const broad = [tilingValue(4, 11), tilingValue(8, 12), tilingValue(16, 13), tilingValue(32, 14)];
  const billows = [tilingBillows(6, 21), tilingBillows(12, 22), tilingBillows(24, 23)];
  const fine = [tilingValue(16, 31), tilingValue(32, 32), tilingValue(64, 33)];
  const streak = [tilingValue(8, 41), tilingValue(32, 42), tilingValue(64, 43)];
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const o = (y * SIZE + x) * 4;
      data[o] = Math.round(octaves(broad, x, y) * 255);
      data[o + 1] = Math.round(octaves(billows, x, y) * 255);
      data[o + 2] = Math.round(octaves(fine, x, y) * 255);
      data[o + 3] = Math.round(octaves(streak, x, y) * 255);
    }
  }
  const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** The field's uniforms: one set, shared by every material that reads the clouds. */
export const CLOUD_FIELD = {
  uHwCloudNoise: { value: null as Texture | null },
  /** How much of the sky is covered, how heaped, and the base and top of the heaped layer, in metres. */
  uHwCloudShape: { value: new Vector4(0.3, 0.8, 1500, 2600) },
  /** How far the wind has carried the field, in metres. */
  uHwCloudDrift: { value: new Vector2() },
};

let users = 0;
let noise: DataTexture | null = null;

/** The noise texture, made on the first use; each call is matched by a `releaseCloudNoise`. */
export function acquireCloudNoise(): void {
  users++;
  noise ??= makeNoise();
  CLOUD_FIELD.uHwCloudNoise.value = noise;
}

export function releaseCloudNoise(): void {
  users--;
  if (users > 0 || !noise) return;
  noise.dispose();
  noise = null;
  CLOUD_FIELD.uHwCloudNoise.value = null;
}

/** The clouds drift faster than the wind at the ground, as the wind aloft does. */
const ALOFT = 2.5;

let lastMotion: number | null = null;

/** Sets the field from the weather and carries it along on the wind: called by each feature that reads it, and does its work once a frame. */
export function updateCloudField({ weather, day }: FeatureFrame): void {
  const w = weather.weather;
  const motion = day.motion;
  if (lastMotion !== null) {
    const seconds = motion - lastMotion;
    CLOUD_FIELD.uHwCloudDrift.value.x -= w.wind.x * w.wind.speed * ALOFT * seconds;
    CLOUD_FIELD.uHwCloudDrift.value.y -= w.wind.z * w.wind.speed * ALOFT * seconds;
  }
  lastMotion = motion;
  // Damp air clouds over lower; heaped clouds tower, layered ones lie thin.
  const base = 1500 + 1100 * (1 - w.humidity);
  CLOUD_FIELD.uHwCloudShape.value.set(w.cloudCover, w.heaped, base, base + 220 + 680 * w.heaped);
}
